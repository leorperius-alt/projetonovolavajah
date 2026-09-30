// ============================================================
// Modo offline — Fase 1 (leitura)
// Guarda no aparelho a última cópia dos dados para o app abrir e
// mostrar informações mesmo sem internet ou com conexão instável.
// Os dados ficam separados por usuário e são apagados no logout.
// ============================================================
import React from "react";
import { supabase } from "../supabaseClient";

const DB_NAME = "detalhapro-offline";
const STORE = "kv";
const IDENTITY_KEY = "detalhapro-last-user";

// Tempo máximo esperando a rede antes de usar a cópia salva (conexão ruim)
export const NET_TIMEOUT_MS = 4000;
export const NET_TIMEOUT_LONG_MS = 8000;

// Quantos dias o app aceita o último status de assinatura salvo, sem internet
export const SUBSCRIPTION_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// ---------- Erros de rede ----------

export function isNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!err) return false;
  if (err.name === "AuthRetryableFetchError") return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

export function withTimeout(promise, ms = NET_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// ---------- "Rede fora do ar": aprende com as falhas para não esperar timeout toda hora ----------
// Depois de uma falha de rede, as próximas chamadas nem tentam a rede por alguns segundos
// e vão direto para a cópia salva / fila. Quando a internet volta (evento "online") ou passa
// o prazo, tenta de novo (com espera curta).
const NET_RETRY_AFTER_MS = 10000;
const NET_RETEST_TIMEOUT_MS = 3000;
let netDownSince = 0;

export function shouldSkipNetwork() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return netDownSince > 0 && Date.now() - netDownSince < NET_RETRY_AFTER_MS;
}
export function markNetUp() {
  netDownSince = 0;
}
export function markNetDown() {
  netDownSince = Date.now();
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", markNetUp);
}

// Faz uma chamada de rede com limite de tempo. Recebe uma FUNÇÃO (a chamada só começa se a rede
// estiver liberada), e lança erro de rede na hora quando já sabemos que está fora do ar.
export async function netCall(fn, ms = NET_TIMEOUT_MS) {
  if (shouldSkipNetwork()) throw new Error("Failed to fetch (sem conexão)");
  const limit = netDownSince > 0 && ms <= 15000 ? Math.min(ms, NET_RETEST_TIMEOUT_MS) : ms;
  try {
    const result = await withTimeout(fn(), limit);
    if (result && !Array.isArray(result) && result.error && isNetworkError(result.error)) markNetDown();
    else markNetUp();
    return result;
  } catch (err) {
    if (isNetworkError(err)) markNetDown();
    throw err;
  }
}

// ---------- IndexedDB simples (chave → valor) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Identidade do último usuário logado neste aparelho ----------

export function getIdentity() {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
  } catch {
    return null;
  }
}

// Se entrar outro usuário no mesmo aparelho, a cópia do anterior é apagada.
export function setIdentity(user) {
  if (!user?.id) return;
  const current = getIdentity();
  if (current && current.id !== user.id) {
    idbClear().catch(() => {});
  }
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ id: user.id, email: user.email || null }));
  } catch {
    // sem espaço / modo privado: segue sem cache
  }
}

// ---------- Cache (escopo = usuário atual) ----------

// strict = true: em vez de ignorar a falha, avisa (usar para dados que não podem ser perdidos, como fotos)
export async function cacheSet(key, value, { strict = false } = {}) {
  const ident = getIdentity();
  if (!ident) {
    if (strict) throw new Error("Sem usuário identificado neste aparelho");
    return;
  }
  try {
    await idbSet(`${ident.id}:${key}`, { value, savedAt: Date.now() });
  } catch (err) {
    if (strict) throw err;
    // falha ao gravar o cache nunca deve quebrar o app
  }
}

export async function cacheDel(key) {
  const ident = getIdentity();
  if (!ident) return;
  try {
    await idbDelete(`${ident.id}:${key}`);
  } catch {
    // ignora
  }
}

export async function cacheGet(key) {
  const ident = getIdentity();
  if (!ident) return null;
  try {
    return (await idbGet(`${ident.id}:${key}`)) || null; // { value, savedAt }
  } catch {
    return null;
  }
}

// Chamar no logout: apaga dados e identidade deste aparelho.
export async function clearOfflineData() {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // ignora
  }
  try {
    await idbClear();
  } catch {
    // ignora
  }
}

// ---------- Usuário atual (funciona sem internet) ----------

export async function getCurrentUserId() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data?.session?.user) return data.session.user.id;
    if (!(navigator.onLine === false || isNetworkError(error))) return null;
  } catch (err) {
    if (!isNetworkError(err)) return null;
  }
  return getIdentity()?.id || null;
}

// ---------- Hook: está online? ----------

export function useOnlineStatus() {
  const [online, setOnline] = React.useState(typeof navigator === "undefined" ? true : navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
