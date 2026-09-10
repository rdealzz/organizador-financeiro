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
const sombra=(c,f)=>`rgb(${Math.round(c[0]*f)},${Math.round(c[1]*f)},${Math.round(c[2]*f)})`;
const comAlfa=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* barras: [{cat,nome,cor,tier,valor,texto}] — uma por categoria E peso.
   opcoes: {aoSelecionar(barra|null), rotuloTier:[..]} */
function montar(canvas, barras, opcoes){
  const ctx=canvas.getContext('2d');
  if(!ctx) return null;
  const op=opcoes||{};
  const quieto=menosMovimento();
  const dpr=Math.min(window.devicePixelRatio||1, 2);

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

window.Viz3D={montar};
})();
