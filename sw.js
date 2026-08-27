/* Sobra do Mês — service worker
   Objetivo: o app abre e funciona sem internet, e as notificações
   continuam sendo entregues pelo sistema mesmo com a aba fechada. */
const VERSAO = 'sobra-v5.2.0';
const CASCA = [
  '/', '/index.html', '/styles.css', '/app.js', '/auth.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    // addAll falha inteiro se um item falhar; guardamos um a um
    await Promise.all(CASCA.map(u => c.add(u).catch(() => {})));
    // Sem skipWaiting: a versão nova fica em espera e a página oferece o
    // botão "Atualizar". Quem decide a hora de trocar é a pessoa.
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    // Sem clients.claim(): assumir uma página que ainda está sendo lida trava
    // o carregamento dos scripts dela. O SW passa a valer na próxima navegação,
    // que é o comportamento padrão e seguro.
  })());
});

/* Navegação: rede primeiro (pega o deploy novo), cai pro cache offline.
   Estáticos do mesmo domínio: cache primeiro, com atualização em segundo plano.

   Regra de ouro deste arquivo: guardar a cópia SEMPRE antes de devolver a
   resposta, e devolver a original. Clonar depois de entregar trava o corpo e
   o navegador fica esperando um script que nunca termina. */
function guardar(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return;
  const copia = res.clone();
  caches.open(VERSAO).then(c => c.put(req, copia)).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;                    // Supabase e fontes passam direto
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const doCache = () => caches.match('/index.html').then(r => r || caches.match('/'));

      // Sem internet, nem tenta a rede: esperar o navegador desistir custa
      // segundos de tela parada. A cópia salva abre na hora.
      if (!self.navigator.onLine) {
        const c = await doCache();
        if (c) return c;
      }

      // Com internet, a rede tem 2,5 s para responder. Passou disso, abre pela
      // cópia salva — melhor um app instantâneo e um pouco antigo do que uma
      // tela branca no 3G ruim.
      const daRede = (async () => {
        const pre = await e.preloadResponse;
        const res = pre || await fetch(req);
        guardar(new Request('/index.html'), res);
        return res;
      })();
      const relogio = new Promise(r => setTimeout(() => r(null), 2500));

      try {
        const res = await Promise.race([daRede, relogio]);
        if (res) return res;
        const c = await doCache();
        if (c) { e.waitUntil(daRede.catch(() => {})); return c; }
        return await daRede;
      } catch (_) {
        const c = await doCache();
        return c || new Response(
          '<meta charset="utf-8"><p style="font:16px system-ui;padding:24px">Sem conexão e sem cópia salva. Abra o app uma vez com internet.',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const guardado = await caches.match(req);
    if (guardado) {
      // Revalida em segundo plano, sem prender a resposta que já foi entregue.
      e.waitUntil(fetch(req).then(res => guardar(req, res)).catch(() => {}));
      return guardado;
    }
    try {
      const res = await fetch(req);
      guardar(req, res);
      return res;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
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
  if (d.tipo === 'versao') {
    // Responde pelo canal que a página abriu; se não houver, pelo cliente.
    const porta = e.ports && e.ports[0];
    if (porta) porta.postMessage({ tipo: 'versao', versao: VERSAO });
    else if (e.source) e.source.postMessage({ tipo: 'versao', versao: VERSAO });
  }
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
