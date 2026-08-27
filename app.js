const CATS={
  casa:{n:'Casa e contas',c:'var(--c100)',peso:10,dica:'celular, internet, luz, o que dá em casa'},
  mercado:{n:'Mercado',c:'var(--c2)',peso:10,dica:'compra do mês e feira'},
  transporte:{n:'Carro e transporte',c:'var(--c10)',peso:14,dica:'combustível, estacionamento, manutenção'},
  comida:{n:'Comida fora e delivery',c:'var(--c20)',peso:7,dica:'almoço fora, lanche, ifood, padaria'},
  assinatura:{n:'Assinaturas',c:'var(--c5)',peso:3,dica:'streaming, apps, anuidade'},
  lazer:{n:'Lazer e compras',c:'var(--c50)',peso:8,dica:'rolê, roupa, compras online'},
  saude:{n:'Saúde e academia',c:'var(--c200)',peso:5,dica:'farmácia, academia, consulta'},
  estudo:{n:'Estudo e trabalho',c:'var(--cedu)',peso:20,dica:'faculdade, curso, material'},
  divida:{n:'Dívidas e parcelas',c:'var(--cdiv)',peso:13,dica:'parcelas do cartão, empréstimo'},
  outros:{n:'Outros',c:'var(--cout)',peso:5,dica:'o que não se encaixa'}
};
const TIER={1:{n:'Essencial',cl:'t1'},2:{n:'Vale a pena',cl:'t2'},3:{n:'Pode cortar',cl:'t3'}};
const KEY_ANTIGA='sobra-do-mes:novo';   // dados de antes do login, neste aparelho
let KEY=KEY_ANTIGA;
function usarChaveDe(uid){ KEY = uid ? ('sobra-do-mes:u:'+uid) : KEY_ANTIGA; }
// nome, cat, peso, valor, cartão, parcelas restantes, tipo, quanto o pai cobre
const SEED=[];
/* Ajustes → Alertas. O `icone` aqui é um traço do conjunto do app; o emoji
   que vai no título da notificação do sistema é definido em alertasPendentes. */
const ALERTAS_PADRAO={
  teto:      {on:true,  icone:'atencao',    nome:'Teto de categoria estourando', desc:'Quando uma categoria passa do percentual que você definiu do teto.'},
  gasto:     {on:true,  icone:'fogo',       nome:'Gastando mais do que dá',      desc:'Quando o total do ciclo passa do disponível depois de guardar.'},
  meta:      {on:true,  icone:'alvo',       nome:'Meta de guardar em risco',     desc:'Quando a sobra prevista cai abaixo do que você quer guardar.'},
  fechamento:{on:true,  icone:'calendario', nome:'Fatura vai fechar',            desc:'Alguns dias antes do fechamento, com o valor que está na fatura.'},
  vencimento:{on:true,  icone:'cartao',     nome:'Fatura vai vencer',            desc:'Alguns dias antes do vencimento, pra não pagar juros por esquecimento.'},
  contas:    {on:true,  icone:'nota',       nome:'Conta fixa a vencer',          desc:'Contas com dia de vencimento (aluguel, luz, mensalidade) chegando.'},
  variavel:  {on:true,  icone:'lapis',      nome:'Lançamento variável zerado',   desc:'Depois da virada do ciclo, lembra de preencher mercado, gasolina e afins.'},
  parcela:   {on:false, icone:'festa',      nome:'Última parcela',               desc:'Quando um parcelado chega na última — dinheiro que volta pro seu bolso.'}
};
let S={versao:2,tema:'auto',salario:0,extra:0,metaPct:20,metaVal:0,diaFech:5,diaVenc:5,ultimoFech:null,hist:[],
       tetos:{},lanc:SEED,div:[],obj:[],meses:6,jaTem:0,
       alertas:{teto:true,gasto:true,meta:true,fechamento:true,vencimento:true,contas:true,variavel:true,parcela:false},
       aTetoPct:85,aDiasFech:3,aDiasVenc:2,notifLog:{},_ultimoSalvo:0};
let prev=[], avisoCiclo='';
let saindo=false;   // logout em andamento: nada mais pode gravar em disco

const $=s=>document.querySelector(s);
const brl=v=>(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>(v*100).toFixed(0)+'%';
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const meuValor=l=>Math.max(l.valor-(+l.pai||0),0);
const iso=d=>d.toISOString().slice(0,10);
const hojeD=()=>{const d=new Date(); d.setHours(0,0,0,0); return d;};
const dataBR=s=>{const [y,m,d]=s.split('-'); return d+'/'+m+'/'+y;};

/* ---------- ciclo da fatura ---------- */
function ultimoFechPassado(){
  const h=hojeD(), dia=+S.diaFech||5;
  return h.getDate()>=dia ? new Date(h.getFullYear(),h.getMonth(),dia) : new Date(h.getFullYear(),h.getMonth()-1,dia);
}
function proximoFech(){
  const h=hojeD(), dia=+S.diaFech||5;
  return h.getDate()<dia ? new Date(h.getFullYear(),h.getMonth(),dia) : new Date(h.getFullYear(),h.getMonth()+1,dia);
}
function fecharCiclo(dataStr){
  let bruto=0,meu=0,pai=0; const porCat={};
  S.lanc.forEach(l=>{ const m=meuValor(l);
    bruto+=l.valor; meu+=m; pai+=Math.min(+l.pai||0,l.valor);
    porCat[l.cat]=(porCat[l.cat]||0)+m; });
  const itens=S.lanc.map(l=>({nome:l.nome,cat:l.cat,tier:l.tier,valor:l.valor,pai:+l.pai||0,
    tipo:l.tipo,fonte:l.fonte,pRest:+l.pRest||0,venc:+l.venc||0}));
  S.hist.unshift({data:dataStr,bruto,meu,pai,porCat,itens});
  S.hist=S.hist.slice(0,24);
  let sumiram=0, andaram=0;
  S.lanc=S.lanc.filter(l=>{
    if(l.tipo==='var'){ l.ref=l.valor; l.valor=0; l.pai=0; return true; }
    if(l.tipo==='rec'||l.tipo==='fixo') return true;
    if(l.tipo==='parc'){ l.pRest=Math.max((+l.pRest||0)-1,0); if(l.pRest<=0){ sumiram++; return false; } andaram++; return true; }
    sumiram++; return false;
  });
  return {sumiram,andaram};
}
function rodarCiclos(){
  if(!S.ultimoFech){ S.ultimoFech=iso(ultimoFechPassado()); return; }
  const h=hojeD(); let n=0, sumiram=0, andaram=0, guarda=0;
  while(guarda++<36){
    const [y,m,d]=S.ultimoFech.split('-').map(Number);
    const prox=new Date(y,m-1+1,+S.diaFech||d);
    if(prox>h) break;
    const r=fecharCiclo(iso(prox)); sumiram+=r.sumiram; andaram+=r.andaram; n++;
    S.ultimoFech=iso(prox);
  }
  if(n) avisoCiclo=`<div class="nota info"><b>A fatura fechou em ${dataBR(S.ultimoFech)}.</b> ${sumiram} lançamento${sumiram===1?'':'s'} de uma vez só saíram da lista, ${andaram} parcela${andaram===1?'':'s'} andou uma casa e o que é fixo continuou. O ciclo anterior foi pro histórico na aba Renda e meta.</div>`;
}

/* ---------- persistência em camadas, com verificação real ---------- */
const memoria={};
const DIAG={claude:'?',local:'?',idb:'?',cookie:'?',sw:'?',origem:location.protocol+'//'+(location.host||'arquivo local')};
let modo='memoria';

// 1) localStorage — testa escrita E leitura de volta
const temLS=(()=>{ try{
  localStorage.setItem('__t__','ok'); const v=localStorage.getItem('__t__'); localStorage.removeItem('__t__');
  DIAG.local = v==='ok' ? 'funciona' : 'não guarda';
  return v==='ok';
}catch(e){ DIAG.local='bloqueado'; return false; } })();

// 2) IndexedDB — sobrevive em contextos onde o localStorage é isolado
let idbOK=false;
function idbAbrir(){
  return new Promise((res,rej)=>{
    if(!window.indexedDB) return rej('sem indexedDB');
    const r=indexedDB.open('controle-financeiro',1);
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function idbDel(k){ const db=await idbAbrir();
  return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite');
    t.objectStore('kv').delete(k); t.oncomplete=()=>res(true); t.onerror=()=>rej(t.error); }); }
async function idbSet(k,v){ const db=await idbAbrir();
  return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite');
    t.objectStore('kv').put(v,k); t.oncomplete=()=>res(true); t.onerror=()=>rej(t.error); }); }
