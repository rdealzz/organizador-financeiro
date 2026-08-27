/* Sobra do Mês — campo de partículas da abertura
   ==========================================================================

   Por que canvas 2D e não Three.js:

   A versão anterior baixava a Three.js do unpkg.com a cada abertura. Três
   problemas com isso, e todos pesam mais que o ganho visual:

   1. O app é offline-first. Uma dependência de CDN quebra justamente na hora
      em que a pessoa mais precisa que ele abra — sem internet. O service
      worker não consegue guardar arquivo de outro domínio.
   2. São ~600 KB para desenhar pontos. O app inteiro tem menos que isso.
   3. O efeito que se quer aqui — partículas que fogem do cursor, voltam
      devagar e se ligam por linhas — é território nativo do canvas 2D. Em
      WebGL isso exigiria mexer nos buffers a cada quadro, que é justamente
      onde ele deixa de ser mais rápido.

   O que este arquivo entrega: campo em tela cheia, repulsão pelo ponteiro,
   volta elástica, linhas de ligação entre vizinhas, profundidade real por
   parallax, brilho seguindo o cursor. Sem dependência nenhuma.

   Custo medido com as duas camadas cheias (cerca de 1.850 pontos de poeira
   mais 150 de constelação a 1440×900): 0,1 ms de física e 0,5 ms de desenho
   por quadro, 60 fps mesmo num Chromium sem placa de vídeo.
   ========================================================================== */

/* O campo tem DUAS camadas, e é a diferença entre elas que dá profundidade:

   POEIRA      milhares de pontinhos nítidos, bem ao fundo. É o que enche a
               tela. Não tem halo nem ligação com ninguém — só posição, brilho
               e parallax. Por isso pode ser numerosa: o desenho dela são
               retângulos de 1 a 2 px, agrupados por cor e brilho, e o custo
               por ponto é quase zero.

   CONSTELAÇÃO as partículas maiores, com halo, que se ligam por linhas. Estas
               são caras (a ligação é par a par, cresce ao quadrado), então
               continuam poucas e limitadas por área de tela.

   Aumentar a poeira é barato; aumentar a constelação, não. */
const CONFIG = {
  // Uma partícula a cada N pixels de tela, com piso e teto.
  densidade: 13000,
  minimo: 46,
  maximo: 150,

  // A poeira: bem mais densa, e o teto é alto porque cada ponto custa pouco.
  densidadePo: 700,
  minimoPo: 320,
  maximoPo: 2600,

  raioFuga: 155,        // até onde o ponteiro empurra
  forcaFuga: 0.62,      // quanto empurra
  raioLigacao: 132,     // até onde duas partículas se enxergam
  volta: 0.0115,        // mola que traz de volta ao lugar de origem
  atrito: 0.918,        // quanto da velocidade sobrevive a cada quadro
  parallax: 34,         // deslocamento máximo do fundo pelo ponteiro
  deriva: 0.16          // vida própria quando ninguém mexe o mouse
};

/* A identidade de cor da marca: brasa → rosa → ouro sobre ameixa. */
const PALETA = [
  [255, 45, 107],
  [255, 92, 152],
  [255, 138, 190],
  [255, 211, 107]
];

/* Cada partícula é uma imagem pronta, desenhada uma vez na partida.
   Montar um gradiente radial por partícula por quadro custa caro — com 170
   delas a 60 fps seriam 10 mil gradientes por segundo, e era o que segurava a
   animação em 44 fps. Assim o laço de desenho vira só drawImage. */
