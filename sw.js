/* Sobra do Mês — service worker
   Objetivo: o app abre e funciona sem internet, e as notificações
   continuam sendo entregues pelo sistema mesmo com a aba fechada. */
const VERSAO = 'sobra-v5.4.0';
const CASCA = [
  '/', '/index.html', '/styles.css', '/app.js', '/auth.js', '/intro.js', '/manifest.webmanifest',
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

/* Cada versão do app é um conjunto fechado: HTML, CSS e JS saem sempre do
   mesmo cache. Nada de "rede primeiro" para o HTML — misturar HTML novo com
   CSS velho quebra a tela. A troca acontece de uma vez só, quando o service
   worker seguinte assume.

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
      /* O HTML sai do MESMO cache que o CSS e o JS.
         Antes a navegação buscava da rede primeiro enquanto os estáticos vinham
         do cache: entre dois deploys o app abria com HTML novo e CSS velho, e a
         tela quebrava (botões sem estilo, funções que não existiam ainda).
         Agora cada versão é um conjunto fechado. A versão nova não entra por
         aqui: ela chega instalando outro service worker, que enche o próprio
         cache e espera a pessoa tocar em "Atualizar". */
      const doCache = await caches.match('/index.html') || await caches.match('/');
      if (doCache) return doCache;

      // Sem cópia salva (primeira visita com este SW): busca da rede e guarda.
      try {
        const pre = await e.preloadResponse;
        const res = pre || await fetch(req);
        guardar(new Request('/index.html'), res);
        return res;
      } catch (_) {
        return new Response(
          '<meta charset="utf-8"><p style="font:16px system-ui;padding:24px">Sem conexão e sem cópia salva. Abra o app uma vez com internet.',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    /* Sem revalidação em segundo plano, pelo mesmo motivo da navegação: trazer
       um arquivo novo para o cache de uma versão antiga mistura as duas. O
       conteúdo de cada versão é imutável; quem troca tudo de uma vez é o
       service worker seguinte. */
    const guardado = await caches.match(req);
    if (guardado) return guardado;
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
