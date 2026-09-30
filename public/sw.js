const CACHE_NAME = "detalhapro-v3";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/logo.png"];
// Com conexão ruim, espera pouco pela rede antes de usar a cópia salva
const NETWORK_TIMEOUT_MS = 2500;

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

function networkFirst(request) {
  return caches.match(request).then((cachedExact) => {
    // Navegação para outra URL do app (ex: com ?parametro) cai na página principal salva
    const cachedPromise =
      cachedExact || request.mode !== "navigate" ? Promise.resolve(cachedExact) : caches.match("/");

    return cachedPromise.then((cached) => {
      const network = fetch(request).then((response) => {
        // Guarda respostas normais e também as de outros domínios (Tailwind CDN, fontes),
        // que chegam como "opaque" e são necessárias para o app ficar bonito offline.
        if (response && (response.status === 200 || response.type === "opaque")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });

      // Sem cópia salva: só resta a rede
      if (!cached) return network;

      // Com cópia salva: rede primeiro, mas sem esperar para sempre
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
      return Promise.race([network.catch(() => cached), timeout]);
    });
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nunca cachear chamadas à API do Supabase — os dados offline ficam no IndexedDB do app
  if (request.url.includes("supabase.co")) return;
  if (request.method !== "GET") return;

  // Rede primeiro: um deploy novo aparece na hora quando há conexão.
  // O cache entra como fallback offline ou quando a rede está lenta demais.
  event.respondWith(networkFirst(request));
});
