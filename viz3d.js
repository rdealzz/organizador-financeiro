/* Sobra+ — barras 3D de onde cortar
   ==========================================================================

   Por que canvas 2D e não uma biblioteca 3D:

   Pelo mesmo motivo do `intro.js`, e vale repetir porque a tentação volta
   sempre. O app é offline-first e o `vercel.json` usa `script-src 'self'`:
   biblioteca de CDN nem carrega, e vendorizar meio megabyte para desenhar
   trinta caixas custaria mais que o app inteiro. Aqui são ~30 barras, ~150
   polígonos por quadro — um custo que o JavaScript resolve sem GPU.

   ── O que o gráfico DIZ ──────────────────────────────────────────────────

   Duas dimensões de dado, e é isso que justifica a terceira dimensão de tela:

   * **altura** — quanto você gasta ali;
   * **profundidade** — o peso do gasto. *Pode cortar* fica na fileira da
     FRENTE, *essencial* na de trás.

   Daí sai a leitura que uma barra 2D não dá em um olhar: a barra alta lá na
   frente é dinheiro grande que você mesmo classificou como cortável — é por
   ela que se começa. Alta e no fundo é caro e necessário: não é corte, é
   negociação.

   Cor é a CATEGORIA, e continua multicolorida de propósito (a regra das cores
   de dado do projeto). O que a fileira da frente ganha é contorno e brilho,
   não uma cor própria: pintar tudo de vermelho apagaria a categoria, que é a
   informação que diz ONDE cortar.

   ── Como o 3D é feito ────────────────────────────────────────────────────

   Cada barra é uma caixa de 8 cantos em coordenadas de mundo. A cada quadro a
   cena inteira gira em torno do eixo Y (o arrasto do dedo), inclina um pouco
   em X (fixo, é o "olhar de cima") e cada canto é projetado em perspectiva.
   As faces são desenhadas do fundo para a frente (algoritmo do pintor), o que
   dispensa buffer de profundidade: com faces convexas e opacas, ordenar pela
   profundidade média é exato o bastante.
   ========================================================================== */