async function idbGet(k){ const db=await idbAbrir();
  return new Promise((res,rej)=>{ const t=db.transaction('kv','readonly');
    const q=t.objectStore('kv').get(k); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); }

// 3) cookie — último recurso, só se couber
function cookieSet(k,v){ try{ if(v.length>3500) return false;
  document.cookie=k+'='+encodeURIComponent(v)+';max-age=34560000;path=/';
  return document.cookie.indexOf(k+'=')>=0; }catch(e){ return false; } }
function cookieGet(k){ try{
  const m=document.cookie.match(new RegExp('(?:^|; )'+k.replace(/[:]/g,'\\:')+'=([^;]*)'));
  return m?decodeURIComponent(m[1]):null; }catch(e){ return null; } }

async function storeSet(k,v){
  if(saindo) return false;
  let ok=false;
  if(window.storage&&window.storage.set){ try{ await window.storage.set(k,v); ok=true; DIAG.claude='funciona'; modo='claude'; }
    catch(e){ DIAG.claude='indisponível'; } } else DIAG.claude='indisponível';
  if(temLS){ try{ localStorage.setItem(k,v); ok=true; if(modo!=='claude') modo='local'; }catch(e){ DIAG.local='encheu ou bloqueou'; } }
  try{ await idbSet(k,v); idbOK=true; DIAG.idb='funciona'; ok=true; if(modo==='memoria') modo='idb'; }
  catch(e){ DIAG.idb='indisponível'; }
  DIAG.cookie = cookieSet(k,v) ? 'funciona' : 'não coube';
  if(DIAG.cookie==='funciona') ok=true;
  if(!ok){ memoria[k]=v; modo='memoria'; }
  return ok;
}
async function storeGet(k){
  const cands=[];
  if(window.storage&&window.storage.get){ try{ const r=await window.storage.get(k); if(r&&r.value) cands.push(r.value); }catch(e){} }
  if(temLS){ try{ const v=localStorage.getItem(k); if(v) cands.push(v); }catch(e){} }
  try{ const v=await idbGet(k); if(v) cands.push(v); }catch(e){}
  const c=cookieGet(k); if(c) cands.push(c);
  if(memoria[k]) cands.push(memoria[k]);
  if(!cands.length) return null;
  // usa a cópia mais recente entre as camadas
  let melhor=null, ts=-1;
  cands.forEach(v=>{ try{ const o=JSON.parse(v); const t=+o._ts||0; if(t>=ts){ ts=t; melhor=v; } }catch(e){} });
  return melhor||cands[0];
}
function avisoModo(){
  const el=$('#status');
  const nomes={local:'Navegador (localStorage)',idb:'Navegador (IndexedDB)',cookie:'Cookie',claude:'Armazenamento do host',sw:'App offline (service worker)'};
  const linhas=Object.keys(nomes).map(k=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;border-bottom:1px solid var(--sep)">
      <span>${nomes[k]}</span><b style="color:${DIAG[k]==='funciona'?'var(--verde)':'var(--txt-3)'}">${DIAG[k]}</b></div>`).join('');
  $('#diag').innerHTML=`<div style="font-size:13px;color:var(--txt-2);margin-top:10px">
      ${linhas}<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0"><span>Endereço</span><b>${esc(DIAG.origem)}</b></div>
    </div>`;
  const salvando = (DIAG.claude==='funciona'||DIAG.local==='funciona'||DIAG.idb==='funciona'||DIAG.cookie==='funciona');
  const qdo=S._ultimoSalvo?new Date(S._ultimoSalvo).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):null;
  if(!salvando){
    el.innerHTML='<span class="salvo ruim"><i></i><b style="color:var(--vermelho)">Este navegador não está guardando nada.</b></span>';
    $('#alertaSalvar').innerHTML='<div class="nota aviso" style="margin:0 0 14px"><b>Aqui os dados somem ao fechar.</b> Use o botão <b>Baixar backup</b> antes de sair e <b>Restaurar backup</b> ao voltar. Pra resolver de vez, abra este arquivo por um endereço na internet (link) em vez de arquivo baixado.</div>';
  }else{
    el.innerHTML='<span class="salvo"><i></i>Salvo neste aparelho'+(qdo?' às '+qdo:'')+'</span>';
    $('#alertaSalvar').innerHTML='';
  }
}
const META=['_ts','_ultimoSalvo','_revisao','_ultimaCopia'];
function conteudoDe(o){
  const c={}; Object.keys(o).forEach(k=>{ if(!META.includes(k)) c[k]=o[k]; });
  return JSON.stringify(c);
}
function estaVazio(o){
  if(!o) return true;
  return !(o.lanc||[]).length && !(o.hist||[]).length && !(o.obj||[]).length
      && !(o.div||[]).length && !((+o.salario||0)+(+o.extra||0));
}
let ultimoConteudo=null;
async function salvar(){
  if(saindo) return false;
  const agora=conteudoDe(S);
  // Só carimba data nova quando algo mudou de verdade. Abrir o app não conta.
  if(agora!==ultimoConteudo){ S._ts=Date.now(); ultimoConteudo=agora; }
  S._ultimoSalvo=Date.now();
  const txt=JSON.stringify(S);
  const ok=await storeSet(KEY,txt);
  avisoModo();
  copiaDeSeguranca(txt);
  agendarEnvio();
  return ok;
}
/* Cópia de segurança automática: uma por dia, as 7 últimas ficam guardadas.
   Se algo corromper o estado atual, dá pra voltar sem depender de backup manual. */
async function copiaDeSeguranca(txt){
  try{
    const hoje=iso(hojeD());
    if(S._ultimaCopia===hoje) return;
    S._ultimaCopia=hoje;
    const chave='copia:'+hoje;
    await idbSet(chave,txt);
    const db=await idbAbrir();
    const chaves=await new Promise((res,rej)=>{ const t=db.transaction('kv','readonly');
      const q=t.objectStore('kv').getAllKeys(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); });
    const velhas=chaves.filter(k=>String(k).startsWith('copia:')).sort().slice(0,-7);
    if(velhas.length){ const t=db.transaction('kv','readwrite');
      velhas.forEach(k=>t.objectStore('kv').delete(k)); }
  }catch(e){}
}
async function carregar(){
  try{ const v=await storeGet(KEY); if(v) S=Object.assign(S,JSON.parse(v)); }catch(e){}
  ultimoConteudo=conteudoDe(S);
  rodarCiclos(); aplicarTema();
  $('#salario').value=S.salario||''; $('#extra').value=S.extra||'';
  $('#metaPct').value=S.metaPct||''; $('#metaVal').value=S.metaVal||'';
  $('#meses').value=S.meses||6; $('#jaTem').value=S.jaTem||'';
  $('#diaFech').value=S.diaFech||5; $('#diaVenc').value=S.diaVenc||S.diaFech||5;
  render(); salvar(); avisoModo();
}

/* ---------- backup em arquivo ---------- */
function baixarBackup(){
  const nome='controle-financeiro-backup-'+iso(hojeD())+'.json';
  const blob=new Blob([JSON.stringify(S,null,1)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=nome; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  $('#status').textContent='Backup baixado: '+nome;
}
function restaurarBackup(file){
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const dados=JSON.parse(fr.result);
      if(!dados||typeof dados!=='object'||!('lanc' in dados)) throw new Error('formato');
      S=Object.assign(S,dados);
      rodarCiclos(); aplicarTema();
      $('#salario').value=S.salario||''; $('#extra').value=S.extra||'';
      $('#metaPct').value=S.metaPct||''; $('#metaVal').value=S.metaVal||'';
      $('#meses').value=S.meses||6; $('#jaTem').value=S.jaTem||''; $('#diaFech').value=S.diaFech||5;
      render(); salvar();
      $('#status').textContent='Backup restaurado: '+S.lanc.length+' lançamentos.';
    }catch(e){ $('#status').innerHTML='<b style="color:var(--vermelho)">Esse arquivo não é um backup válido.</b>'; }
  };
  fr.readAsText(file);
}

/* ---------- cálculo ---------- */
function calc(){
  const renda=(+S.salario||0)+(+S.extra||0);
  const t={1:0,2:0,3:0}, porCat={};
  let bruto=0, pai=0;
  S.lanc.forEach(l=>{ const v=meuValor(l); bruto+=l.valor; pai+=Math.min(+l.pai||0,l.valor);
    t[l.tier]+=v; porCat[l.cat]=(porCat[l.cat]||0)+v; });
  const gasto=t[1]+t[2]+t[3];
  const meta=(+S.metaVal>0)?+S.metaVal:renda*((+S.metaPct||0)/100);
  const disponivel=Math.max(renda-meta,0);
  const fixos=Object.entries(S.tetos).filter(([k,v])=>v>0);
  const somaFixos=fixos.reduce((s,[,v])=>s+v,0);
  const pesosLivres=Object.entries(CATS).filter(([k])=>!S.tetos[k]).reduce((s,[,c])=>s+c.peso,0)||1;
  const restante=Math.max(disponivel-somaFixos,0);
  const tetos={}; Object.entries(CATS).forEach(([k,c])=>{ tetos[k]=S.tetos[k]>0?S.tetos[k]:restante*c.peso/pesosLivres; });
  const excesso={}; let somaExcesso=0;
  Object.keys(CATS).forEach(k=>{ const e=(porCat[k]||0)-tetos[k]; if(e>0.5){ excesso[k]=e; somaExcesso+=e; } });
  const futuro=S.lanc.reduce((s,l)=>s+meuValor(l)*(+l.pRest||0),0);
  const fontes={}; S.lanc.forEach(l=>{const f=l.fonte||'Conta'; fontes[f]=(fontes[f]||0)+l.valor;});
  return {renda,gasto,bruto,pai,t,porCat,meta,disponivel,tetos,excesso,somaExcesso,futuro,fontes,
          sobra:renda-gasto,corte:t[3]};
}

/* ---------- render ---------- */
function render(){
  const c=calc();
  renderHero(c);
  renderInsights(c);
  $('#cAviso').innerHTML=avisoCiclo;

  const b=$('#barra'); b.innerHTML='';
  const base=Math.max(c.renda,c.gasto,1);
  [[c.t[1],'var(--c200)','Essencial'],[c.t[2],'#8A7B33','Vale a pena'],[c.t[3],'var(--alerta)','Pode cortar'],[Math.max(c.sobra,0),null,'Sobra']]
   .forEach(([v,cor,nome])=>{ if(v<=0)return;
     const d=document.createElement('div'); d.className='seg'+(cor?'':' sobra'); if(cor)d.style.background=cor;
     d.style.flex='0 0 '+(v/base*100)+'%';
     d.innerHTML='<span>'+(v/base>0.13?nome+' '+pct(v/base):'')+'</span>';
     d.title=nome+': '+brl(v); b.appendChild(d); });

  const vazio=!S.lanc.length;
  $('#blocoOnde').hidden=vazio;
  $('#topoUltimos').hidden=vazio;
  $('#blocoUltimos').classList.toggle('sem-moldura',vazio);
  renderTopCats(c); renderUltimos(c);
  renderMeta(c); renderHist(); renderTetos(c); renderLanc(c); renderCortes(c); renderReserva(c); renderObj(c); renderDiv();
  renderVenc(c); renderAlertas(c); renderChips();
  if(AREA==='analise'&&SUB.analise==='graficos') renderGraficos(c);
  $('#dlFontes').innerHTML=[...new Set(S.lanc.map(l=>l.fonte).filter(Boolean))].map(f=>`<option value="${esc(f)}">`).join('');
}

function renderMeta(c){
  $('#cardsMeta').innerHTML=`
   <div class="card"><div class="l">Guardar por mês</div><div class="v" style="color:var(--verde)">${brl(c.meta)}</div><div class="n">${c.renda>0?pct(c.meta/c.renda)+' da renda':''}</div></div>
   <div class="card"><div class="l">Sobra pra viver</div><div class="v">${brl(c.disponivel)}</div><div class="n">vira teto das categorias</div></div>
   <div class="card"><div class="l">Em 12 meses</div><div class="v">${brl(c.meta*12)}</div></div>`;
  const n=$('#notaMeta'); if(!c.renda){ n.innerHTML=''; return; }
  const p=c.meta/c.renda;
  n.innerHTML = p>0.4 ? `<div class="nota aviso">Guardar ${pct(p)} é agressivo demais pra manter no longo prazo. Entre 20% e 30% é o ritmo que se sustenta.</div>`
   : p<0.1 ? `<div class="nota">Guardar menos de 10% faz qualquer imprevisto virar dívida. Se der, vale testar um pouco mais.</div>`
   : `<div class="nota">Ritmo saudável. ${brl(c.meta)} por mês são ${brl(c.meta*12)} em um ano.</div>`;
}

let histSel=0;
function renderHist(){
  const lc=$('#listaCiclos'), dc=$('#detalheCiclo');
  if(!S.hist.length){
    lc.innerHTML='<p class="vazio">Nenhuma fatura arquivada ainda. Na primeira virada de ciclo, o mês atual aparece aqui inteiro.</p>';
    dc.innerHTML=''; return;
  }
  if(histSel>=S.hist.length) histSel=0;
  lc.innerHTML='<table><thead><tr><th>Fechou em</th><th style="text-align:right">Fatura</th><th style="text-align:right">Meu</th><th style="text-align:right">Outro</th><th style="text-align:right">Variação</th><th></th></tr></thead><tbody>'+
    S.hist.map((x,i)=>{
      const ant=S.hist[i+1];
      const dif=ant?x.meu-ant.meu:null;
      return `<tr style="${i===histSel?'background:var(--fill)':''}">
        <td>${dataBR(x.data)}</td>
        <td class="v">${brl(x.bruto)}</td>
        <td class="v" style="font-weight:700">${brl(x.meu)}</td>
        <td class="v" style="color:var(--pai)">${brl(x.pai)}</td>
        <td class="v" style="color:${dif===null?'var(--txt-3)':(dif>0?'var(--vermelho)':'var(--verde)')}">
          ${dif===null?'—':(dif>0?'+':'−')+brl(Math.abs(dif))}</td>
        <td style="text-align:right"><button class="btn sec" data-ciclo="${i}" style="font-size:13px;padding:6px 12px">ver</button></td>
      </tr>`;}).join('')+'</tbody></table>';
  lc.querySelectorAll('[data-ciclo]').forEach(b=>b.onclick=()=>{ histSel=+b.dataset.ciclo; renderHist();
    $('#detalheCiclo').scrollIntoView({behavior:'smooth',block:'start'}); });

  const x=S.hist[histSel], ant=S.hist[histSel+1];
  const cats=Object.entries(x.porCat||{}).sort((a,b)=>b[1]-a[1]);
  const itens=[...(x.itens||[])].sort((a,b)=>b.valor-a.valor);
  const selo=l=>(l.tipo==='rec'||l.tipo==='fixo')?'<span class="tag ciclor">fixo</span>'
    :l.tipo==='var'?'<span class="tag ciclov">variável</span>'
    :l.tipo==='parc'?`<span class="tag ciclop">parcela</span>`:'<span class="tag ciclo1">1x</span>';
  dc.innerHTML=`<h3>Fatura de ${dataBR(x.data)}</h3>
   <div class="cards">
     <div class="card"><div class="l">Fatura total</div><div class="v">${brl(x.bruto)}</div></div>
     <div class="card"><div class="l">Meu</div><div class="v" style="color:var(--verde)">${brl(x.meu)}</div></div>
     ${x.pai>0?`<div class="card"><div class="l">De outra pessoa</div><div class="v" style="color:var(--pai)">${brl(x.pai)}</div></div>`:''}
     ${ant?`<div class="card"><div class="l">Contra o mês anterior</div><div class="v" style="color:${x.meu>ant.meu?'var(--vermelho)':'var(--verde)'}">${x.meu>ant.meu?'+':'−'}${brl(Math.abs(x.meu-ant.meu))}</div></div>`:''}
   </div>
   ${cats.length?'<h3>Por categoria</h3>'+cats.map(([k,v])=>{
      const antV=ant&&ant.porCat?(ant.porCat[k]||0):null;
      const d=antV===null?null:v-antV;
      return `<div class="teto" style="padding:10px 0">
        <div class="teto-l"><span class="teto-nome" style="font-size:15px"><span class="pt" style="background:${CATS[k]?CATS[k].c:'var(--cout)'}"></span>${CATS[k]?CATS[k].n:k}</span>
        <span class="teto-n">${brl(v)}${d===null?'':' <b style="color:'+(d>0?'var(--vermelho)':'var(--verde)')+'">'+(d>0?'+':'−')+brl(Math.abs(d))+'</b>'}</span></div>
        <div class="trilho"><i style="width:${x.meu>0?Math.min(v/x.meu*100,100):0}%;background:${CATS[k]?CATS[k].c:'var(--cout)'}"></i></div>
      </div>`;}).join(''):''}
   ${itens.length?`<h3>${itens.length} lançamentos</h3>
     <table><thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Fatura</th><th style="text-align:right">Meu</th></tr></thead><tbody>`+
     itens.map(l=>`<tr><td>${esc(l.nome)} ${selo(l)}<div style="font-size:12px;color:var(--txt-3)">${esc(l.fonte||'Conta')}</div></td>
      <td>${CATS[l.cat]?CATS[l.cat].n:l.cat}</td><td class="v">${brl(l.valor)}</td>
      <td class="v" style="font-weight:600">${brl(Math.max(l.valor-(l.pai||0),0))}</td></tr>`).join('')+
     `</tbody></table>`:''}`;
}

function renderTetos(c){
  $('#cardsTeto').innerHTML=`
   <div class="card"><div class="l">Disponível pra gastar</div><div class="v">${brl(c.disponivel)}</div><div class="n">renda menos o que guarda</div></div>
   <div class="card"><div class="l">Meu gasto de hoje</div><div class="v" style="color:${c.gasto>c.disponivel?'var(--alerta)':'var(--verde)'}">${brl(c.gasto)}</div><div class="n">${c.pai>0?'sem os '+brl(c.pai)+' de outra pessoa':''}</div></div>
   <div class="card" style="${c.somaExcesso>0?'border-color:var(--alerta)':''}"><div class="l">Estourando o teto</div><div class="v" style="color:${c.somaExcesso>0?'var(--alerta)':'var(--verde)'}">${brl(c.somaExcesso)}</div><div class="n">${c.somaExcesso>0?'é isso que precisa sair':'nenhuma categoria passou'}</div></div>`;
  const its=Object.entries(CATS).sort((a,b)=>(c.porCat[b[0]]||0)-(c.porCat[a[0]]||0));
  $('#tetos').innerHTML=its.map(([k,cat])=>{
    const g=c.porCat[k]||0, t=c.tetos[k]||0, dif=t-g;
    const p=t>0?Math.min(g/t*100,100):0, cor=g>t?'var(--alerta)':cat.c;
    return `<div class="teto">
      <div class="teto-l"><span class="teto-nome"><span class="pt" style="background:${cat.c}"></span>${cat.n}</span>
      <span class="teto-n">${brl(g)} de ${brl(t)}${c.renda?' · '+pct(t/c.renda)+' da renda':''}</span></div>
      <div class="trilho"><i style="width:${p}%;background:${cor}"></i></div>
      <div class="teto-acao"><span class="veredito ${dif>=0?'ok':'ruim'}">${dif>=0?'cabe mais '+brl(dif):'passou '+brl(-dif)}</span>
      <span style="color:var(--txt-3)">· ${cat.dica}</span>
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
        <label style="margin:0;text-transform:none;letter-spacing:0;font-size:12px">teto fixo</label>
        <input type="number" min="0" step="0.01" data-teto="${k}" value="${S.tetos[k]||''}" placeholder="auto"></span>
      </div></div>`;
  }).join('');
  $('#tetos').querySelectorAll('[data-teto]').forEach(inp=>inp.onchange=e=>{
    const k=e.target.dataset.teto, v=+e.target.value;
    if(v>0) S.tetos[k]=v; else delete S.tetos[k];
    render(); salvar();
  });
  $('#notaTeto').innerHTML = (c.gasto>c.disponivel&&c.renda>0)
    ? `<div class="nota aviso">Seus gastos passam em ${brl(c.gasto-c.disponivel)} do disponível depois de guardar. Ou o corte sai das categorias em vermelho, ou a meta cai — não tem terceira opção.</div>` : '';
}

function renderLanc(c){
  const fs=Object.entries(c.fontes).sort((a,b)=>b[1]-a[1]);
  $('#cards2').innerHTML='<div class="cards">'+
    `<div class="card"><div class="l">Fatura total</div><div class="v">${brl(c.bruto)}</div></div>`+
    `<div class="card" style="border-color:var(--verde)"><div class="l">Meu</div><div class="v" style="color:var(--verde)">${brl(c.gasto)}</div></div>`+
    (c.pai>0?`<div class="card" style="border-color:var(--pai)"><div class="l">De outra pessoa</div><div class="v" style="color:var(--pai)">${brl(c.pai)}</div><div class="n">está na fatura, não é gasto seu</div></div>`:'')+
    fs.map(([f,v])=>`<div class="card"><div class="l">${esc(f)}</div><div class="v">${brl(v)}</div></div>`).join('')+
    (c.futuro>0?`<div class="card" style="border-color:var(--alerta)"><div class="l">Parcelas por vir</div><div class="v" style="color:var(--alerta)">${brl(c.futuro)}</div><div class="n">sua parte, nos próximos meses</div></div>`:'')+'</div>';

  const tb=$('#tbLanc');
  if(!S.lanc.length){ tb.innerHTML='<tr><td colspan="7" class="vazio">Nenhum gasto neste ciclo.</td></tr>'; return; }
  const selo=l=>(l.tipo==='rec'||l.tipo==='fixo')?'<span class="tag ciclor">fixo</span>'
    :l.tipo==='var'?'<span class="tag ciclov">variável</span>'
    :l.tipo==='parc'?`<span class="tag ciclop">faltam ${l.pRest||0}x</span>`:'<span class="tag ciclo1">1x</span>';
  tb.innerHTML=[...S.lanc].sort((a,b)=>b.valor-a.valor).map(l=>`<tr>
    <td>${esc(l.nome)} ${selo(l)}<div style="font-size:11.5px;color:var(--txt-3)">${esc(l.fonte||'Conta')} · <span class="tag ${TIER[l.tier].cl}">${TIER[l.tier].n}</span></div></td>
    <td><span class="pt" style="background:${CATS[l.cat].c}"></span>${CATS[l.cat].n}</td>
    <td><select data-pag="${l.id}" style="padding:5px 6px;font-size:12.5px">
      <option value="eu"${!l.pai?' selected':''}>Eu</option>
      <option value="dividido"${l.pai&&l.pai<l.valor?' selected':''}>Dividido</option>
      <option value="pai"${l.pai>=l.valor?' selected':''}>Outra pessoa</option></select></td>
    <td class="v"><input type="number" min="0" step="0.01" data-val="${l.id}" value="${l.valor||''}" placeholder="0,00"
        style="width:100px;padding:5px 7px;text-align:right;font-size:13px">
        ${(!l.valor&&l.ref)?`<div style="font-size:11px;color:var(--txt-3)">mês passado ${brl(l.ref)}</div>`:''}</td>
    <td class="v"><input type="number" min="0" step="0.01" data-pai="${l.id}" value="${l.pai||''}" placeholder="0,00"
        style="width:96px;padding:5px 7px;text-align:right;font-size:13px"></td>
    <td class="v" style="font-weight:700;color:${meuValor(l)===0?'var(--pai)':'inherit'}">${brl(meuValor(l))}</td>
    <td style="text-align:right"><button class="btn-x" data-del="${l.id}" aria-label="Remover">×</button></td></tr>`).join('')
    +`<tr class="total"><td colspan="3">Total</td><td class="v">${brl(c.bruto)}</td>
      <td class="v" style="color:var(--pai)">${brl(c.pai)}</td><td class="v">${brl(c.gasto)}</td><td></td></tr>`;
  tb.querySelectorAll('[data-val]').forEach(i=>i.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.val);
    if(l){ l.valor=+e.target.value||0; l.pai=Math.min(+l.pai||0,l.valor); render(); salvar(); }});
  tb.querySelectorAll('[data-pai]').forEach(i=>i.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.pai);
    if(l){ l.pai=Math.min(+e.target.value||0,l.valor); render(); salvar(); }});
  tb.querySelectorAll('[data-pag]').forEach(s=>s.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.pag); if(!l) return;
    if(e.target.value==='eu') l.pai=0;
    else if(e.target.value==='pai') l.pai=l.valor;
    else if(!l.pai||l.pai>=l.valor) l.pai=+(l.valor/2).toFixed(2);
    render(); salvar();});
}

function renderCortes(c){
  const lista=[];
  Object.entries(c.excesso).forEach(([k,v])=>{
    const itens=S.lanc.filter(l=>l.cat===k&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a));
    lista.push({tipo:'teto',nome:CATS[k].n,valor:v,alvo:c.tetos[k],hoje:c.porCat[k],
      itens:itens.slice(0,3).map(l=>l.nome+' ('+brl(meuValor(l))+')')});
  });
  S.lanc.filter(l=>l.tier===3&&!c.excesso[l.cat]&&meuValor(l)>0).forEach(l=>{
    lista.push({tipo:'zerar',nome:l.nome,valor:meuValor(l),alvo:0,hoje:meuValor(l),itens:[CATS[l.cat].n]});
  });
  lista.sort((a,b)=>b.valor-a.valor);
  const total=lista.reduce((s,x)=>s+x.valor,0), nova=c.sobra+total;

  $('#cortes').innerHTML=lista.length
    ? lista.map((x,i)=>`<div class="corte">
       <div class="ord num">${String(i+1).padStart(2,'0')}</div>
       <div class="txt">
         <div class="nome">${esc(x.nome)}</div>
         <div class="det" style="margin:4px 0 6px">
           hoje <b class="num">${brl(x.hoje)}</b> →
           <b style="color:${x.alvo>0?'var(--verde)':'var(--alerta)'}">
             ${x.alvo>0?'gaste no máximo '+brl(x.alvo):'ZERE ISSO'}</b>
         </div>
         <div class="trilho"><i style="width:100%;background:var(--alerta)"></i></div>
         <div class="det" style="margin-top:5px">${esc(x.itens.join(' · '))}</div>
       </div>
       <div class="ano">−${brl(x.valor)}<div class="det" style="font-weight:400">por mês</div>
         <div class="det" style="font-weight:600;color:var(--txt)">${brl(x.valor*12)}/ano</div></div>
      </div>`).join('')
    : '<p class="vazio">Preencha a renda e a meta pra ver o que está fora do teto.</p>';

  $('#cardsCorte').innerHTML=`
   <div class="card"><div class="l">Sobra hoje</div><div class="v" style="color:${c.sobra<0?'var(--alerta)':'var(--txt)'}">${brl(c.sobra)}</div></div>
   <div class="card" style="border-color:var(--alerta)"><div class="l">Dá pra cortar</div><div class="v" style="color:var(--alerta)">${brl(total)}</div><div class="n">por mês</div></div>
   <div class="card" style="border-color:var(--verde)"><div class="l">Sobra depois do corte</div><div class="v" style="color:var(--verde)">${brl(nova)}</div><div class="n">${c.renda>0?pct(Math.max(nova,0)/c.renda)+' da renda':''}</div></div>
   <div class="card"><div class="l">Em 12 meses</div><div class="v">${brl(Math.max(nova,0)*12)}</div><div class="n">se guardar tudo isso</div></div>`;

  const zerar=lista.filter(x=>x.tipo==='zerar').reduce((s,x)=>s+x.valor,0);
  let txt='';
  if(c.renda>0&&c.meta>0){
    txt = nova>=c.meta
      ? `<div class="nota"><b>Plano de ataque.</b> Você não precisa da lista inteira: vá de cima pra baixo até juntar ${brl(c.meta-c.sobra>0?c.meta-c.sobra:0)}. Os três primeiros já resolvem na maioria dos meses.</div>`
      : `<div class="nota aviso"><b>Mesmo cortando tudo faltam ${brl(c.meta-nova)}.</b> Aqui apertar mais o dia a dia não resolve — o caminho é renda maior ou meta menor. Corte o que dá e ajuste a meta pra um número que você consiga manter.</div>`;
  }
  if(zerar>0) txt+=`<div class="nota aviso"><b>Zerando só o que está marcado como “pode cortar”: ${brl(zerar)} por mês, ${brl(zerar*12)} no ano.</b> Não é dinheiro que falta — é dinheiro que já é seu e está indo embora em pedaços pequenos.</div>`;
  $('#notaCorte').innerHTML=txt;
}

function renderReserva(c){
  const alvo=c.t[1]*(+S.meses||6), falta=Math.max(alvo-(+S.jaTem||0),0);
  const guarda=Math.max(Math.min(c.sobra,c.meta)||c.meta,0);
  const m=guarda>0?Math.ceil(falta/guarda):null;
  $('#cardsReserva').innerHTML=`
   <div class="card"><div class="l">Alvo da reserva</div><div class="v">${brl(alvo)}</div><div class="n">${S.meses||6} meses de ${brl(c.t[1])} essenciais seus</div></div>
   <div class="card"><div class="l">Falta juntar</div><div class="v">${brl(falta)}</div></div>
   <div class="card"><div class="l">Tempo até lá</div><div class="v">${falta===0?'pronto':(m?m+(m===1?' mês':' meses'):'—')}</div><div class="n">${guarda>0?'guardando '+brl(guarda)+'/mês':'defina sua meta'}</div></div>`;
}

function renderObj(c){
  const tb=$('#tbObj');
  if(!S.obj.length){ tb.innerHTML='<tr><td colspan="5" class="vazio">Nenhum objetivo ainda. Meta sem destino não dura.</td></tr>'; $('#notaObj').innerHTML=''; return; }
  let soma=0;
  tb.innerHTML=S.obj.map(o=>{
    const falta=Math.max(o.alvo-(o.tem||0),0), porMes=o.prazo>0?falta/o.prazo:0; soma+=porMes;
    return `<tr><td>${esc(o.nome)}<div style="font-size:11.5px;color:var(--txt-3)">custa ${brl(o.alvo)} · já tem ${brl(o.tem||0)}</div></td>
     <td class="v">${brl(falta)}</td><td class="v">${o.prazo||'—'} ${o.prazo?'meses':''}</td>
     <td class="v" style="font-weight:700">${porMes?brl(porMes):'—'}</td>
     <td style="text-align:right"><button class="btn-x" data-delo="${o.id}" aria-label="Remover">×</button></td></tr>`;
  }).join('')+`<tr class="total"><td colspan="3">Precisa guardar por mês</td><td class="v">${brl(soma)}</td><td></td></tr>`;
  $('#notaObj').innerHTML= soma<=c.meta
    ? `<div class="nota">Seus objetivos pedem ${brl(soma)}/mês e sua meta guarda ${brl(c.meta)}. Cabe — sobram ${brl(c.meta-soma)}.</div>`
    : `<div class="nota aviso">Seus objetivos pedem ${brl(soma)}/mês, mas a meta guarda ${brl(c.meta)}. Faltam ${brl(soma-c.meta)}: estique o prazo, corte mais (tem ${brl(c.somaExcesso)} de excesso) ou tire um da fila.</div>`;
}

function renderDiv(){
  const tb=$('#tbDiv');
  if(!S.div.length){ tb.innerHTML='<tr><td colspan="6" class="vazio">Nenhuma dívida com juros. Se não tem, ótimo — pule.</td></tr>'; $('#notaDiv').innerHTML=''; return; }
  const ord=[...S.div].sort((a,b)=>b.juros-a.juros);
  tb.innerHTML=ord.map((d,i)=>`<tr><td class="num" style="color:var(--txt-3)">${i+1}º</td>
   <td>${esc(d.nome)}${d.parc?'<div style="font-size:12px;color:var(--txt-3)">parcela '+brl(d.parc)+'</div>':''}</td>
   <td class="v">${brl(d.saldo)}</td><td class="v">${(d.juros||0).toFixed(2)}%</td>
   <td class="v" style="color:var(--alerta)">${brl(d.saldo*(d.juros||0)/100)}</td>
   <td style="text-align:right"><button class="btn-x" data-deld="${d.id}" aria-label="Remover">×</button></td></tr>`).join('');
  const total=S.div.reduce((s,d)=>s+d.saldo*(d.juros||0)/100,0), p=ord[0];
  $('#notaDiv').innerHTML=`<div class="nota aviso">Só de juros: <b>${brl(total)}</b> por mês, ${brl(total*12)} no ano sem abater saldo. Jogue a sobra em <b>${esc(p.nome)}</b> primeiro.</div>`;
}

/* ---------- eventos ---------- */
document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>irPara(b.dataset.a));
document.querySelectorAll('.subnav .sub').forEach(b=>b.onclick=()=>{
  const area=b.closest('.area').id.slice(2);
  irPara(area+':'+b.dataset.s);
});
document.addEventListener('click',e=>{
  const l=e.target.closest('[data-ir]'); if(l) irPara(l.dataset.ir);
});
$('#lCat').innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v.n}</option>`).join('');
let tDeb=null;
function agendarRender(){ clearTimeout(tDeb); tDeb=setTimeout(()=>{ render(); salvar(); },220); }
['salario','extra','meses','jaTem','metaPct','metaVal','diaFech','diaVenc'].forEach(id=>$('#'+id).addEventListener('input',e=>{
  S[id]=+e.target.value||0;
  if(id==='metaVal'&&+e.target.value>0) S.metaPct=0;
  if(id==='metaPct'&&+e.target.value>0){ S.metaVal=0; $('#metaVal').value=''; }
  if(id==='diaFech') S.ultimoFech=iso(ultimoFechPassado());
  agendarRender();
}));
$('#lPagador').onchange=e=>{ const v=+$('#lValor').value||0;
  if(e.target.value==='eu') $('#lPai').value='';
  else if(e.target.value==='pai') $('#lPai').value=v||'';
  else if(v) $('#lPai').value=(v/2).toFixed(2); };
$('#lTipo').onchange=e=>{ $('#lParc').disabled=(e.target.value!=='parc'); if(e.target.value!=='parc') $('#lParc').value=''; };
$('#btnTema').onclick=()=>{ S.tema=(S.tema==='escuro')?'claro':'escuro'; aplicarTema(); salvar(); };
function aplicarTema(){
  if(!S.tema||S.tema==='auto'){
    S.tema=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'escuro':'claro';
  }
  const esc=(S.tema==='escuro');
  const cor=esc?'#000000':'#F2F2F7';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',cor));
  document.documentElement.setAttribute('data-tema',esc?'escuro':'claro');
  const b=$('#btnTema');
  b.innerHTML=icone(esc?'sol':'lua',20);
  b.setAttribute('aria-label',esc?'Mudar para o tema claro':'Mudar para o tema escuro');
}
$('#lParc').disabled=true;
$('#resetTetos').onclick=()=>{ S.tetos={}; render(); salvar(); };
$('#fecharAgora').onclick=()=>{
  const n=S.lanc.length;
  if(!confirm('Fechar a fatura agora?\n\nOs '+n+' lançamentos deste ciclo vão pro arquivo. Os de uma vez só saem da lista, os parcelados perdem uma parcela e os fixos e variáveis continuam.')) return;
  const r=fecharCiclo(iso(hojeD()));
  S.ultimoFech=iso(hojeD()); histSel=0;
  avisoCiclo=`<div class="nota info"><b>Fatura fechada e arquivada.</b> ${r.sumiram} lançamento${r.sumiram===1?'':'s'} saíram, ${r.andaram} parcela${r.andaram===1?'':'s'} continuam na próxima.</div>`;
  S.retroVista=S.hist[0].data;
  render(); salvar();
  setTimeout(()=>mostrarRetro(S.hist[0]),260);
};
$('#btnBackup').onclick=baixarBackup;
$('#btnRestaurar').onclick=()=>$('#arqBackup').click();
$('#arqBackup').onchange=e=>{ const f=e.target.files[0]; if(f) restaurarBackup(f); e.target.value=''; };
window.addEventListener('beforeunload',()=>{ try{
  if(saindo||!Auth.logado()) return;   // logout em andamento: não ressuscitar os dados
  const v=JSON.stringify(Object.assign(S,{_ts:Date.now()}));
  if(temLS) localStorage.setItem(KEY,v);
  cookieSet(KEY,v);
}catch(e){} });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') salvar(); });
$('#addLanc').onclick=()=>{
  const nome=$('#lNome').value.trim(), valor=+$('#lValor').value;
  if(!nome||!(valor>0)){ $('#lNome').focus(); return; }
  const tipo=$('#lTipo').value;
  S.lanc.push({id:Date.now()+Math.random(),criadoEm:Date.now(),nome,valor,cat:$('#lCat').value,tier:+$('#lTier').value,
    fonte:$('#lFonte').value.trim()||'Conta',tipo,pRest:tipo==='parc'?(+$('#lParc').value||1):0,
    pai:Math.min(+$('#lPai').value||0,valor),ref:0,venc:Math.min(Math.max(+$('#lVenc').value||0,0),31)});
  ['lNome','lValor','lParc','lPai','lVenc'].forEach(i=>$('#'+i).value=''); $('#lPagador').value='eu'; $('#lNome').focus();
  render(); salvar();
};
$('#addObj').onclick=()=>{
  const nome=$('#oNome').value.trim(), alvo=+$('#oAlvo').value;
  if(!nome||!(alvo>0)){ $('#oNome').focus(); return; }
  S.obj.push({id:Date.now()+Math.random(),nome,alvo,tem:+$('#oTem').value||0,prazo:+$('#oPrazo').value||0});
  ['oNome','oAlvo','oTem','oPrazo'].forEach(i=>$('#'+i).value='');
  render(); salvar(); toast('Objetivo adicionado'); vibrar(12);
};
$('#addDiv').onclick=()=>{
  const nome=$('#dNome').value.trim(), saldo=+$('#dSaldo').value;
  if(!nome||!(saldo>0)){ $('#dNome').focus(); return; }
  S.div.push({id:Date.now()+Math.random(),nome,saldo,juros:+$('#dJuros').value||0,parc:+$('#dParc').value||0});
  ['dNome','dSaldo','dJuros','dParc'].forEach(i=>$('#'+i).value='');
  render(); salvar(); toast('Dívida adicionada'); vibrar(12);
};
function removerCom(lista,id,rotulo){
  const i=S[lista].findIndex(x=>String(x.id)===String(id));
  if(i<0) return;
  const item=S[lista][i];
  S[lista].splice(i,1); render(); salvar(); vibrar(10);
  snack(rotulo+' removido.','Desfazer',()=>{
    S[lista].splice(Math.min(i,S[lista].length),0,item); render(); salvar(); toast('Restaurado');
  });
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-del]'), d=e.target.closest('[data-deld]'), o=e.target.closest('[data-delo]');
  if(b) removerCom('lanc',b.dataset.del,'Lançamento');
  if(d) removerCom('div',d.dataset.deld,'Dívida');
  if(o) removerCom('obj',o.dataset.delo,'Objetivo');
});
$('#zerar').onclick=()=>{ if(confirm('Apagar tudo e recomeçar do zero?')){
  S=Object.assign({},S,{salario:0,extra:0,metaPct:20,metaVal:0,diaFech:5,diaVenc:5,
     ultimoFech:iso(ultimoFechPassado()),hist:[],tetos:{},lanc:[],div:[],obj:[],meses:6,jaTem:0,notifLog:{},agendaLog:{},retroVista:null});
  ['salario','extra','jaTem','metaVal'].forEach(i=>$('#'+i).value=''); $('#metaPct').value=20; $('#meses').value=6;
  avisoCiclo=''; render(); salvar();
  Auth.apagarEstadoNaNuvem().catch(()=>{});
  toast('Tudo apagado'); irPara('hoje'); } };

