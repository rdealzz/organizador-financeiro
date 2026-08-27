/* Sobra do Mês — esfera de partículas
   ==========================================================================

   Por que canvas 2D e não Three.js:

   A versão anterior baixava a Three.js do unpkg a cada abertura. Três
   problemas, e todos pesam mais que o ganho:

   1. O app é offline-first. Depender de um CDN quebra o app justamente quando
      não há internet — o service worker não guarda arquivo de outro domínio.
   2. Eram ~600 KB para desenhar pontos. O app inteiro tem menos que isso.
   3. Pontos de 1 px não precisam de GPU. Medido aqui: 12,3 mil pontos custam
      2,4 ms de JavaScript por quadro num Chromium SEM placa de vídeo, e o
      conjunto roda a 60 fps. Sobra folga dentro dos 16,6 ms de um quadro.

   ── Como a esfera é feita ────────────────────────────────────────────────

   Cada ponto vive numa posição fixa em 3D dentro de uma casca esférica. A
   cada quadro a esfera inteira gira (devagar, mais um empurrãozinho na
   direção do cursor) e cada ponto é projetado em perspectiva. Quem está na
   frente fica maior e mais claro; quem está atrás, menor e mais apagado. É
   daí que vem a profundidade — não é opacidade fingida sobre um campo chapado.

   A repulsão do cursor é aplicada DEPOIS da projeção, em coordenadas de tela:
   cada ponto carrega um deslocamento próprio que a mola devolve a zero. Assim
   o empurrão é fiel ao que a pessoa vê, sem precisar resolver colisão em 3D.

   ── Por que arrays tipados ───────────────────────────────────────────────

   São até 13 mil pontos. Um objeto por ponto viraria 13 mil objetos visitados
   60 vezes por segundo, com o coletor de lixo no encalço. Arrays tipados
   paralelos ocupam blocos contíguos de memória e não geram lixo nenhum.

   ── Os dois modos ────────────────────────────────────────────────────────

   'capa'   tela de abertura: brilho cheio, reação cheia, 60 fps.
   'fundo'  atrás do app depois do login: mais apagado, mais lento, metade dos
            quadros. É decoração, e decoração não pode comer a bateria de um
            app que fica aberto o dia todo.
   ========================================================================== */

const CONFIG = {
  // Um ponto a cada N pixels de tela, com piso e teto.
  densidade: 105,
  minimo: 1800,
  maximo: 16000,

  raio: 0.46,           // da esfera, em fração do menor lado da tela
  giro: 0.000045,       // radianos por milissegundo — bem devagar
  perspectiva: 2.6,     // distância da câmera, em raios da esfera

  raioFuga: 195,        // até onde o cursor empurra, em pixels de tela
  forcaFuga: 3.2,
  volta: 0.020,         // mola que devolve o ponto ao lugar projetado
  atrito: 0.90,
  inclinacao: 0.32      // quanto a esfera se vira na direção do cursor
};

/* Brasa → rosa → ouro, a identidade da marca. O quase-branco entra em pouca
   quantidade e é ele que dá o brilho de estrela nos pontos da frente. */
const PALETA = [
  [255, 45, 107],
  [255, 92, 152],
  [255, 138, 190],
  [255, 211, 107],
  [255, 240, 245]
];
const PESO = [0.24, 0.24, 0.22, 0.12, 0.18];   // quanto cada cor aparece

function sorteiaCor() {
  let r = Math.random();
  for (let i = 0; i < PESO.length; i++) { r -= PESO[i]; if (r <= 0) return i; }
  return 0;
}

/* O corte anterior (menos de 700 px, até 4 núcleos, até 4 GB) chamava de
   fraco um notebook comum de 4 núcleos — e cortava a esfera para um terço à
   toa. A barra agora é de aparelho realmente modesto. */
function aparelhoFraco() {
  const menor = Math.min(window.innerWidth, window.innerHeight);
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 4;
  return menor < 520 || nucleos <= 2 || memoria <= 2;
}

