/* Sobra do Mês — service worker
   Objetivo: o app abre e funciona sem internet, e as notificações
   continuam sendo entregues pelo sistema mesmo com a aba fechada. */
const VERSAO = 'sobra-v2.0.0';
const CASCA = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    // addAll falha inteiro se um item falhar; guardamos um a um
    await Promise.all(CASCA.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/* Navegação: rede primeiro (pega deploy novo), cai pro cache offline.
   Estáticos do mesmo domínio: cache primeiro, revalida em segundo plano. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse;
        const res = pre || await fetch(req);
        const c = await caches.open(VERSAO);
        c.put('/index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('/index.html')) || (await caches.match('/')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    const rede = fetch(req).then(res => {
      if (res && res.ok) caches.open(VERSAO).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return hit || (await rede) ||
      new Response('', { status: 504 });
  })());
});

/* A página manda o alerta pronto; o SW só entrega.
   Assim o alerta aparece como notificação do sistema, com ação de abrir. */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.tipo === 'notificar') {
    self.registration.showNotification(d.titulo || 'Sobra do Mês', {
      body: d.corpo || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag || 'sobra',
      renotify: false,
      requireInteraction: false,
      silent: false,
      vibrate: [40, 60, 40],
      data: { aba: d.aba || '', url: d.url || '/' }
    });
  }
  if (d.tipo === 'pular-espera') self.skipWaiting();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const aba = (e.notification.data && e.notification.data.aba) || '';
  const alvo = aba ? '/?aba=' + aba : '/';
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if (c.url.includes(location.origin)) {
        await c.focus();
        c.postMessage({ tipo: 'abrir-aba', aba });
        return;
      }
    }
    await self.clients.openWindow(alvo);
  })());
});

/* Onde o navegador suportar (Chrome/Android instalado), ele acorda o SW
   de tempos em tempos e a página faz a checagem dos alertas. */
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'checar-alertas') return;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ tipo: 'checar-alertas' }));
  })());
});
