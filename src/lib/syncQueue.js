// ============================================================
// Modo offline — Fase 2 (escrita)
// Alterações feitas sem internet entram numa fila salva no aparelho
// e são enviadas ao Supabase, na ordem, quando a conexão volta.
//
// Regras importantes:
//  - Os IDs são gerados no aparelho (newId), então dá para criar cliente,
//    veículo e ordem offline e ligar um ao outro sem esperar o servidor.
//  - Criações são seguras para repetir: se o servidor já recebeu (erro 23505),
//    a fila considera como enviado.
//  - Se a fila tem itens, toda alteração nova entra nela (mantém a ordem).
//  - O que o servidor recusar de verdade vai para a lista "falhas" e não trava o resto.
// ============================================================
import React from "react";
import { supabase } from "../supabaseClient";
import { reportError } from "../sentry.js";
import { cacheGet, cacheSet, isNetworkError, withTimeout } from "./offline";

const QUEUE_KEY = "queue";
const FAILED_KEY = "queue-failed";
const OP_TIMEOUT_MS = 15000;
const SYNC_INTERVAL_MS = 15000;

// Só estas tabelas podem ser alteradas pela fila
const TABLES = ["customers", "vehicles", "orders", "expenses"];

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // fallback para navegadores antigos
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- Estado (para a interface) ----------

let status = { pending: 0, failed: 0, syncing: false };
const listeners = new Set();
const syncedListeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}

export function getSyncStatus() {
  return status;
}

export function useSyncStatus() {
  const [s, setS] = React.useState(status);
  React.useEffect(() => {
    listeners.add(setS);
    setS(status);
    return () => listeners.delete(setS);
  }, []);
  return s;
}

// Avisa quando algo foi enviado com sucesso (a tela recarrega os dados)
export function onSynced(fn) {
  syncedListeners.add(fn);
  return () => syncedListeners.delete(fn);
}

// ---------- Fila (com trava para evitar corrida entre gravações) ----------

let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}

export async function getQueue() {
  const c = await cacheGet(QUEUE_KEY);
  return c?.value || [];
}

async function saveQueue(queue) {
  await cacheSet(QUEUE_KEY, queue);
  setStatus({ pending: queue.length });
}

async function getFailed() {
  const c = await cacheGet(FAILED_KEY);
  return c?.value || [];
}

async function saveFailed(list) {
  await cacheSet(FAILED_KEY, list);
  setStatus({ failed: list.length });
}

// Lê o tamanho da fila salva (chamar ao abrir o app)
export async function refreshSyncStatus() {
  const [q, f] = await Promise.all([getQueue(), getFailed()]);
  setStatus({ pending: q.length, failed: f.length });
}

export async function discardFailed() {
  await withLock(() => saveFailed([]));
}

// ---------- Execução de uma operação no servidor ----------

// Erro de sessão vencida: acontece logo que a internet volta, antes do token renovar.
function isAuthError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "PGRST301" || err?.status === 401 || msg.includes("jwt");
}

async function execute(op) {
  if (op.type === "insert") {
    if (!TABLES.includes(op.table)) throw new Error("Tabela não permitida: " + op.table);
    const { error } = await withTimeout(supabase.from(op.table).insert(op.row), OP_TIMEOUT_MS);
    if (error && error.code !== "23505") throw error; // 23505 = já existe (envio repetido)
    return;
  }
  if (op.type === "update") {
    if (!TABLES.includes(op.table)) throw new Error("Tabela não permitida: " + op.table);
    const { error } = await withTimeout(supabase.from(op.table).update(op.patch).eq("id", op.id), OP_TIMEOUT_MS);
    if (error) throw error;
    return;
  }
  if (op.type === "stock") {
    const { error } = await withTimeout(
      supabase.rpc("adjust_stock", {
        p_product_id: op.productId,
        p_type: op.moveType,
        p_quantity: op.quantity,
        p_note: op.note || null,
      }),
      OP_TIMEOUT_MS
    );
    if (error) throw error;
    return;
  }
  throw new Error("Operação desconhecida: " + op.type);
}

// ---------- Uso pelo db.js ----------

// Tenta enviar na hora; se estiver sem internet (ou a fila já tiver itens), guarda na fila.
export async function mutate(op) {
  const queued = await withLock(async () => {
    const queue = await getQueue();
    if (queue.length === 0 && navigator.onLine !== false) {
      try {
        await execute(op);
        return false;
      } catch (err) {
        if (!(isNetworkError(err) || isAuthError(err))) throw err; // erro real: quem chamou trata
      }
    }
    await saveQueue([...queue, { ...op, qid: newId(), at: Date.now() }]);
    return true;
  });
  if (queued) syncSoon();
  return { queued };
}