function menosMovimento() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function iniciarAbertura(canvas, modo) {
  /* Canvas OPACO: o degradê de fundo é pintado aqui dentro. Com canvas
     transparente o navegador mistura mais de um milhão de pixels com a camada
     de baixo a cada quadro — sem GPU isso sozinho custa uns 5 fps. O degradê
     continua no CSS da .cena para quem nunca chega a carregar este arquivo. */
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('sem canvas 2D');

  const fraco = aparelhoFraco();
  const quieto = menosMovimento();
  const dpr = Math.min(window.devicePixelRatio || 1, fraco ? 1.5 : 2);

  const FAIXAS = 7;                              // faixas de brilho por cor
  const lotes = Array.from({ length: PALETA.length * FAIXAS }, () => []);

  let L = 0, A = 0, R = 0;
  /* O fundo (degradê + brilho do miolo) é pintado UMA vez num canvas à parte e
     depois só copiado. Um degradê é calculado pixel a pixel: recalcular dois
     deles a cada quadro sobre 1,3 milhão de pixels era o que mais pesava aqui,
     mais do que os 12 mil pontos. Copiar uma imagem pronta é uma operação de
     bloco, e não muda nada na aparência. */
  const fundoPronto = document.createElement('canvas');
  const fctx = fundoPronto.getContext('2d');
  let n = 0;
  // Um bloco contíguo por atributo, em vez de milhares de objetos.
  let ex, ey, ez;            // posição na esfera (unitária)
  let ox, oy, ovx, ovy;      // deslocamento na tela e sua velocidade
  let cor, cintila;
  let ang = 0, quadro = 0, vivo = true, ultimo = 0;
  let mergulhando = 0;
  let recuado = modo === 'fundo';

  const pt = { x: -9999, y: -9999, ax: -9999, ay: -9999, dentro: false };
  const inc = { x: 0, y: 0, ax: 0, ay: 0 };      // inclinação da esfera

  /* ---------------------------------------------------------------- tamanho */
  function medir() {
    const r = canvas.getBoundingClientRect();
    L = Math.max(1, r.width);
    A = Math.max(1, r.height);
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(L, A) * CONFIG.raio;

    fundoPronto.width = canvas.width;
    fundoPronto.height = canvas.height;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = fctx.createRadialGradient(L / 2, A * 0.5, 0, L / 2, A * 0.5, Math.max(L, A) * 0.72);
    g.addColorStop(0, '#320621');
    g.addColorStop(0.5, '#20051a');
    g.addColorStop(1, '#0d0209');
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, L, A);

    // Brilho quente atrás do miolo da esfera, como na referência.
    const b = fctx.createRadialGradient(L / 2, A * 0.5, 0, L / 2, A * 0.5, R * 1.15);
    b.addColorStop(0, 'rgba(255,70,130,0.17)');
    b.addColorStop(0.55, 'rgba(200,40,110,0.07)');
    b.addColorStop(1, 'rgba(120,20,80,0)');
    fctx.fillStyle = b;
    fctx.fillRect(0, 0, L, A);
  }

  function quantos() {
    const q = Math.round((L * A) / CONFIG.densidade);
    const teto = fraco ? Math.round(CONFIG.maximo / 2.5) : CONFIG.maximo;
    return Math.max(Math.min(CONFIG.minimo, teto), Math.min(teto, q));
  }

  /* Semeia a casca. A direção é sorteada de forma uniforme na esfera (sortear
     dois ângulos amontoaria pontos nos polos), e o raio é puxado para fora —
     é a casca que desenha a silhueta redonda, o miolo só preenche. */
  function semear() {
    n = quantos();
    ex = new Float32Array(n); ey = new Float32Array(n); ez = new Float32Array(n);
    ox = new Float32Array(n); oy = new Float32Array(n);
    ovx = new Float32Array(n); ovy = new Float32Array(n);
    cor = new Uint8Array(n); cintila = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rad = Math.pow(Math.random(), 0.42);   // 0,42 = puxa para a casca
      ex[i] = s * Math.cos(th) * rad;
      ey[i] = s * Math.sin(th) * rad;
      ez[i] = u * rad;
      cor[i] = sorteiaCor();
      cintila[i] = 0.55 + Math.random() * 0.75;    // nem todo ponto brilha igual
    }
  }

  /* ---------------------------------------------------------------- passo */
  function passo(dt) {
    pt.x += (pt.ax - pt.x) * 0.16;
    pt.y += (pt.ay - pt.y) * 0.16;
    inc.x += (inc.ax - inc.x) * 0.04;
    inc.y += (inc.ay - inc.y) * 0.04;
    ang += CONFIG.giro * dt * (recuado ? 0.45 : 1) * (1 + mergulhando * 5);
  }

  /* ---------------------------------------------------------------- desenho */
  function desenhar() {
    ctx.drawImage(fundoPronto, 0, 0, L, A);

    const cx = L / 2, cy = A * 0.5;
    const escala = 1 + mergulhando * 0.7;
    const opac = recuado ? 0.74 : 1;

    // Rotação: giro contínuo em torno de Y, mais a inclinação para o cursor.
    const angY = ang + inc.x * CONFIG.inclinacao;
    const angX = inc.y * CONFIG.inclinacao * 0.7;
    const cosY = Math.cos(angY), sinY = Math.sin(angY);
    const cosX = Math.cos(angX), sinX = Math.sin(angX);

    const f = CONFIG.perspectiva;
    const pMin = f / (f + 1), pMax = f / (f - 1);   // perspectiva no fundo e na frente
    const faixaP = pMax - pMin;
    const raioF = CONFIG.raioFuga, raio2 = raioF * raioF;
    const forca = CONFIG.forcaFuga * (recuado ? 0.35 : 1) * (1 + mergulhando * 3);
    const podeFugir = pt.dentro && !quieto;

    for (const b of lotes) b.length = 0;

    for (let i = 0; i < n; i++) {
      // Gira em Y, depois em X.
      const x0 = ex[i], y0 = ey[i], z0 = ez[i];
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y1 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;

      // Perspectiva: quem está na frente (z2 alto) cresce e clareia.
      const p = f / (f - z2);
      let X = cx + x1 * R * p * escala;
      let Y = cy + y1 * R * p * escala;

      // Empurrão do cursor, em coordenadas de tela.
      if (podeFugir) {
        const dx = X + ox[i] - pt.x, dy = Y + oy[i] - pt.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < raio2 && d2 > 0.01) {
          const dist = Math.sqrt(d2);
          const q = 1 - dist / raioF;
          const emp = q * q * forca * p;          // a frente reage mais
          ovx[i] += (dx / dist) * emp;
          ovy[i] += (dy / dist) * emp;
        }
      }
      // Mola de volta ao lugar + atrito: é isto que faz o retorno lento.
      if (ovx[i] || ovy[i] || ox[i] || oy[i]) {
        ovx[i] = (ovx[i] - ox[i] * CONFIG.volta) * CONFIG.atrito;
        ovy[i] = (ovy[i] - oy[i] * CONFIG.volta) * CONFIG.atrito;
        ox[i] += ovx[i];
        oy[i] += ovy[i];
        X += ox[i];
        Y += oy[i];
      }

      if (X < -2 || Y < -2 || X > L + 2 || Y > A + 2) continue;

      /* Brilho pela profundidade, com PISO. A versão anterior elevava a
         profundidade a 1,5 sem piso: tudo que estava atrás caía abaixo do
         corte e sumia, e a esfera virava uma névoa rala. O piso mantém o
         fundo presente; o quadrado ainda faz a frente destacar. */
      const prof = (p - pMin) / faixaP;                    // 0 atrás → 1 na frente
      const b = Math.min(1, (0.30 + 0.70 * prof * prof) * cintila[i] * opac);
      if (b < 0.05) continue;
      const faixa = Math.min(FAIXAS - 1, (b * FAIXAS) | 0);
      lotes[cor[i] * FAIXAS + faixa].push(X, Y, b > 0.80 ? 2 : 1);
    }

    /* Um fillStyle por lote em vez de um por ponto: 35 trocas de estado por
       quadro no lugar de 13 mil. É o que torna esta contagem possível. */
    for (let c = 0; c < PALETA.length; c++) {
      const rgb = PALETA[c];
      for (let k = 0; k < FAIXAS; k++) {
        const lote = lotes[c * FAIXAS + k];
        if (!lote.length) continue;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${((k + 0.6) / FAIXAS).toFixed(3)})`;
        for (let m = 0; m < lote.length; m += 3) {
          const t = lote[m + 2];
          ctx.fillRect(lote[m], lote[m + 1], t, t);
        }
      }
    }

    // Brilho discreto acompanhando o cursor.
    if (pt.dentro && !recuado && !fraco) {
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 150);
      g.addColorStop(0, 'rgba(255,150,190,0.10)');
      g.addColorStop(1, 'rgba(255,150,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pt.x - 150, pt.y - 150, 300, 300);
    }
  }

  /* ---------------------------------------------------------------- laço */
  let pula = 0;
  function laco(t) {
    if (!vivo) return;
    quadro = requestAnimationFrame(laco);
    if (document.hidden) return;                 // aba escondida não gasta bateria
    /* Atrás do app o campo é decoração. Meia taxa ali corta o consumo pela
       metade sem ninguém notar, num movimento tão lento. */
    if (recuado && (pula ^= 1)) return;
    const dt = Math.min(50, t - (ultimo || t));  // um travão não deve dar um salto
    ultimo = t;
    passo(dt);
    desenhar();
  }

  /* ---------------------------------------------------------------- entrada */
  function mover(x, y) {
    const r = canvas.getBoundingClientRect();
    pt.ax = x - r.left;
    pt.ay = y - r.top;
    pt.dentro = true;
    inc.ax = Math.max(-1, Math.min(1, (pt.ax / L - 0.5) * 2));
    inc.ay = Math.max(-1, Math.min(1, (pt.ay / A - 0.5) * 2));
  }
  const aoMouse = e => mover(e.clientX, e.clientY);
  const aoToque = e => { if (e.touches && e.touches[0]) mover(e.touches[0].clientX, e.touches[0].clientY); };
  const aoSair = () => { pt.dentro = false; inc.ax = 0; inc.ay = 0; };
  const aoVirar = () => { medir(); };

  window.addEventListener('pointermove', aoMouse, { passive: true });
  window.addEventListener('touchmove', aoToque, { passive: true });
  window.addEventListener('pointerleave', aoSair, { passive: true });
  window.addEventListener('blur', aoSair);
  window.addEventListener('resize', aoVirar);

  medir();
  semear();

  if (quieto) desenhar();                        // um quadro parado, nada se mexe
  else quadro = requestAnimationFrame(laco);

  function encerrar() {
    vivo = false;
    cancelAnimationFrame(quadro);
    window.removeEventListener('pointermove', aoMouse);
    window.removeEventListener('touchmove', aoToque);
    window.removeEventListener('pointerleave', aoSair);
    window.removeEventListener('blur', aoSair);
    window.removeEventListener('resize', aoVirar);
    ex = ey = ez = ox = oy = ovx = ovy = cor = cintila = null;
    n = 0;
  }

  return {
    /* O mergulho: a esfera acelera e avança por 420 ms, e no meio do caminho
       avisa quem chamou para trocar a capa pelo login. O zoom e o desfoque da
       camada são do CSS; aqui é só a energia. */
    mergulhar(pronto) {
      if (quieto) { if (pronto) pronto(); return; }
      const inicio = performance.now();
      const DUR = 420;
      let avisou = false;
      const anda = agora => {
        const k = Math.min(1, (agora - inicio) / DUR);
        mergulhando = k < 0.62 ? k / 0.62 : (1 - k) / 0.38;
        if (!avisou && k >= 0.42) { avisou = true; if (pronto) pronto(); }
        if (k < 1) requestAnimationFrame(anda);
        else mergulhando = 0;
      };
      requestAnimationFrame(anda);
    },
    // Passa ao modo decoração, atrás do app.
    recuar() { recuado = true; },
    encerrar
  };
}