(function(){
'use strict';

const GRAUS = Math.PI/180;
const CONFIG = {
  inclinacao: -26*GRAUS,   // olhar de cima; negativo põe a câmera acima do chão
  distancia: 8.2,          // câmera no eixo Z, em unidades de mundo
  fov: 3.1,                // quanto a perspectiva "abre"
  giroIdle: 0.10,          // rad/s do giro parado, quando ninguém arrasta
  larguraBarra: 0.62,
  passoX: 1.0,
  passoZ: 1.25,
  alturaMax: 3.0
};

function menosMovimento(){
  try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; }
}
/* Resolve `var(--c10)` — que pode apontar para outra var — para um rgb de
   verdade. O navegador faz a conta melhor do que qualquer parser meu: basta
   pedir a cor computada de um elemento que não aparece. */
function rgbDe(expr){
  const el=document.createElement('span');
  el.style.cssText='position:absolute;left:-9999px;width:0;height:0';
  el.style.color=expr;
  document.body.appendChild(el);
  const s=getComputedStyle(el).color;
  el.remove();
  const m=s.match(/(\d+(?:\.\d+)?)/g);
  return m?[+m[0],+m[1],+m[2]]:[120,120,120];
}
/* Está na tela? (v12.5) Perguntar `checkVisibility()` a cada quadro força o
   navegador a recalcular estilo — medido: com a CPU 4x mais lenta, a planilha
   caía para 31 fps. O IntersectionObserver avisa só quando MUDA. */
function vigia(el){
  const v={na:true};
  if('IntersectionObserver' in window){ v.na=false;
    v.io=new IntersectionObserver(es=>{ v.na=es[es.length-1].isIntersecting; }); v.io.observe(el); }
  return v;
}
/* O balanço assenta: forte no começo, some em ~9 s. Uma cena parada não é
   redesenhada — só quando algo muda —, e isso é bateria e quadro livre para
   o resto da tela. */
const balanco=t=>Math.max(0,1-t/9);
const sombra=(c,f)=>`rgb(${Math.round(c[0]*f)},${Math.round(c[1]*f)},${Math.round(c[2]*f)})`;
const comAlfa=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* barras: [{cat,nome,cor,tier,valor,texto}] — uma por categoria E peso.
   opcoes: {aoSelecionar(barra|null), rotuloTier:[..]} */
function montar(canvas, barras, opcoes){
  const ctx=canvas.getContext('2d');
  if(!ctx) return null;
  const op=opcoes||{};
  const quieto=menosMovimento();
  const dpr=Math.min(window.devicePixelRatio||1, 1.5);   // 1.5: texto nítido, metade dos pixels de 2x (v12.5)

  let L=1,A=1, giro=-0.55, giroVel=0, inclina=CONFIG.inclinacao;
  let arrastando=false, arrastou=false, x0=0, giro0=0, ultimo=0, vivo=true;
  let selecionada=null;
  let cores=new Map(), corFundo=[0,0,0], corTexto=[0,0,0];

  const cats=[]; barras.forEach(b=>{ if(!cats.includes(b.cat)) cats.push(b.cat); });
  const maior=barras.reduce((m,b)=>Math.max(m,b.valor),0)||1;

  function lerCores(){
    cores=new Map();
    barras.forEach(b=>{ if(!cores.has(b.cat)) cores.set(b.cat, rgbDe(b.cor)); });
    corTexto=rgbDe('var(--txt-2)');
    corFundo=rgbDe('var(--sep)');
  }
  function medir(){
    const r=canvas.getBoundingClientRect();
    L=Math.max(1,r.width); A=Math.max(1,r.height);
    canvas.width=Math.round(L*dpr); canvas.height=Math.round(A*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  /* mundo → plano da câmera, ainda SEM escala nem centro.

     A cena é enquadrada depois, em `enquadrar()`: girando, a silhueta muda de
     largura o tempo todo, e uma escala fixa ora deixava metade do gráfico fora
     da caixa, ora um deserto de espaço vazio. Projetar primeiro e escalar
     depois resolve isso de uma vez, em qualquer ângulo e em qualquer tela. */
  let escala=1, centroX=0, centroY=0, calha=70;
  const FONTE_ROT='600 11px system-ui,-apple-system,sans-serif';
  /* A largura da calha dos rótulos é MEDIDA, não chutada: com 70px fixos
     "Pode cortar" saía cortado pela borda esquerda — a fonte do sistema muda de
     largura entre aparelhos, e um número mágico só acerta no meu. */
  function medirCalha(){
    ctx.font=FONTE_ROT;
    const rot=op.rotuloTier||['Essencial','Vale a pena','Pode cortar'];
    calha=Math.min(rot.reduce((m,t)=>Math.max(m,ctx.measureText(t).width),0)+16, L*0.42);
  }
  function bruta(x,y,z){
    const cs=Math.cos(giro), sn=Math.sin(giro);
    const X=x*cs - z*sn, Z=x*sn + z*cs;
    const ci=Math.cos(inclina), si=Math.sin(inclina);
    const Y2=y*ci - Z*si, Z2=y*si + Z*ci;
    const prof=Z2+CONFIG.distancia;
    const f=CONFIG.fov/Math.max(prof,0.1);
    return {x:X*f, y:-Y2*f, prof};
  }
  const projetar=(x,y,z)=>{ const p=bruta(x,y,z);
    return {x:centroX+p.x*escala, y:centroY+p.y*escala, prof:p.prof}; };

  /* Enquadra a cena inteira na caixa: todos os cantos de todas as barras, as
     quinas do chão e as âncoras dos rótulos das fileiras. A margem da esquerda
     é maior porque é lá que os rótulos são escritos. */
  function enquadrar(){
    const pts=[];
    const meio=(cats.length)/2*CONFIG.passoX;
    for(const zx of [-1.5,1.5]) for(const xx of [-meio,meio]) pts.push(bruta(xx,0,zx*CONFIG.passoZ));
    for(let i=0;i<3;i++) pts.push(bruta(-meio-0.35,0,(i-1)*CONFIG.passoZ));
    barras.forEach(b=>{
      const w=CONFIG.larguraBarra/2;
      const x=(cats.indexOf(b.cat)-(cats.length-1)/2)*CONFIG.passoX;
      const z=(b.tier-2)*CONFIG.passoZ;
      const h=Math.max(b.valor/maior*CONFIG.alturaMax,0.04);
      for(const dx of [-w,w]) for(const dz of [-w,w]) pts.push(bruta(x+dx,h,z+dz));
    });
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    pts.forEach(p=>{ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; });
    const padE=calha, padD=10, padV=14;   // à esquerda cabem os rótulos das fileiras
    const lx=Math.max(x1-x0,0.001), ly=Math.max(y1-y0,0.001);
    escala=Math.min((L-padE-padD)/lx,(A-padV*2)/ly);
    centroX=padE+(L-padE-padD)/2-((x0+x1)/2)*escala;
    centroY=A/2-((y0+y1)/2)*escala;
  }

  function cantosDaBarra(b,i){
    const w=CONFIG.larguraBarra/2;
    const x=(cats.indexOf(b.cat)-(cats.length-1)/2)*CONFIG.passoX;
    const z=(b.tier-2)*CONFIG.passoZ;
    const h=Math.max(b.valor/maior*CONFIG.alturaMax,0.04);
    const p=[];
    [[-w,0,-w],[w,0,-w],[w,0,w],[-w,0,w],[-w,h,-w],[w,h,-w],[w,h,w],[-w,h,w]]
      .forEach(([dx,dy,dz])=>p.push(projetar(x+dx,dy,z+dz)));
    return {p,x,z,h};
  }

  const FACES=[[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const BRILHO=[1.14,0.78,0.94,0.62,0.84];   // topo mais claro, laterais em degradê

  function desenhar(){
    ctx.clearRect(0,0,L,A);
    medirCalha();
    enquadrar();
    desenharChao();

    /* Cada face vira um polígono com sua profundidade média; o conjunto é
       ordenado de trás para frente e pintado nessa ordem. */
    const polis=[];
    barras.forEach((b,i)=>{
      const {p,h}=cantosDaBarra(b,i);
      const cor=cores.get(b.cat);
      const frente=b.tier===3;
      FACES.forEach((f,j)=>{
        const media=(p[f[0]].prof+p[f[1]].prof+p[f[2]].prof+p[f[3]].prof)/4;
        polis.push({pts:f.map(k=>p[k]), prof:media, cor:sombra(cor,BRILHO[j]),
          alfa: frente?1:(b.tier===2?0.94:0.86),
          borda: (selecionada===b)?'rgba(255,255,255,.95)':(frente?comAlfa(cor,.95):null),
          barra:b, topo:j===0});
      });
      b._topo=p[4]&&{x:(p[4].x+p[6].x)/2, y:(p[4].y+p[6].y)/2};
      b._face=[p[4],p[5],p[6],p[7]];
      b._prof=(p[4].prof+p[5].prof+p[6].prof+p[7].prof)/4;
    });
    polis.sort((a,b)=>b.prof-a.prof);
    polis.forEach(q=>{
      ctx.globalAlpha=q.alfa;
      ctx.beginPath();
      ctx.moveTo(q.pts[0].x,q.pts[0].y);
      for(let i=1;i<4;i++) ctx.lineTo(q.pts[i].x,q.pts[i].y);
      ctx.closePath();
      ctx.fillStyle=q.cor; ctx.fill();
      if(q.borda){ ctx.strokeStyle=q.borda; ctx.lineWidth=q.topo?1.6:1; ctx.stroke(); }
      ctx.globalAlpha=1;
    });
    desenharRotulos();
  }

  /* O chão existe para o olho ter onde apoiar a altura das barras. Sem ele as
     caixas flutuam e a comparação entre fileiras fica ambígua. */
  function desenharChao(){
    const x0=-(cats.length)/2*CONFIG.passoX, x1=(cats.length)/2*CONFIG.passoX;
    const z0=-1.5*CONFIG.passoZ, z1=1.5*CONFIG.passoZ;
    ctx.strokeStyle=comAlfa(corFundo,.55); ctx.lineWidth=1;
    for(let t=0;t<=3;t++){
      const z=z0+(z1-z0)*t/3;
      const a=projetar(x0,0,z), b=projetar(x1,0,z);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    for(let i=0;i<=cats.length;i++){
      const x=x0+(x1-x0)*i/cats.length;
      const a=projetar(x,0,z0), b=projetar(x,0,z1);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
  }

  /* Só o rótulo da fileira da frente e o da barra selecionada. Escrever o nome
     de dez categorias em perspectiva vira sopa de letra: o nome de cada barra
     aparece ao tocar nela, e a lista embaixo do gráfico continua sendo a
     leitura completa. */
  function desenharRotulos(){
    const rot=op.rotuloTier||['Essencial','Vale a pena','Pode cortar'];
    ctx.font='600 11px system-ui,-apple-system,sans-serif';
    ctx.textAlign='right'; ctx.textBaseline='middle';
    const x=-(cats.length)/2*CONFIG.passoX-0.35;
    rot.forEach((txt,i)=>{
      const p=projetar(x,0,(i+1-2)*CONFIG.passoZ);
      /* Girada a cena, a âncora da fileira pode acabar na metade direita da
         caixa; o texto alinha pelo lado de fora, senão invade as barras. */
      /* Alinhado à direita SEMPRE, preso a uma das bordas: em perspectiva a
         ponta da fileira da frente entra por cima das barras e o rótulo ia
         junto, e do lado direito o texto alinhado à esquerda saía da caixa.
         O que identifica a fileira é a ALTURA do rótulo, não o x. */
      ctx.textAlign='right';
      ctx.fillStyle=comAlfa(corTexto, i===2?0.95:0.5);
      const largura=ctx.measureText(txt).width;
      const xt=(p.x<L/2)
        ? Math.max(largura+4, Math.min(p.x-6, calha-6))   // termina dentro da calha
        : L-6;
      ctx.fillText(txt, xt, p.y);
    });
    if(selecionada&&selecionada._topo){
      const p=selecionada._topo;
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.font='700 12px system-ui,-apple-system,sans-serif';
      ctx.fillStyle=comAlfa(corTexto,1);
      ctx.fillText(selecionada.nome, Math.max(40,Math.min(L-40,p.x)), p.y-8);
    }
  }

  function quadro(t){
    if(!vivo) return;
    /* Fora da tela não se desenha. A aba de Análises pode ficar escondida por
       horas com o gráfico montado, e girar uma cena que ninguém vê é bateria
       queimada. Sai só o desenho — o laço continua, e volta a pintar sozinho
       quando a seção reaparece. */
    if(document.hidden||L<2||A<2||!canvas.isConnected||!canvas.checkVisibility||!canvas.checkVisibility()){
      ultimo=t; requestAnimationFrame(quadro); return;
    }
    const dt=Math.min((t-(ultimo||t))/1000,0.05); ultimo=t;
    if(!arrastando){
      giro+=giroVel*dt;
      giroVel*=Math.pow(0.02,dt);                     // atrito da inércia
      if(!quieto&&Math.abs(giroVel)<0.02) giro+=CONFIG.giroIdle*dt;
    }
    desenhar();
    requestAnimationFrame(quadro);
  }

  /* Um toque que não arrastou é seleção; arrastar gira. `touch-action:pan-y`
     no CSS deixa a rolagem vertical da página passar direto — um gráfico de
     300px que engole a rolagem é pior que um gráfico sem giro. */
  function ondePeguei(ev){
    const r=canvas.getBoundingClientRect();
    return {x:ev.clientX-r.left, y:ev.clientY-r.top};
  }
  canvas.addEventListener('pointerdown',ev=>{
    arrastando=true; arrastou=false; x0=ev.clientX; giro0=giro; giroVel=0;
    canvas.setPointerCapture&&canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove',ev=>{
    if(!arrastando) return;
    const d=ev.clientX-x0;
    if(Math.abs(d)>4) arrastou=true;
    const novo=giro0+d*0.008;
    giroVel=(novo-giro)*12; giro=novo;
  });
  function soltar(ev){
    if(!arrastando) return;
    arrastando=false;
    if(!arrastou) selecionar(ondePeguei(ev));
  }
  canvas.addEventListener('pointerup',soltar);
  canvas.addEventListener('pointercancel',()=>{ arrastando=false; });

  /* Acertar a barra pelo TAMPO dela, não pela distância até o centro: barra
     baixa e barra alta vizinhas têm centros próximos na tela, e a escolha pelo
     mais perto pegava a errada. As mais à frente são testadas primeiro, que é
     o que o dedo espera quando duas se sobrepõem. O centro continua como
     reserva, com folga, pra tampo pequeno demais para o dedo. */
  function dentroDoPoligono(pt,poli){
    let dentro=false;
    for(let i=0,j=poli.length-1;i<poli.length;j=i++){
      const a=poli[i], b=poli[j];
      if(((a.y>pt.y)!==(b.y>pt.y)) && (pt.x < (b.x-a.x)*(pt.y-a.y)/((b.y-a.y)||1e-9)+a.x)) dentro=!dentro;
    }
    return dentro;
  }
  function selecionar(pt){
    let achada=null;
    const ordem=barras.slice().filter(b=>b._face).sort((a,b)=>a._prof-b._prof);
    for(const b of ordem){ if(dentroDoPoligono(pt,b._face)){ achada=b; break; } }
    if(!achada){
      let melhor=40;
      barras.forEach(b=>{ if(!b._topo) return;
        const d=Math.hypot(b._topo.x-pt.x, b._topo.y-pt.y);
        if(d<melhor){ melhor=d; achada=b; } });
    }
    selecionada=(achada===selecionada)?null:achada;
    if(op.aoSelecionar) op.aoSelecionar(selecionada);
  }

  lerCores(); medir();
  const ro=('ResizeObserver' in window)?new ResizeObserver(medir):null;
  if(ro) ro.observe(canvas); else window.addEventListener('resize',medir);
  requestAnimationFrame(quadro);

  return {
    encerrar(){ vivo=false; if(ro) ro.disconnect(); else window.removeEventListener('resize',medir); },
    repintar(){ lerCores(); },          // troca de tema
    limparSelecao(){ selecionada=null; }
  };
}

/* ══════════════════ A PLANILHA EM 3D (v12.3) ══════════════════

   A mesma planilha, de pé. O chão é a grade da planilha — uma faixa por
   linha, da esquerda para a direita na ordem em que se lê de cima para baixo —
   e cada linha levanta uma coluna:

   * **altura** — a Sobra depois daquela linha. Lidas em sequência, as colunas
     viram uma ESCADA que desce: o "vai diminuindo" do pedido, visto de uma vez;
   * **tampa colorida** — o que aquela linha comeu da Sobra, na cor da
     categoria (verde para o que entrou, azul para o que foi guardado). É o
     degrau: quanto maior a tampa, maior o tombo;
   * **fileira de trás** — a parte que OUTRA pessoa paga, translúcida e na cor
     dela. Fica atrás de propósito: ela aparece na fatura mas não desce a
     escada, porque não é dinheiro seu. Duas dimensões de dado — quem paga e
     quanto — é o que justifica a terceira de tela, a regra do gráfico acima.

   O motor é o mesmo do gráfico de barras (projeção à mão, pintor, enquadrar a
   cada quadro). O que muda: a cena NÃO gira sozinha em volta — uma escada
   comprida girando inteira desorienta —, só balança alguns graus; e os
   números ANDAM até o valor novo quando um gasto entra, para o degrau descer
   na frente da pessoa em vez de aparecer pronto. */
function escada(canvas, linhas, opcoes){
  const ctx=canvas.getContext('2d');
  if(!ctx) return null;
  const op=opcoes||{};
  const quieto=menosMovimento();
  const dpr=Math.min(window.devicePixelRatio||1, 1.5);   // 1.5: texto nítido, metade dos pixels de 2x (v12.5)
  const brl=op.brl||(v=>v.toFixed(2));
  let BASE=-0.36;
  const C={inclinacao:-22*GRAUS, distancia:9, fov:3.1, passoX:1, largura:0.66, fundoZ:1.05, alturaMax:3.2};

  let L=1,A=1, giro=BASE, giroVel=0, mexeu=false, t0=0, sujo=true;
  let arrastando=false, arrastou=false, x0=0, giro0=0, ultimo=0, vivo=true;
  const ve=vigia(canvas);
  let lin=[], atual=new Map(), alvoMax=1, maxAtual=1;
  let selecionada=null, sobre=null;
  let cor={};

  function lerCores(){
    cor={verde:rgbDe('var(--verde)'), azul:rgbDe('var(--azul)'), verm:rgbDe('var(--vermelho)'),
         txt:rgbDe('var(--txt)'), txt2:rgbDe('var(--txt-2)'), sep:rgbDe('var(--sep)'), card:rgbDe('var(--card)')};
    lin.forEach(l=>{ l._rgb=rgbDe(l.cor||'var(--azul)'); l._rgbO=l.outros>0?rgbDe(l.outrosCor||'var(--pai)'):null; });
  }
  function definir(novas){
    lin=(novas||[]).map(l=>Object.assign({},l));
    alvoMax=lin.reduce((m,l)=>Math.max(m,Math.abs(l.antes||0),Math.abs(l.depois||0),l.outros||0),0)||1;
    const vivos=new Set();
    lin.forEach(l=>{
      vivos.add(l.id);
      const a=atual.get(l.id);
      /* Linha nova nasce do valor da vizinha de antes — o degrau "cai" de onde
         a escada estava, em vez de brotar do chão. */
      if(!a) atual.set(l.id, quieto?{a:l.antes,d:l.depois,o:l.outros||0}:{a:l.antes,d:l.antes,o:0});
    });
    for(const k of [...atual.keys()]) if(!vivos.has(k)) atual.delete(k);
    if(selecionada) selecionada=lin.find(l=>l.id===selecionada.id)||null;
    if(maxAtual<=1) maxAtual=alvoMax;
    lerCores(); sujo=true;
  }
  function medir(){
    const r=canvas.getBoundingClientRect();
    L=Math.max(1,r.width); A=Math.max(1,r.height);
    canvas.width=Math.round(L*dpr); canvas.height=Math.round(A*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    /* Tela estreita: a escada é vista mais de frente. Em diagonal, num celular,
       ela ocupava uma faixa inclinada e deixava os dois cantos vazios. */
    BASE=(A/L>0.6)?-0.17:-0.36;
    if(!mexeu) giro=BASE;
    sujo=true;
  }

  let escala=1, cx=0, cy=0;
  function bruta(x,y,z){
    const cs=Math.cos(giro), sn=Math.sin(giro);
    const X=x*cs - z*sn, Z=x*sn + z*cs;
    const ci=Math.cos(C.inclinacao), si=Math.sin(C.inclinacao);
    const Y2=y*ci - Z*si, Z2=y*si + Z*ci;
    const prof=Z2+C.distancia;
    const f=C.fov/Math.max(prof,0.1);
    return {x:X*f, y:-Y2*f, prof};
  }
  const proj=(x,y,z)=>{ const p=bruta(x,y,z); return {x:cx+p.x*escala, y:cy+p.y*escala, prof:p.prof}; };
  /* A altura cresce com o número de linhas: com trinta gastos a escada fica
     larga, e uma altura fixa a deixava achatada como uma régua. */
  /* E com a PROPORÇÃO da caixa: no celular ela é quase quadrada, e a escada
     desenhada com a altura do computador virava uma tira no meio do vazio. */
  /* (v12.6) O mundo encolhe para caber diante da câmera: com 30 linhas a
     escada tinha 30 unidades de largura e a câmera está a 9 — as pontas
     passavam POR TRÁS dela e a perspectiva virava uma linha. O passo é o que
     faz a escada inteira medir no máximo ~12 unidades. */
  const PX=()=>Math.min(C.passoX, 12/Math.max(lin.length,1));
  const LG=()=>C.largura*PX()/C.passoX;
  const alturaMax=()=>Math.max(C.alturaMax, lin.length*PX()*0.36*Math.min(Math.max((A/L)/0.345,1),1.6));
  const H=v=>v/maxAtual*alturaMax();
  const xDe=i=>(i-(lin.length-1)/2)*PX();
  const temFundo=()=>lin.some(l=>(l.outros||0)>0);

  function enquadrar(){
    const n=Math.max(lin.length,1), meio=n/2*PX(), zf=temFundo()?C.fundoZ+0.5:0.5;
    const pts=[];
    /* Só o que existe: o chão e o topo REAL de cada coluna. Reservar a altura
       cheia até o fim da escada deixava metade da caixa vazia. */
    for(const z of [-0.5,zf]) for(const x of [-meio,meio]) pts.push(bruta(x,0,z));
    lin.forEach((l,i)=>{ const v=atual.get(l.id); if(!v) return;
      const x=xDe(i), w=LG()/2, top=H(Math.max(v.a,v.d,v.o,0)), bot=H(Math.min(v.d,0));
      for(const dx of [-w,w]) for(const dz of [-w,w]){ pts.push(bruta(x+dx,top,dz)); if(bot<0) pts.push(bruta(x+dx,bot,dz)); }
      if(v.o>0) pts.push(bruta(x,H(v.o),C.fundoZ)); });
    let a=1e9,b=-1e9,c=1e9,d=-1e9;
    pts.forEach(p=>{ if(p.x<a)a=p.x; if(p.x>b)b=p.x; if(p.y<c)c=p.y; if(p.y>d)d=p.y; });
    const padX=12, padTop=50, padBase=10;   // em cima cabem as etiquetas
    escala=Math.min((L-padX*2)/Math.max(b-a,.001),(A-padTop-padBase)/Math.max(d-c,.001));
    cx=L/2-((a+b)/2)*escala;
    cy=padTop+(A-padTop-padBase)/2-((c+d)/2)*escala;
  }

  const FACES=[[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const BRILHO=[1.16,0.80,0.95,0.64,0.86];
  function caixa(x,z,w,y0,y1){
    const p=[];
    [[-w,y0,-w],[w,y0,-w],[w,y0,w],[-w,y0,w],[-w,y1,-w],[w,y1,-w],[w,y1,w],[-w,y1,w]]
      .forEach(([dx,y,dz])=>p.push(proj(x+dx,y,z+dz)));
    return p;
  }

  function desenhar(){
    ctx.clearRect(0,0,L,A);
    enquadrar();
    chao();
    const polis=[], w=LG()/2;
    lin.forEach((l,i)=>{
      const v=atual.get(l.id); if(!v) return;
      const x=xDe(i), foco=(l===selecionada||l===sobre);
      const cap=l.tipo==='fim'?null:[Math.max(Math.min(v.a,v.d),0),Math.max(Math.max(v.a,v.d),0)];
      const pil=l.tipo==='fim'?[Math.min(v.d,0),Math.max(v.d,0)]
              :(v.d<0?[v.d,0]:[0,cap?cap[0]:0]);
      l._faces=[];
      const bloco=(y0,y1,rgb,alfa,z,larg,borda,chave)=>{
        if(Math.abs(H(y1)-H(y0))<0.004) return;
        const p=caixa(x,z,larg,H(y0),H(y1));
        FACES.forEach((f,j)=>{
          if(j===0&&chave==='pilar'&&cap&&cap[1]>cap[0]) return;   // topo do pilar fica sob a tampa
          const m=(p[f[0]].prof+p[f[1]].prof+p[f[2]].prof+p[f[3]].prof)/4;
          polis.push({pts:f.map(k=>p[k]),prof:m,cor:sombra(rgb,BRILHO[j]),alfa,borda,topo:j===0});
        });
        if(chave!=='fundo') l._faces.push(...FACES.map(f=>f.map(k=>p[k])));
        if(chave==='tampa'||chave==='fim'||(!cap&&chave==='pilar')||(chave==='pilar'&&!(cap&&cap[1]>cap[0]))) l._topo={x:(p[4].x+p[6].x)/2,y:Math.min(p[4].y,p[5].y,p[6].y,p[7].y)};
      };
      const realce=foco?'rgba(255,255,255,.95)':null;
      /* A prévia do gasto que está sendo digitado: o degrau em vidro, com
         contorno tracejado — ainda não é dinheiro que saiu. */
      if(l.tipo==='previa'){
        const pul=quieto?.55:.42+.18*Math.sin(t0*4);
        bloco(pil[0],pil[1],cor.azul,.18,0,w,null,'pilar');
        if(cap[1]>cap[0]){ const n0=polis.length; bloco(cap[0],cap[1],l._rgb||cor.azul,pul,0,w,comAlfa(cor.txt,.85),'tampa');
          for(let q=n0;q<polis.length;q++) polis[q].tracejado=true; }
        return;
      }
      if(l.tipo==='fim'){
        const c=v.d<0?cor.verm:cor.verde;
        bloco(pil[0],pil[1],c,1,0,w*1.08,realce||comAlfa(c,1),'fim');
      }else{
        const neg=v.d<0;
        bloco(pil[0],pil[1],neg?cor.verm:cor.azul,neg?.55:.22,0,w,realce&&comAlfa(cor.azul,.9),'pilar');
        if(cap[1]>cap[0]) bloco(cap[0],cap[1],l._rgb||cor.azul,1,0,w,realce,'tampa');
      }
      if(v.o>0.004&&l._rgbO) bloco(0,v.o,l._rgbO,.42,C.fundoZ,w*.82,comAlfa(l._rgbO,.85),'fundo');
    });
    polis.sort((a,b)=>b.prof-a.prof);
    polis.forEach(q=>{
      ctx.globalAlpha=q.alfa;
      ctx.beginPath(); ctx.moveTo(q.pts[0].x,q.pts[0].y);
      for(let i=1;i<4;i++) ctx.lineTo(q.pts[i].x,q.pts[i].y);
      ctx.closePath(); ctx.fillStyle=q.cor; ctx.fill();
      if(q.borda){ ctx.globalAlpha=Math.max(q.alfa,.8); ctx.strokeStyle=q.borda; ctx.lineWidth=q.topo?1.5:1;
        if(q.tracejado) ctx.setLineDash([4,3]); ctx.stroke(); if(q.tracejado) ctx.setLineDash([]); }
      ctx.globalAlpha=1;
    });
    rotulos();
  }

  /* O chão é a planilha deitada: uma faixa por linha e, quando alguém divide
     gasto, uma segunda faixa atrás — a "coluna" de quem paga a parte dele. */
  function chao(){
    const n=Math.max(lin.length,1), x0=-n/2*PX(), x1=n/2*PX();
    const zs=temFundo()?[-0.5,0.5,C.fundoZ+0.5]:[-0.5,0.5];
    const a=proj(x0,0,zs[0]), b=proj(x1,0,zs[0]), c=proj(x1,0,zs[zs.length-1]), d=proj(x0,0,zs[zs.length-1]);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath();
    ctx.fillStyle=comAlfa(cor.azul,.05); ctx.fill();
    ctx.strokeStyle=comAlfa(cor.sep,.9); ctx.lineWidth=1;
    zs.forEach(z=>{ const p=proj(x0,0,z), q=proj(x1,0,z); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); });
    for(let i=0;i<=n;i++){
      const x=x0+i*PX(), p=proj(x,0,zs[0]), q=proj(x,0,zs[zs.length-1]);
      ctx.globalAlpha=(i===0||i===n)?1:.55;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  function etiqueta(txt,sub,p,forte){
    ctx.font=(forte?'700 13px':'600 12px')+' system-ui,-apple-system,sans-serif';
    const w1=ctx.measureText(txt).width;
    ctx.font='500 11px system-ui,-apple-system,sans-serif';
    const w2=sub?ctx.measureText(sub).width:0;
    const w=Math.max(w1,w2)+18, h=sub?38:24;
    const x=Math.max(4,Math.min(L-w-4,p.x-w/2)), y=Math.max(2,p.y-h-10);
    ctx.fillStyle=comAlfa(cor.card,.94); ctx.strokeStyle=comAlfa(cor.sep,1); ctx.lineWidth=1;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x,y,w,h,9); else ctx.rect(x,y,w,h);
    ctx.fill(); ctx.stroke();
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.font=(forte?'700 13px':'600 12px')+' system-ui,-apple-system,sans-serif';
    ctx.fillStyle=comAlfa(cor.txt,1); ctx.fillText(txt,x+9,y+6);
    if(sub){ ctx.font='500 11px system-ui,-apple-system,sans-serif'; ctx.fillStyle=comAlfa(cor.txt2,1); ctx.fillText(sub,x+9,y+22); }
  }
  /* Escrever o nome de trinta linhas em perspectiva vira sopa de letra. Fica
     escrito o que responde à pergunta da tela — quanto ainda posso gastar —,
     e o resto aparece ao tocar ou passar o mouse. */
  function rotulos(){
    const fim=lin.find(l=>l.tipo==='fim');
    const previa=lin.find(l=>l.tipo==='previa');
    const alvo=sobre||selecionada||previa;
    if(fim&&fim._topo&&!alvo) etiqueta(brl(fim.depois),fim.nome,fim._topo,true);
    if(alvo&&alvo._topo){
      const sub=alvo.tipo==='previa'?'prévia · a sobra iria para '+brl(alvo.depois)
        :alvo.tipo==='fim'?'é o que dá para gastar'
        :alvo.tipo==='renda'?'entrou · sobra '+brl(alvo.depois)
        :'−'+brl(alvo.antes-alvo.depois)+' · sobra '+brl(alvo.depois)+(alvo.outros>0?' · outros pagam '+brl(alvo.outros):'');
      etiqueta(alvo.tipo==='fim'?brl(alvo.depois):alvo.nome, sub, alvo._topo, true);
    }
  }

  function quadro(t){
    if(!vivo) return;
    if(document.hidden||!ve.na||L<2||A<2||!canvas.isConnected){
      ultimo=t; requestAnimationFrame(quadro); return;
    }
    const dt=Math.min((t-(ultimo||t))/1000,0.05); ultimo=t; t0+=dt;
    /* Os números andam até o alvo: o degrau desce na frente da pessoa. */
    const k=quieto?1:Math.min(1,dt*6);
    let andou=Math.abs(alvoMax-maxAtual)>1e-3;
    maxAtual+=(alvoMax-maxAtual)*k;
    lin.forEach(l=>{ const v=atual.get(l.id); if(!v) return;
      if(Math.abs(l.antes-v.a)+Math.abs(l.depois-v.d)+Math.abs((l.outros||0)-v.o)>1e-3) andou=true;
      v.a+=(l.antes-v.a)*k; v.d+=(l.depois-v.d)*k; v.o+=((l.outros||0)-v.o)*k; });
    if(!arrastando){
      if(Math.abs(giroVel)>1e-3){ giro+=giroVel*dt; giroVel*=Math.pow(0.02,dt); andou=true; }
      const b=balanco(t0);
      if(!quieto&&!mexeu&&b>0){ giro=BASE+Math.sin(t0*0.32)*0.13*b; andou=true; }   // só balança, e assenta
    }
    /* a prévia pulsa: enquanto ela existe, a cena está viva */
    if(lin.some(l=>l.tipo==='previa')&&!quieto) andou=true;
    if(andou||sujo||arrastando){ desenhar(); sujo=false; }
    requestAnimationFrame(quadro);
  }

  function onde(ev){ const r=canvas.getBoundingClientRect(); return {x:ev.clientX-r.left, y:ev.clientY-r.top}; }
  function dentro(pt,poli){
    let d=false;
    for(let i=0,j=poli.length-1;i<poli.length;j=i++){
      const a=poli[i], b=poli[j];
      if(((a.y>pt.y)!==(b.y>pt.y)) && (pt.x<(b.x-a.x)*(pt.y-a.y)/((b.y-a.y)||1e-9)+a.x)) d=!d;
    }
    return d;
  }
  function achar(pt){
    for(let i=lin.length-1;i>=0;i--){ const l=lin[i]; if(l._faces&&l._faces.some(f=>dentro(pt,f))) return l; }
    let melhor=null, dist=28;
    lin.forEach(l=>{ if(!l._topo) return; const d=Math.hypot(l._topo.x-pt.x,l._topo.y-pt.y); if(d<dist){dist=d;melhor=l;} });
    return melhor;
  }
  canvas.addEventListener('pointerdown',ev=>{
    arrastando=true; arrastou=false; x0=ev.clientX; giro0=giro; giroVel=0;
    canvas.setPointerCapture&&canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove',ev=>{
    if(!arrastando){
      if(ev.pointerType==='mouse'){ const s=achar(onde(ev)); if(s!==sobre){ sobre=s; sujo=true; canvas.style.cursor=s?'pointer':'grab'; } }
      return;
    }
    const d=ev.clientX-x0;
    if(Math.abs(d)>4){ arrastou=true; mexeu=true; }
    const novo=Math.max(-1.25,Math.min(0.55,giro0+d*0.006));
    giroVel=(novo-giro)*12; giro=novo;
  });
  canvas.addEventListener('pointerleave',()=>{ sobre=null; sujo=true; });
  canvas.addEventListener('pointerup',ev=>{
    if(!arrastando) return; arrastando=false;
    if(!arrastou){
      const s=achar(onde(ev));
      selecionada=(s===selecionada)?null:s; sujo=true;
      if(op.aoSelecionar) op.aoSelecionar(selecionada);
    }
  });
  canvas.addEventListener('pointercancel',()=>{ arrastando=false; });

  definir(linhas); medir();
  const ro=('ResizeObserver' in window)?new ResizeObserver(medir):null;
  if(ro) ro.observe(canvas); else window.addEventListener('resize',medir);
  requestAnimationFrame(quadro);
  return {
    atualizar:definir,
    encerrar(){ vivo=false; if(ve.io) ve.io.disconnect(); if(ro) ro.disconnect(); else window.removeEventListener('resize',medir); },
    repintar(){ lerCores(); sujo=true; },
    selecionar(id){ selecionada=lin.find(l=>l.id===id)||null; sujo=true; },
    centralizar(){ mexeu=false; giroVel=0; }
  };
}

/* ══════════════════ MATRIZ 3D (v12.4) ══════════════════

   Uma grade de colunas para as telas que cruzam DUAS coisas:

   * Meses anteriores — mês (da esquerda, o mais antigo, para a direita) ×
     categoria (fileiras). Uma "cidade": dá para ver numa olhada em que mês e
     em que categoria o dinheiro foi, o que nenhuma lista de faturas mostra;
   * Gastos por cartão — cartão × tipo (fixo, parcelado, do mês).

   dados = {colunas:[{nome}], fileiras:[{nome}], celulas:[{c,f,valor,cor,nome,sub}]}
   A primeira fileira fica na FRENTE.

   Mesmo motor e mesmas regras da escada: só balança, arrasto com limite, as
   colunas crescem do chão ao montar e andam até o valor novo ao atualizar, e
   nada é desenhado com a cena fora da tela. */
function matriz(canvas, dados, opcoes){
  const ctx=canvas.getContext('2d');
  if(!ctx) return null;
  const op=opcoes||{};
  const quieto=menosMovimento();
  const dpr=Math.min(window.devicePixelRatio||1, 1.5);   // 1.5: texto nítido, metade dos pixels de 2x (v12.5)
  const C={inclinacao:-24*GRAUS, distancia:9, fov:3.1};
  let BASE=-0.42;
  let L=1,A=1, giro=BASE, giroVel=0, mexeu=false, t0=0;
  let arrastando=false, arrastou=false, x0=0, giro0=0, ultimo=0, vivo=true;
  let D={colunas:[],fileiras:[],celulas:[]}, maxAlvo=1, maxAtual=1, atual=new Map();
  let selecionada=null, sobre=null, cor={};
  const ve=vigia(canvas);

  function lerCores(){
    cor={txt:rgbDe('var(--txt)'), txt2:rgbDe('var(--txt-2)'), sep:rgbDe('var(--sep)'), card:rgbDe('var(--card)'), azul:rgbDe('var(--azul)')};
    D.celulas.forEach(c=>{ c._rgb=rgbDe(c.cor||'var(--azul)'); });
  }
  const chave=c=>c.c+'|'+c.f;
  function definir(novo){
    D={colunas:(novo.colunas||[]).slice(), fileiras:(novo.fileiras||[]).slice(),
       celulas:(novo.celulas||[]).map(c=>Object.assign({},c))};
    maxAlvo=D.celulas.reduce((m,c)=>Math.max(m,c.valor||0),0)||1;
    const vivos=new Set();
    D.celulas.forEach(c=>{ const k=chave(c); vivos.add(k); if(!atual.has(k)) atual.set(k, quieto?c.valor:0); });
    for(const k of [...atual.keys()]) if(!vivos.has(k)) atual.delete(k);
    if(selecionada) selecionada=D.celulas.find(c=>chave(c)===chave(selecionada))||null;
    if(maxAtual<=1) maxAtual=maxAlvo;
    lerCores();
  }
  function medir(){
    const r=canvas.getBoundingClientRect();
    L=Math.max(1,r.width); A=Math.max(1,r.height);
    canvas.width=Math.round(L*dpr); canvas.height=Math.round(A*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    BASE=(A/L>0.6)?-0.24:-0.42;
    if(!mexeu) giro=BASE;
  }
  let escala=1, cx=0, cy=0;
  function bruta(x,y,z){
    const cs=Math.cos(giro), sn=Math.sin(giro);
    const X=x*cs - z*sn, Z=x*sn + z*cs;
    const ci=Math.cos(C.inclinacao), si=Math.sin(C.inclinacao);
    const Y2=y*ci - Z*si, Z2=y*si + Z*ci;
    const prof=Z2+C.distancia, f=C.fov/Math.max(prof,0.1);
    return {x:X*f, y:-Y2*f, prof};
  }
  const proj=(x,y,z)=>{ const p=bruta(x,y,z); return {x:cx+p.x*escala, y:cy+p.y*escala, prof:p.prof}; };
  const nC=()=>Math.max(D.colunas.length,1), nF=()=>Math.max(D.fileiras.length,1);
  /* (v12.6) O mesmo cuidado da escada: 30 dias do ciclo davam 34 unidades de
     largura com a câmera a 9, e a cena colapsava numa linha. A grade inteira
     cabe em ~8 × 5 unidades, qualquer que seja o número de colunas. */
  const KM=()=>Math.min(1, 8/(nC()*1.15), 5/(nF()*1.05));
  const PX=()=>1.15*KM(), PZ=()=>1.05*KM(), LG=()=>0.62*Math.min(1,KM()*1.25);
  const xDe=i=>(i-(nC()-1)/2)*PX(), zDe=j=>(j-(nF()-1)/2)*PZ();
  /* Altura proporcional ao tamanho da grade e à proporção da caixa, como na
     escada: grade larga com altura fixa vira um tapete. */
  const alturaMax=()=>Math.max(2.4, Math.max(nC()*PX(), nF()*PZ())*0.62*Math.min(Math.max((A/L)/0.4,1),1.5));
  const H=v=>Math.max(v,0)/maxAtual*alturaMax();

  function enquadrar(){
    const pts=[], mx=nC()/2*PX(), mz=nF()/2*PZ();
    for(const x of [-mx,mx]) for(const z of [-mz,mz]) pts.push(bruta(x,0,z));
    D.celulas.forEach(c=>{ const h=H(atual.get(chave(c))||0), x=xDe(c.c), z=zDe(c.f), w=LG()/2;
      for(const dx of [-w,w]) for(const dz of [-w,w]) pts.push(bruta(x+dx,h,z+dz)); });
    let a=1e9,b=-1e9,c=1e9,d=-1e9;
    pts.forEach(p=>{ if(p.x<a)a=p.x; if(p.x>b)b=p.x; if(p.y<c)c=p.y; if(p.y>d)d=p.y; });
    const padX=16, padTop=48, padBase=34;     // embaixo, os nomes das colunas
    escala=Math.min((L-padX*2)/Math.max(b-a,.001),(A-padTop-padBase)/Math.max(d-c,.001));
    cx=L/2-((a+b)/2)*escala;
    cy=padTop+(A-padTop-padBase)/2-((c+d)/2)*escala;
  }
  const FACES=[[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const BRILHO=[1.16,0.80,0.95,0.64,0.86];

  function desenhar(){
    ctx.clearRect(0,0,L,A);
    enquadrar();
    // o chão é uma grade de verdade: uma casa por cruzamento
    const mx=nC()/2*PX(), mz=nF()/2*PZ();
    ctx.strokeStyle=comAlfa(cor.sep,.95); ctx.lineWidth=1;
    for(let i=0;i<=nC();i++){ const x=-mx+i*PX(), p=proj(x,0,-mz), q=proj(x,0,mz); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); }
    for(let j=0;j<=nF();j++){ const z=-mz+j*PZ(), p=proj(-mx,0,z), q=proj(mx,0,z); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); }
    const polis=[], w=LG()/2;
    D.celulas.forEach(c=>{
      const h=H(atual.get(chave(c))||0); c._faces=null; c._topo=null;
      if(h<0.004) return;
      const x=xDe(c.c), z=zDe(c.f), foco=(c===selecionada||c===sobre);
      const p=[];
      [[-w,0,-w],[w,0,-w],[w,0,w],[-w,0,w],[-w,h,-w],[w,h,-w],[w,h,w],[-w,h,w]].forEach(([dx,y,dz])=>p.push(proj(x+dx,y,z+dz)));
      FACES.forEach((f,j)=>{
        const m=(p[f[0]].prof+p[f[1]].prof+p[f[2]].prof+p[f[3]].prof)/4;
        polis.push({pts:f.map(k=>p[k]),prof:m,cor:sombra(c._rgb,BRILHO[j]),borda:foco?'rgba(255,255,255,.95)':null,topo:j===0,
          alfa:(selecionada&&!foco)?.45:1});
      });
      c._faces=FACES.map(f=>f.map(k=>p[k]));
      c._topo={x:(p[4].x+p[6].x)/2, y:Math.min(p[4].y,p[5].y,p[6].y,p[7].y)};
      c._prof=(p[4].prof+p[6].prof)/2;
    });
    polis.sort((a,b)=>b.prof-a.prof);
    polis.forEach(q=>{
      ctx.globalAlpha=q.alfa;
      ctx.beginPath(); ctx.moveTo(q.pts[0].x,q.pts[0].y);
      for(let i=1;i<4;i++) ctx.lineTo(q.pts[i].x,q.pts[i].y);
      ctx.closePath(); ctx.fillStyle=q.cor; ctx.fill();
      if(q.borda){ ctx.strokeStyle=q.borda; ctx.lineWidth=q.topo?1.6:1; ctx.stroke(); }
    });
    ctx.globalAlpha=1;
    rotulos(mx,mz);
  }

  /* Nomes das colunas na borda da frente, das fileiras na lateral. Quando não
     cabem todos, escreve-se um sim, um não: nome sobreposto é pior que nome
     faltando, e o toque mostra o resto. */
  function rotulos(mx,mz){
    /* Cada nome só é escrito se não encostar no último que foi escrito — a
       conta é feita com a caixa REAL do texto na tela, não com um palpite de
       espaçamento. Nome sobreposto é pior que nome faltando, e o toque mostra
       o resto. A última coluna (o mês mais novo) é escrita primeiro: é ela
       que importa. */
    ctx.font='600 11px system-ui,-apple-system,sans-serif';
    ctx.textBaseline='top'; ctx.textAlign='center';
    ctx.fillStyle=comAlfa(cor.txt2,1);
    const feitas=[];
    const cabe=(x0,x1,y0,y1)=>!feitas.some(r=>x0<r[1]+6&&x1>r[0]-6&&y0<r[3]+2&&y1>r[2]-2);
    /* a coluna marcada `forte` (o "hoje") é escrita antes de todas */
    const ordemC=D.colunas.map((c,i)=>i).sort((a,b)=>(D.colunas[b].forte?1:0)-(D.colunas[a].forte?1:0)||b-a);
    for(const i of ordemC){
      const t=D.colunas[i].nome, p=proj(xDe(i),0,-mz-0.32), w=ctx.measureText(t).width;
      ctx.fillStyle=comAlfa(D.colunas[i].forte?cor.txt:cor.txt2,1);
      const x=Math.max(w/2+2,Math.min(L-w/2-2,p.x)), y=Math.min(A-14,p.y+2);
      if(!cabe(x-w/2,x+w/2,y,y+13)) continue;
      feitas.push([x-w/2,x+w/2,y,y+13]); ctx.fillText(t,x,y);
    }
    ctx.textBaseline='middle';
    for(let j=D.fileiras.length-1;j>=0;j--){
      const t=D.fileiras[j].nome, p=proj(mx+0.25,0,zDe(j)), w=ctx.measureText(t).width;
      const dir=p.x+w+6>L, x0=dir?L-6-w:p.x+4;
      if(!cabe(x0,x0+w,p.y-7,p.y+7)) continue;
      feitas.push([x0,x0+w,p.y-7,p.y+7]);
      ctx.textAlign='left'; ctx.fillStyle=comAlfa(cor.txt2,.9); ctx.fillText(t,x0,p.y);
    }
    const alvo=sobre||selecionada;
    if(alvo&&alvo._topo) etiqueta(alvo.nome, alvo.sub, alvo._topo);
  }
  function etiqueta(txt,sub,p){
    ctx.font='700 13px system-ui,-apple-system,sans-serif';
    const w1=ctx.measureText(txt).width;
    ctx.font='500 11px system-ui,-apple-system,sans-serif';
    const w2=sub?ctx.measureText(sub).width:0;
    const w=Math.max(w1,w2)+18, h=sub?38:24;
    const x=Math.max(4,Math.min(L-w-4,p.x-w/2)), y=Math.max(2,p.y-h-10);
    ctx.fillStyle=comAlfa(cor.card,.95); ctx.strokeStyle=comAlfa(cor.sep,1); ctx.lineWidth=1;
    ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,9); else ctx.rect(x,y,w,h); ctx.fill(); ctx.stroke();
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.font='700 13px system-ui,-apple-system,sans-serif'; ctx.fillStyle=comAlfa(cor.txt,1); ctx.fillText(txt,x+9,y+6);
    if(sub){ ctx.font='500 11px system-ui,-apple-system,sans-serif'; ctx.fillStyle=comAlfa(cor.txt2,1); ctx.fillText(sub,x+9,y+22); }
  }

  /* Parado é parado: depois que as colunas assentam e com o movimento
     reduzido ligado, a cena não é redesenhada a cada quadro — só quando algo
     muda. Com o balanço ligado ela desenha, mas só enquanto está na tela. */
  let sujo=true;
  function quadro(t){
    if(!vivo) return;
    if(document.hidden||!ve.na||L<2||A<2||!canvas.isConnected){
      ultimo=t; requestAnimationFrame(quadro); return;
    }
    const dt=Math.min((t-(ultimo||t))/1000,0.05); ultimo=t; t0+=dt;
    const k=quieto?1:Math.min(1,dt*5);
    let andou=Math.abs(maxAlvo-maxAtual)>1e-3;
    maxAtual+=(maxAlvo-maxAtual)*k;
    D.celulas.forEach(c=>{ const kk=chave(c), v=atual.get(kk)||0; if(Math.abs(c.valor-v)>1e-3) andou=true; atual.set(kk, v+(c.valor-v)*k); });
    if(!arrastando){
      if(Math.abs(giroVel)>1e-3){ giro+=giroVel*dt; giroVel*=Math.pow(0.02,dt); andou=true; }
      const b=balanco(t0);
      if(!quieto&&!mexeu&&b>0){ giro=BASE+Math.sin(t0*0.3)*0.12*b; andou=true; }
    }
    if(andou||sujo||arrastando){ desenhar(); sujo=false; }
    requestAnimationFrame(quadro);
  }
  function onde(ev){ const r=canvas.getBoundingClientRect(); return {x:ev.clientX-r.left, y:ev.clientY-r.top}; }
  function dentro(pt,poli){ let d=false;
    for(let i=0,j=poli.length-1;i<poli.length;j=i++){ const a=poli[i], b=poli[j];
      if(((a.y>pt.y)!==(b.y>pt.y)) && (pt.x<(b.x-a.x)*(pt.y-a.y)/((b.y-a.y)||1e-9)+a.x)) d=!d; }
    return d; }
  function achar(pt){
    const ord=D.celulas.filter(c=>c._faces).sort((a,b)=>a._prof-b._prof);
    for(const c of ord) if(c._faces.some(f=>dentro(pt,f))) return c;
    return null;
  }
  canvas.addEventListener('pointerdown',ev=>{ arrastando=true; arrastou=false; x0=ev.clientX; giro0=giro; giroVel=0;
    canvas.setPointerCapture&&canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointermove',ev=>{
    if(!arrastando){ if(ev.pointerType==='mouse'){ const s=achar(onde(ev)); if(s!==sobre){ sobre=s; sujo=true; canvas.style.cursor=s?'pointer':'grab'; } } return; }
    const d=ev.clientX-x0; if(Math.abs(d)>4){ arrastou=true; mexeu=true; }
    const novo=Math.max(-1.3,Math.min(0.5,giro0+d*0.006)); giroVel=(novo-giro)*12; giro=novo;
  });
  canvas.addEventListener('pointerleave',()=>{ if(sobre){ sobre=null; sujo=true; } });
  canvas.addEventListener('pointerup',ev=>{ if(!arrastando) return; arrastando=false;
    if(!arrastou){ const s=achar(onde(ev)); selecionada=(s===selecionada)?null:s; sujo=true; if(op.aoSelecionar) op.aoSelecionar(selecionada); } });
  canvas.addEventListener('pointercancel',()=>{ arrastando=false; });

  definir(dados); medir();
  const ro=('ResizeObserver' in window)?new ResizeObserver(()=>{ medir(); sujo=true; }):null;
  if(ro) ro.observe(canvas);
  requestAnimationFrame(quadro);
  return {
    atualizar(n){ definir(n); sujo=true; },
    encerrar(){ vivo=false; if(ve.io) ve.io.disconnect(); if(ro) ro.disconnect(); },
    repintar(){ lerCores(); sujo=true; }
  };
}

window.Viz3D={montar, escada, matriz};
})();
