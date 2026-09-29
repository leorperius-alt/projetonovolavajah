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
export const NET_TIMEOUT_MS = 8000;
export const NET_TIMEOUT_LONG_MS = 15000;

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

export async function cacheSet(key, value) {
  const ident = getIdentity();
  if (!ident) return;
  try {
    await idbSet(`${ident.id}:${key}`, { value, savedAt: Date.now() });
  } catch {
    // falha ao gravar o cache nunca deve quebrar o app
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
