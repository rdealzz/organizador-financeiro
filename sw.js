/* Sobra do Mês — service worker
   Objetivo: o app abre e funciona sem internet, e as notificações
   continuam sendo entregues pelo sistema mesmo com a aba fechada. */
const VERSAO = 'sobra-v9.0.0';
const CASCA = [
  '/', '/index.html', '/styles.css', '/app.js', '/auth.js', '/intro.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'
];

/* Uma resposta marcada como "redirecionada" NÃO pode ser devolvida numa
   navegação: o navegador recusa a entrega e mostra "Não é possível acessar
   esse site" (ERR_FAILED), sem pista nenhuma de que a culpa é do cache.

   Isto morde aqui porque o vercel.json usa "cleanUrls": true — a hospedagem
   responde 308 em /index.html e manda para /. Quem busca /index.html recebe o
   conteúdo certo, mas com a marca de redirecionado grudada. Guardar essa
   resposta e devolvê-la depois numa navegação derruba o app inteiro.

   A saída é reconstruir a resposta: mesmo corpo, mesmos cabeçalhos, sem a
   marca. */
async function semRedirecionamento(res) {
  if (!res || !res.redirected) return res;
  const corpo = await res.blob();
  return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    // Um a um: addAll falha inteiro se um item falhar. E nada de c.add(), que
    // guardaria a resposta com a marca de redirecionado intacta.
    await Promise.all(CASCA.map(async u => {
      try {
        const res = await fetch(u, { cache: 'reload' });
        if (!res.ok) return;
        await c.put(u, await semRedirecionamento(res));
      } catch (_) {}
    }));
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

   Regra de ouro deste arquivo: clonar SEMPRE antes de devolver a resposta, e
   devolver a original. Clonar depois de entregar trava o corpo e o navegador
   fica esperando um script que nunca termina — por isso quem chama guardar()
   passa um res.clone() feito na hora, e esta função pode consumir à vontade. */
async function guardar(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return;
  try {
    const c = await caches.open(VERSAO);
    await c.put(req, await semRedirecionamento(res));
  } catch (_) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;                    // Firebase e fontes passam direto

  if (req.mode === 'navigate') {
    /* Escotilha de resgate: abrir o site com ?sw=off faz o service worker sair
       da frente por completo. Se um dia o cache ficar corrompido a ponto de a
       página não abrir, este endereço ainda abre — e o app se desregistra. */
    if (url.searchParams.get('sw') === 'off') return;

    e.respondWith((async () => {
      /* Este bloco NUNCA pode terminar em promessa rejeitada: quando isso
         acontece o navegador não mostra erro nenhum do app, mostra
         "Não é possível acessar esse site" (ERR_FAILED) e a pessoa fica sem
         saída. Por isso tudo aqui dentro está protegido e há sempre uma
         resposta de último caso no fim.

         O HTML sai do MESMO cache que o CSS e o JS. Antes a navegação buscava
         da rede primeiro enquanto os estáticos vinham do cache: entre dois
         deploys o app abria com HTML novo e CSS velho e a tela quebrava. Agora
         cada versão é um conjunto fechado; a versão nova chega instalando
         outro service worker, que enche o próprio cache e espera a pessoa
         tocar em "Atualizar". */
      try {
        // '/' primeiro: é o endereço que a hospedagem serve de verdade.
        // /index.html só existe como redirecionamento para cá.
        const doCache = await caches.match('/') || await caches.match('/index.html');
        if (doCache) return await semRedirecionamento(doCache);
      } catch (_) { /* cache indisponível ou corrompido: cai para a rede */ }

      // Sem cópia salva (primeira visita com este SW): busca da rede e guarda.
      try {
        const pre = await e.preloadResponse;
        const res = pre || await fetch(req);
        const limpa = await semRedirecionamento(res);
        guardar(new Request('/'), limpa.clone());
        return limpa;
      } catch (_) {}

      return new Response(
        '<meta charset="utf-8"><p style="font:16px system-ui;padding:24px">Sem conexão e sem cópia salva. Abra o app uma vez com internet.',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  e.respondWith((async () => {
    /* Sem revalidação em segundo plano, pelo mesmo motivo da navegação: trazer
       um arquivo novo para o cache de uma versão antiga mistura as duas. O
       conteúdo de cada versão é imutável; quem troca tudo de uma vez é o
       service worker seguinte. */
    try {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
    } catch (_) { /* cache indisponível: cai para a rede */ }
    try {
      const res = await fetch(req);
      guardar(req, res.clone());
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
