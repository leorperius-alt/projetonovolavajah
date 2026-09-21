const CACHE_NAME = "detalhapro-v2";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nunca cachear chamadas à API do Supabase — precisam ser sempre em tempo real
  if (request.url.includes("supabase.co")) return;
  if (request.method !== "GET") return;

  // Rede primeiro: sempre busca a versão mais nova quando há conexão.
  // O cache só entra como fallback quando o usuário está offline —
  // assim um deploy novo aparece na hora, sem depender de o cache expirar.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