// ---------- Envio da fila ----------

let syncing = false;
let syncTimer = null;

function syncSoon() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncNow();
  }, 300);
}

export async function syncNow() {
  if (syncing || navigator.onLine === false) return;
  syncing = true;
  setStatus({ syncing: true });
  let sentAny = false;
  try {
    // tenta renovar a sessão antes de enviar (o token pode ter vencido offline)
    try {
      await withTimeout(supabase.auth.getSession(), 8000);
    } catch {
      // segue: se falhar, o envio abaixo tenta de novo depois
    }

    while (true) {
      const queue = await getQueue();
      if (queue.length === 0) break;
      const op = queue[0];
      try {
        await execute(op);
      } catch (err) {
        if (isNetworkError(err) || isAuthError(err)) break; // tenta de novo mais tarde
        // O servidor recusou de verdade: não trava a fila, guarda em "falhas"
        reportError(err, { where: "sync offline", op: op.type, table: op.table });
        await withLock(async () => {
          const failed = await getFailed();
          await saveFailed([...failed, { ...op, error: String(err?.message || err) }]);
        });
      }
      // tira a operação da frente da fila (sem perder as que entraram enquanto enviava)
      await withLock(async () => {
        const current = await getQueue();
        await saveQueue(current.filter((o) => o.qid !== op.qid));
      });
      sentAny = true;
    }
  } finally {
    syncing = false;
    setStatus({ syncing: false });
  }
  if (sentAny) syncedListeners.forEach((fn) => fn());
}

// Liga o envio automático: ao abrir, quando a internet volta e de tempos em tempos.
export function startAutoSync() {
  refreshSyncStatus().then(() => syncNow());
  const onOnline = () => syncNow();
  window.addEventListener("online", onOnline);
  const timer = setInterval(() => {
    if (status.pending > 0) syncNow();
  }, SYNC_INTERVAL_MS);
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(timer);
  };
}

// ---------- Mostrar na tela o que ainda está na fila ----------

function mergeById(list, id, patch) {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

// Aplica as operações pendentes por cima dos dados (sem alterar o original).
export function applyQueue(data, queue) {
  if (!queue || queue.length === 0) return data;
  let d = { ...data };
  for (const op of queue) {
    const createdAt = new Date(op.at || Date.now()).toISOString();
    if (op.type === "insert") {
      const row = op.row;
      if (op.table === "customers") {
        if (!d.customers.some((c) => c.id === row.id)) {
          d.customers = [...d.customers, { created_at: createdAt, ...row, vehicles: [] }].sort((a, b) =>
            String(a.name).localeCompare(String(b.name), "pt-BR")
          );
        }
      } else if (op.table === "vehicles") {
        d.customers = d.customers.map((c) =>
          c.id === row.customer_id && !c.vehicles.some((v) => v.id === row.id)
            ? { ...c, vehicles: [...c.vehicles, { created_at: createdAt, ...row }] }
            : c
        );
      } else if (op.table === "orders") {
        if (!d.orders.some((o) => o.id === row.id)) d.orders = [{ created_at: createdAt, paid: false, ...row }, ...d.orders];
      } else if (op.table === "expenses") {
        if (!d.expenses.some((e) => e.id === row.id)) d.expenses = [{ created_at: createdAt, ...row }, ...d.expenses];
      }
    } else if (op.type === "update") {
      if (op.table === "orders") d.orders = mergeById(d.orders, op.id, op.patch);
      else if (op.table === "expenses") d.expenses = mergeById(d.expenses, op.id, op.patch);
      else if (op.table === "customers") d.customers = mergeById(d.customers, op.id, op.patch);
      else if (op.table === "vehicles") {
        d.customers = d.customers.map((c) => ({ ...c, vehicles: mergeById(c.vehicles, op.id, op.patch) }));
      }
    } else if (op.type === "stock") {
      const sign = op.moveType === "entrada" ? 1 : -1;
      d.products = d.products.map((p) =>
        p.id === op.productId ? { ...p, quantity: Number(p.quantity || 0) + sign * Number(op.quantity || 0) } : p
      );
    }
  }
  return d;
}
