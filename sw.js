// Service worker: guarda o app e os modelos 3D para abrir rápido (e instalar como app).
const VERSAO = 'cine-v10';
const ESSENCIAIS = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;     // Supabase e vídeos: sempre rede
  const pesado = /\/(assets|vendor)\//.test(url.pathname);
  if (pesado) {   // cache primeiro
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, cp)); }
      return resp;
    })));
  } else {        // rede primeiro (código sempre atualizado)
    e.respondWith(fetch(e.request).then(resp => {
      if (resp.ok) { const cp = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, cp)); }
      return resp;
    }).catch(() => caches.match(e.request)));
  }
});