/* ---------- leitura de extrato ---------- */
/* Normaliza antes de classificar: "Farmácia" e "farmacia" têm que cair no
   mesmo lugar, e "mercado" sozinho vale tanto quanto "mercado livre". */
const semAcento=t=>String(t).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const REGRAS=[
  [/mercadolivre|mercado livre|\bmp\*|shopee|amazon|magalu|aliexpress|shein|americanas|renner|riachuelo|zara|centauro|nike|adidas|steam|playstation|xbox|nintendo|cinema|ingresso|barbearia|cabelereir|salao|tatuagem|cerveja|bar\b|balada|presente|roupa|tenis|perfum/,'lazer',3],
  [/ifood|rappi|delivery|mcdonald|burger|pizza|lanche|hamburg|sushi|padaria|panificadora|restaurante|subway|\bcafe|starbucks|habib|marmita|almoco|jantar|sorvete|acai|doceria|espetinho|churrasc/,'comida',3],
  [/supermerc|\bmercado\b|mercado |carrefour|assai|atacad|condor|muffato|angeloni|hortifruti|acougue|pao de acucar|big\b|extra\b|tenda|dia\b|sacolao|feira|quitanda|compra do mes/,'mercado',1],
  [/posto|ipiranga|shell|petrobr|combust|gasolin|etanol|alcool|diesel|\buber\b|99app|99pop|indriver|taxi|onibus|metro|\bbus\b|passagem|pedagio|estacion|\bpark|oficina|mecanic|\bipva\b|licenciam|seguro auto|pneu|lavagem|revisao/,'transporte',1],
  [/netflix|spotify|disney|hbo|\bmax\b|prime video|deezer|youtube|apple\.com|\bicloud|google \*|canva|chatgpt|anthropic|claude|assinatura|globoplay|paramount|crunchyroll|telecine|plano do cartao|anuidade/,'assinatura',3],
  [/farmacia|drogaria|drogasil|pacheco|panvel|raia|nissei|unimed|amil|hapvida|plano de saude|dentista|medic|consulta|exame|laborator|academia|smartfit|bluefit|gympass|suplement|whey|psicolog|terapia|vacina/,'saude',1],
  [/aluguel|condominio|energia|copel|cemig|enel|light\b|\bluz\b|\bagua\b|sanepar|sabesp|\bgas\b|comgas|ultragaz|internet|\bvivo\b|claro|\btim\b|oi fibra|nextfibra|\biptu\b|celular|telefone|recarga|faxina|diarista|gato|racao|pet/,'casa',1],
  [/faculdade|mensalidade|escola|colegio|curso|udemy|alura|coursera|ieduc|apostila|livro|material escolar|impress|xerox|papelaria|certifica/,'estudo',2],
  [/fatura|cartao|emprestimo|financiamento|consorcio|parcela|juros|rotativo|nubank|inter\b|itau|bradesco|santander|caixa\b/,'divida',1]
];
function classificar(txt){
  const t=semAcento(txt);
  for(const [re,cat,tier] of REGRAS) if(re.test(t)) return [cat,tier];
  return ['outros',2];
}
const IGNORA=/valor da cota|pagamento com saldo|saldo anterior|total da fatura|limite dispon|encargos|^saldo/i;
function parseLinha(l){
  const limpa=l.replace(/\s+/g,' ').trim();
  if(!limpa||IGNORA.test(limpa)) return null;
  const mp=limpa.match(/parcela\s+(\d+)\s+de\s+(\d+)/i);
  const vals=limpa.match(/-?\s?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s?\d+\.\d{2}(?!\d)/g);
  if(!vals) return mp?{soParcela:+mp[2]-+mp[1]}:null;
  const bruto=vals.find(v=>/R\$/.test(v))||vals[0];
  if(/^-/.test(bruto.trim())) return null;
  const v=Math.abs(parseFloat(bruto.replace(/[R$\s-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.')));
  if(!(v>0)) return null;
  let nome=limpa.replace(bruto,'')
    .replace(/^\d{1,2}\s?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\.?/i,'')
    .replace(/^\d{2}[\/.]\d{2}([\/.]\d{2,4})?/,'')
    .replace(/US\$\s?[\d.,]+/g,'').replace(/[•·]/g,'')
    .replace(/parcela\s+\d+\s+de\s+\d+/i,'')
    .replace(/[-–|]+/g,' ').replace(/\s+/g,' ').trim();
  if(!nome) nome='Lançamento';
  const [cat,tier]=classificar(limpa);
  return {nome:nome.slice(0,42),valor:v,cat,tier,pRest:mp?+mp[2]-+mp[1]:0};
}
function lerTexto(txt){
  const out=[];
  txt.split(/\r?\n/).forEach(l=>{ const p=parseLinha(l); if(!p) return;
    if(p.soParcela!==undefined){ if(out.length) out[out.length-1].pRest=p.soParcela; return; }
    out.push(p); });
  return out.map((p,i)=>Object.assign(p,{k:i}));
}
function numBR(s){ s=String(s).replace(/[R$\s"']/g,'');
  if(/,\d{1,2}$/.test(s)) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/,/g,'');
  return parseFloat(s); }
function lerOFX(txt){
  const out=[];
  txt.split(/<STMTTRN>/i).slice(1).forEach(b=>{
    const g=t=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():'';};
    const v=parseFloat(g('TRNAMT')), nome=(g('MEMO')||g('NAME')||'Lançamento').trim();
    if(!isNaN(v)&&v!==0) out.push({nome:nome.slice(0,42),bruto:v}); });
  return out;
}
function lerCSV(txt){
  const linhas=txt.split(/\r?\n/).filter(l=>l.trim()); if(!linhas.length) return [];
  const del=(linhas[0].match(/;/g)||[]).length>(linhas[0].match(/,/g)||[]).length?';':',';
  const cel=l=>l.split(del).map(c=>c.replace(/^"|"$/g,'').trim());
  const cab=cel(linhas[0]).map(c=>c.toLowerCase());
  const iV=cab.findIndex(c=>/valor|amount|montante/.test(c));
  const iN=cab.findIndex(c=>/descri|title|hist|estabelec|memo|lan[cç]amento|detalhe/.test(c));
  const corpo=(iV>=0||/data|date/.test(cab[0]))?linhas.slice(1):linhas;
  const out=[];
  corpo.forEach(l=>{ const c=cel(l); if(c.length<2) return;
    let v,nome;
    if(iV>=0){ v=numBR(c[iV]); nome=iN>=0?c[iN]:c.filter((x,j)=>j!==iV).join(' '); }
    else{ let m=-1; c.forEach((x,j)=>{ const n=numBR(x); if(!isNaN(n)&&!/^\d{2}[\/-]\d{2}/.test(x)) m=j; });
      if(m<0) return; v=numBR(c[m]); nome=c.filter((x,j)=>j!==m&&!/^\d{2}[\/-]\d{2}/.test(x)).join(' '); }
    if(isNaN(v)||v===0) return;
    out.push({nome:(nome||'Lançamento').slice(0,42),bruto:v}); });
  return out;
}
function daBruto(itens){
  const temNeg=itens.some(i=>i.bruto<0);
  const gastos=temNeg?itens.filter(i=>i.bruto<0):itens;
  return {ignorados:itens.length-gastos.length,
    linhas:gastos.map((i,k)=>{const [cat,tier]=classificar(i.nome);
      return {nome:i.nome,valor:Math.abs(i.bruto),cat,tier,pRest:0,k};}).filter(p=>p.valor>0)};
}
$('#arq').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=()=>{ const t=fr.result;
    if(t.includes('\uFFFD')){ const f2=new FileReader(); f2.onload=()=>processar(f2.result,f.name); f2.readAsText(f,'windows-1252'); return; }
    processar(t,f.name); };
  fr.onerror=()=>{ $('#arqInfo').textContent='Não consegui abrir esse arquivo.'; };
  fr.readAsText(f,'utf-8');
};
function processar(txt,nomeArq){
  let itens=/<STMTTRN>/i.test(txt)?lerOFX(txt):lerCSV(txt);
  if(!itens.length) itens=lerTexto(txt).map(p=>({nome:p.nome,bruto:-p.valor}));
  const r=daBruto(itens);
  if(!r.linhas.length){ $('#arqInfo').textContent='Li o arquivo mas não achei lançamentos. Tente OFX ou cole as linhas abaixo.'; prev=[]; renderPrev(); return; }
  $('#arqInfo').textContent=nomeArq+' — '+r.linhas.length+' lançamentos'+(r.ignorados?' ('+r.ignorados+' entradas ignoradas)':'');
  prev=r.linhas; renderPrev(); $('#prev').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#lerExtrato').onclick=()=>{ prev=lerTexto($('#txExtrato').value); renderPrev(); };
$('#limparPrev').onclick=()=>{ prev=[]; $('#txExtrato').value=''; renderPrev(); };
function renderPrev(){
  const el=$('#prev');
  if(!prev.length){ el.innerHTML=$('#txExtrato').value?'<div class="nota aviso">Não achei valores nessas linhas. Cada linha precisa ter descrição e valor.</div>':''; return; }
  const soma=prev.reduce((s,p)=>s+p.valor,0);
  el.innerHTML=`<h3>${prev.length} lançamentos · ${brl(soma)}</h3>
   <p class="ajuda">Confira categoria e peso. Depois de adicionar, marque na tabela quem paga cada um.</p>
   <table><thead><tr><th>Descrição</th><th>Categoria</th><th>Peso</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>`+
   prev.map(p=>`<tr><td>${esc(p.nome)}${p.pRest?'<div style="font-size:11.5px;color:var(--txt-3)">faltam '+p.pRest+'x</div>':''}</td>
    <td><select data-pc="${p.k}">${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${k===p.cat?' selected':''}>${v.n}</option>`).join('')}</select></td>
    <td><select data-pt="${p.k}">${[1,2,3].map(t=>`<option value="${t}"${t===p.tier?' selected':''}>${TIER[t].n}</option>`).join('')}</select></td>
    <td class="v">${brl(p.valor)}</td>
    <td style="text-align:right"><button class="btn-x" data-pd="${p.k}" aria-label="Descartar">×</button></td></tr>`).join('')+
   `</tbody></table><div style="margin-top:12px"><button class="btn" id="confirmPrev">Adicionar aos meus gastos</button></div>`;
  el.querySelectorAll('[data-pc]').forEach(s=>s.onchange=e=>{ prev.find(p=>p.k==e.target.dataset.pc).cat=e.target.value; });
  el.querySelectorAll('[data-pt]').forEach(s=>s.onchange=e=>{ prev.find(p=>p.k==e.target.dataset.pt).tier=+e.target.value; });
  el.querySelectorAll('[data-pd]').forEach(b=>b.onclick=e=>{ prev=prev.filter(p=>p.k!=e.target.dataset.pd); renderPrev(); });
  $('#confirmPrev').onclick=()=>{
    const fn=($('#impFonte').value||'').trim()||'Conta';
    prev.forEach(p=>S.lanc.push({id:Date.now()+Math.random(),nome:p.nome,valor:p.valor,cat:p.cat,tier:p.tier,
      fonte:fn,pRest:+p.pRest||0,tipo:p.pRest>0?'parc':'unico',pai:0}));
    const n=prev.length;
    prev=[]; $('#txExtrato').value=''; renderPrev(); render(); salvar();
    toast(n+' lançamento'+(n===1?'':'s')+' importado'+(n===1?'':'s')); vibrar(16);
    irPara('hoje');
  };
}

/* ==========================================================================
   v2 — gráficos, alertas por notificação, contas a vencer e PWA
   ========================================================================== */
const ABAS=['renda','tetos','lanc','cortes','objetivos','graficos','hist','alertas','extrato'];
const MES_CURTO=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const SERIES=['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];

/* ---------- utilidades de SVG ---------- */
const NS='http://www.w3.org/2000/svg';
function svg(w,h,extra){
  return `<svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet"${extra||''}>`;
}
function ligarTip(fig){
  const tip=fig.querySelector('.viz-tip'); if(!tip) return;
  fig.querySelectorAll('[data-tip]').forEach(el=>{
    const mostra=ev=>{
      tip.innerHTML=el.dataset.tip;
      const r=fig.getBoundingClientRect();
      const x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
      const y=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top;
      tip.style.left=Math.max(70,Math.min(x,r.width-70))+'px';
      tip.style.top=Math.max(34,y-6)+'px';
      tip.style.opacity='1';
      fig.querySelectorAll('.arco,.barra-m').forEach(o=>o.classList.toggle('apaga',o!==el));
    };
    const some=()=>{ tip.style.opacity='0';
      fig.querySelectorAll('.arco,.barra-m').forEach(o=>o.classList.remove('apaga')); };
    el.addEventListener('mousemove',mostra);
    el.addEventListener('mouseleave',some);
    el.addEventListener('touchstart',mostra,{passive:true});
    el.addEventListener('touchend',some);
  });
}
/* rótulo de eixo curto: 'R$ 3,6 mil' cabe na margem, 'R$ 3.565,00' não */
const brlCurto=v=>{ v=+v||0;
  if(v>=1000) return 'R$ '+(v/1000).toFixed(v>=10000?0:1).replace('.',',')+' mil';
  return 'R$ '+v.toFixed(0); };
const DICA_ROL='<p class="viz-dica">Arraste o gráfico pro lado pra ver tudo.</p>';
function rolagem(inner){ return '<div class="viz-rol">'+inner+'</div>'+DICA_ROL; }
function tabela(cab,linhas){
  return `<details class="viz-tab"><summary>ver os números em tabela</summary>
   <table><thead><tr>${cab.map((c,i)=>`<th${i?' style="text-align:right"':''}>${c}</th>`).join('')}</tr></thead>
   <tbody>${linhas.map(l=>`<tr>${l.map((c,i)=>`<td${i?' class="v"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

/* ---------- 1. rosca: para onde foi o meu dinheiro ---------- */
function grafDonut(c){
  const fig=$('#figDonut');
  const itens=Object.entries(c.porCat).filter(([,v])=>v>0.005).sort((a,b)=>b[1]-a[1]);
  const cabeca=`<figcaption><div class="viz-tit">Para onde foi o seu dinheiro</div>
    <div class="viz-sub">Ciclo atual, só a sua parte. As sete maiores aparecem separadas; o resto vira “Outras”.</div></figcaption>`;
  if(!itens.length){ fig.innerHTML=cabeca+'<div class="viz-vazio">Sem gastos lançados neste ciclo ainda.</div>'; return; }
  let dados=itens.slice(0,7).map(([k,v],i)=>({nome:CATS[k]?CATS[k].n:k,v,cor:SERIES[i]}));
  const resto=itens.slice(7).reduce((s,[,v])=>s+v,0);
  if(resto>0) dados.push({nome:'Outras',v:resto,cor:SERIES[7]});
  const total=dados.reduce((s,d)=>s+d.v,0);

  const R=100, r=72, cx=110, cy=110, gap=0.018; // 2px de respiro entre fatias
  let a0=-Math.PI/2, arcos='';
  dados.forEach(d=>{
    const frac=d.v/total;
    let a1=a0+frac*Math.PI*2;
    const ga=(frac>0.02)?gap:0.004;
    const s=a0+ga/2, e=Math.max(a1-ga/2,a0+0.002);
    const grande=(e-s)>Math.PI?1:0;
    const p=[ `M ${cx+R*Math.cos(s)} ${cy+R*Math.sin(s)}`,
      `A ${R} ${R} 0 ${grande} 1 ${cx+R*Math.cos(e)} ${cy+R*Math.sin(e)}`,
      `L ${cx+r*Math.cos(e)} ${cy+r*Math.sin(e)}`,
      `A ${r} ${r} 0 ${grande} 0 ${cx+r*Math.cos(s)} ${cy+r*Math.sin(s)}`,'Z'].join(' ');
    arcos+=`<path class="arco" d="${p}" fill="${d.cor}" tabindex="0"
      data-tip="<b>${esc(d.nome)}</b><br>${brl(d.v)} · ${pct(d.v/total)} do gasto"><title>${esc(d.nome)}: ${brl(d.v)}</title></path>`;
    a0=a1;
  });
  fig.innerHTML=cabeca+
   `<div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
      <div style="flex:0 0 220px;max-width:220px">
        ${svg(220,220)}${arcos}
        <text class="donut-c" x="110" y="102" text-anchor="middle">meu gasto</text>
        <text class="donut-v" x="110" y="124" text-anchor="middle">${brl(total)}</text>
        <text class="donut-c" x="110" y="143" text-anchor="middle" opacity=".75">neste ciclo</text></svg>
      </div>
      <div style="flex:1;min-width:210px">
        <div class="viz-leg" style="flex-direction:column;gap:9px">
        ${dados.map(d=>`<span style="justify-content:space-between;width:100%">
          <span style="display:inline-flex;align-items:center;gap:7px;min-width:0">
            <i style="background:${d.cor}"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nome)}</span></span>
          <b>${brl(d.v)} <span style="color:var(--txt-3);font-weight:500">${pct(d.v/total)}</span></b></span>`).join('')}
        </div>
      </div>
    </div>
    <div class="viz-tip"></div>`+
   tabela(['Categoria','Meu gasto','Fatia'],dados.map(d=>[esc(d.nome),brl(d.v),pct(d.v/total)]));
  ligarTip(fig);
}

/* ---------- 2. evolução mês a mês ---------- */
function grafEvolucao(c){
  const fig=$('#figEvol');
  const cabeca=`<figcaption><div class="viz-tit">Meu gasto mês a mês</div>
    <div class="viz-sub">Cada barra é uma fatura arquivada — só a sua parte. A última, mais clara, é o ciclo que ainda está aberto.</div></figcaption>`;
  const hist=[...S.hist].slice(0,11).reverse();
  if(hist.length<1){ fig.innerHTML=cabeca+
    '<div class="viz-vazio">Ainda não há fatura arquivada. Na primeira virada de ciclo esse gráfico se preenche sozinho.</div>'; return; }
  const barras=hist.map(x=>{const [y,m,d]=x.data.split('-');
    return {rot:MES_CURTO[+m-1],sub:d+'/'+m,v:x.meu,parcial:false};});
  barras.push({rot:MES_CURTO[hojeD().getMonth()],sub:'agora',v:c.gasto,parcial:true});

  const W=680,H=250,ml=74,mr=54,mt=18,mb=42;
  const max=Math.max(...barras.map(b=>b.v),1)*1.15;
  const larg=(W-ml-mr)/barras.length, bw=Math.min(larg*0.62,52);
  const media=hist.reduce((s,x)=>s+x.meu,0)/hist.length;
  const y=v=>mt+(H-mt-mb)*(1-v/max);
  let corpo='';
  [0,.5,1].forEach(f=>{ const yy=y(max*f);
    corpo+=`<line class="malha" x1="${ml}" y1="${yy}" x2="${W-mr}" y2="${yy}"></line>
      <text class="vrot" x="${ml-10}" y="${yy+4}" text-anchor="end">${brlCurto(max*f)}</text>`; });
  if(hist.length>1) corpo+=`<line x1="${ml}" y1="${y(media)}" x2="${W-mr}" y2="${y(media)}"
     stroke="var(--txt-3)" stroke-width="2" stroke-dasharray="5 5"></line>
     <text class="vrotv" x="${W-mr+6}" y="${y(media)+4}" text-anchor="start">média</text>`;
  barras.forEach((b,i)=>{
    const x=ml+larg*i+(larg-bw)/2, alt=Math.max((H-mt-mb)*(b.v/max),b.v>0?3:0);
    const yy=H-mb-alt;
    const antes=i>0?barras[i-1].v:null;
    const dif=antes===null?null:b.v-antes;
    corpo+=`<rect class="barra-m" x="${x}" y="${yy}" width="${bw}" height="${alt}" rx="4"
       fill="var(--s1)" ${b.parcial?'fill-opacity=".45" stroke="var(--s1)" stroke-width="2" stroke-dasharray="4 3"':''}
       tabindex="0" data-tip="<b>${b.rot} ${b.sub==='agora'?'(parcial)':''}</b><br>${brl(b.v)}${dif===null?'':'<br>'+(dif>0?'▲ +':'▼ −')+brl(Math.abs(dif))+' vs. anterior'}"></rect>
     <text class="vrot" x="${x+bw/2}" y="${H-mb+16}" text-anchor="middle">${b.rot}</text>
     <text class="vrot" x="${x+bw/2}" y="${H-mb+29}" text-anchor="middle" opacity=".7">${b.sub}</text>`;
  });
  fig.innerHTML=cabeca+rolagem(svg(W,H)+corpo+'</svg>')+
    `<div class="viz-leg"><span><i style="background:var(--s1)"></i>Fatura fechada</span>
     <span><i style="background:var(--s1);opacity:.45"></i>Ciclo aberto (parcial)</span>
     ${hist.length>1?'<span><i style="background:var(--txt-3)"></i>Média das fechadas</span>':''}</div>
     <div class="viz-tip"></div>`+
    tabela(['Mês','Meu gasto'],barras.map(b=>[b.rot+' '+b.sub,brl(b.v)]));
  ligarTip(fig);
}

/* ---------- 3. gasto contra o teto ---------- */
function grafTetos(c){
  const fig=$('#figTeto');
  const cabeca=`<figcaption><div class="viz-tit">Quanto de cada teto já foi</div>
    <div class="viz-sub">A trilha é o teto do mês; a barra é o que você já gastou. Vermelho é o que passou.</div></figcaption>`;
  const its=Object.entries(CATS).map(([k,cat])=>({k,nome:cat.n,g:c.porCat[k]||0,t:c.tetos[k]||0}))
    .filter(x=>x.g>0||x.t>0).sort((a,b)=>(b.g/(b.t||1))-(a.g/(a.t||1)));
  if(!its.length||!c.renda){ fig.innerHTML=cabeca+
    '<div class="viz-vazio">Preencha a renda e a meta na aba Renda pra o site calcular os tetos.</div>'; return; }
  const W=680,lh=34,mt=10,ml=150,mr=96,H=mt+its.length*lh+6;
  const base=Math.max(...its.map(x=>Math.max(x.g,x.t)),1);
  let corpo='';
  its.forEach((x,i)=>{
    const y=mt+i*lh, larg=W-ml-mr;
    const wt=larg*(x.t/base), wg=larg*(x.g/base);
    const passou=x.g>x.t+0.5;
    corpo+=`<text class="vcat" x="${ml-10}" y="${y+17}" text-anchor="end">${esc(x.nome.length>18?x.nome.slice(0,17)+'…':x.nome)}</text>
      <rect x="${ml}" y="${y+4}" width="${Math.max(wt,2)}" height="18" rx="4" fill="var(--fill-2)"></rect>
      <rect class="barra-m" x="${ml}" y="${y+4}" width="${Math.max(wg,x.g>0?3:0)}" height="18" rx="4"
        fill="${passou?'var(--vermelho)':'var(--s3)'}" tabindex="0"
        data-tip="<b>${esc(x.nome)}</b><br>gastou ${brl(x.g)} de ${brl(x.t)}<br>${passou?'passou '+brl(x.g-x.t):'ainda cabe '+brl(x.t-x.g)}"></rect>
      <text class="vrotv" x="${W-mr+8}" y="${y+18}" fill="${passou?'var(--vermelho)':'var(--txt-2)'}">${x.t>0?pct(x.g/x.t):'—'}</text>`;
  });
  fig.innerHTML=cabeca+rolagem(svg(W,H)+corpo+'</svg>')+
    `<div class="viz-leg"><span><i style="background:var(--s3)"></i>Dentro do teto</span>
      <span><i style="background:var(--vermelho)"></i>Passou do teto</span>
      <span><i style="background:var(--fill-2)"></i>Teto do mês</span></div><div class="viz-tip"></div>`+
    tabela(['Categoria','Gastou','Teto','% do teto'],its.map(x=>[esc(x.nome),brl(x.g),brl(x.t),x.t>0?pct(x.g/x.t):'—']));
  ligarTip(fig);
}

/* ---------- 4. o que já está comprometido lá na frente ---------- */
function grafProjecao(c){
  const fig=$('#figProj');
  const cabeca=`<figcaption><div class="viz-tit">Parcelas já compromissadas</div>
    <div class="viz-sub">Só o que é parcelado e ainda tem parcela a vencer — a sua parte, mês a mês. Isso já está gasto antes do mês começar.</div></figcaption>`;
  const parc=S.lanc.filter(l=>l.tipo==='parc'&&(+l.pRest||0)>0&&meuValor(l)>0);
  if(!parc.length){ fig.innerHTML=cabeca+
    '<div class="viz-vazio">Nenhum parcelado em aberto. Mês que vem começa limpo.</div>'; return; }
  const N=Math.min(Math.max(...parc.map(l=>+l.pRest||0)),12);
  const meses=Array.from({length:N},(_,i)=>{
    const d=new Date(hojeD().getFullYear(),hojeD().getMonth()+i+1,1);
    const v=parc.reduce((s,l)=>s+((+l.pRest||0)>i?meuValor(l):0),0);
    const qtd=parc.filter(l=>(+l.pRest||0)>i).length;
    return {rot:MES_CURTO[d.getMonth()],ano:String(d.getFullYear()).slice(2),v,qtd};
  });
  const W=680,H=220,ml=74,mr=16,mt=18,mb=40;
  const max=Math.max(...meses.map(m=>m.v),1)*1.15;
  const larg=(W-ml-mr)/meses.length, bw=Math.min(larg*0.6,46);
  const y=v=>mt+(H-mt-mb)*(1-v/max);
  let corpo='';
  [0,.5,1].forEach(f=>{const yy=y(max*f);
    corpo+=`<line class="malha" x1="${ml}" y1="${yy}" x2="${W-mr}" y2="${yy}"></line>
      <text class="vrot" x="${ml-10}" y="${yy+4}" text-anchor="end">${brlCurto(max*f)}</text>`;});
  meses.forEach((m,i)=>{
    const x=ml+larg*i+(larg-bw)/2, alt=Math.max((H-mt-mb)*(m.v/max),m.v>0?3:0);
    corpo+=`<rect class="barra-m" x="${x}" y="${H-mb-alt}" width="${bw}" height="${alt}" rx="4" fill="var(--s2)" tabindex="0"
       data-tip="<b>${m.rot}/${m.ano}</b><br>${brl(m.v)} em ${m.qtd} parcela${m.qtd===1?'':'s'}"></rect>
      <text class="vrot" x="${x+bw/2}" y="${H-mb+16}" text-anchor="middle">${m.rot}</text>
      <text class="vrot" x="${x+bw/2}" y="${H-mb+28}" text-anchor="middle" opacity=".7">${m.ano}</text>`;
  });
  const soma=meses.reduce((s,m)=>s+m.v,0);
  fig.innerHTML=cabeca+rolagem(svg(W,H)+corpo+'</svg>')+
    `<div class="nota">Ao todo <b>${brl(c.futuro)}</b> em parcelas a vencer${N<Math.max(...parc.map(l=>+l.pRest||0))?` (o gráfico mostra os próximos ${N} meses, ${brl(soma)})`:''}. É esse valor que já sai da sua renda antes de qualquer escolha.</div>
     <div class="viz-tip"></div>`+
    tabela(['Mês','Parcelas','Valor'],meses.map(m=>[m.rot+'/'+m.ano,m.qtd,brl(m.v)]));
  ligarTip(fig);
}

function renderGraficos(c){ grafDonut(c); grafEvolucao(c); grafTetos(c); grafProjecao(c); }

/* ---------- contas a vencer (recorrências com dia marcado) ---------- */
function proximoVenc(dia){
  const h=hojeD(), d=Math.min(Math.max(+dia||0,1),31);
  const noMes=(y,m)=>{const u=new Date(y,m+1,0).getDate(); return new Date(y,m,Math.min(d,u));};
  let alvo=noMes(h.getFullYear(),h.getMonth());
  if(alvo<h) alvo=noMes(h.getFullYear(),h.getMonth()+1);
  return alvo;
}
function contasAVencer(){
  return S.lanc.filter(l=>+l.venc>0&&meuValor(l)>0)
    .map(l=>{const d=proximoVenc(l.venc);
      return {l,data:d,dias:Math.round((d-hojeD())/86400000)};})
    .sort((a,b)=>a.dias-b.dias);
}
function renderVenc(){
  const el=$('#blocoVenc'); const cs=contasAVencer();
  if(!cs.length){ el.innerHTML=''; return; }
  const total=cs.reduce((s,x)=>s+meuValor(x.l),0);
  el.innerHTML=`<h3>Contas a vencer · ${brl(total)}</h3>
   <p class="ajuda">Lançamentos com dia de vencimento marcado. Ligue o alerta “Conta fixa a vencer” pra ser avisado alguns dias antes.</p>`+
   cs.map(x=>`<div class="venc${x.dias<=3?' perto':''}">
     <div class="dia"><b>${x.data.getDate()}</b><span>${MES_CURTO[x.data.getMonth()]}</span></div>
     <div class="vn">${esc(x.l.nome)}<small>${x.dias===0?'vence hoje':x.dias===1?'vence amanhã':'em '+x.dias+' dias'} · ${esc(x.l.fonte||'Conta')}</small></div>
     <div class="vv">${brl(meuValor(x.l))}</div></div>`).join('');
}

/* ---------- exportar CSV ---------- */
function exportarCSV(){
  const cab=['descricao','categoria','peso','tipo','valor_fatura','pago_por_outro','meu_valor','fonte','parcelas_restantes','vence_dia'];
  const lin=S.lanc.map(l=>[l.nome,CATS[l.cat]?CATS[l.cat].n:l.cat,TIER[l.tier].n,l.tipo,
    l.valor,+l.pai||0,meuValor(l),l.fonte||'Conta',+l.pRest||0,+l.venc||0]);
  const hist=S.hist.flatMap(x=>(x.itens||[]).map(l=>['[fatura '+dataBR(x.data)+'] '+l.nome,
    CATS[l.cat]?CATS[l.cat].n:l.cat,TIER[l.tier]?TIER[l.tier].n:l.tier,l.tipo,l.valor,+l.pai||0,
    Math.max(l.valor-(+l.pai||0),0),l.fonte||'Conta',+l.pRest||0,+l.venc||0]));
  const cel=v=>typeof v==='number'?String(v).replace('.',','):'"'+String(v).replace(/"/g,'""')+'"';
  const csv='﻿'+[cab.join(';'),...lin.concat(hist).map(l=>l.map(cel).join(';'))].join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='sobra-do-mes-'+iso(hojeD())+'.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  $('#status').textContent='CSV exportado com '+(lin.length+hist.length)+' linhas.';
}

/* ==========================================================================
   Alertas por notificação
   Tudo roda no aparelho: nenhum dado sai daqui, não há servidor de push.
   O service worker entrega o aviso como notificação do sistema.
   ========================================================================== */
let swReg=null, podeNotificar=('Notification' in window);

function permissao(){ return podeNotificar?Notification.permission:'indisponivel'; }
function cicloAtual(){ return S.ultimoFech||iso(ultimoFechPassado()); }
function jaAvisou(tag){ return S.notifLog&&S.notifLog[tag]===cicloAtual(); }
function marcarAviso(tag){ S.notifLog=S.notifLog||{}; S.notifLog[tag]=cicloAtual(); }

async function enviarNotificacao({titulo,corpo,tag,aba}){
  if(permissao()!=='granted') return false;
  const dados={tipo:'notificar',titulo,corpo,tag:tag||'sobra',aba:aba||''};
  try{
    if(!swReg) swReg=await navigator.serviceWorker.getRegistration();
    if(swReg&&swReg.active){ swReg.active.postMessage(dados); return true; }
    if(swReg&&swReg.showNotification){
      await swReg.showNotification(titulo,{body:corpo,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:dados.tag});
      return true;
    }
    new Notification(titulo,{body:corpo,icon:'/icons/icon-192.png',tag:dados.tag});
    return true;
  }catch(e){ return false; }
}

/* Monta a lista do que está pendente agora. Cada item tem uma chave estável
   por ciclo, pra o mesmo aviso não cair todo dia. */
function alertasPendentes(c){
  const fora=[], on=k=>S.alertas&&S.alertas[k];
  const h=hojeD(), ck=cicloAtual();
  const lim=Math.min(Math.max(+S.aTetoPct||85,50),100)/100;

  if(on('teto')&&c.renda>0){
    Object.entries(CATS).forEach(([k,cat])=>{
      const g=c.porCat[k]||0, t=c.tetos[k]||0;
      if(t<=0||g<t*lim) return;
      const passou=g>t;
      fora.push({tag:'teto:'+k+':'+ck, icone:passou?'🔴':'🚦', ico:'atencao', aba:'plano:tetos',
        titulo:passou?`${cat.n}: passou do teto`:`${cat.n}: ${pct(g/t)} do teto`,
        corpo:passou?`Você já gastou ${brl(g)} de um teto de ${brl(t)}. São ${brl(g-t)} a mais do que cabia.`
                    :`${brl(g)} de ${brl(t)}. Ainda cabem ${brl(t-g)} até o fim do ciclo.`,
        peso:passou?3:2});
    });
  }
  if(on('gasto')&&c.renda>0&&c.gasto>c.disponivel&&c.disponivel>0){
    fora.push({tag:'gasto:'+ck, icone:'🔥', ico:'fogo', aba:'analise:cortes',
      titulo:'Você está gastando mais do que dá',
      corpo:`O ciclo já soma ${brl(c.gasto)} e o disponível depois de guardar é ${brl(c.disponivel)}. Faltam cortar ${brl(c.gasto-c.disponivel)}.`,
      peso:3});
  }
  if(on('meta')&&c.renda>0&&c.meta>0&&c.sobra<c.meta){
    fora.push({tag:'meta:'+ck, icone:'🎯', ico:'alvo', aba:'plano:renda',
      titulo:'A meta de guardar está em risco',
      corpo:`A sobra prevista é ${brl(c.sobra)} e sua meta é ${brl(c.meta)}. Faltam ${brl(c.meta-c.sobra)}.`,
      peso:2});
  }
  if(on('fechamento')){
    const prox=proximoFech(), d=Math.round((prox-h)/86400000);
    if(d<=(+S.aDiasFech||3)){
      fora.push({tag:'fech:'+iso(prox), icone:'📅', ico:'calendario', aba:'hoje',
        titulo:d===0?'A fatura fecha hoje':`A fatura fecha em ${d} dia${d===1?'':'s'}`,
        corpo:`Estão na fatura ${brl(c.bruto)} (${brl(c.gasto)} seus). Confira os variáveis antes de virar o ciclo.`,
        peso:2});
    }
  }
  if(on('vencimento')){
    const dv=+S.diaVenc||+S.diaFech||5, pv=proximoVenc(dv), d=Math.round((pv-h)/86400000);
    if(d<=(+S.aDiasVenc||2)){
      fora.push({tag:'venc:'+iso(pv), icone:'💳', ico:'cartao', aba:'plano:renda',
        titulo:d===0?'A fatura vence hoje':`A fatura vence em ${d} dia${d===1?'':'s'}`,
        corpo:`Pague antes de ${dataBR(iso(pv))} pra não entrar no rotativo — é o juro mais caro que existe.`,
        peso:3});
    }
  }
  if(on('contas')){
    contasAVencer().filter(x=>x.dias<=(+S.aDiasVenc||2)).forEach(x=>{
      fora.push({tag:'conta:'+x.l.id+':'+iso(x.data), icone:'🧾', ico:'nota', aba:'hoje',
        titulo:x.dias===0?`${x.l.nome} vence hoje`:`${x.l.nome} vence em ${x.dias} dia${x.dias===1?'':'s'}`,
        corpo:`${brl(meuValor(x.l))} · ${x.l.fonte||'Conta'} · vencimento ${x.data.getDate()}/${String(x.data.getMonth()+1).padStart(2,'0')}.`,
        peso:2});
    });
  }
  if(on('variavel')){
    const zerados=S.lanc.filter(l=>l.tipo==='var'&&!(l.valor>0)&&(+l.ref||0)>0);
    if(zerados.length){
      fora.push({tag:'var:'+ck, icone:'✏️', ico:'lapis', aba:'hoje',
        titulo:`${zerados.length} gasto${zerados.length===1?'':'s'} variáve${zerados.length===1?'l':'is'} sem valor`,
        corpo:`${zerados.slice(0,3).map(l=>l.nome).join(', ')}${zerados.length>3?' e outros':''} estão zerados desde a virada. Preencha pra a conta do mês fechar certa.`,
        peso:1});
    }
  }
  if(on('parcela')){
    S.lanc.filter(l=>l.tipo==='parc'&&+l.pRest===1).forEach(l=>{
      fora.push({tag:'ult:'+l.id+':'+ck, icone:'🎉', ico:'festa', aba:'hoje',
        titulo:`Última parcela de ${l.nome}`,
        corpo:`Depois desta, ${brl(meuValor(l))} por mês voltam pro seu bolso. Já pensou em mandar isso pra reserva?`,
        peso:1});
    });
  }
  return fora.sort((a,b)=>b.peso-a.peso);
}

async function checarAlertas(forcar){
  const c=calc(), lista=alertasPendentes(c);
  if(permissao()!=='granted') return {lista,enviados:0};
  let n=0;
  for(const a of lista){
    if(!forcar&&jaAvisou(a.tag)) continue;
    const ok=await enviarNotificacao({titulo:a.icone+' '+a.titulo,corpo:a.corpo,tag:a.tag,aba:a.aba});
    if(ok){ marcarAviso(a.tag); n++; }
    if(n>=3) break;             // no máximo 3 de uma vez, pra não virar spam
  }
  if(n){ salvar(); renderAlertas(c); }
  return {lista,enviados:n};
}

function renderAlertas(c){
  if(!$('#listaAlertas')) return;
  S.alertas=S.alertas||{}; S.notifLog=S.notifLog||{};
  const p=permissao();
  const est=$('#notifEstado');
  const dentroApp=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
  if(p==='indisponivel'){
    est.innerHTML='<div class="aviso-card ruim"><span>⚠️</span><div>Este navegador não tem notificações. No iPhone elas só funcionam se você <b>adicionar o site à Tela de Início</b> pelo Safari (Compartilhar → Adicionar à Tela de Início) e abrir por lá.</div></div>';
  }else if(p==='granted'){
    est.innerHTML=`<div class="aviso-card ok"><span>🔔</span><div><b>Notificações ligadas.</b> ${dentroApp?'O app está instalado — os avisos chegam como notificação do sistema.':'Instale na tela inicial pra os avisos chegarem mesmo com o navegador fechado.'} A checagem acontece quando você abre o app e a cada 30 minutos com ele aberto.</div></div>`;
  }else if(p==='denied'){
    est.innerHTML='<div class="aviso-card ruim"><span>🔕</span><div><b>Você bloqueou as notificações deste site.</b> Pra liberar: toque no cadeado ao lado do endereço → Notificações → Permitir. Depois volte aqui.</div></div>';
  }else{
    est.innerHTML='<div class="aviso-card"><span>🔔</span><div><b>As notificações estão desligadas.</b> Toque em “Ligar as notificações” — o navegador vai pedir sua permissão uma única vez.</div></div>';
  }
  $('#btnPermitir').disabled=(p==='granted'||p==='indisponivel'||p==='denied');
  $('#btnPermitir').textContent=p==='granted'?'Notificações ligadas ✓':'Ligar as notificações';

  $('#listaAlertas').innerHTML=Object.entries(ALERTAS_PADRAO).map(([k,a])=>`
    <div class="alerta-linha">
      <div class="ai">${icone(a.icone,19)}</div>
      <div class="at"><div class="an">${a.nome}</div><div class="ad">${a.desc}</div></div>
      <button class="sw" role="switch" data-al="${k}" aria-checked="${S.alertas[k]?'true':'false'}" aria-label="${a.nome}"></button>
    </div>`).join('');
  $('#listaAlertas').querySelectorAll('[data-al]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.al; S.alertas[k]=!S.alertas[k];
    b.setAttribute('aria-checked',S.alertas[k]?'true':'false');
    salvar(); renderAlertas(calc());
  });

  const lista=alertasPendentes(c||calc());
  $('#pendentes').innerHTML=lista.length
    ? lista.map(a=>`<div class="alerta-linha"><div class="ai">${icone(a.ico||'atencao',19)}</div>
        <div class="at"><div class="an">${esc(a.titulo)}</div><div class="ad">${esc(a.corpo)}</div>
        <div style="margin-top:6px"><span class="chip ${jaAvisou(a.tag)?'':'on'}">${jaAvisou(a.tag)?'já avisado neste ciclo':'ainda não avisado'}</span></div></div></div>`).join('')
    : '<p class="vazio">Nada fora do lugar agora. Quando algo escapar do plano, aparece aqui e vira notificação.</p>';
}

/* ==========================================================================
   PWA: service worker, instalação e checagem periódica
   ========================================================================== */
let eventoInstalar=null;
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',async()=>{
    try{
      swReg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      DIAG.sw='funciona';
      // Versão nova já esperando de uma visita anterior
      if(swReg.waiting && navigator.serviceWorker.controller) mostrarAtualizacao(swReg);
      swReg.addEventListener('updatefound',()=>{
        const novo=swReg.installing;
        if(novo) novo.addEventListener('statechange',()=>{
          if(novo.state==='installed'&&navigator.serviceWorker.controller) mostrarAtualizacao(swReg);
        });
      });
      // Procura versão nova ao abrir, ao voltar pro app e de hora em hora
      const procurar=()=>{ swReg.update().catch(()=>{}); };
      procurar();
      setInterval(procurar,60*60*1000);
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible') procurar();
      });
    }catch(e){ DIAG.sw='indisponível'; }
  });
  navigator.serviceWorker.addEventListener('message',e=>{
    const d=e.data||{};
    if(d.tipo==='checar-alertas'){ checarAlertas(false); checarAgenda(false); }
    if(d.tipo==='abrir-aba'&&d.aba) irPara(d.aba);
  });
}
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); eventoInstalar=e;
  if(!localStorage.getItem('sobra:instalar-nao')) $('#instalar').classList.add('mostra');
});
window.addEventListener('appinstalled',()=>{ $('#instalar').classList.remove('mostra'); eventoInstalar=null; });

/* ==========================================================================
   Eventos da v2
   ========================================================================== */
$('#btnInstalar').onclick=async()=>{
  if(!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar=null; $('#instalar').classList.remove('mostra');
};
$('#btnInstalarNao').onclick=()=>{
  $('#instalar').classList.remove('mostra');
  try{ localStorage.setItem('sobra:instalar-nao','1'); }catch(e){}
};
$('#btnPermitir').onclick=async()=>{
  if(!podeNotificar) return;
  try{
    const r=await Notification.requestPermission();
    renderAlertas(calc());
    if(r==='granted'){
      await enviarNotificacao({titulo:'🔔 Alertas ligados',
        corpo:'A partir de agora eu te aviso quando o gasto fugir do plano.',tag:'boas-vindas'});
      if(swReg&&'periodicSync' in swReg){
        try{ await swReg.periodicSync.register('checar-alertas',{minInterval:12*60*60*1000}); }catch(e){}
      }
      checarAlertas(false); renderAgenda();
      setTimeout(()=>checarAgenda(false),1200);
    }
  }catch(e){}
};
$('#btnTestar').onclick=async()=>{
  if(permissao()!=='granted'){ $('#notifEstado').scrollIntoView({behavior:'smooth'}); return; }
  const c=calc();
  const ok=await enviarNotificacao({titulo:'🔥 Exemplo de alerta',
    corpo:`Assim chega o aviso: “Comida fora já consumiu 92% do teto — ${brl(c.tetos.comida||180)} do mês.”`,
    tag:'teste-'+Date.now(),aba:'plano:tetos'});
  $('#status').textContent=ok?'Notificação de teste enviada.':'Não consegui enviar — confira a permissão.';
};
$('#btnChecarAgora').onclick=async()=>{
  const r=await checarAlertas(true);
  $('#status').textContent=permissao()!=='granted'
    ? 'Ligue as notificações primeiro.'
    : (r.enviados?r.enviados+' alerta(s) enviado(s).':'Nada pendente pra avisar agora.');
  renderAlertas(calc());
};
['aTetoPct','aDiasFech','aDiasVenc'].forEach(id=>$('#'+id).addEventListener('input',e=>{
  S[id]=+e.target.value||0; salvar(); renderAlertas(calc());
}));
$('#btnCSV').onclick=exportarCSV;

/* checagem periódica com o app aberto + ao voltar pra ele */
setInterval(()=>checarAlertas(false),30*60*1000);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!Auth.logado()) return;
  rodarCiclos(); render(); checarAlertas(false); checarAgenda(false); puxarDaNuvem();
});

/* ==========================================================================
   v3 — navegação por área, lançamento em um campo, feedback e insights
   ========================================================================== */
const AREAS={
  hoje:    {titulo:'Hoje',        subs:[]},
  plano:   {titulo:'Planejamento',subs:['renda','tetos','objetivos']},
  analise: {titulo:'Análises',    subs:['graficos','cortes','hist']},
  ajustes: {titulo:'Ajustes',     subs:['alertas','conta','extrato','dados']}
};
let AREA='hoje';
const SUB={plano:'renda',analise:'graficos',ajustes:'alertas'};

function irPara(destino){
  const [area,sub]=String(destino).split(':');
  if(!AREAS[area]) return;
  AREA=area;
  if(sub&&AREAS[area].subs.includes(sub)) SUB[area]=sub;
  Object.keys(AREAS).forEach(a=>{ const el=$('#a-'+a); if(el) el.hidden=(a!==area); });
  document.querySelectorAll('.tb').forEach(b=>b.setAttribute('aria-selected',b.dataset.a===area));
  const el=$('#a-'+area);
  if(el) el.querySelectorAll('.subnav .sub').forEach(b=>{
    const alvo=(b.dataset.s===SUB[area]);
    b.setAttribute('aria-selected',alvo);
    const sec=$('#t-'+b.dataset.s); if(sec) sec.hidden=!alvo;
  });
  $('#tituloArea').textContent=AREAS[area].titulo;
  if(area==='analise'&&SUB.analise==='graficos') renderGraficos(calc());
  if(area==='ajustes') renderAlertas(calc());
  try{ history.replaceState(null,'','?ir='+area+(AREAS[area].subs.length?':'+SUB[area]:'')); }catch(e){}
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- feedback: toast, vibração, snackbar de desfazer ---------- */
let toastT=null;
function toast(msg,ruim){
  const t=$('#toast');
  t.innerHTML=(ruim?'⚠️ ':'✓ ')+esc(msg);
  t.className='toast abre'+(ruim?' ruim':'');
  clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast'+(ruim?' ruim':''),2400);
}
function vibrar(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||12); }catch(e){} }
let snackT=null, desfazer=null;
function snack(msg,rotulo,acao){
  const s=$('#snack');
  s.innerHTML=`<span>${esc(msg)}</span><button type="button">${esc(rotulo)}</button>`;
  s.querySelector('button').onclick=()=>{ acao(); fechaSnack(); };
  s.classList.add('abre');
  document.body.classList.add('com-snack');
  clearTimeout(snackT); snackT=setTimeout(fechaSnack,5200);
}
function fechaSnack(){
  $('#snack').classList.remove('abre');
  document.body.classList.remove('com-snack');
  clearTimeout(snackT);
}

/* ---------- contador animado ---------- */
const RED=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animarValor(el,alvo,ms){
  const de=+el.dataset.v||0;
  el.dataset.v=alvo;
  if(RED||Math.abs(alvo-de)<0.5){ el.textContent=brl(alvo); return; }
  const t0=performance.now(), dur=ms||520;
  const passo=t=>{
    const p=Math.min((t-t0)/dur,1), e=1-Math.pow(1-p,3);
    el.textContent=brl(de+(alvo-de)*e);
    if(p<1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/* ---------- painel: quanto posso gastar hoje ---------- */
function diasRestantes(){
  return Math.max(Math.round((proximoFech()-hojeD())/86400000),0);
}
function podeGastarHoje(c){
  const dias=Math.max(diasRestantes(),1);
  // o que ainda cabe: disponível do mês menos o que já foi gasto, dividido pelos dias que faltam.
  // gastos fixos e parcelas já lançados contam como pagos — o que sobra é o dia a dia.
  return {porDia:(c.disponivel-c.gasto)/dias, dias, folga:c.disponivel-c.gasto};
}
function renderHero(c){
  const {porDia,dias,folga}=podeGastarHoje(c);
  const v=$('#hoje-valor');
  if(!c.renda){
    v.textContent='Vamos começar'; v.className='hero-v num zero peq';
    $('#hoje-sub').innerHTML='Diga quanto você ganha e quanto quer guardar — em 30 segundos o app calcula o resto.'+
      ' <button class="link" data-ir="plano:renda">Começar</button>';
  }else{
    animarValor(v,Math.max(porDia,0));
    v.className='hero-v num'+(porDia<0?' neg':'');
    $('#hoje-sub').innerHTML= porDia<0
      ? `Você já passou <b>${brl(-folga)}</b> do que tinha pra este ciclo. Cada gasto novo sai da sua meta de guardar.`
      : `É o que cabe por dia nos <b>${dias} dia${dias===1?'':'s'}</b> que faltam até a fatura fechar, já descontando o que você quer guardar.`;
  }
  document.querySelector('.hero-mini').hidden=!c.renda;
  document.querySelector('.hero-pista').hidden=!c.renda;
  const ant=ultimoFechPassado(), total=Math.max(Math.round((proximoFech()-ant)/86400000),1);
  $('#hoje-pista').style.width=Math.round((total-dias)/total*100)+'%';
  $('#hoje-sobra').textContent=brl(c.sobra);
  $('#hoje-sobra').style.color=c.sobra<0?'var(--vermelho)':'';
  $('#hoje-meta').textContent=brl(c.meta);
  $('#hoje-dias').textContent=dias+(dias===1?' dia':' dias');
}

/* ---------- barra por categoria no topo de Hoje ---------- */
function renderTopCats(c){
  const its=Object.entries(c.porCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,4);
  if(!its.length){ $('#topCats').innerHTML=''; return; }
  $('#topCats').innerHTML='<div style="margin-top:14px">'+its.map(([k,v])=>{
    const t=c.tetos[k]||0, p=t>0?Math.min(v/t*100,100):0, passou=v>t+0.5;
    return `<div style="padding:9px 0">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
        <span style="font-size:14.5px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          <span class="pt" style="background:${CATS[k].c}"></span>${CATS[k].n}</span>
        <span class="num" style="font-size:13px;color:${passou?'var(--vermelho)':'var(--txt-2)'};font-weight:600;white-space:nowrap">
          ${brl(v)}${t>0?' <span style="color:var(--txt-3);font-weight:500">/ '+brl(t)+'</span>':''}</span></div>
      <div class="trilho" style="margin-top:7px"><i style="width:${p}%;background:${passou?'var(--vermelho)':CATS[k].c}"></i></div>
    </div>`;}).join('')+'</div>';
}

/* ---------- últimos lançamentos ---------- */
const EMOJI={casa:'🏠',mercado:'🛒',transporte:'⛽',comida:'🍔',assinatura:'📺',
  lazer:'🎬',saude:'💊',estudo:'📚',divida:'💳',outros:'📦'};
function renderUltimos(c){
  const el=$('#ultimos');
  if(!S.lanc.length){
    const temRenda=(+S.salario||0)+(+S.extra||0)>0;
    el.innerHTML=`<div class="bloco vazio-b">
      <div class="em">${icone(temRenda?'nota':'raio',32)}</div>
      <div class="ti">${temRenda?'Agora os gastos fixos':'Dois passos e pronto'}</div>
      <div class="de">${temRenda
        ? 'Aluguel, internet, energia, academia. São os que não mudam — e é com eles que o app descobre quanto sobra de verdade no seu mês.'
        : 'Primeiro sua renda e quanto quer guardar. Depois os gastos fixos. A partir daí o app calcula os tetos, avisa quando você está gastando demais e fecha a fatura sozinho.'}</div>
      <div class="passos">
        <div class="passo ${temRenda?'feito':''}"><b>1</b><span>Renda e meta</span>
          ${temRenda?'<i>✓</i>':'<button class="btn sec" data-ir="plano:renda">Preencher</button>'}</div>
        <div class="passo"><b>2</b><span>Gastos fixos</span>
          <button class="btn ${temRenda?'':'sec'}" data-abrir-folha="1">Adicionar</button></div>
      </div>
      <p class="ajuda" style="margin:14px auto 0;max-width:34ch;font-size:13px">
        Dica: no campo de gasto basta escrever <b>aluguel 1350</b> — o app entende sozinho a categoria.</p>
    </div>`;
    return;
  }
  const its=[...S.lanc].sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)||b.valor-a.valor).slice(0,6);
  const selo=l=>(l.tipo==='fixo')?'fixo':l.tipo==='var'?'variável':l.tipo==='parc'?`faltam ${l.pRest||0}x`:'1x';
  el.innerHTML=its.map(l=>`<div class="item">
    <div class="ic" style="background:color-mix(in srgb,${CATS[l.cat].c} 13%,transparent);color:${CATS[l.cat].c}"
      >${icone(ICONE_CAT[l.cat]||'outros')}</div>
    <div class="tx"><div class="nm">${esc(l.nome)}</div>
      <div class="dt">${CATS[l.cat].n} · ${selo(l)}${l.fonte&&l.fonte!=='Conta'?' · '+esc(l.fonte):''}</div></div>
    <div class="vl">${brl(l.valor)}${(+l.pai>0)?`<small>meu ${brl(meuValor(l))}</small>`:''}</div>
    <button class="rm" data-del="${l.id}" aria-label="Remover ${esc(l.nome)}">×</button>
  </div>`).join('');
  if(S.lanc.length>6) el.innerHTML+=`<p class="ajuda" style="margin:12px 0 0;text-align:center">
    e mais ${S.lanc.length-6} no ciclo</p>`;
}

/* ---------- insights: o app falando como consultor ---------- */
function mediaHist(chave){
  const h=S.hist.slice(0,3); if(!h.length) return null;
  return h.reduce((s,x)=>s+(chave?(x.porCat&&x.porCat[chave]||0):x.meu),0)/h.length;
}
function montarInsights(c){
  const out=[], dias=diasRestantes();
  const {porDia,folga}=podeGastarHoje(c);
  const decorridos=Math.max(Math.round((hojeD()-ultimoFechPassado())/86400000),1);

  if(!c.renda) return out;   // o cartão de onboarding já diz o que fazer
  // ritmo do ciclo — só o que é variável se projeta; fixo e parcela já valem o mês inteiro
  if(S.lanc.length&&decorridos>=7&&dias>0){
    const variavel=S.lanc.filter(l=>l.tipo==='var'||l.tipo==='unico').reduce((s,l)=>s+meuValor(l),0);
    const jaFechado=c.gasto-variavel;
    const projetado=jaFechado+variavel/decorridos*(decorridos+dias);
    if(projetado>c.disponivel*1.05)
      out.push({t:'ruim',e:'subindo',txt:`No ritmo dos variáveis, o ciclo fecha em <b>${brl(projetado)}</b> — ${brl(projetado-c.disponivel)} acima do que cabe. Segurar <b>${brl((projetado-c.disponivel)/dias)}</b> por dia já resolve.`});
    else if(projetado<c.disponivel*0.9)
      out.push({t:'bom',e:'raio',txt:`No ritmo de agora o ciclo fecha em <b>${brl(projetado)}</b> e sobram <b>${brl(c.disponivel-projetado)}</b> além da meta.`});
  }
  // categoria que mais subiu contra a média
  Object.keys(CATS).forEach(k=>{
    const m=mediaHist(k), hoje=c.porCat[k]||0;
    if(m&&m>50&&hoje>m*1.18)
      out.push({t:'atencao',e:'atencao',txt:`<b>${CATS[k].n}</b> está ${pct(hoje/m-1)} acima da sua média dos últimos meses — ${brl(hoje)} contra ${brl(m)}.`});
    if(m&&m>50&&hoje<m*0.8&&hoje>0)
      out.push({t:'bom',e:'descendo',txt:`<b>${CATS[k].n}</b> caiu ${pct(1-hoje/m)} em relação à sua média: ${brl(m-hoje)} a menos este mês.`});
  });
  // o maior cortável
  const corta=S.lanc.filter(l=>l.tier===3&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a))[0];
  if(corta&&c.sobra<c.meta)
    out.push({t:'atencao',e:'tesoura',txt:`Zerar <b>${esc(corta.nome)}</b> devolve ${brl(meuValor(corta))} por mês — ${brl(meuValor(corta)*12)} no ano.`});
  // fatura chegando
  if(dias<=5)
    out.push({t:'atencao',e:'calendario',txt:`A fatura fecha em <b>${dias} dia${dias===1?'':'s'}</b> com ${brl(c.bruto)}. Confira os variáveis antes que o ciclo vire.`});
  // variáveis zerados
  const zerados=S.lanc.filter(l=>l.tipo==='var'&&!(l.valor>0)&&(+l.ref||0)>0);
  if(zerados.length)
    out.push({t:'atencao',e:'lapis',txt:`${zerados.length} gasto${zerados.length===1?'':'s'} variáve${zerados.length===1?'l':'is'} sem valor (${zerados.slice(0,2).map(l=>esc(l.nome)).join(', ')}). Sem eles a conta do mês sai errada.`});
  // parabéns
  if(c.sobra>=c.meta&&c.meta>0&&S.lanc.length)
    out.push({t:'bom',e:'alvo',txt:`Você está batendo a meta e ainda sobram <b>${brl(c.sobra-c.meta)}</b> livres.`});
  if(porDia>0&&S.lanc.length&&dias>0)
    out.push({t:'bom',e:'certo',txt:`Sobram <b>${brl(folga)}</b> pro resto do ciclo: dá <b>${brl(porDia)}</b> por dia sem mexer no que você quer guardar.`});
  return out.slice(0,3);
}
function renderInsights(c){
  const el=$('#insights'); if(!el) return;
  el.innerHTML=montarInsights(c).map(i=>
    `<div class="insight ${i.t}"><div class="ie">${icone(i.e,19)}</div>
     <div class="it2">${i.txt}</div></div>`).join('');
}

/* ==========================================================================
   Lançamento em um campo só
   Reaproveita classificar() e as REGRAS da importação de extrato.
   ========================================================================== */
function lerRapido(txt){
  const bruto=String(txt||'').trim();
  if(!bruto) return null;
  // valor: último número da frase, aceita 1.234,56 / 1234.56 / 45
  const m=bruto.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2}|\d+\.\d{1,2}(?!\d)|\d+)\s*$/i);
  let ini=null;
  if(!m){
    ini=bruto.match(/^(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2}|\d+\.\d{1,2}(?!\d)|\d+)\s+(.+)$/i);
    if(!ini) return {nome:bruto,valor:0,incompleto:true};
  }
  let n=m?m[1]:ini[1];
  if(/,/.test(n)) n=n.replace(/\./g,'').replace(',','.');
  const valor=parseFloat(n);
  const nome=(m?bruto.slice(0,m.index):ini[2]).replace(/[-–—:]\s*$/,'').replace(/\s+/g,' ').trim();
  if(!nome||!(valor>0)) return {nome:nome||bruto,valor:valor||0,incompleto:true};
  const [cat,tier]=classificar(nome);
  // aprende com o histórico: se já existe um gasto com esse nome, herda tudo dele
  const igual=[...S.lanc,...S.hist.flatMap(h=>h.itens||[])]
    .find(l=>l.nome&&l.nome.toLowerCase()===nome.toLowerCase());
  return {
    nome:nome.charAt(0).toUpperCase()+nome.slice(1),
    valor,
    cat: igual?igual.cat:cat,
    tier: igual?igual.tier:tier,
    tipo: igual?igual.tipo:(cat==='casa'||cat==='assinatura'?'fixo':'var'),
    fonte: igual?(igual.fonte||'Conta'):'Conta',
    herdado: !!igual
  };
}
function renderEco(){
  const el=$('#rapidoEco'), p=lerRapido($('#rapido').value);
  if(!p){ el.innerHTML='<span class="aviso">Escreva o gasto e o valor. Ex.: <b>mercado 820</b></span>'; return; }
  if(p.incompleto){ el.innerHTML='<span class="aviso">Falta o valor no fim. Ex.: <b>'+esc(p.nome)+' 45</b></span>'; return; }
  el.innerHTML=`<span class="pt" style="background:${CATS[p.cat].c}"></span>
    <span><b>${esc(p.nome)}</b> · ${brl(p.valor)} · ${CATS[p.cat].n} · ${TIER[p.tier].n}</span>
    ${p.herdado?'<span class="aviso">(como da última vez)</span>':''}`;
}
function salvarRapido(){
  const p=lerRapido($('#rapido').value);
  if(!p||p.incompleto){ toast('Escreva a descrição e o valor. Ex.: ifood 45',true); $('#rapido').focus(); return; }
  const l={id:Date.now()+Math.random(),criadoEm:Date.now(),nome:p.nome,valor:p.valor,cat:p.cat,
    tier:p.tier,tipo:p.tipo,fonte:p.fonte,pRest:0,pai:0,ref:0,venc:0};
  S.lanc.push(l);
  $('#rapido').value=''; renderEco();
  render(); salvar(); vibrar(14);
  toast(p.nome+' · '+brl(p.valor));
  snack('Lançamento adicionado.','Desfazer',()=>{
    S.lanc=S.lanc.filter(x=>x.id!==l.id); render(); salvar(); toast('Desfeito');
  });
  $('#rapido').focus();
}

/* ---------- chips: o que você mais lança ---------- */
function renderChips(){
  const el=$('#chips'); if(!el) return;
  const conta={};
  const registra=(nome,cat,peso)=>{ if(!nome) return;
    const k=nome.toLowerCase();
    conta[k]=conta[k]||{nome,cat,n:0,ult:0};
    conta[k].n+=peso; };
  S.lanc.forEach(l=>registra(l.nome,l.cat,3));
  S.hist.slice(0,4).forEach(h=>(h.itens||[]).forEach(l=>registra(l.nome,l.cat,1)));
  let its=Object.values(conta).sort((a,b)=>b.n-a.n).slice(0,6);
  if(its.length<3){
    const base=[['Mercado','mercado'],['Combustível','transporte'],['iFood','comida'],
                ['Farmácia','saude'],['Uber','transporte'],['Padaria','comida']];
    base.forEach(([nome,cat])=>{ if(its.length<6&&!its.some(x=>x.nome.toLowerCase()===nome.toLowerCase()))
      its.push({nome,cat,n:0}); });
  }
  el.innerHTML=its.map(x=>`<button type="button" class="chip-s" data-chip="${esc(x.nome)}">
    <i style="background:${CATS[x.cat]?CATS[x.cat].c:'var(--cout)'}"></i>${esc(x.nome)}</button>`).join('');
  el.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{
    const inp=$('#rapido');
    inp.value=b.dataset.chip+' ';
    inp.focus();
    try{ inp.setSelectionRange(inp.value.length,inp.value.length); }catch(e){}
    renderEco(); vibrar(8);
  });
}

/* ---------- folha ---------- */
let folhaAberta=false;
function abrirFolha(){
  folhaAberta=true;
  renderChips();
  $('#sheetBg').classList.add('abre');
  $('#sheet').classList.add('abre');
  $('#rapido').value=''; renderEco();
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#rapido').focus(),260);
}
function fecharFolha(){
  folhaAberta=false;
  $('#sheetBg').classList.remove('abre');
  $('#sheet').classList.remove('abre');
  $('#mais').open=false;
  document.body.style.overflow='';
}

/* ==========================================================================
   Lembretes com hora marcada
   IMPORTANTE, e está dito na tela: sem servidor de push, o navegador não
   acorda o app numa hora exata com ele fechado. O que fazemos:
     • com o app aberto, o horário dispara no minuto certo;
     • com o app fechado, o lembrete sai assim que ele for aberto de novo
       (o app sabe que o horário passou e ainda não avisou hoje);
     • em Android instalado, o periodicSync acorda o app sozinho de tempos
       em tempos e o lembrete sai perto do horário.
   ========================================================================== */
const MOMENTOS={
  manha:  {nome:'Quanto posso gastar hoje', icone:'sol',    emoji:'☀️'},
  meio:   {nome:'Como está o ritmo',        icone:'comida', emoji:'🍽️'},
  noite:  {nome:'Fechar a conta do dia',    icone:'lua',    emoji:'🌙'},
  fatura: {nome:'Só perto da fatura',       icone:'cartao', emoji:'💳'}
};
const AGENDA_PADRAO=[
  {id:'m',hora:'08:30',tipo:'manha',on:true},
  {id:'n',hora:'20:30',tipo:'noite',on:true}
];

function hhmmAgora(){ const d=new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }

/* Mensagem do momento: escolhida pelo estado real das contas, nunca genérica. */
function mensagemDoMomento(tipo,c){
  const {porDia,folga,dias}=podeGastarHoje(c);
  const dv=+S.diaVenc||+S.diaFech||5, pv=proximoVenc(dv);
  const diasV=Math.round((pv-hojeD())/86400000);
  const estourou=Object.entries(c.excesso||{}).sort((a,b)=>b[1]-a[1])[0];
  const cortavel=S.lanc.filter(l=>l.tier===3&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a))[0];

  if(!c.renda) return {titulo:'👋 Falta pouco pra começar',
    corpo:'Coloque sua renda e quanto quer guardar — aí eu passo a te dizer todo dia quanto dá pra gastar.',aba:'plano:renda'};

  if(tipo==='fatura'){
    if(diasV>7) return null;                       // fora da janela: não incomoda
    const guardar=c.bruto/Math.max(diasV,1);
    return {titulo:`💳 Fatura de ${brl(c.bruto)} em ${diasV} dia${diasV===1?'':'s'}`,
      corpo:diasV<=1?`Vence ${diasV===0?'hoje':'amanhã'}. Pagar tudo evita o rotativo, que é o juro mais caro que existe.`
        :`Separando ${brl(guardar)} por dia até lá, a fatura fica paga sem susto.`,aba:'hoje'};
  }

  if(tipo==='manha'){
    if(porDia<=0) return {titulo:'🌅 Hoje é dia de segurar',
      corpo:`O que cabia neste ciclo já acabou — está ${brl(-folga)} além. Um dia sem gasto novo já melhora o fim do mês.`,aba:'hoje'};
    if(estourou) return {titulo:`☀️ Bom dia — ${brl(porDia)} pra hoje`,
      corpo:`${CATS[estourou[0]].n} passou ${brl(estourou[1])} do teto. Se der pra evitar essa categoria hoje, o mês fecha no azul.`,aba:'hoje'};
    return {titulo:`☀️ Bom dia — ${brl(porDia)} pra hoje`,
      corpo:`É o que dá pra gastar sem mexer nos ${brl(c.meta)} que você quer guardar. Sobram ${brl(folga)} pros ${dias} dias que faltam.`,aba:'hoje'};
  }

  if(tipo==='meio'){
    if(estourou) return {titulo:`🍽️ Antes de decidir o almoço`,
      corpo:`${CATS[estourou[0]].n} já está ${brl(estourou[1])} acima do teto este mês. Comer em casa hoje devolve esse valor pro seu bolso.`,aba:'analise:cortes'};
    if(cortavel) return {titulo:`🍽️ ${brl(porDia)} ainda cabem hoje`,
      corpo:`Pra referência: ${cortavel.nome} custa ${brl(meuValor(cortavel))} por mês, ${brl(meuValor(cortavel)*12)} no ano.`,aba:'hoje'};
    return {titulo:`🍽️ ${brl(porDia)} ainda cabem hoje`,
      corpo:`Está no ritmo. Lançar os gastos na hora é o que mantém essa conta confiável.`,aba:'hoje'};
  }

  // noite
  // "gasto de hoje" é o do dia a dia — aluguel e parcela são compromisso do mês, não do dia
  const lancHoje=S.lanc.filter(l=>l.criadoEm&&l.tipo!=='fixo'&&l.tipo!=='parc'
    &&new Date(l.criadoEm).toDateString()===new Date().toDateString());
  const gastoHoje=lancHoje.reduce((s,l)=>s+meuValor(l),0);
  if(!lancHoje.length) return {titulo:'🌙 Nada lançado hoje',
    corpo:porDia>0?`Se o dia foi sem gasto, ótimo: ${brl(porDia)} viraram folga pro resto do mês. Se gastou, leva 5 segundos pra registrar.`
      :'Se gastou hoje, registre agora — leva 5 segundos e mantém a conta do mês honesta.',aba:'hoje'};
  return {titulo:`🌙 Hoje você gastou ${brl(gastoHoje)}`,
    corpo:gastoHoje<=porDia?`Ficou dentro dos ${brl(porDia)} do dia. Sobram ${brl(folga)} até a fatura fechar.`
      :`Passou ${brl(gastoHoje-porDia)} do que cabia hoje. Amanhã dá pra compensar gastando ${brl(Math.max(folga/Math.max(dias,1),0))}.`,
    aba:'hoje'};
}

function checarAgenda(forcar){
  if(permissao()!=='granted') return 0;
  const agora=hhmmAgora(), hoje=iso(hojeD());
  S.agendaLog=S.agendaLog||{};
  let n=0;
  (S.agenda||[]).forEach(h=>{
    if(!h.on) return;
    if(!forcar){
      if(S.agendaLog[h.id]===hoje) return;   // já avisou hoje
      if(h.hora>agora) return;               // ainda não deu a hora
    }
    const c=calc(), m=mensagemDoMomento(h.tipo,c);
    if(!m){ S.agendaLog[h.id]=hoje; return; }
    enviarNotificacao({titulo:m.titulo,corpo:m.corpo,tag:'agenda:'+h.id+':'+hoje,aba:m.aba});
    S.agendaLog[h.id]=hoje; n++;
  });
  if(n) salvar();
  return n;
}

function renderAgenda(){
  const el=$('#agenda'); if(!el) return;
  S.agenda=S.agenda||[];
  if(!S.agenda.length){
    el.innerHTML='<p class="ajuda" style="margin:0">Nenhum horário ainda. Sugestão: um de manhã, pra saber quanto dá pra gastar, e um à noite, pra fechar o dia.</p>';
  }else{
    el.innerHTML=S.agenda.map(h=>`<div class="hora">
      <input type="time" value="${esc(h.hora)}" data-hora="${h.id}" aria-label="Horário do lembrete">
      <select data-tipo="${h.id}" aria-label="Tipo de lembrete">
        ${Object.entries(MOMENTOS).map(([k,m])=>`<option value="${k}"${k===h.tipo?' selected':''}>${m.emoji} ${m.nome}</option>`).join('')}
      </select>
      <button class="sw" role="switch" data-on="${h.id}" aria-checked="${h.on?'true':'false'}" aria-label="Ligar lembrete"></button>
      <button class="rm" data-rmh="${h.id}" aria-label="Remover horário">×</button>
    </div>`).join('');
    el.querySelectorAll('[data-hora]').forEach(i=>i.onchange=e=>{
      const h=S.agenda.find(x=>x.id===e.target.dataset.hora); if(h){ h.hora=e.target.value||'08:30'; salvar(); } });
    el.querySelectorAll('[data-tipo]').forEach(i=>i.onchange=e=>{
      const h=S.agenda.find(x=>x.id===e.target.dataset.tipo); if(h){ h.tipo=e.target.value; salvar(); renderAgenda(); } });
    el.querySelectorAll('[data-on]').forEach(b=>b.onclick=()=>{
      const h=S.agenda.find(x=>x.id===b.dataset.on); if(!h) return;
      h.on=!h.on; b.setAttribute('aria-checked',h.on?'true':'false'); salvar(); });
    el.querySelectorAll('[data-rmh]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.rmh, guardado=S.agenda.find(x=>x.id===id);
      S.agenda=S.agenda.filter(x=>x.id!==id); renderAgenda(); salvar();
      snack('Horário removido.','Desfazer',()=>{ S.agenda.push(guardado); renderAgenda(); salvar(); });
    });
  }
  const instalado=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
  $('#avisoAgenda').innerHTML=`<div class="aviso-card"><span>ℹ️</span><div>
    <b>Como o horário funciona de verdade.</b> Com o app aberto, o lembrete sai na hora marcada.
    Com o app fechado, ele sai <b>assim que o app for aberto de novo</b> — o app sabe que a hora passou e ainda não avisou hoje.
    ${instalado?'Como está instalado, o Android também pode acordar o app sozinho e entregar perto do horário.'
      :'Instalando na tela inicial, o Android passa a acordar o app sozinho e o lembrete chega mais perto do horário.'}
    Pra garantir a hora exata com o app fechado seria preciso um servidor de notificações — não temos um, e por isso nada dos seus dados sai do aparelho.</div></div>`;
}

/* ==========================================================================
   Retrospectiva: o mês que fechou
   ========================================================================== */
function confete(){
  if(RED) return;
  const cores=['#34C759','#007AFF','#FF9500','#AF52DE','#FF2D55'];
  const d=document.createElement('div'); d.className='confete';
  for(let i=0;i<46;i++){
    const p=document.createElement('i');
    p.style.left=Math.random()*100+'vw';
    p.style.background=cores[i%cores.length];
    p.style.animationDuration=(1.6+Math.random()*1.4)+'s';
    p.style.animationDelay=(Math.random()*.5)+'s';
    d.appendChild(p);
  }
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),3400);
}
function mostrarRetro(x){
  const ant=S.hist[S.hist.indexOf(x)+1];
  const [y,m]=x.data.split('-');
  const nomeMes=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto',
                 'setembro','outubro','novembro','dezembro'][+m-1];
  const dif=ant?x.meu-ant.meu:null;
  const economizou=dif!==null&&dif<0;
  const cats=Object.entries(x.porCat||{}).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const variacoes=cats.map(([k,v])=>{
    const a=ant&&ant.porCat?(ant.porCat[k]||0):null;
    return {k,v,d:a===null||a===0?null:(v-a)/a};
  });
  $('#retroCorpo').innerHTML=`
    <div class="re-cap">Fatura fechada em ${dataBR(x.data)}</div>
    <h2 id="retroTit">${nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)} terminou.</h2>

    <div class="re-card" style="animation-delay:.05s">
      <div class="l">Você gastou</div>
      <div class="re-n">${brl(x.meu)}</div>
      ${dif===null?'<div class="d">Primeiro mês fechado — a partir do próximo dá pra comparar.</div>'
        :`<div class="d" style="color:${economizou?'var(--verde)':'var(--vermelho)'};font-weight:600">
           ${economizou?'▼ '+brl(-dif)+' a menos':'▲ '+brl(dif)+' a mais'} que o mês anterior</div>`}
    </div>

    ${x.pai>0?`<div class="re-card" style="animation-delay:.1s">
      <div class="l">Outra pessoa cobriu</div><div class="re-n" style="font-size:30px;color:var(--pai)">${brl(x.pai)}</div>
      <div class="d">Estava na fatura, mas não saiu do seu bolso.</div></div>`:''}

    <div class="re-card" style="animation-delay:.15s">
      <div class="l">Para onde foi</div>
      ${variacoes.map(v=>`<div class="re-linha">
        <span class="pt" style="background:${CATS[v.k]?CATS[v.k].c:'var(--cout)'}"></span>
        <span class="rn">${CATS[v.k]?CATS[v.k].n:v.k}</span>
        <span class="rv">${brl(v.v)}</span>
        <span class="rd" style="color:${v.d===null||Math.abs(v.d)<0.005?'var(--txt-3)':(v.d>0?'var(--vermelho)':'var(--verde)')}">
          ${v.d===null?'—':Math.abs(v.d)<0.005?'igual':(v.d>0?'+':'−')+Math.abs(Math.round(v.d*100))+'%'}</span></div>`).join('')}
    </div>

    ${economizou?`<div class="re-card" style="animation-delay:.2s;border-left:3px solid var(--verde)">
      <div class="l">Parabéns</div>
      <div style="font-size:15.5px">Você economizou <b>${brl(-dif)}</b> em relação ao mês passado.
      Mantendo esse ritmo por um ano, são <b>${brl(-dif*12)}</b>.</div></div>`
      :dif!==null?`<div class="re-card" style="animation-delay:.2s">
      <div class="l">Para o mês que começa</div>
      <div style="font-size:15.5px">O mês subiu ${brl(dif)}. Olhe as categorias em vermelho ali em cima —
      normalmente uma ou duas explicam quase tudo.</div></div>`:''}

    <div class="retro-acoes">
      <button class="btn" id="retroFechar" style="flex:1">Começar o novo mês</button>
      <button class="btn sec" id="retroVer">Ver a fatura</button>
    </div>`;
  $('#retro').hidden=false;
  document.body.style.overflow='hidden';
  if(economizou) setTimeout(confete,420);
  $('#retroFechar').onclick=fecharRetro;
  $('#retroVer').onclick=()=>{ fecharRetro(); irPara('analise:hist'); };
}
function fecharRetro(){ $('#retro').hidden=true; document.body.style.overflow=''; }

/* ==========================================================================
   Eventos da v3
   ========================================================================== */
$('#fab').onclick=()=>{ abrirFolha(); vibrar(10); };
$('#sheetFechar').onclick=fecharFolha;
$('#sheetBg').onclick=fecharFolha;
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ if(folhaAberta) fecharFolha(); else if(!$('#retro').hidden) fecharRetro(); }
});
document.addEventListener('click',e=>{
  if(e.target.closest('[data-abrir-folha]')) abrirFolha();
});
$('#rapido').addEventListener('input',renderEco);
$('#rapido').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); salvarRapido(); } });
$('#rapidoOk').onclick=salvarRapido;
$('#verTodos').onclick=()=>{ $('#blocoTodos').hidden=false;
  $('#blocoTodos').scrollIntoView({behavior:'smooth',block:'start'}); };
$('#fecharTodos').onclick=()=>{ $('#blocoTodos').hidden=true; };
$('#addHorario').onclick=()=>{
  S.agenda=S.agenda||[];
  if(S.agenda.length>=6){ toast('Seis horários já é bastante.',true); return; }
  S.agenda.push({id:'h'+Date.now().toString(36),hora:'12:30',tipo:'meio',on:true});
  renderAgenda(); salvar();
};

/* arrastar a folha pra baixo pra fechar */
(()=>{
  const sh=$('#sheet'); let y0=null,dy=0;
  sh.addEventListener('touchstart',e=>{ if(sh.scrollTop>0) return; y0=e.touches[0].clientY; dy=0; },{passive:true});
  sh.addEventListener('touchmove',e=>{ if(y0===null) return;
    dy=e.touches[0].clientY-y0;
    if(dy>0){ sh.style.transition='none'; sh.style.transform='translateY('+dy+'px)'; } },{passive:true});
  sh.addEventListener('touchend',()=>{
    if(y0===null) return;
    sh.style.transition=''; sh.style.transform='';
    if(dy>110) fecharFolha();
    y0=null;
  });
})();

/* checagens periódicas */
setInterval(()=>{ if(Auth.logado()) checarAgenda(false); },60*1000);   // o minuto do horário marcado
setInterval(()=>{ if(Auth.logado()) checarAlertas(false); },30*60*1000); // os alertas de situação

/* ==========================================================================
   v4 — sessão, sincronização e atualização do app
   ========================================================================== */

/* ---------- sincronização com a nuvem ---------- */
let sincEstado='local', sincQuando=0, envioT=null, enviando=false, pendente=false;

function pintarSinc(){
  const el=$('#sinc'); if(!el) return;
  const hora=sincQuando?new Date(sincQuando).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
  const txt={
    ok:       hora?('Sincronizado '+hora):'Sincronizado',
    enviando: 'Sincronizando…',
    offline:  'Offline — salvo aqui',
    erro:     'Falha ao sincronizar',
    local:    'Só neste aparelho'
  }[sincEstado]||'—';
  el.dataset.e=sincEstado;
  el.querySelector('span').textContent=txt;
  el.setAttribute('aria-label','Sincronização: '+txt+'. Toque para sincronizar agora.');
  const c=$('#contaSinc');
  const traco={ok:'certo',offline:'lua',erro:'atencao',enviando:'relogio',local:'nota'}[sincEstado]||'relogio';
  if(c) c.innerHTML=`<div class="aviso-card ${sincEstado==='ok'?'ok':sincEstado==='erro'?'ruim':''}">
    <span class="av-ic">${icone(traco,18)}</span>
    <div>${sincEstado==='ok'?`<b>Tudo salvo na sua conta.</b> Última sincronização às ${hora}. Abrindo em outro aparelho com este mesmo login, os dados estarão lá.`
      :sincEstado==='offline'?'<b>Sem internet agora.</b> Continue usando normalmente — está tudo salvo neste aparelho e sobe sozinho quando a conexão voltar.'
      :sincEstado==='erro'?'<b>Não consegui sincronizar.</b> Seus dados estão salvos neste aparelho. Toque em “Sincronizar agora” para tentar de novo.'
      :'Sincronizando…'}</div></div>`;
}
function marcarSinc(e){ sincEstado=e; if(e==='ok') sincQuando=Date.now(); pintarSinc(); }

function agendarEnvio(){
  if(!Auth.logado()) return;
  clearTimeout(envioT);
  envioT=setTimeout(enviarParaNuvem,1200);
}
async function enviarParaNuvem(){
  if(!Auth.logado()) return;
  if(enviando){ pendente=true; return; }
  if(!navigator.onLine){ marcarSinc('offline'); pendente=true; return; }
  if(estaVazio(S) && S._revisao){ marcarSinc('ok'); return; }
  enviando=true; marcarSinc('enviando');
  try{
    const r=await Auth.enviarEstado(S);
    if(r) S._revisao=r.revisao;
    marcarSinc('ok');
  }catch(e){
    marcarSinc(String(e.codigo||'').includes('sem_rede')||!navigator.onLine?'offline':'erro');
  }finally{
    enviando=false;
    if(pendente){ pendente=false; agendarEnvio(); }
  }
}
/* Puxa o que está na nuvem e resolve conflito pelo carimbo de tempo:
   quem gravou por último ganha, e o outro lado é sobrescrito só se for mais velho. */
async function puxarDaNuvem(silencioso){
  if(!Auth.logado()) return;
  if(!navigator.onLine){ marcarSinc('offline'); return; }
  if(!silencioso) marcarSinc('enviando');
  try{
    const linha=await Auth.puxarEstado();
    if(!linha){ await enviarParaNuvem(); return; }
    const remoto=linha.dados||{};
    const tRemoto=+remoto._ts||0, tLocal=+S._ts||0;
    // Rede de segurança: aparelho sem nada não apaga conta com dados.
    const adotarRemoto = (!estaVazio(remoto) && estaVazio(S)) || tRemoto>tLocal;
    if(adotarRemoto){
      S=Object.assign(S,remoto);
      S._revisao=linha.revisao;
      rodarCiclos(); aplicarTema(); preencherCampos(); render();
      await storeSet(KEY,JSON.stringify(S));
      marcarSinc('ok');
      if(!silencioso) toast('Dados atualizados desta conta');
    }else if(tLocal>tRemoto && !estaVazio(S)){
      await enviarParaNuvem();
    }else{
      S._revisao=linha.revisao; marcarSinc('ok');
    }
  }catch(e){
    marcarSinc(String(e.codigo||'').includes('sem_rede')?'offline':'erro');
  }
}
window.addEventListener('online',()=>{ if(Auth.logado()){ marcarSinc('enviando'); puxarDaNuvem(true); } });
window.addEventListener('offline',()=>{ if(Auth.logado()) marcarSinc('offline'); });

/* preenche os campos do formulário a partir do estado (usado no load e no pull) */
function preencherCampos(){
  const p=(id,v)=>{ const el=$('#'+id); if(el) el.value=(v||v===0)?v:''; };
  p('salario',S.salario); p('extra',S.extra); p('metaPct',S.metaPct); p('metaVal',S.metaVal);
  p('meses',S.meses||6); p('jaTem',S.jaTem); p('diaFech',S.diaFech||5);
  p('diaVenc',S.diaVenc||S.diaFech||5);
  p('aTetoPct',S.aTetoPct||85); p('aDiasFech',S.aDiasFech||3); p('aDiasVenc',S.aDiasVenc||2);
}

/* ==========================================================================
   Tela de entrar / criar conta
   ========================================================================== */
let modoAuth='entrar';   // entrar | cadastrar | recuperar
const $a=id=>document.getElementById(id);

function mostrarErroCampo(campo,msg){
  const err=$a('err'+campo), inp=$a('auth'+campo);
  if(!err||!inp) return;
  err.textContent=msg||''; err.hidden=!msg;
  inp.setAttribute('aria-invalid',msg?'true':'false');
}
function avisoAuth(msg,tipo){
  const e=$a('authErro'), k=$a('authOk');
  e.hidden=true; k.hidden=true;
  if(!msg) return;
  const alvo=tipo==='ok'?k:e;
  alvo.innerHTML=msg; alvo.hidden=false;
}
function carregandoAuth(ligado,rotulo){
  const b=$a('authEnviar');
  b.disabled=ligado;
  b.innerHTML=ligado?'<span class="girando"></span>':(rotulo||b.dataset.rotulo||'Entrar');
}
function pintarModo(){
  const tit={entrar:'Entrar',cadastrar:'Criar conta',recuperar:'Recuperar senha'}[modoAuth];
  const sub={
    entrar:'Seus dados ficam na sua conta, e só nela.',
    cadastrar:'Leva 20 segundos: seu nome, um e-mail e uma senha.',
    recuperar:'Digite seu e-mail e enviamos um link para criar uma senha nova.'
  }[modoAuth];
  const rotulo={entrar:'Entrar',cadastrar:'Criar minha conta',recuperar:'Enviar o link'}[modoAuth];
  $a('authTit').textContent=tit;
  $a('authSub').textContent=sub;
  $a('authEnviar').dataset.rotulo=rotulo;
  $a('authEnviar').textContent=rotulo;
  $a('campoNome').hidden=(modoAuth!=='cadastrar');
  $a('campoSenha').hidden=(modoAuth==='recuperar');
  $a('campoConfirma').hidden=(modoAuth!=='cadastrar');
  $a('forcaSenha').hidden=(modoAuth!=='cadastrar');
  $a('authEsqueci').hidden=(modoAuth!=='entrar');
  $a('authSenha').setAttribute('autocomplete',modoAuth==='cadastrar'?'new-password':'current-password');
  $a('authTrocaTxt').textContent=(modoAuth==='entrar')?'Ainda não tem conta?':'Já tem conta?';
  $a('authTroca').textContent=(modoAuth==='entrar')?'Criar conta':'Entrar';
  ['Nome','Email','Senha','Confirma'].forEach(c=>mostrarErroCampo(c,''));
  avisoAuth('');
}
function trocarModo(novo){
  modoAuth=novo; pintarModo();
  $a(modoAuth==='cadastrar'?'authNome':'authEmail').focus();
}

function validarFormulario(){
  let ok=true;
  if(modoAuth==='cadastrar'){
    const n=Auth.validarNome($a('authNome').value);
    mostrarErroCampo('Nome',n); if(n) ok=false;
  }
  const e=Auth.validarEmail($a('authEmail').value);
  mostrarErroCampo('Email',e); if(e) ok=false;
  if(modoAuth!=='recuperar'){
    const s=modoAuth==='cadastrar'
      ? Auth.validarSenha($a('authSenha').value)
      : ($a('authSenha').value ? '' : 'Digite sua senha.');
    mostrarErroCampo('Senha',s); if(s) ok=false;
  }
  if(modoAuth==='cadastrar'){
    const c=$a('authConfirma').value;
    const msg=!c ? 'Repita a senha para confirmar.'
      : (c!==$a('authSenha').value ? 'As senhas não são iguais. Confira as duas.' : '');
    mostrarErroCampo('Confirma',msg); if(msg) ok=false;
  }
  return ok;
}

async function enviarAuth(ev){
  if(ev) ev.preventDefault();
  if(!validarFormulario()) return;
  const email=$a('authEmail').value.trim(), senha=$a('authSenha').value;
  const nome=$a('authNome').value.trim();
  carregandoAuth(true);
  avisoAuth('');
  try{
    if(modoAuth==='entrar'){
      await Auth.entrar(email,senha);
      await abrirApp(true);
    }else if(modoAuth==='cadastrar'){
      const r=await Auth.cadastrar(email,senha,nome);
      if(r.confirmar){
        avisoAuth(`<b>Conta criada.</b> Enviamos um link de confirmação para <b>${esc(email)}</b>.
          Abra o e-mail, confirme e volte aqui para entrar.
          <button type="button" class="link" id="reenviar" style="display:block;margin-top:6px">Reenviar o e-mail</button>`,'ok');
        const rb=$a('reenviar');
        if(rb) rb.onclick=async()=>{
          try{ await Auth.reenviarConfirmacao(email); avisoAuth('E-mail reenviado. Confira a caixa de entrada e o spam.','ok'); }
          catch(e2){ avisoAuth(Auth.mensagemDeErro(e2)); }
        };
        modoAuth='entrar'; pintarModo();
        avisoAuth(`<b>Conta criada.</b> Confirme pelo link que enviamos para <b>${esc(email)}</b> e entre aqui.`,'ok');
      }else{
        // Rede de segurança: se o nome não voltou junto da sessão, gravamos
        // agora — a saudação nunca pode cair no pedaço do e-mail.
        if(nome && !(Auth.usuario()||{}).nome){
          try{ await Auth.definirNome(nome); }catch(e2){}
        }
        await abrirApp(true);
      }
    }else{
      await Auth.recuperarSenha(email, location.origin+'/?recuperar=1');
      avisoAuth(`Se existir uma conta com <b>${esc(email)}</b>, o link para criar uma senha nova já está a caminho. Confira também o spam.`,'ok');
      modoAuth='entrar';
      const guardado=$a('authOk').innerHTML;
      pintarModo(); avisoAuth(guardado,'ok');
    }
  }catch(e){
    avisoAuth(Auth.mensagemDeErro(e));
    if(String(e.message||'').toLowerCase().includes('invalid login')) $a('authSenha').select();
  }finally{
    carregandoAuth(false);
  }
}

function ligarAuth(){
  $a('authForm').addEventListener('submit',enviarAuth);
  $a('authTroca').onclick=()=>trocarModo(modoAuth==='entrar'?'cadastrar':'entrar');
  $a('authEsqueci').onclick=()=>trocarModo('recuperar');
  document.querySelectorAll('.olho').forEach(b=>b.onclick=()=>{
    const inp=$a(b.dataset.ver); if(!inp) return;
    const ver=(inp.type==='password');
    inp.type=ver?'text':'password';
    b.setAttribute('aria-pressed',ver?'true':'false');
    b.setAttribute('aria-label',ver?'Ocultar senha':'Mostrar senha');
    b.querySelectorAll('.o-aberto').forEach(el=>el.style.opacity=ver?'.4':'1');
    b.querySelector('.o-riscado').hidden=!ver;
    inp.focus();
  });
  $a('authSenha').addEventListener('input',()=>{
    if(modoAuth!=='cadastrar') return;
    const f=Auth.forcaDaSenha($a('authSenha').value);
    const box=$a('forcaSenha');
    box.dataset.n=f.nivel;
    box.querySelector('i').style.width=(f.nivel/4*100)+'%';
    box.querySelector('span').textContent=$a('authSenha').value?f.rotulo:'';
    if($a('errSenha').hidden===false && !Auth.validarSenha($a('authSenha').value)) mostrarErroCampo('Senha','');
  });
  $a('authConfirma').addEventListener('input',()=>{
    const c=$a('authConfirma').value;
    if(c && c===$a('authSenha').value) mostrarErroCampo('Confirma','');
  });
  ['authEmail'].forEach(id=>$a(id).addEventListener('blur',()=>{
    if($a(id).value) mostrarErroCampo('Email',Auth.validarEmail($a(id).value));
  }));
}

function mostrarAuth(){
  document.body.classList.add('sem-barra');
  $('#auth').hidden=false;
  $('#appWrap').hidden=true;
  $('#tabbar').hidden=true;
  $('#fab').hidden=true;
  pintarModo();
  setTimeout(()=>$a('authEmail').focus(),380);
}

/* ==========================================================================
   Entrar no app depois de autenticado
   ========================================================================== */
async function abrirApp(recemLogado){
  const u=Auth.usuario();
  usarChaveDe(u&&u.id);
  document.body.classList.remove('sem-barra');
  $('#auth').hidden=true;
  $('#appWrap').hidden=false;
  $('#tabbar').hidden=false;
  $('#fab').hidden=false;

  await carregar();

  // Dados que já existiam neste aparelho antes de haver conta: importa uma vez.
  if(recemLogado && !S.lanc.length && !((+S.salario||0)+(+S.extra||0))){
    try{
      const antigo=await storeGet(KEY_ANTIGA);
      if(antigo){
        const d=JSON.parse(antigo);
        if(d && (d.lanc||[]).length){
          S=Object.assign(S,d); delete S._revisao;
          rodarCiclos(); preencherCampos(); render(); await salvar();
          toast('Importamos os dados que já estavam neste aparelho');
        }
      }
    }catch(e){}
  }

  S.alertas=Object.assign({teto:true,gasto:true,meta:true,fechamento:true,vencimento:true,
    contas:true,variavel:true,parcela:false},S.alertas||{});
  S.notifLog=S.notifLog||{}; S.agendaLog=S.agendaLog||{};
  if(!Array.isArray(S.agenda)) S.agenda=AGENDA_PADRAO.map(h=>Object.assign({},h));
  preencherCampos();

  pintarSaudacao();
  pedirNomeSeFaltar();

  const ir=new URLSearchParams(location.search).get('ir');
  irPara(ir||'hoje');
  renderAgenda(); renderAlertas(calc()); renderChips(); pintarConta();

  // Local primeiro: o app já está pronto com o que estava no aparelho. A nuvem
  // é consultada em segundo plano, sem segurar a tela. Se vier algo mais novo,
  // a tela se atualiza sozinha.
  marcarSinc(navigator.onLine?'enviando':'offline');
  puxarDaNuvem(true);

  if(avisoCiclo&&S.hist.length&&S.retroVista!==S.hist[0].data){
    S.retroVista=S.hist[0].data; salvar();
    setTimeout(()=>mostrarRetro(S.hist[0]),650);
  }
  setTimeout(()=>{ checarAlertas(false); checarAgenda(false); },1600);
  if(recemLogado){
    const nome=Auth.primeiroNome();
    toast(estaVazio(S) ? (nome?`Bem-vindo, ${nome}`:'Bem-vindo')
                       : (nome?`Bem-vindo de volta, ${nome}`:'Bem-vindo de volta'));
  }
}

/* Contas criadas antes de existir o campo de nome ficam sem nome, e a saudação
   sai seca ("Bom dia"). Em vez de deixar assim para sempre, pedimos uma vez —
   com um cartão discreto no topo de Hoje, que some assim que for respondido. */
function pedirNomeSeFaltar(){
  const alvo=$('#pedirNome');
  if(!alvo) return;
  const u=Auth.usuario();
  if(!u || (u.nome||'').trim() || S.nomeDispensado){ alvo.hidden=true; return; }
  alvo.hidden=false;
  alvo.innerHTML=`<div class="bloco pede-nome">
    <div class="pn-tx">
      <b>Como podemos te chamar?</b>
      <span>Sua conta é anterior a esse campo. Escreva seu nome e o app passa a falar com você pelo nome.</span>
    </div>
    <div class="linha-campo">
      <input type="text" id="pnNome" maxlength="40" autocapitalize="words"
             placeholder="Seu nome ou apelido" aria-label="Seu nome ou apelido">
      <button class="btn" id="pnSalvar">Salvar</button>
    </div>
    <button class="link" id="pnDepois">Agora não</button>
  </div>`;
  $('#pnDepois').onclick=()=>{ S.nomeDispensado=true; salvar(); alvo.hidden=true; };
  $('#pnNome').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#pnSalvar').click(); });
  $('#pnSalvar').onclick=async e=>{
    const v=$('#pnNome').value, msg=Auth.validarNome(v);
    if(msg){ toast(msg,true); $('#pnNome').focus(); return; }
    await comCarregamento(e.currentTarget, async()=>{
      try{
        await Auth.definirNome(v);
        pintarSaudacao(); pintarConta();
        alvo.hidden=true;
        toast('Prazer, '+Auth.primeiroNome());
      }catch(err){ toast(Auth.mensagemDeErro(err),true); }
    },'Salvar');
  };
}

/* A saudação usa o nome que a pessoa escolheu. Se por algum motivo não houver
   nome, cumprimentamos sem nome — o pedaço do e-mail nunca vira identidade. */
function pintarSaudacao(){
  const h=new Date().getHours();
  const hora=h<5?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const nome=Auth.primeiroNome();
  $('#saudacao').textContent=hora+(nome?', '+nome:'');
}
function pintarConta(){
  const u=Auth.usuario(); if(!u) return;
  const nome=Auth.primeiroNome();
  $('#contaNome').textContent=(u.nome||'').trim()||'Sem nome ainda';
  $('#contaEmail').textContent=u.email||'—';
  $('#contaAvatar').textContent=(nome||u.email||'?').charAt(0);
  $('#contaApelido').value=(u.nome||'').trim();
  pintarSinc();
}

/* Limpa a cópia local de uma conta em TODAS as camadas onde o app grava.
   Sem isso, quem pegasse o aparelho depois poderia ver os dados de quem saiu. */
async function limparDadosLocais(uid){
  const chave='sobra-do-mes:u:'+uid;
  try{ localStorage.removeItem(chave); }catch(e){}
  try{ await idbDel(chave); }catch(e){}
  try{ document.cookie=chave+'=;max-age=0;path=/'; }catch(e){}
  try{ delete memoria[chave]; }catch(e){}
  try{
    const db=await idbAbrir();
    const chaves=await new Promise((res,rej)=>{ const t=db.transaction('kv','readonly');
      const q=t.objectStore('kv').getAllKeys(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); });
    const copias=chaves.filter(k=>String(k).startsWith('copia:'));
    if(copias.length){ const t=db.transaction('kv','readwrite');
      copias.forEach(k=>t.objectStore('kv').delete(k)); }
  }catch(e){}
}
async function sairDaConta(){
  if(!confirm('Sair da conta?\n\nSeus dados continuam salvos na nuvem e voltam quando você entrar de novo. A cópia guardada neste aparelho será apagada.')) return;
  const u=Auth.usuario();
  const b=$('#btnSair'); b.disabled=true; b.textContent='Saindo…';
  try{ await enviarParaNuvem(); }catch(e){}
  saindo=true;
  if(u) await limparDadosLocais(u.id);
  await Auth.sair();
  location.replace('/');
}

/* ==========================================================================
   Nova versão disponível
   ========================================================================== */
let swEsperando=null, versaoEmEspera=null;
const CHAVE_DISPENSADA='sobra:versao-dispensada';

/* Pergunta ao service worker em espera qual versão ele é. Assim "fechar o
   aviso" vale para aquela versão, e não para todas as futuras. */
function perguntarVersao(sw){
  return new Promise(res=>{
    if(!sw) return res(null);
    const canal=new MessageChannel();
    const relogio=setTimeout(()=>res(null),1500);
    canal.port1.onmessage=e=>{ clearTimeout(relogio);
      res((e.data&&e.data.versao)||null); };
    try{ sw.postMessage({tipo:'versao'},[canal.port2]); }
    catch(e){ clearTimeout(relogio); res(null); }
  });
}
async function mostrarAtualizacao(reg){
  swEsperando=(reg&&reg.waiting)||null;
  if(!swEsperando) return;
  versaoEmEspera=await perguntarVersao(swEsperando);
  let dispensada=null;
  try{ dispensada=localStorage.getItem(CHAVE_DISPENSADA); }catch(e){}
  // Fechou este mesmo aviso antes? Fica quieto. Versão nova? Aparece de novo.
  if(versaoEmEspera && dispensada===versaoEmEspera) return;
  $('#atNota').textContent='Suas informações são salvas antes de atualizar.';
  $('#atualiza').classList.add('abre');
}
$('#btnAtualizar').onclick=async()=>{
  const b=$('#btnAtualizar');
  b.disabled=true; b.textContent='Atualizando…';
  try{ await salvar(); await enviarParaNuvem(); }catch(e){}
  if(swEsperando){
    // O SW novo assume e a página recarrega já na versão nova.
    swEsperando.postMessage({tipo:'pular-espera'});
    setTimeout(()=>location.reload(),700);
  }else{
    try{
      const rs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map(r=>r.update()));
      const ks=await caches.keys();
      await Promise.all(ks.map(k=>caches.delete(k)));
    }catch(e){}
    location.reload();
  }
};
$('#btnAtualizarDepois').onclick=()=>{
  $('#atualiza').classList.remove('abre');
  // Esconde só esta versão. Quando sair outra, o aviso volta sozinho.
  try{ if(versaoEmEspera) localStorage.setItem(CHAVE_DISPENSADA,versaoEmEspera); }catch(e){}
};
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!window.__recarregando){ window.__recarregando=true; location.reload(); }
  });
}

/* ==========================================================================
   Eventos da conta
   ========================================================================== */
/* Um botão que espera precisa dizer que está esperando. */
async function comCarregamento(botao, tarefa, rotuloFinal){
  const rotulo=botao.textContent;
  botao.disabled=true; botao.classList.add('ocupado');
  botao.innerHTML='<span class="girando"></span>';
  try{ return await tarefa(); }
  finally{
    botao.disabled=false; botao.classList.remove('ocupado');
    botao.textContent=rotuloFinal||rotulo;
  }
}

$('#salvarApelido').onclick=async e=>{
  const campo=$('#contaApelido'), erro=$('#errApelido');
  const msg=Auth.validarNome(campo.value);
  erro.textContent=msg; erro.hidden=!msg;
  campo.setAttribute('aria-invalid',msg?'true':'false');
  if(msg){ campo.focus(); return; }
  await comCarregamento(e.currentTarget, async()=>{
    try{
      await Auth.definirNome(campo.value);
      pintarSaudacao(); pintarConta(); render();
      toast('Agora te chamamos de '+Auth.primeiroNome());
    }catch(err){ toast(Auth.mensagemDeErro(err),true); }
  },'Salvar');
};
$('#contaApelido').addEventListener('input',()=>{
  const erro=$('#errApelido');
  if(!erro.hidden && !Auth.validarNome($('#contaApelido').value)){
    erro.hidden=true; $('#contaApelido').setAttribute('aria-invalid','false');
  }
});

/* Ondinha no ponto do toque — o retorno físico de que o botão respondeu. */
document.addEventListener('pointerdown',e=>{
  const alvo=e.target.closest('.btn, .chip-s, .fab');
  if(!alvo||alvo.disabled) return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r=alvo.getBoundingClientRect(), d=Math.max(r.width,r.height);
  const onda=document.createElement('span');
  onda.className='onda';
  onda.style.width=onda.style.height=d+'px';
  onda.style.left=(e.clientX-r.left-d/2)+'px';
  onda.style.top=(e.clientY-r.top-d/2)+'px';
  alvo.appendChild(onda);
  setTimeout(()=>onda.remove(),520);
});

$('#sinc').onclick=()=>{ if(Auth.logado()) puxarDaNuvem(); };
$('#btnSincAgora').onclick=async()=>{ await puxarDaNuvem(); await enviarParaNuvem(); toast('Sincronizado'); };
$('#btnSair').onclick=sairDaConta;
$('#btnTrocarSenha').onclick=()=>{
  const el=$('#trocaSenha'); el.hidden=!el.hidden;
  if(!el.hidden) $('#novaSenha').focus();
};
$('#salvarSenha').onclick=async e=>{
  const v=$('#novaSenha').value, msg=Auth.validarSenha(v);
  if(msg){ toast(msg,true); $('#novaSenha').focus(); return; }
  await comCarregamento(e.currentTarget, async()=>{
    try{
      await Auth.definirNovaSenha(v);
      $('#novaSenha').value=''; $('#trocaSenha').hidden=true;
      toast('Senha alterada');
    }catch(err){ toast(Auth.mensagemDeErro(err),true); }
  },'Salvar nova senha');
};

/* ==========================================================================
   Partida
   ========================================================================== */
function esconderSplash(){
  const s=document.getElementById('splash');
  if(s){ s.classList.add('sai'); setTimeout(()=>s.remove(),380); }
}
(async()=>{
  ligarAuth();
  try{
    // Voltou do e-mail de recuperação: o token vem no fragmento da URL.
    const frag=new URLSearchParams(location.hash.replace(/^#/,''));
    if(frag.get('access_token')){
      const s=Auth.montarSessao({
        access_token:frag.get('access_token'),
        refresh_token:frag.get('refresh_token'),
        expires_in:+frag.get('expires_in')||3600,
        user:{}
      });
      if(s){
        Auth.guardarSessao(s);
        history.replaceState(null,'',location.pathname);
        await abrirApp(true);
        irPara('ajustes:conta');
        $('#trocaSenha').hidden=false;
        toast('Agora escolha uma senha nova');
        esconderSplash();
        return;
      }
    }
    if(Auth.logado()) await abrirApp(false);
    else mostrarAuth();
  }catch(e){
    mostrarAuth();
    avisoAuth('Algo saiu do lugar ao abrir o app. Entre de novo, por favor.');
  }finally{
    esconderSplash();
  }
})();

/* ==========================================================================
   v5 — Conjunto de ícones
   Um só desenho para o app inteiro: traço de 1.75, cantos arredondados,
   24×24. Emoji só sobra nas notificações do sistema, onde ele se sai bem.
   ========================================================================== */
const TRACOS={
  casa:      '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.2V19h11v-8.8"/><path d="M10.2 19v-4.3h3.6V19"/>',
  mercado:   '<path d="M3.5 4.5h2l2.2 9.4a1.6 1.6 0 0 0 1.6 1.2h6.9a1.6 1.6 0 0 0 1.6-1.2l1.2-5.4H6.2"/><circle cx="10" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  transporte:'<path d="M5 16.5v2a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-2"/><path d="M21.5 16.5v2a1 1 0 0 1-1 1H20a1 1 0 0 1-1-1v-2"/><path d="M4 16.5h16v-4l-1.8-4.3A2 2 0 0 0 16.4 7H7.6a2 2 0 0 0-1.8 1.2L4 12.5Z"/><path d="M6.5 12.5h11"/>',
  comida:    '<path d="M6 3.5v7a2.5 2.5 0 0 0 5 0v-7"/><path d="M8.5 13v7.5"/><path d="M17.5 3.5c-1.5 1-2.2 2.7-2.2 4.6 0 1.6.6 2.6 2.2 3v9.4"/>',
  assinatura:'<rect x="2.8" y="6" width="18.4" height="12.5" rx="2.2"/><path d="M10.2 10.4 14 12.2l-3.8 1.9z"/>',
  lazer:     '<path d="M20.5 12.7c0 4.3-3.8 7.8-8.5 7.8s-8.5-3.5-8.5-7.8c0-2 .9-3.9 2.3-5.3"/><path d="M8 8.2 12 3.5l4 4.7"/><circle cx="12" cy="12.8" r="2.6"/>',
  saude:     '<path d="M12 20.3s-7.5-4.3-7.5-9.5A4.3 4.3 0 0 1 12 7.9a4.3 4.3 0 0 1 7.5 2.9c0 5.2-7.5 9.5-7.5 9.5Z"/>',
  estudo:    '<path d="M12 4 2.8 8.4 12 12.8l9.2-4.4z"/><path d="M6.4 10.6v5c0 1.4 2.5 2.6 5.6 2.6s5.6-1.2 5.6-2.6v-5"/><path d="M21.2 8.4v5.4"/>',
  divida:    '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2.2"/><path d="M2.8 9.8h18.4"/><path d="M6.6 14.6h3.6"/>',
  outros:    '<rect x="3.4" y="3.4" width="7" height="7" rx="1.8"/><rect x="13.6" y="3.4" width="7" height="7" rx="1.8"/><rect x="3.4" y="13.6" width="7" height="7" rx="1.8"/><rect x="13.6" y="13.6" width="7" height="7" rx="1.8"/>',

  subindo:   '<path d="M3.5 17.5 9.5 11l4 4 7-7.5"/><path d="M15.5 7.5h5.5V13"/>',
  descendo:  '<path d="M3.5 7.5 9.5 14l4-4 7 7.5"/><path d="M15.5 17.5h5.5V12"/>',
  certo:     '<circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.5 2.5 4.7-5"/>',
  atencao:   '<path d="M12 4.4 2.9 19.3h18.2z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/>',
  alvo:      '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r=".9"/>',
  tesoura:   '<circle cx="6.4" cy="6.4" r="2.4"/><circle cx="6.4" cy="17.6" r="2.4"/><path d="M8.5 8.1 19.6 18.8"/><path d="M8.5 15.9 19.6 5.2"/>',
  calendario:'<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 10h17.2"/><path d="M8 3.4v3.4M16 3.4v3.4"/>',
  lapis:     '<path d="m16.4 4.6 3 3L8.6 18.4l-4 1 1-4z"/>',
  relogio:   '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 1.8"/>',
  sol:       '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
  lua:       '<path d="M20 13.5A8.2 8.2 0 0 1 10.5 4a8.2 8.2 0 1 0 9.5 9.5Z"/>',
  cartao:    '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2.2"/><path d="M2.8 9.8h18.4"/>',
  nota:      '<path d="M5.4 3.6h13.2v16.8l-2.6-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.6-1.6z"/><path d="M9 8.4h6M9 12.4h6"/>',
  festa:     '<path d="M4 20.4 8.6 8.2l7.2 7.2z"/><path d="M14.4 4.6v2M19.4 9.6h-2M18.2 5.8 16.8 7.2"/>',
  fogo:      '<path d="M12 3.4s5 4 5 8.6a5 5 0 0 1-10 0c0-1.6.7-3 1.6-4.2.4 1.2 1.2 2 2.2 2 0-2.6.6-4.8 1.2-6.4Z"/>',
  raio:      '<path d="M13.4 3.4 5 13.6h5.6L9.8 20.6 18.6 10.4H13z"/>'
};
function icone(nome, tamanho){
  const d=TRACOS[nome]||TRACOS.outros;
  const t=tamanho||20;
  return `<svg class="ico" viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true">${d}</svg>`;
}
/* qual traço representa cada categoria e cada tipo de conselho */
const ICONE_CAT={casa:'casa',mercado:'mercado',transporte:'transporte',comida:'comida',
  assinatura:'assinatura',lazer:'lazer',saude:'saude',estudo:'estudo',divida:'divida',outros:'outros'};