function fazerSprite(c) {
  const S = 64, meio = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g2 = cv.getContext('2d');
  const g = g2.createRadialGradient(meio, meio, 0, meio, meio, meio);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.55)`);
  g.addColorStop(.18, `rgba(${c[0]},${c[1]},${c[2]},.30)`);
  g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  g2.fillStyle = g;
  g2.fillRect(0, 0, S, S);
  g2.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  g2.beginPath();
  g2.arc(meio, meio, S / 9, 0, 6.2832);   // núcleo: 1/4,5 do halo
  g2.fill();
  return cv;
}

function aparelhoFraco() {
  const menor = Math.min(window.innerWidth, window.innerHeight);
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 4;
  return menor < 700 || nucleos <= 4 || memoria <= 4;
}

function menosMovimento() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function iniciarAbertura(canvas) {
  /* Canvas OPACO, e o degradê de fundo é pintado aqui dentro.
     Com canvas transparente o navegador precisa misturar 1,3 milhão de pixels
     com o degradê da camada de baixo a cada quadro — sem placa de vídeo isso
     sozinho custa uns 5 fps. Opaco, ele só substitui. O degradê continua no
     CSS da .cena para quem nunca chega a carregar este arquivo. */
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('sem canvas 2D');

  const fraco = aparelhoFraco();
  const quieto = menosMovimento();
  const dpr = Math.min(window.devicePixelRatio || 1, fraco ? 1.5 : 2);

  // Imagens das partículas e lotes de linhas: montados uma vez, reusados
  // em todos os quadros.
  const sprites = PALETA.map(fazerSprite);
  const FAIXAS = 5;
  const lotes = Array.from({ length: PALETA.length * FAIXAS }, () => []);
  const lotesPo = Array.from({ length: PALETA.length * FAIXAS }, () => []);

  let L = 0, A = 0;                 // largura e altura em pixels de CSS
  let fundo = null;                 // degradê de fundo, remontado a cada tamanho
  let pontos = [];
  let poeira = [];
  let quadro = 0;
  let vivo = true;
  let mergulhando = 0;              // 0 = parado, sobe até 1 durante a entrada
  let calmo = false;                // modo de fundo, atrás do login

  // Ponteiro: alvo (para onde ele foi) e atual (perseguindo com suavidade).
  const pt = { x: -9999, y: -9999, ax: -9999, ay: -9999, dentro: false };
  // Parallax: -1..1 nos dois eixos, também suavizado.
  const par = { x: 0, y: 0, ax: 0, ay: 0 };

  /* ---------------------------------------------------------------- tamanho */
  function medir() {
    const r = canvas.getBoundingClientRect();
    L = Math.max(1, r.width);
    A = Math.max(1, r.height);
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // O mesmo degradê que está no CSS da .cena, montado uma vez por tamanho.
    fundo = ctx.createRadialGradient(L / 2, A * 0.52, 0, L / 2, A * 0.52, Math.max(L, A) * 0.78);
    fundo.addColorStop(0, '#4a0830');
    fundo.addColorStop(0.46, '#2a0722');
    fundo.addColorStop(1, '#17040f');
  }

  function quantas(dens, min, max) {
    const n = Math.round((L * A) / dens);
    const teto = fraco ? Math.round(max / 2) : max;
    return Math.max(Math.min(min, teto), Math.min(teto, n));
  }

  /* Semeia guardando a posição relativa: numa virada de tela o campo
     acompanha em vez de recomeçar do zero. */
  function semear(preservar) {
    pontos = semearCamada(preservar ? pontos : null,
      quantas(CONFIG.densidade, CONFIG.minimo, CONFIG.maximo), false);
    poeira = semearCamada(preservar ? poeira : null,
      quantas(CONFIG.densidadePo, CONFIG.minimoPo, CONFIG.maximoPo), true);
  }

  function semearCamada(antigos, n, ehPoeira) {
    const saida = [];
    for (let i = 0; i < n; i++) {
      const velho = antigos && antigos[i];
      const u = velho ? velho.hx / Math.max(1, velho.L) : Math.random();
      const v = velho ? velho.hy / Math.max(1, velho.A) : Math.random();
      /* A poeira fica atrás: profundidade baixa, e por isso menor, mais fraca
         e com menos parallax. É essa separação que faz as duas camadas se
         lerem como distantes uma da outra em vez de virarem uma sopa só. */
      const z = velho ? velho.z
        : ehPoeira ? 0.10 + Math.random() * 0.42
                   : 0.36 + Math.random() * 0.64;
      const ic = velho ? velho.ic : (Math.random() * PALETA.length) | 0;
      const hx = u * L, hy = v * A;
      saida.push({
        hx, hy, L, A,
        x: velho ? velho.x : hx,
        y: velho ? velho.y : hy,
        vx: 0, vy: 0,
        z,
        // Poeira: 0,4 a 1,2 px de raio — pontinho nítido, sem halo.
        r: ehPoeira ? 0.4 + z * 1.6 : 0.65 + z * 1.75,
        ic,                                    // índice na paleta
        cor: PALETA[ic],
        fase: Math.random() * Math.PI * 2,      // desencontra a deriva
        giro: 0.16 + Math.random() * 0.5
      });
    }
    return saida;
  }

  /* ---------------------------------------------------------------- física */
  function passo(t) {
    // O ponteiro e o parallax perseguem o alvo — nada salta de um quadro
    // para o outro, é isso que dá a sensação de peso.
    pt.x += (pt.ax - pt.x) * 0.16;
    pt.y += (pt.ay - pt.y) * 0.16;
    par.x += (par.ax - par.x) * 0.05;
    par.y += (par.ay - par.y) * 0.05;

    const raio = CONFIG.raioFuga * (calmo ? 0.55 : 1);
    const forca = CONFIG.forcaFuga * (calmo ? 0.4 : 1) * (1 + mergulhando * 2.4);
    const raio2 = raio * raio;

    const d = CONFIG.deriva * (calmo ? 0.5 : 1);

    // A poeira também foge do cursor: ela é o grosso do que se vê, e um fundo
    // parado atrás de partículas que reagem entregaria o truque na hora.
    for (const camada of [pontos, poeira]) {
      for (const p of camada) {
        // Deriva: círculo lento e minúsculo, para o campo nunca parecer morto.
        p.vx += Math.cos(t * 0.00035 * p.giro + p.fase) * d * 0.05;
        p.vy += Math.sin(t * 0.00042 * p.giro + p.fase) * d * 0.05;

        // Fuga do ponteiro. A força cai com o quadrado da distância para o
        // empurrão ser firme de perto e não existir de longe.
        if (pt.dentro) {
          const dx = p.x - pt.x, dy = p.y - pt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < raio2 && d2 > 0.01) {
            const dist = Math.sqrt(d2);
            const q = 1 - dist / raio;
            const emp = q * q * forca * (0.45 + p.z * 0.85);   // frente reage mais
            p.vx += (dx / dist) * emp;
            p.vy += (dy / dist) * emp;
          }
        }

        // Mola de volta para casa + atrito. Juntos fazem o retorno lento.
        p.vx += (p.hx - p.x) * CONFIG.volta;
        p.vy += (p.hy - p.y) * CONFIG.volta;
        p.vx *= CONFIG.atrito;
        p.vy *= CONFIG.atrito;
        p.x += p.vx;
        p.y += p.vy;
      }
    }
  }

  /* ---------------------------------------------------------------- desenho */
  function desenhar() {
    // Pinta o fundo em vez de limpar: o canvas é opaco.
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, L, A);

    const escala = 1 + mergulhando * 0.55;      // o campo avança no mergulho
    const cx = L / 2, cy = A / 2;
    const opacidade = calmo ? 0.78 : 1;

    /* POEIRA — a camada de trás, desenhada primeiro.
       Retângulos de 1 a 2 px agrupados por cor e brilho: um fillStyle por
       lote em vez de um por ponto. É isso que permite milhares deles sem
       pesar. Nada de halo aqui — halo em ponto pequeno vira borrão, e o que
       se quer é o pontinho nítido. */
    for (const b of lotesPo) b.length = 0;
    for (let i = 0; i < poeira.length; i++) {
      const p = poeira[i];
      const desl = p.z / 0.52;
      let x = p.x + par.x * CONFIG.parallax * 0.45 * desl;
      let y = p.y + par.y * CONFIG.parallax * 0.45 * desl;
      if (escala !== 1) { x = cx + (x - cx) * escala; y = cy + (y - cy) * escala; }
      if (x < -4 || y < -4 || x > L + 4 || y > A + 4) continue;
      const alfa = (0.16 + p.z * 1.15) * opacidade;
      const faixa = Math.min(FAIXAS - 1, (alfa / 0.76 * FAIXAS) | 0);
      const t = p.r < 0.75 ? 1 : p.r < 1.25 ? 1.5 : 2;
      lotesPo[p.ic * FAIXAS + faixa].push(x, y, t);
    }
    for (let ic = 0; ic < PALETA.length; ic++) {
      const c = PALETA[ic];
      for (let k = 0; k < FAIXAS; k++) {
        const lote = lotesPo[ic * FAIXAS + k];
        if (!lote.length) continue;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${((k + 0.6) / FAIXAS * 0.76).toFixed(3)})`;
        for (let m = 0; m < lote.length; m += 3) {
          const t = lote[m + 2];
          ctx.fillRect(lote[m] - t / 2, lote[m + 1] - t / 2, t, t);
        }
      }
    }

    // Posição final de cada partícula: física + parallax por profundidade
    // + escala do mergulho. Calculada uma vez e reaproveitada nas ligações.
    const px = [], py = [], pz = [];
    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i];
      const desl = (p.z - 0.34) / 0.66;
      let x = p.x + par.x * CONFIG.parallax * desl;
      let y = p.y + par.y * CONFIG.parallax * desl;
      if (escala !== 1) {
        x = cx + (x - cx) * escala;
        y = cy + (y - cy) * escala;
      }
      px[i] = x; py[i] = y; pz[i] = p.z;
    }

    /* Ligações primeiro, para as partículas ficarem por cima delas.

       Cada segmento tem uma opacidade própria, e trocar strokeStyle a cada
       linha custaria milhares de trocas de estado por quadro. Em vez disso os
       segmentos caem em lotes (cor × faixa de opacidade) e cada lote vira um
       traçado só: no máximo 20 chamadas de stroke por quadro, em vez de uma
       por linha. */
    const rl = CONFIG.raioLigacao * (calmo ? 0.8 : 1);
    const rl2 = rl * rl;
    for (const b of lotes) b.length = 0;

    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        const dx = px[i] - px[j], dy = py[i] - py[j];
        const d2 = dx * dx + dy * dy;
        if (d2 > rl2) continue;
        const a = 1 - Math.sqrt(d2) / rl;
        // Ligação só entre partículas de profundidade parecida: sem isso o
        // campo vira uma malha chapada e a profundidade se perde.
        const perto = 1 - Math.abs(pz[i] - pz[j]);
        const alfa = a * a * perto * 0.34 * opacidade;
        if (alfa < 0.012) continue;
        const faixa = Math.min(FAIXAS - 1, (alfa / 0.34 * FAIXAS) | 0);
        const lote = lotes[pontos[i].ic * FAIXAS + faixa];
        lote.push(px[i], py[i], px[j], py[j]);
      }
    }

    ctx.lineWidth = 1;
    for (let ic = 0; ic < PALETA.length; ic++) {
      const c = PALETA[ic];
      for (let k = 0; k < FAIXAS; k++) {
        const lote = lotes[ic * FAIXAS + k];
        if (!lote.length) continue;
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${((k + 0.5) / FAIXAS * 0.34).toFixed(3)})`;
        ctx.beginPath();
        for (let m = 0; m < lote.length; m += 4) {
          ctx.moveTo(lote[m], lote[m + 1]);
          ctx.lineTo(lote[m + 2], lote[m + 3]);
        }
        ctx.stroke();
      }
    }

    // Partículas em modo aditivo: onde elas se sobrepõem, acende.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i];
      const tam = p.r * 7.5 * (1 + mergulhando * 0.8);  // 7,5 = diâmetro do halo
      ctx.globalAlpha = (0.24 + p.z * 0.58) * opacidade;
      ctx.drawImage(sprites[p.ic], px[i] - tam / 2, py[i] - tam / 2, tam, tam);
    }
    ctx.globalAlpha = 1;

    // Brilho acompanhando o cursor, por cima de tudo, bem discreto.
    if (pt.dentro && !calmo && !fraco) {
      const t = 290;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sprites[2], pt.x - t / 2, pt.y - t / 2, t, t);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- laço */
  let pula = 0;
  function laco(t) {
    if (!vivo) return;
    quadro = requestAnimationFrame(laco);
    if (document.hidden) return;               // aba escondida não gasta bateria
    /* Atrás do login o campo é só ambiência, e ainda por cima fica sob um
       painel de vidro — que obriga o navegador a refazer o desfoque a cada
       quadro novo. Meia taxa ali economiza bateria sem ninguém perceber. */
    if (calmo && (pula ^= 1)) return;
    const _a=performance.now(); passo(t);
    const _b=performance.now(); desenhar();
    (window.__perf=window.__perf||[]).push([_b-_a,performance.now()-_b,pontos.length,poeira.length]);
  }

  /* ---------------------------------------------------------------- entrada */
  function mover(x, y) {
    const r = canvas.getBoundingClientRect();
    pt.ax = x - r.left;
    pt.ay = y - r.top;
    pt.dentro = true;
    par.ax = Math.max(-1, Math.min(1, (pt.ax / L - 0.5) * 2));
    par.ay = Math.max(-1, Math.min(1, (pt.ay / A - 0.5) * 2));
  }
  const aoMouse = e => mover(e.clientX, e.clientY);
  const aoToque = e => { if (e.touches && e.touches[0]) mover(e.touches[0].clientX, e.touches[0].clientY); };
  const aoSair = () => { pt.dentro = false; par.ax = 0; par.ay = 0; };
  const aoVirar = () => { medir(); semear(true); };

  window.addEventListener('pointermove', aoMouse, { passive: true });
  window.addEventListener('touchmove', aoToque, { passive: true });
  window.addEventListener('pointerleave', aoSair, { passive: true });
  window.addEventListener('blur', aoSair);
  window.addEventListener('resize', aoVirar);

  /* ---------------------------------------------------------------- partida */
  medir();
  semear(false);

  if (quieto) {
    // Quem pediu menos movimento recebe um quadro parado: o campo existe,
    // com a mesma identidade, mas nada se mexe.
    desenhar();
  } else {
    quadro = requestAnimationFrame(laco);
  }

  function encerrar() {
    vivo = false;
    cancelAnimationFrame(quadro);
    window.removeEventListener('pointermove', aoMouse);
    window.removeEventListener('touchmove', aoToque);
    window.removeEventListener('pointerleave', aoSair);
    window.removeEventListener('blur', aoSair);
    window.removeEventListener('resize', aoVirar);
    pontos = [];
    poeira = [];
  }

  return {
    /* O mergulho: o campo acelera e avança por 420 ms, e no meio do caminho
       avisa quem chamou para trocar a capa pelo login. A parte visual pesada
       (zoom, blur, escurecer) é do CSS — aqui é só a energia das partículas. */
    mergulhar(pronto) {
      if (quieto) { if (pronto) pronto(); calmo = true; return; }
      const inicio = performance.now();
      const DUR = 420;
      let avisou = false;
      const anda = agora => {
        const k = Math.min(1, (agora - inicio) / DUR);
        mergulhando = k < 0.62 ? k / 0.62 : (1 - k) / 0.38;   // sobe e volta
        if (!avisou && k >= 0.42) { avisou = true; if (pronto) pronto(); }
        if (k < 1) requestAnimationFrame(anda);
        else { mergulhando = 0; calmo = true; }
      };
      requestAnimationFrame(anda);
    },
    encerrar
  };
}
