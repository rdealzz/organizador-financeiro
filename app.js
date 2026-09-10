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
const opcoesCat=sel=>Object.entries(CATS).map(([k,v])=>`<option value="${k}"${k===sel?' selected':''}>${v.n}</option>`).join('');

/* ---------- pessoas com quem se divide o gasto ----------

   O app já sabia dizer "outra pessoa cobriu R$ 800". Só isso não bastava:
   quem divide o mercado com o pai E a assinatura com a mãe via os dois
   somados num número só, sem como saber quanto é de quem. Agora cada gasto
   dividido aponta para uma PESSOA — `l.com` guarda o id dela — e todo lugar
   que dizia "outra pessoa" passa a dizer o nome.

   `l.pai` continua sendo o campo de QUANTO a outra pessoa cobre, com esse
   nome mesmo. Ele está nas faturas já arquivadas, no CSV exportado e nos
   backups de quem usa o app desde antes disto; renomear quebraria os três
   sem mudar nada para quem olha a tela. */
const COR_PESSOA=['var(--pes1)','var(--pes2)','var(--pes3)','var(--pes4)',
                  'var(--pes5)','var(--pes6)','var(--pes7)','var(--pes8)'];
const pessoas=()=>Array.isArray(S.pessoas)?S.pessoas:(S.pessoas=[]);
const achaPessoa=id=>id?(pessoas().find(p=>String(p.id)===String(id))||null):null;
const nomePessoa=id=>{const p=achaPessoa(id); return p?p.nome:'Outra pessoa';};
const corPessoa=id=>{const p=achaPessoa(id); return (p&&p.cor)||'var(--pai)';};
function criarPessoa(nome){
  const n=String(nome||'').trim().replace(/\s+/g,' ').slice(0,28);
  if(!n) return null;
  const igual=pessoas().find(p=>p.nome.toLowerCase()===n.toLowerCase());
  if(igual) return igual;
  const p={id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
           nome:n,cor:COR_PESSOA[pessoas().length%COR_PESSOA.length]};
  pessoas().push(p);
  return p;
}
/* Quanto cada pessoa cobriu numa lista de lançamentos, do maior pro menor.
   Serve tanto pro ciclo aberto quanto pra fatura que está sendo arquivada. */
function fatiasPessoa(itens){
  const m={};
  (itens||[]).forEach(l=>{ const v=Math.min(+l.pai||0,+l.valor||0);
    if(v>0){ const k=l.com||''; m[k]=(m[k]||0)+v; } });
  return Object.entries(m).map(([id,valor])=>({id,nome:nomePessoa(id),cor:corPessoa(id),valor}))
    .sort((a,b)=>b.valor-a.valor);
}
/* ---------- o que cobrar de cada pessoa ----------

   `fatiasPessoa` responde "quanto é de cada um" — um número por pessoa. Para
   COBRAR isso não basta: ninguém transfere R$ 427 para alguém sem saber de
   quê. Aqui a mesma divisão vem ITEMIZADA, com o gasto e o quanto dele é dela,
   que é o que se manda pra pessoa conferir.

   Serve para os dois lados da vida da fatura: a que está aberta (prévia, ainda
   muda) e a arquivada (fechada, é essa que se cobra). Só muda a lista de itens
   que entra. `congeladas` são as fatias gravadas na fatura arquivada — quando
   existem, o nome e a cor vêm DELAS, nunca do cadastro de hoje: quem apagar
   "Mãe" em dezembro continua vendo de quem era a cobrança de setembro. */
function cobrancas(itens,congeladas){
  const m={};
  (itens||[]).forEach(l=>{
    const v=Math.min(+l.pai||0,+l.valor||0); if(!(v>0)) return;
    const k=l.com||'';
    if(!m[k]) m[k]={id:k,itens:[],total:0};
    m[k].itens.push({nome:l.nome,cat:l.cat,valor:v,cheio:+l.valor||0});
    m[k].total+=v;
  });
  return Object.values(m).map(g=>{
    const cong=(congeladas||[]).find(f=>String(f.id)===String(g.id));
    g.nome=(cong&&cong.nome)||nomePessoa(g.id);
    g.cor=(cong&&cong.cor)||corPessoa(g.id);
    g.itens.sort((a,b)=>b.valor-a.valor);
    return g;
  }).sort((a,b)=>b.total-a.total);
}
/* O texto que vai pro WhatsApp. Item a item de propósito: uma cobrança que
   chega só com o total vira conversa; com a lista, a pessoa confere e paga. */
function textoCobranca(g,quando){
  return `Fatura de ${quando}\n\n`
    +g.itens.map(i=>'• '+i.nome+': '+brl(i.valor)).join('\n')
    +`\n\nTotal: ${brl(g.total)}`;
}
/* Copiar tem que funcionar mesmo onde a API nova não existe (navegador antigo,
   página sem contexto seguro): o textarea escondido é o plano B de sempre. */
async function copiar(txt){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(txt); return true; }
  }catch(e){}
  try{
    const t=document.createElement('textarea');
    t.value=txt; t.setAttribute('readonly',''); t.style.position='fixed'; t.style.opacity='0';
    document.body.appendChild(t); t.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(t);
    return ok;
  }catch(e){ return false; }
}
/* Um botão só, com o rótulo que faz sentido no aparelho: onde há folha de
   compartilhamento do sistema (celular), "enviar" abre o WhatsApp junto de
   tudo mais; onde não há, "copiar" é o caminho honesto. */
async function enviarCobranca(g,quando){
  const txt=textoCobranca(g,quando);
  if(navigator.share){
    try{ await navigator.share({text:txt}); return; }
    catch(e){ if(e&&e.name==='AbortError') return; }   // a pessoa fechou a folha: não é erro
  }
  const ok=await copiar(txt);
  toast(ok?'Cobrança de '+g.nome+' copiada':'Não consegui copiar aqui',!ok);
}

/* Estado de antes desta versão: havia valor em `pai` e pessoa nenhuma. Em vez
   de jogar essa informação fora, ela vira uma pessoa de verdade chamada
   "Outra pessoa" — basta renomear pra "Pai" e o histórico inteiro vem junto.
   Roda uma vez por conta: `pessoasOk` viaja no estado, então quem entra no
   segundo aparelho não repete a migração. */
function migrarPessoas(){
  if(!Array.isArray(S.pessoas)) S.pessoas=[];
  if(S.pessoasOk) return;
  S.pessoasOk=true;
  const legado=l=>+l.pai>0&&!l.com;
  const temLegado=(S.lanc||[]).some(legado)
    || (S.hist||[]).some(x=>(x.itens||[]).some(legado));
  if(!temLegado) return;
  const p=criarPessoa('Outra pessoa'); if(!p) return;
  (S.lanc||[]).forEach(l=>{ if(legado(l)) l.com=p.id; });
  (S.hist||[]).forEach(x=>{
    (x.itens||[]).forEach(l=>{ if(legado(l)) l.com=p.id; });
    if(!x.pessoas) x.pessoas=fatiasPessoa(x.itens);
  });
}
const KEY_ANTIGA='sobra-do-mes:novo';   // dados de antes do login, neste aparelho
let KEY=KEY_ANTIGA;
function usarChaveDe(uid){ KEY = uid ? ('sobra-do-mes:u:'+uid) : KEY_ANTIGA; }

/* Estado da cena de fundo — declarado AQUI, no topo, de propósito.

   A partida do app roda no fim deste arquivo, mas quando já existe sessão
   salva ela chama abrirApp() na hora, e abrirApp() mexe na cena. Se estas
   variáveis fossem declaradas junto do resto do código da cena, lá embaixo,
   elas ainda estariam na zona morta temporal do `let` nesse instante — e ler
   uma delas lança "Cannot access 'cena' before initialization".

   Era exatamente isso que acontecia ao REABRIR o app já logado: a exceção
   subia, a partida caía no catch, o login aparecia com "algo saiu do lugar" e
   a capa continuava por cima dele. Quem entrava pelo formulário nunca via o
   problema, porque aí o arquivo já tinha terminado de carregar. */
let cena=null, capaSaindo=false;
/* Declarado AQUI pelo mesmo motivo de `cena` e `retroPendente`: `aplicarTema()`
   roda na partida, antes do fim deste arquivo, e um `let` lá embaixo estaria na
   zona morta temporal — ler a variável lançaria e derrubaria a abertura. */
let viz3d=null, viz3dChave='';
/* Como pagou, no formulário de lançamento. Volta pra 'cartao' a cada gasto: é
   o caso comum, e deixar grudado no Pix faria a fatura seguinte nascer errada.
   Mora AQUI no topo, junto de `cena`, porque renderFatura() o lê e render()
   roda antes do fim deste arquivo quando o app reabre com sessão salva. */
let meioForm='cartao';
/* Retrospectiva que está esperando o portal sair da frente — ver abrirApp(). */
let retroPendente=null;
/* Promessa que só resolve quando a capa sai. Quem revela o app espera por ela,
   senão o app aparece POR TRÁS da capa — era o segundo sintoma do mesmo bug. */
let capaPronta=Promise.resolve();
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
/* `tema:'auto'` quer dizer "esta conta não escolheu tema", e é o que faz
   temaAtual() ir olhar a escolha guardada NO APARELHO. Pôr 'claro' aqui parece
   inofensivo e não é: temaAtual() devolveria 'claro' de cara, sem nunca
   consultar `sobra:tema`, e aplicarTema() ainda gravaria 'claro' por cima da
   escolha da pessoa — quem tivesse escolhido escuro veria o app voltar pro
   claro a cada recarga. O padrão claro mora em TEMA_PADRAO, lá embaixo, como
   ÚLTIMO recurso: só vale quando não há escolha nenhuma. */
let S={versao:2,tema:'auto',avatar:'',salario:0,extra:0,metaPct:20,metaVal:0,diaFech:5,diaVenc:12,ultimoFech:null,hist:[],
       tetos:{},lanc:SEED,div:[],obj:[],pessoas:[],meses:6,jaTem:0,
       orcaOculto:null,orcaEm:null,
       alertas:{teto:true,gasto:true,meta:true,fechamento:true,vencimento:true,contas:true,variavel:true,parcela:false},
       aTetoPct:85,aDiasFech:3,aDiasVenc:2,notifLog:{},_ultimoSalvo:0};
let prev=[], avisoCiclo='';
let saindo=false;   // logout em andamento: nada mais pode gravar em disco

const $=s=>document.querySelector(s);
const brl=v=>(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>(v*100).toFixed(0)+'%';
/* Escapa TUDO que muda de significado dentro de HTML, aspas simples e crase
   incluídas: um atributo escrito com aspas simples em alguma linha futura não
   pode virar uma porta. Um caractere esquecido aqui vale por todas as
   validações do resto do arquivo. */
const ESCAPES={'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;'};
const esc=s=>String(s).replace(/[<>&"'`=]/g,c=>ESCAPES[c]);
const meuValor=l=>Math.max(l.valor-(+l.pai||0),0);
const iso=d=>d.toISOString().slice(0,10);
const hojeD=()=>{const d=new Date(); d.setHours(0,0,0,0); return d;};
const dataBR=s=>{const [y,m,d]=s.split('-'); return d+'/'+m+'/'+y;};
const dataDeISO=s=>{const [y,m,d]=String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1);};
const diaDoMes=n=>Math.min(Math.max(Math.round(+n)||1,1),28);
const ddmm=d=>String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');

/* ---------- ciclo da fatura ---------- */
function ultimoFechPassado(){
  const h=hojeD(), dia=+S.diaFech||5;
  return h.getDate()>=dia ? new Date(h.getFullYear(),h.getMonth(),dia) : new Date(h.getFullYear(),h.getMonth()-1,dia);
}
function proximoFech(){
  const h=hojeD(), dia=+S.diaFech||5;
  return h.getDate()<dia ? new Date(h.getFullYear(),h.getMonth(),dia) : new Date(h.getFullYear(),h.getMonth()+1,dia);
}
/* ---------- fechar ≠ vencer: o gasto de hoje é da PRÓXIMA cobrança ----------

   A fatura que vence daqui a quatro dias já fechou. O que se compra agora não
   entra nela: entra na fatura que ainda está aberta, e essa só é paga no
   vencimento seguinte ao fechamento dela. Quem fecha e vence no dia 12 paga em
   12/10 o que comprou em 08/09 — o app dizia 12/09, que é a fatura anterior,
   fechada e já arquivada. Era só isso que faltava ele entender.

   `vencDaFatura` é o único lugar que casa as duas datas: recebe o dia em que a
   fatura FECHA e devolve o dia em que ela é PAGA — o primeiro `diaVenc` depois
   do fechamento. Fechamento e vencimento no mesmo dia do mês (a configuração de
   quem só sabe a data do pagamento) caem naturalmente no mês seguinte, que é
   exatamente o comportamento do cartão. */
function vencDaFatura(fech){
  const dv=diaDoMes(S.diaVenc||S.diaFech||5);
  const d=new Date(fech.getFullYear(),fech.getMonth(),dv);
  if(d<=fech) d.setMonth(d.getMonth()+1);
  return d;
}
/* A fatura que está sendo formada agora — é nela que cai tudo que se lança
   hoje, e ela só vira cobrança depois de fechar. */
function faturaAberta(){ const fecha=proximoFech(); return {fecha,vence:vencDaFatura(fecha)}; }
/* A fatura que está na mão pra PAGAR é a última arquivada, não a aberta — e só
   enquanto o vencimento dela não passou. Sem histórico não há o que pagar: quem
   começou a usar o app agora só tem fatura em formação. */
function faturaAPagar(){
  const x=S.hist&&S.hist[0]; if(!x||!x.data||x.pago) return null;
  const fecha=dataDeISO(x.data);
  const vence=x.venc?dataDeISO(x.venc):vencDaFatura(fecha);
  return vence<hojeD()?null:{fecha,vence,bruto:+x.bruto||0,meu:+x.meu||0,ref:x};
}

/* Um lançamento pode nascer apontando pra fatura SEGUINTE: `l.prox` conta
   quantos fechamentos ele ainda espera antes de entrar na conta. Enquanto for
   maior que zero ele fica guardado — não soma nos totais do ciclo, não estoura
   teto, não é arquivado no fechamento. Só anda uma casa na fila. */
/* Nem todo gasto passa pelo cartão. A parcela da moto paga no Pix é gasto seu,
   conta no teto e no quanto sobra — mas NÃO está na fatura, e somá-la ali
   inflava o valor a pagar no vencimento. `l.meio` separa as duas coisas:

   • 'cartao' (padrão, e o que todo lançamento antigo é) — entra na fatura.
   • 'avista' (Pix, débito, dinheiro) — já saiu da conta; conta no gasto, não
     na fatura.

   A distinção é só sobre COBRANÇA. Teto, categoria, sobra do mês e a divisão
   com outra pessoa continuam valendo igual para os dois: o dinheiro saiu do
   seu bolso do mesmo jeito. */
const naFatura=l=>l.meio!=='avista';
const naFaturaAberta=l=>!(+l.prox>0);
const doCiclo=()=>S.lanc.filter(naFaturaAberta);
const daProxima=()=>S.lanc.filter(l=>+l.prox>0);

function fecharCiclo(dataStr){
  /* Só fecha o que é DESTA fatura. O que foi lançado apontando pra seguinte
     não estava nela: não é arquivado, apenas anda uma casa na fila. */
  const daFatura=S.lanc.filter(naFaturaAberta), adiados=daProxima();
  let bruto=0,avista=0,meu=0,pai=0; const porCat={};
  daFatura.forEach(l=>{ const m=meuValor(l);
    if(naFatura(l)) bruto+=l.valor; else avista+=l.valor;
    meu+=m; pai+=Math.min(+l.pai||0,l.valor);
    porCat[l.cat]=(porCat[l.cat]||0)+m; });
  const itens=daFatura.map(l=>({nome:l.nome,cat:l.cat,tier:l.tier,valor:l.valor,pai:+l.pai||0,
    com:l.com||'',tipo:l.tipo,fonte:l.fonte,pRest:+l.pRest||0,venc:+l.venc||0,meio:l.meio||'cartao'}));
  /* O nome e a cor da pessoa vão CONGELADOS na fatura arquivada, não por
     referência: quem apagar "Mãe" daqui a três meses continua vendo de quem
     era aquela metade do mercado de setembro.
     `venc` também vai gravado: a fatura que fecha hoje é paga no vencimento
     seguinte, e daqui a seis meses o app não pode ter que adivinhar qual era
     o dia de vencimento configurado na época. */
  /* `bruto` é a fatura do cartão; `avista` é o que saiu por fora dela. As
     faturas gravadas antes desta versão não têm `avista` — para elas o campo
     não existe e vale zero, que é a verdade: naquela época tudo era cartão. */
  S.hist.unshift({data:dataStr,venc:iso(vencDaFatura(dataDeISO(dataStr))),
    bruto,avista,meu,pai,porCat,itens,pessoas:fatiasPessoa(daFatura)});
  S.hist=S.hist.slice(0,24);
  let sumiram=0, andaram=0;
  const ficam=daFatura.filter(l=>{
    if(l.tipo==='var'){ l.ref=l.valor; l.valor=0; l.pai=0; return true; }   // `com` fica: a divisão do mercado costuma ser a mesma no mês seguinte
    if(l.tipo==='rec'||l.tipo==='fixo') return true;
    if(l.tipo==='parc'){ l.pRest=Math.max((+l.pRest||0)-1,0); if(l.pRest<=0){ sumiram++; return false; } andaram++; return true; }
    sumiram++; return false;
  });
  adiados.forEach(l=>{ l.prox=Math.max((+l.prox||0)-1,0); });
  S.lanc=ficam.concat(adiados);
  return {sumiram,andaram,entraram:adiados.length};
}
function rodarCiclos(){
  if(!S.ultimoFech){ S.ultimoFech=iso(ultimoFechPassado()); return; }
  const h=hojeD(); let n=0, sumiram=0, andaram=0, entraram=0, guarda=0;
  while(guarda++<36){
    const [y,m,d]=S.ultimoFech.split('-').map(Number);
    const prox=new Date(y,m-1+1,+S.diaFech||d);
    if(prox>h) break;
    const r=fecharCiclo(iso(prox)); sumiram+=r.sumiram; andaram+=r.andaram; entraram+=r.entraram; n++;
    S.ultimoFech=iso(prox);
  }
  if(n){
    const f=faturaAberta();
    avisoCiclo=`<div class="nota info"><b>A fatura fechou em ${dataBR(S.ultimoFech)}.</b> ${sumiram} lançamento${sumiram===1?'':'s'} de uma vez só saíram da lista, ${andaram} parcela${andaram===1?'':'s'} andou uma casa e o que é fixo continuou.`
      +(entraram?` ${entraram} gasto${entraram===1?' que estava guardado entrou':'s que estavam guardados entraram'} nesta fatura.`:'')
      +` O que você lançar de agora em diante entra na fatura que fecha em ${dataBR(iso(f.fecha))} e é cobrada em ${dataBR(iso(f.vence))}.`
      +` O ciclo anterior foi pro histórico na aba Renda e meta.</div>`;
  }
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
  migrarPessoas(); rodarCiclos(); aplicarTema();
  $('#salario').value=S.salario||''; $('#extra').value=S.extra||'';
  $('#metaPct').value=S.metaPct||''; $('#metaVal').value=S.metaVal||'';
  $('#meses').value=S.meses||6; $('#jaTem').value=S.jaTem||'';
  $('#diaFech').value=S.diaFech||5; $('#diaVenc').value=S.diaVenc||S.diaFech||12;
  // O rosto escolhido vem no estado da conta: pinta assim que ele chega.
  pintarAvatares();
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
      migrarPessoas(); rodarCiclos(); aplicarTema();
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
  /* A conta do ciclo é só do que está NESTA fatura. O que foi guardado pra
     seguinte é somado à parte, em `prox`, e mostrado como o que já está
     comprometido com a cobrança de depois. */
  const itens=doCiclo(), prox=daProxima();
  const t={1:0,2:0,3:0}, porCat={};
  /* `bruto` é a FATURA — só o que passa no cartão. O que foi no Pix vai em
     `avista`, à parte. Os dois somam no gasto: peso, categoria e teto não
     perguntam como você pagou. */
  let bruto=0, avista=0, avistaMeu=0, pai=0;
  itens.forEach(l=>{ const v=meuValor(l);
    if(naFatura(l)) bruto+=l.valor; else { avista+=l.valor; avistaMeu+=v; }
    pai+=Math.min(+l.pai||0,l.valor);
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
  /* Parcelas por vir conta só o que é PARCELA: das desta fatura, o que ainda
     falta; das guardadas, uma a mais, porque nem a primeira foi cobrada. Um
     gasto de uma vez só que está na fila não entra aqui — ele já aparece
     inteiro em `proxBruto`, e somá-lo nos dois lugares dobrava o valor. */
  const futuro=itens.reduce((s,l)=>s+meuValor(l)*(+l.pRest||0),0)
              +prox.reduce((s,l)=>s+meuValor(l)*(l.tipo==='parc'?(+l.pRest||0)+1:0),0);
  const fontes={}; itens.forEach(l=>{const f=l.fonte||'Conta'; fontes[f]=(fontes[f]||0)+l.valor;});
  const proxBruto=prox.reduce((s,l)=>s+(+l.valor||0),0);
  const proxMeu=prox.reduce((s,l)=>s+meuValor(l),0);
  return {renda,gasto,bruto,avista,avistaMeu,pai,t,porCat,meta,disponivel,tetos,excesso,somaExcesso,futuro,fontes,
          proxBruto,proxMeu,proxN:prox.length,
          fatias:fatiasPessoa(itens),sobra:renda-gasto,corte:t[3]};
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
  renderMeta(c); renderHist(); renderTetos(c); renderPessoas(c); renderLanc(c); renderCortes(c); renderReserva(c); renderObj(c); renderDiv();
  renderVenc(c); renderFatura(c); renderAlertas(c); renderChips();
  if(AREA==='analise'&&SUB.analise==='graficos') renderGraficos(c);
  $('#dlFontes').innerHTML=[...new Set(S.lanc.map(l=>l.fonte).filter(Boolean))].map(f=>`<option value="${esc(f)}">`).join('');
  pintarPagadorForm();   // as opções são as pessoas cadastradas, e elas mudam
}

/* ---------- em que fatura cai o que estou lançando agora ----------

   A pergunta que o app não respondia. Ela aparece em quatro lugares, sempre
   com as duas datas juntas — fecha em X, é cobrada em Y — porque é a distância
   entre elas que confunde: na folha de lançamento (antes de digitar), no bloco
   de todos os gastos (olhando a lista), junto das datas em Renda e meta (ao
   configurar) e no cartão da fatura fechada, que é a única que já virou
   cobrança de verdade. */
/* A linha da folha de lançamento muda com o que está sendo lançado: um gasto à
   vista não entra em fatura nenhuma, e deixar "entra na fatura que fecha em
   05/10" logo acima de um eco que diz "fora da fatura" é o app se contradizendo
   em duas linhas coladas. */
function linhaFaturaDaFolha(avista){
  const st=$('#sheetFatura'); if(!st) return;
  const f=faturaAberta();
  st.innerHTML=avista
    ? 'Pago à vista — <b>não entra em fatura nenhuma</b>, mas conta no seu gasto do mês'
    : `Entra na fatura que fecha em <b>${dataBR(iso(f.fecha))}</b> · cobrada em <b>${dataBR(iso(f.vence))}</b>`;
}
function renderFatura(c){
  const f=faturaAberta(), fecha=dataBR(iso(f.fecha)), vence=dataBR(iso(f.vence));
  const pagar=faturaAPagar();

  linhaFaturaDaFolha(meioForm==='avista');

  const sel=$('#lFatura');
  if(sel){
    const prox=vencDaFatura(new Date(f.fecha.getFullYear(),f.fecha.getMonth()+1,f.fecha.getDate()));
    sel.options[0].textContent='Esta — fecha '+ddmm(f.fecha)+', cobrada '+ddmm(f.vence);
    sel.options[1].textContent='A próxima — cobrada só em '+ddmm(prox);
  }

  const av=$('#faturaAviso');
  if(av) av.innerHTML=`<div class="nota info" style="margin:0 0 14px">
    <b>Esta é a fatura em formação.</b> Ela fecha em ${fecha} e só é cobrada no vencimento de <b>${vence}</b> —
    o que você lança hoje não entra na fatura que vence antes disso, que já fechou.
    ${c.proxN?`<br>Há ${c.proxN} gasto${c.proxN===1?'':'s'} guardado${c.proxN===1?'':'s'} pra fatura seguinte, somando ${brl(c.proxBruto)}. ${c.proxN===1?'Ele não entra':'Eles não entram'} nos totais acima.`:''}</div>`;

  const nf=$('#notaFatura');
  /* Fechamento e vencimento iguais quase sempre são a mesma data digitada duas
     vezes, por só se conhecer a do pagamento. O app funciona assim mesmo — mas
     lê os dois dias como "fecha hoje, paga no mesmo dia do mês que vem", trinta
     dias de folga que nenhum cartão dá, e a data de cobrança sai um mês adiante
     da real.

     Avisar não bastava: dizer "ajuste" e deixar a pessoa fazer a conta de qual
     dia pôr é empurrar o problema de volta. O botão faz a correção mais comum
     — a fatura fecha SETE dias antes de vencer — já com o dia calculado no
     rótulo, e o campo continua ali para quem sabe o dia exato do seu cartão. */
  const dv=diaDoMes(S.diaVenc||S.diaFech||5);
  const mesmoDia=diaDoMes(S.diaFech||5)===dv;
  const seteAntes=((dv-7-1+28)%28)+1;
  if(nf){
    nf.innerHTML=`<div class="nota">Um gasto no cartão feito <b>hoje</b> entra na fatura que fecha em
      <b>${fecha}</b> e é cobrado no vencimento de <b>${vence}</b>.`
      +(mesmoDia?` <br><b>Os dois dias estão iguais</b>, e aí o app entende que a fatura fecha e só é paga no mesmo dia do mês seguinte.
        Quase nenhum cartão funciona assim: o normal é fechar alguns dias antes de vencer.
        <div style="margin-top:10px"><button class="btn sec" id="btnFecha7">Fechar dia ${seteAntes}, sete dias antes de vencer</button></div>`
        :'')+`</div>`;
    const b7=$('#btnFecha7');
    if(b7) b7.onclick=()=>{
      S.diaFech=seteAntes;
      $('#diaFech').value=seteAntes;
      /* Mudar o dia do fechamento move a régua do ciclo — o mesmo que o campo
         faz quando a pessoa digita nele. Sem isto o app acharia que a fatura
         atual já fechou (ou ainda não), e viraria ciclo na hora errada. */
      S.ultimoFech=iso(ultimoFechPassado());
      render(); salvar(); vibrar(12);
      const f=faturaAberta();
      toast('Fecha dia '+seteAntes+' · o que você gastar hoje é cobrado em '+ddmm(f.vence));
    };
  }

  const bp=$('#blocoPagar');
  if(bp){
    if(!pagar){ bp.innerHTML=''; }
    else{
      const d=Math.round((pagar.vence-hojeD())/86400000);
      bp.innerHTML=`<section class="bloco"><div class="bloco-topo"><h2>Fatura fechada a pagar</h2></div>
        <div class="pagar">
          <div class="pg-t"><b>${brl(pagar.bruto)}</b>
            <small>fechou em ${dataBR(iso(pagar.fecha))} · ${d===0?'vence hoje':d===1?'vence amanhã':'vence em '+d+' dias'} (${dataBR(iso(pagar.vence))})</small></div>
          <button class="btn" id="btnPagouFatura">Já paguei</button>
        </div>
        <p class="ajuda" style="margin:10px 0 0">É a fatura que já fechou — a que está em formação agora só é cobrada em ${vence}.</p>
      </section>`;
      $('#btnPagouFatura').onclick=()=>{
        pagar.ref.pago=iso(hojeD());
        render(); salvar(); vibrar(14);
        snack('Fatura de '+dataBR(iso(pagar.fecha))+' marcada como paga.','Desfazer',()=>{
          delete pagar.ref.pago; render(); salvar(); toast('Desfeito');
        });
      };
    }
  }
}

function renderMeta(c){
  pintarChipsMeta();
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
/* A fatura arquivada guarda as fatias congeladas desde esta versão. As de
   antes só têm o total em `pai`, e para elas o melhor que dá pra dizer é
   "outra pessoa" — era só isso que o app sabia quando elas fecharam. */
function fatiasDoHist(x){
  if(Array.isArray(x.pessoas)&&x.pessoas.length) return x.pessoas;
  return x.pai>0?[{id:'',nome:'Outra pessoa',cor:'var(--pai)',valor:x.pai}]:[];
}
/* "Já me pagou" mora na própria fatura arquivada (`x.recebido`), com a data.
   Fica preso ao mês certo: cobrar de novo o que já foi pago é o erro que
   estraga a relação com quem divide a conta. */
function recebeuDe(x,id){ return !!(x.recebido&&x.recebido[id||'']); }
function alternarRecebido(x,id){
  x.recebido=x.recebido||{};
  const k=id||'';
  if(x.recebido[k]){ delete x.recebido[k]; }
  else { x.recebido[k]=iso(hojeD()); vibrar(12); }
  renderHist(); salvar();
}
/* A lista do que cobrar numa fatura fechada: cada pessoa com os itens dela,
   o total, o botão de enviar e o de marcar que já pagou. */
function blocoCobrancas(x){
  const gs=cobrancas(x.itens,fatiasDoHist(x));
  if(!gs.length) return '';
  const quando=dataBR(x.data);
  const falta=gs.filter(g=>!recebeuDe(x,g.id)).reduce((t,g)=>t+g.total,0);
  const pagos=gs.filter(g=>recebeuDe(x,g.id)).length;
  return `<h3>Para cobrar · ${brl(falta)}</h3>
   <p class="ajuda" style="margin:-6px 0 12px">O que cada pessoa deve desta fatura, item a item.
     ${pagos?`<b>${pagos}</b> já ${pagos===1?'acertou':'acertaram'}.`:'Toque em <b>Enviar</b> para mandar a lista pronta.'}</p>`
   +gs.map(g=>{
     const pago=recebeuDe(x,g.id);
     return `<div class="cobranca${pago?' pago':''}">
      <div class="cb-topo">
        <span class="cb-ini" style="background:color-mix(in srgb,${g.cor} 16%,transparent);color:${g.cor}"
          >${esc(g.nome.trim().charAt(0).toUpperCase()||'?')}</span>
        <div class="cb-nome">${esc(g.nome)}<small>${g.itens.length} gasto${g.itens.length===1?'':'s'}${pago?' · pago em '+dataBR(x.recebido[g.id||''])
          :''}</small></div>
        <div class="cb-v" style="color:${pago?'var(--txt-3)':g.cor}">${brl(g.total)}</div>
      </div>
      <div class="cb-itens">${g.itens.map(i=>`<div class="cb-i">
        <span class="pt" style="background:${CATS[i.cat]?CATS[i.cat].c:'var(--cout)'}"></span>
        <span class="cb-in">${esc(i.nome)}</span>
        <span class="cb-iv">${brl(i.valor)}${i.cheio>i.valor+0.005?`<small>de ${brl(i.cheio)}</small>`:''}</span>
      </div>`).join('')}</div>
      <div class="cb-acoes">
        <button class="btn sec" data-cobrar="${esc(g.id)}">${navigator.share?'Enviar':'Copiar'} cobrança</button>
        <button class="btn-pago${pago?' on':''}" data-recebi="${esc(g.id)}"
          aria-pressed="${pago?'true':'false'}">${pago?'✓ recebido':'Já recebi'}</button>
      </div></div>`;}).join('');
}

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
    :l.tipo==='parc'?`<span class="tag ciclop">parcela</span>`:'<span class="tag ciclo1">única</span>';
  const vencX=x.venc?dataDeISO(x.venc):vencDaFatura(dataDeISO(x.data));
  dc.innerHTML=`<h3>Fatura que fechou em ${dataBR(x.data)}</h3>
   <p class="ajuda" style="margin:-4px 0 12px">Cobrada no vencimento de <b>${dataBR(iso(vencX))}</b>${x.pago?' · <b style="color:var(--verde)">paga</b>':''}.</p>
   <div class="cards">
     <div class="card"><div class="l">Fatura do cartão</div><div class="v">${brl(x.bruto)}</div></div>
     ${+x.avista>0?`<div class="card" style="border-color:var(--teal)"><div class="l">Fora da fatura</div><div class="v" style="color:var(--teal)">${brl(x.avista)}</div><div class="n">Pix, débito ou dinheiro</div></div>`:''}
     <div class="card"><div class="l">Meu</div><div class="v" style="color:var(--verde)">${brl(x.meu)}</div></div>
     ${fatiasDoHist(x).map(f=>`<div class="card"><div class="l">De ${esc(f.nome)}</div><div class="v" style="color:${f.cor}">${brl(f.valor)}</div></div>`).join('')}
     ${ant?`<div class="card"><div class="l">Contra o mês anterior</div><div class="v" style="color:${x.meu>ant.meu?'var(--vermelho)':'var(--verde)'}">${x.meu>ant.meu?'+':'−'}${brl(Math.abs(x.meu-ant.meu))}</div></div>`:''}
   </div>
   ${blocoCobrancas(x)}
   ${cats.length?'<h3>Por categoria</h3>'+cats.map(([k,v])=>{
      const antV=ant&&ant.porCat?(ant.porCat[k]||0):null;
      const d=antV===null?null:v-antV;
      return `<div class="teto" style="padding:10px 0">
        <div class="teto-l"><span class="teto-nome" style="font-size:15px"><span class="pt" style="background:${CATS[k]?CATS[k].c:'var(--cout)'}"></span>${CATS[k]?CATS[k].n:k}</span>
        <span class="teto-n">${brl(v)}${d===null?'':' <b style="color:'+(d>0?'var(--vermelho)':'var(--verde)')+'">'+(d>0?'+':'−')+brl(Math.abs(d))+'</b>'}</span></div>
        <div class="trilho"><i style="--p:${x.meu>0?Math.min(v/x.meu,1).toFixed(4):0};background:${CATS[k]?CATS[k].c:'var(--cout)'}"></i></div>
      </div>`;}).join(''):''}
   ${itens.length?`<h3>${itens.length} lançamentos</h3>
     <table><thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Fatura</th><th style="text-align:right">Meu</th></tr></thead><tbody>`+
     itens.map(l=>`<tr><td>${esc(l.nome)} ${selo(l)}<div style="font-size:12px;color:var(--txt-3)">${esc(l.fonte||'Conta')}</div></td>
      <td>${CATS[l.cat]?CATS[l.cat].n:l.cat}</td><td class="v">${brl(l.valor)}</td>
      <td class="v" style="font-weight:600">${brl(Math.max(l.valor-(l.pai||0),0))}</td></tr>`).join('')+
     `</tbody></table>`:''}`;
  const gs=cobrancas(x.itens,fatiasDoHist(x));
  dc.querySelectorAll('[data-cobrar]').forEach(b=>b.onclick=()=>{
    const g=gs.find(g=>String(g.id)===b.dataset.cobrar); if(g) enviarCobranca(g,dataBR(x.data));
  });
  dc.querySelectorAll('[data-recebi]').forEach(b=>b.onclick=()=>alternarRecebido(x,b.dataset.recebi));
}

/* ══════════════════════ ORÇAMENTO ADAPTATIVO ══════════════════════

   O teto de cada categoria deixou de ser uma regra genérica. Antes o app
   dividia o disponível pelos pesos fixos de CATS — os mesmos para todo mundo —
   e quem quase não faz mercado mas vive dentro do carro recebia R$ 700 de teto
   de mercado e um teto de transporte que estourava todo mês. A distribuição
   estava certa na média e errada em cada pessoa.

   Agora o app APRENDE do histórico de faturas fechadas e propõe uma
   distribuição que reflete o gasto real. Três regras governam isto:

   1. **Nunca aplica sozinho.** Toda sugestão aparece com o motivo escrito e um
      botão. Mexer no teto de alguém sem explicar é o mesmo que errar.
   2. **Aprende de faturas FECHADAS**, não do ciclo aberto. O ciclo em formação
      está pela metade; entrar na média puxaria todo teto para baixo no dia 6 e
      para cima no dia 28. O ciclo aberto tem outro papel — a previsão, lá
      embaixo.
   3. **Muda devagar.** A média é ponderada entre quatro janelas (1, 3, 6 e 12
      ciclos). Um mês fora da curva mexe pouco; um hábito novo que se manteve
      por três meses mexe de verdade.

   Sem inteligência remota nenhuma: é estatística do próprio histórico, rodando
   no aparelho. O app não fala com serviço de terceiro — a decisão de projeto
   do `auth.js` vale aqui também. */

/* Quatro janelas, quatro pesos. O recente pesa mais, mas nunca sozinho: sem as
   janelas longas, um mês atípico (a viagem de julho, o pneu que estourou)
   viraria o novo normal do orçamento. */
const JANELAS=[{n:1,peso:.40},{n:3,peso:.30},{n:6,peso:.20},{n:12,peso:.10}];
const MIN_CICLOS=2;                 // abaixo disto o app diz que ainda está aprendendo

const mediaDe=(hist,k,n)=>{
  const usa=hist.slice(0,n); if(!usa.length) return null;
  return usa.reduce((s,x)=>s+(+x.porCat[k]||0),0)/usa.length;
};
/* Uma janela que o histórico ainda não cobre inteira vale proporcionalmente
   menos — com três faturas na conta, a janela de 12 meses opina pouco em vez de
   opinar com dados que não existem. */
function mediaPonderada(hist,k){
  let soma=0,peso=0;
  JANELAS.forEach(j=>{
    const m=mediaDe(hist,k,j.n); if(m===null) return;
    const cobertura=Math.min(hist.length,j.n)/j.n;
    soma+=m*j.peso*cobertura; peso+=j.peso*cobertura;
  });
  return peso?soma/peso:0;
}
/* O "mês ruim típico": o segundo maior dos últimos seis, não o maior. O maior é
   o acidente (a revisão dos 40 mil km); o segundo maior é o mês apertado que se
   repete, e é ele que o teto precisa aguentar sem virar alarme falso. */
function picoTipico(hist,k,n){
  const vs=hist.slice(0,n).map(x=>+x.porCat[k]||0).sort((a,b)=>b-a);
  if(!vs.length) return 0;
  return vs.length>=3?vs[1]:vs[0];
}
/* Quanto o gasto pula de um mês para o outro. Categoria estável (assinatura)
   precisa de pouca folga; categoria que oscila (carro) precisa de mais, senão o
   teto vive estourando por um mês que era previsível. */
function volatilidade(hist,k,n){
  const vs=hist.slice(0,n).map(x=>+x.porCat[k]||0);
  if(vs.length<2) return .5;
  const m=vs.reduce((s,v)=>s+v,0)/vs.length; if(m<=0) return 0;
  const dp=Math.sqrt(vs.reduce((s,v)=>s+(v-m)*(v-m),0)/vs.length);
  return dp/m;
}
const folgaDe=v=> v<.25?1.12 : v<.6?1.25 : 1.4;
/* Teto com cara de teto: R$ 250, não R$ 247,80. Um número redondo é uma
   decisão; um número quebrado parece resultado de conta e ninguém confia. */
const arredondaTeto=v=> v<=0?0 : v<200?Math.ceil(v/10)*10 : v<1000?Math.ceil(v/25)*25 : Math.ceil(v/50)*50;

/* O que o app propõe para cada categoria, com o porquê em texto.

   Devolve `null` enquanto não houver histórico suficiente — e quem chama mostra
   "ainda estou aprendendo" em vez de inventar um número com uma fatura só. */
function orcamentoAdaptativo(c){
  const hist=(S.hist||[]).filter(x=>x&&x.porCat);
  const n=hist.length;
  if(n<MIN_CICLOS||!(c.disponivel>0)) return {aprendendo:true,ciclos:n,faltam:Math.max(MIN_CICLOS-n,0)};

  const jan=Math.min(n,6);
  const cats=Object.keys(CATS).map(k=>{
    const media=mediaPonderada(hist,k);
    const pico=picoTipico(hist,k,jan);
    const vol=volatilidade(hist,k,jan);
    const bruto=Math.max(media*folgaDe(vol),pico);
    return {k,nome:CATS[k].n,cor:CATS[k].c,media,pico,vol,bruto,
            m1:mediaDe(hist,k,1),m3:mediaDe(hist,k,3),m6:mediaDe(hist,k,6),m12:mediaDe(hist,k,12),
            atual:c.tetos[k]||0, fixado:+S.tetos[k]>0};
  });

  /* Categoria que a pessoa não usa não recebe teto de enfeite: recebe um piso
     pequeno, só pra um gasto avulso não nascer estourado. O dinheiro que sobra
     dali é o ponto inteiro desta tela. */
  const piso=Math.max(c.disponivel*.02,30);
  cats.forEach(x=>{ x.bruto=x.media>0?Math.max(x.bruto,piso):Math.min(piso,60); });

  const somaBruta=cats.reduce((s,x)=>s+x.bruto,0);
  let sobra=c.disponivel-somaBruta, apertado=false;
  if(sobra<0){
    /* O padrão de gasto pede mais do que cabe depois de guardar. O corte sai
       primeiro do que a própria pessoa classifica como cortável — lazer, comida
       fora, assinatura — e só depois, se ainda faltar, de todo mundo. Cortar
       proporcionalmente logo de cara tiraria do mercado tanto quanto do rolê. */
    apertado=true;
    const cortavel=['lazer','comida','assinatura'];
    let falta=-sobra;
    const podeCortar=cats.filter(x=>cortavel.includes(x.k)&&x.bruto>piso);
    const folgaCortavel=podeCortar.reduce((s,x)=>s+(x.bruto-piso),0);
    if(folgaCortavel>0){
      const tira=Math.min(falta,folgaCortavel);
      podeCortar.forEach(x=>{ x.bruto-=tira*((x.bruto-piso)/folgaCortavel); });
      falta-=tira;
    }
    if(falta>0.5){
      const total=cats.reduce((s,x)=>s+x.bruto,0)||1;
      cats.forEach(x=>{ x.bruto=Math.max(x.bruto-falta*(x.bruto/total),0); });
    }
    sobra=0;
  }

  cats.forEach(x=>{ x.sugerido=arredondaTeto(x.bruto); });
  /* O arredondamento é pra cima — o que é certo num teto e errado numa soma.
     Somados, os arredondamentos podem passar do disponível, e um painel que
     distribui mais do que existe não vale nada. Então o excesso volta, tirado
     sempre do maior teto: R$ 25 a menos em R$ 1.050 não muda a vida de
     ninguém; os mesmos R$ 25 tirados de R$ 80 zeram a categoria. */
  const passoDe=v=> v<200?10 : v<1000?25 : 50;
  let guarda=0;
  while(cats.reduce((s,x)=>s+x.sugerido,0)>c.disponivel+.5&&guarda++<600){
    const alvo=cats.slice().sort((a,b)=>b.sugerido-a.sugerido)[0];
    if(!alvo||alvo.sugerido<=0) break;
    alvo.sugerido=Math.max(alvo.sugerido-passoDe(alvo.sugerido),0);
  }
  cats.forEach(x=>{
    x.delta=x.sugerido-x.atual;
    x.usoPct=x.atual>0?x.media/x.atual:null;
    x.motivo=motivoDoTeto(x,n,jan);
  });
  const somaFinal=cats.reduce((s,x)=>s+x.sugerido,0);
  sobra=Math.max(c.disponivel-somaFinal,0);

  const mudam=cats.filter(x=>Math.abs(x.delta)>=Math.max(c.disponivel*.01,20))
                  .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return {aprendendo:false,ciclos:n,cats,mudam,sobra,apertado,
          perfil:perfilFinanceiro(hist,c),
          soma:somaFinal};
}

/* A frase que acompanha cada sugestão. Nenhum teto muda sem ela: a pessoa tem
   que conseguir discordar, e pra discordar precisa saber do quê. */
function motivoDoTeto(x,n,jan){
  const ciclos=Math.min(n,jan);
  const base=`Média de <b>${brl(x.media)}</b> por mês nas últimas ${ciclos} faturas`;
  if(x.media<=0)
    return `Você nunca lançou nada aqui. O teto fica no mínimo, só pra um gasto avulso não nascer estourado.`;
  if(x.usoPct!==null&&x.usoPct<.5&&x.delta<0)
    return `${base} — <b>${pct(x.usoPct)}</b> do teto de hoje (${brl(x.atual)}). Sobra ${brl(x.atual-x.sugerido)} pra quem precisa mais.`;
  if(x.delta>0)
    return `${base}, e seu mês apertado típico chega a <b>${brl(x.pico)}</b>. O teto de hoje (${brl(x.atual)}) estoura sozinho.`;
  return `${base}. O teto sugerido cobre seu mês apertado típico (${brl(x.pico)}) com folga.`;
}

/* ---------- o perfil sai dos números, não de um questionário ----------

   Ninguém se descreve bem: quem gasta 40% em restaurante se considera econômico
   porque não viaja. As regras abaixo leem a proporção real dos últimos ciclos e
   a taxa do que sobra. A ordem importa — a primeira que casa ganha, e as mais
   específicas (viajante, automotivo) vêm antes das genéricas. */
const PERFIS=[
  {id:'viajante', nome:'Perfil Viajante', teste:(p,g,e)=>e.viagem>=.12,
   diz:p=>`Viagem, hotel e passagem aparecem em boa parte do seu lazer — o orçamento respeita isso em vez de tratar como excesso.`},
  {id:'automotivo',nome:'Perfil Automotivo', teste:p=>p.transporte>=.28,
   diz:p=>`<b>${pct(p.transporte)}</b> do seu gasto é carro: combustível, manutenção, estacionamento. É a sua maior conta, e o teto acompanha.`},
  {id:'familia',  nome:'Perfil Família', teste:p=>(p.mercado+p.casa)>=.5,
   diz:p=>`Mercado e casa somam <b>${pct(p.mercado+p.casa)}</b> do que você gasta — orçamento de quem sustenta uma casa, não de quem só se sustenta.`},
  {id:'social',   nome:'Perfil Social', teste:p=>(p.comida+p.lazer)>=.33,
   diz:p=>`Comida fora e lazer somam <b>${pct(p.comida+p.lazer)}</b>. Não é desperdício — é onde seu dinheiro te dá prazer, e o app conta com isso.`},
  {id:'investidor',nome:'Perfil Investidor', teste:(p,g)=>g.taxa>=.25,
   diz:(p,g)=>`Você guarda <b>${pct(g.taxa)}</b> do que ganha. O orçamento trabalha pra proteger essa taxa, não pra gastá-la.`},
  {id:'economico',nome:'Perfil Econômico', teste:(p,g)=>g.usoRenda<=.6,
   diz:(p,g)=>`Seus gastos ocupam <b>${pct(g.usoRenda)}</b> da renda. Sobra folga real todo mês — a pergunta deixou de ser "cabe?" e passou a ser "pra onde vai?".`},
  {id:'equilibrado',nome:'Perfil Equilibrado', teste:()=>true,
   diz:()=>`Nenhuma categoria domina seus gastos. O orçamento aqui é de afinação fina, não de corte.`}
];
const TERMOS_VIAGEM=/viagem|hotel|pousada|airbnb|passagem|aereo|milhas|excursao|resort/;
function perfilFinanceiro(hist,c){
  const usa=hist.slice(0,6);
  const tot=usa.reduce((s,x)=>s+(+x.meu||0),0)||1;
  const p={}; Object.keys(CATS).forEach(k=>{ p[k]=usa.reduce((s,x)=>s+(+x.porCat[k]||0),0)/tot; });
  const mediaMes=tot/usa.length;
  const g={taxa:c.renda>0?Math.max(c.renda-mediaMes,0)/c.renda:0, usoRenda:c.renda>0?mediaMes/c.renda:1};
  const viagem=usa.flatMap(x=>x.itens||[]).filter(l=>TERMOS_VIAGEM.test(semAcento(l.nome||'')))
                  .reduce((s,l)=>s+Math.max(l.valor-(+l.pai||0),0),0)/(tot||1);
  const e={viagem};
  const achado=PERFIS.find(x=>x.teste(p,g,e))||PERFIS[PERFIS.length-1];
  return {id:achado.id,nome:achado.nome,frase:achado.diz(p,g,e),partes:p,geral:g};
}

/* ---------- previsão: avisar ANTES de estourar ----------

   O aviso que chega quando o teto já estourou não serve pra nada: o dinheiro
   saiu. Aqui o app olha o RITMO do ciclo aberto e diz em quantos dias a
   categoria bate no teto, enquanto ainda dá pra decidir. */
function previsoes(c){
  const dias=diasRestantes();
  const decorridos=Math.max(Math.round((hojeD()-ultimoFechPassado())/86400000),1);
  if(decorridos<5||dias<=0) return [];      // ritmo de três dias não é ritmo, é ruído
  return Object.keys(CATS).map(k=>{
    const g=c.porCat[k]||0, t=c.tetos[k]||0;
    if(!(t>0)||!(g>0)) return null;
    const ritmo=g/decorridos, proj=ritmo*(decorridos+dias);
    if(proj<=t*1.02) return null;
    const faltam=Math.max(Math.ceil((t-g)/ritmo),0);
    if(faltam>dias) return null;
    return {k,nome:CATS[k].n,cor:CATS[k].c,gasto:g,teto:t,proj,faltam,
            usoPct:g/t,estouro:proj-t};
  }).filter(Boolean).sort((a,b)=>a.faltam-b.faltam);
}

function renderTetos(c){
  $('#cardsTeto').innerHTML=`
   <div class="card"><div class="l">Disponível pra gastar</div><div class="v">${brl(c.disponivel)}</div><div class="n">renda menos o que guarda</div></div>
   <div class="card"><div class="l">Meu gasto de hoje</div><div class="v" style="color:${c.gasto>c.disponivel?'var(--alerta)':'var(--verde)'}">${brl(c.gasto)}</div><div class="n">${fraseFatias(c)}</div></div>
   <div class="card" style="${c.somaExcesso>0?'border-color:var(--alerta)':''}"><div class="l">Estourando o teto</div><div class="v" style="color:${c.somaExcesso>0?'var(--alerta)':'var(--verde)'}">${brl(c.somaExcesso)}</div><div class="n">${c.somaExcesso>0?'é isso que precisa sair':'nenhuma categoria passou'}</div></div>`;
  const its=Object.entries(CATS).sort((a,b)=>(c.porCat[b[0]]||0)-(c.porCat[a[0]]||0));
  $('#tetos').innerHTML=its.map(([k,cat])=>{
    const g=c.porCat[k]||0, t=c.tetos[k]||0, dif=t-g;
    const p=t>0?Math.min(g/t*100,100):0, cor=g>t?'var(--alerta)':cat.c;
    return `<div class="teto">
      <div class="teto-l"><span class="teto-nome"><span class="pt" style="background:${cat.c}"></span>${cat.n}</span>
      <span class="teto-n">${brl(g)} de ${brl(t)}${c.renda?' · '+pct(t/c.renda)+' da renda':''}</span></div>
      <div class="trilho"><i style="--p:${(p/100).toFixed(4)};background:${cor}"></i></div>
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
  renderOrcaIA(c);
  $('#notaTeto').innerHTML = (c.gasto>c.disponivel&&c.renda>0)
    ? `<div class="nota aviso">Seus gastos passam em ${brl(c.gasto-c.disponivel)} do disponível depois de guardar. Ou o corte sai das categorias em vermelho, ou a meta cai — não tem terceira opção.</div>` : '';
}

/* A tela do orçamento adaptativo. Três blocos, nesta ordem, porque é a ordem em
   que as perguntas aparecem na cabeça de quem abre: quem eu sou pro app, o que
   ele quer mudar e por quê, e o que fazer com o que sobrar. */
function renderOrcaIA(c){
  const el=$('#orcaIA'); if(!el) return;
  if(!(c.renda>0)){ el.innerHTML=''; return; }
  const o=orcamentoAdaptativo(c);

  if(o.aprendendo){
    el.innerHTML=`<div class="orca">
      <div class="orca-cab"><span class="orca-selo">Orçamento adaptativo</span></div>
      <p class="orca-vazio">Ainda estou aprendendo seu padrão de gasto. ${o.ciclos?`Tenho <b>${o.ciclos}</b> fatura fechada`:'Nenhuma fatura fechou ainda'} — com mais <b>${o.faltam}</b> eu passo a propor um teto por categoria com o SEU gasto real, em vez da divisão padrão. Até lá, trave na mão o que você já souber.</p></div>`;
    return;
  }

  const p=o.perfil;
  const oculto=(S.orcaOculto===o.ciclos);
  const pv=previsoes(c);

  const cabecalho=`<div class="orca-cab">
      <span class="orca-selo">Orçamento adaptativo</span>
      <span class="orca-base">aprendido de ${o.ciclos} fatura${o.ciclos===1?'':'s'} fechada${o.ciclos===1?'':'s'}</span></div>
    <div class="orca-perfil"><b>${esc(p.nome)}</b><span>${p.frase}</span></div>`;

  /* Previsão primeiro quando existe: é o único bloco com prazo. Um teto que vai
     estourar em 8 dias importa mais do que a distribuição do mês que vem. */
  const blocoPrev=pv.length?`<div class="orca-prev">
      ${pv.map(x=>`<div class="orca-p1">
        <div class="orca-t"><span class="pt" style="background:${x.cor}"></span><b>${esc(x.nome)}</b>
          <span class="tag ciclov">estoura em ${x.faltam} dia${x.faltam===1?'':'s'}</span></div>
        <p class="orca-p">Você já usou <b>${pct(x.usoPct)}</b> do teto (${brl(x.gasto)} de ${brl(x.teto)}). No ritmo deste ciclo o mês fecha em <b>${brl(x.proj)}</b> — ${brl(x.estouro)} acima.</p>
        <div class="orca-acoes">
          <button class="btn sec mini" data-orca1="${x.k}">Ajustar este teto ao meu padrão</button>
          <button class="btn sec mini" data-ir="plano:tetos">Manter como está</button>
        </div></div>`).join('')}
    </div>`:'';

  let corpo;
  if(oculto){
    corpo=`<p class="orca-vazio">Sugestões dispensadas. Elas voltam quando a próxima fatura fechar —
      ou <button class="link" data-orca-rever="1">rever agora</button>.</p>`;
  }else if(!o.mudam.length){
    corpo=`<p class="orca-vazio">Seus tetos já batem com o seu padrão de gasto. Não tenho nada a propor este mês — e isso é uma boa notícia.</p>`;
  }else{
    corpo=`<div class="orca-lista">${o.mudam.map(x=>`
      <div class="orca-l">
        <div class="orca-t"><span class="pt" style="background:${x.cor}"></span><b>${esc(x.nome)}</b>
          <span class="orca-de">${brl(x.atual)} <i>→</i> <b style="color:${x.delta>0?'var(--alerta)':'var(--verde)'}">${brl(x.sugerido)}</b></span>
          ${x.fixado?'<span class="tag ciclo1">travado por você</span>':''}</div>
        <p class="orca-p">${x.motivo}</p>
        <div class="orca-acoes"><button class="btn sec mini" data-orca1="${x.k}">Aplicar só este</button></div>
      </div>`).join('')}</div>
      <div class="orca-acoes orca-fim">
        <button class="btn" data-orca-tudo="1">Aplicar o orçamento sugerido</button>
        <button class="btn sec" data-orca-nao="1">Agora não</button>
      </div>`;
  }

  /* A sobra não fica parada. Ela é o resultado inteiro da redistribuição: o
     dinheiro que estava reservado pra uma categoria que a pessoa não usa. */
  const blocoSobra=(!oculto&&o.sobra>=20)?`<div class="orca-sobra">
      <div class="orca-t"><b>Sobram ${brl(o.sobra)} por mês</b></div>
      <p class="orca-p">É o que estava reservado pra categorias que você não usa. Depois de dar a cada uma o que o seu histórico pede, esse dinheiro fica sem dono — e dinheiro sem dono vira gasto sem querer.</p>
      <div class="orca-acoes">
        <button class="btn" data-orca-meta="${o.sobra.toFixed(2)}">Guardar ${brl(o.sobra)} a mais por mês</button>
        <button class="btn sec" data-ir="plano:objetivos">Pôr num objetivo</button>
      </div></div>`:'';

  const blocoApertado=o.apertado?`<div class="nota aviso" style="margin:14px 0 0">Seu padrão de gasto pede mais do que cabe depois de guardar ${brl(c.meta)}. Os tetos sugeridos já vêm cortados — o corte saiu de lazer, comida fora e assinaturas primeiro, que é o que você mesmo classifica como cortável. Se não for por aí, a meta é que precisa ceder.</div>`:'';

  el.innerHTML=`<div class="orca">${cabecalho}${blocoPrev}${corpo}${blocoSobra}${blocoApertado}</div>`;

  el.querySelectorAll('[data-orca1]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.orca1, x=o.cats.find(y=>y.k===k); if(!x) return;
    S.tetos[k]=x.sugerido;
    render(); salvar(); vibrar(12);
    toast(CATS[k].n+': teto agora é '+brl(x.sugerido));
  });
  const b1=el.querySelector('[data-orca-tudo]');
  if(b1) b1.onclick=()=>{
    /* Aplica TODAS as categorias, não só as que mudam muito: o retrato tem que
       fechar com o disponível, senão a soma dos tetos passa a não bater com
       nenhuma conta da tela. */
    o.cats.forEach(x=>{ S.tetos[x.k]=x.sugerido; });
    S.orcaEm=iso(hojeD()); S.orcaOculto=null;
    render(); salvar(); vibrar(18);
    toast('Orçamento ajustado ao seu padrão');
    snack('Tetos redistribuídos pelo seu histórico.','Desfazer',()=>{
      o.cats.forEach(x=>{ if(x.fixado) S.tetos[x.k]=x.atual; else delete S.tetos[x.k]; });
      S.orcaEm=null; render(); salvar(); toast('Desfeito');
    });
  };
  const b2=el.querySelector('[data-orca-nao]');
  if(b2) b2.onclick=()=>{ S.orcaOculto=o.ciclos; render(); salvar(); toast('Volto quando a próxima fatura fechar'); };
  const b3=el.querySelector('[data-orca-rever]');
  if(b3) b3.onclick=()=>{ S.orcaOculto=null; render(); salvar(); };
  const b4=el.querySelector('[data-orca-meta]');
  if(b4) b4.onclick=()=>{
    /* Guardar mais é mexer na META, e a meta em valor manda sobre a meta em
       porcentagem — por isso vira valor fixo aqui, com o número que a pessoa
       leu na tela. */
    const nova=c.meta+(+b4.dataset.orcaMeta||0);
    S.metaVal=+nova.toFixed(2);
    preencherCampos(); render(); salvar(); vibrar(18);
    toast('Meta de guardar: '+brl(nova)+' por mês');
    snack('Você passou a guardar '+brl(nova)+' por mês.','Desfazer',()=>{
      S.metaVal=+(nova-(+b4.dataset.orcaMeta||0)).toFixed(2);
      if(S.metaVal<=0) S.metaVal=0;
      preencherCampos(); render(); salvar(); toast('Desfeito');
    });
  };
}


/* ---------- quem paga: um select, uma pessoa ----------

   Antes eram três opções fixas — Eu, Dividido, Outra pessoa — e a "outra
   pessoa" era sempre a mesma, anônima. Agora o mesmo select lista, para cada
   pessoa cadastrada, as duas situações que existem de verdade: dividido com
   ela, ou por conta dela. Em um controle só, e sem deixar escolher "dividido"
   sem dizer com quem. */
function opcoesPagador(l,curto){
  const val=+l.valor||0, pago=Math.min(+l.pai||0,val);
  const atual=!pago?'eu':((pago>=val&&val>0?'t:':'d:')+(l.com||''));
  const lista=pessoas().slice();
  // Pessoa apagada, ou gasto de antes da migração: continua aparecendo, senão
  // o select mostraria "Eu" para um gasto que não é só seu.
  if(pago>0&&!achaPessoa(l.com)) lista.unshift({id:l.com||'',nome:nomePessoa(l.com)});
  const op=(v,txt)=>`<option value="${esc(v)}"${v===atual?' selected':''}>${esc(txt)}</option>`;
  /* Na tabela o rótulo é curto de propósito: a coluna cabe em 430px de tela e
     "Dividido com Mãe" a espremia até virar "Divi". O nome por extenso fica
     embaixo da descrição, que é a coluna que nunca sai da tela. */
  return op('eu',curto?'Eu':'Eu, sozinho')
    +lista.map(p=>op('d:'+p.id,curto?'Com '+p.nome:'Dividido com '+p.nome)
                 +op('t:'+p.id,curto?p.nome+' paga':p.nome+' paga tudo')).join('')
    +`<option value="+">${curto?'+ pessoa…':'+ Nova pessoa…'}</option>`;
}
function aplicarPagador(l,v){
  if(v==='eu'){ l.pai=0; l.com=''; return; }
  const [modo,id]=String(v).split(':'), val=+l.valor||0;
  l.com=id||'';
  if(modo==='t') l.pai=val;
  else if(!(+l.pai>0)||+l.pai>=val) l.pai=+(val/2).toFixed(2);
}
function pedirPessoa(){
  const n=prompt('Quem divide esse gasto com você?\n\nEscreva o nome como você chama a pessoa: Pai, Mãe, Ana…');
  if(n===null) return null;
  const p=criarPessoa(n);
  if(!p){ toast('Escreva um nome para a pessoa',true); return null; }
  return p;
}
function renomearPessoa(id){
  const p=achaPessoa(id); if(!p) return;
  const n=prompt('Novo nome para '+p.nome+':',p.nome);
  if(n===null) return;
  const lim=String(n).trim().replace(/\s+/g,' ').slice(0,28);
  if(!lim){ toast('O nome não pode ficar vazio',true); return; }
  p.nome=lim;
  render(); salvar(); toast('Agora é '+lim);
}
function removerPessoa(id){
  const p=achaPessoa(id); if(!p) return;
  const n=S.lanc.filter(l=>l.com===id&&+l.pai>0).length;
  if(!confirm('Remover '+p.nome+'?\n\n'+(n
      ? n+(n===1?' gasto deste ciclo volta a ser só seu.':' gastos deste ciclo voltam a ser só seus.')
      : 'Nenhum gasto deste ciclo está dividido com essa pessoa.')
    +'\nAs faturas já arquivadas continuam mostrando o nome.')) return;
  S.lanc.forEach(l=>{ if(l.com===id){ l.com=''; l.pai=0; } });
  S.pessoas=pessoas().filter(x=>x.id!==id);
  render(); salvar(); toast(p.nome+' saiu da lista');
}
/* A frase que aparece embaixo do "meu gasto de hoje". Com uma pessoa só, vale
   dizer o nome; com mais de uma, o nome de cada uma está logo ali no bloco
   "Dividido com" e repetir tudo aqui só faria a linha crescer. */
function fraseFatias(c){
  if(!(c.pai>0)) return '';
  return c.fatias.length===1
    ? 'sem os '+brl(c.fatias[0].valor)+' que '+c.fatias[0].nome+' cobre'
    : 'sem os '+brl(c.pai)+' de outras pessoas';
}

/* ---------- bloco "Dividido com" ---------- */
function renderPessoas(c){
  const sec=$('#blocoPessoas'), el=$('#pessoas');
  if(!sec||!el) return;
  const reg=pessoas();
  // Pessoa apagada que ainda tem gasto no ciclo entra na lista assim mesmo.
  const soltas=c.fatias.filter(f=>!achaPessoa(f.id));
  sec.hidden=!reg.length&&!soltas.length;
  if(sec.hidden){ el.innerHTML=''; return; }
  const linhas=reg.map(p=>({id:p.id,nome:p.nome,cor:p.cor||'var(--pai)'})).concat(soltas)
    .map(p=>{
      const itens=doCiclo().filter(l=>(l.com||'')===p.id&&+l.pai>0);
      const dela=itens.reduce((t,l)=>t+Math.min(+l.pai||0,l.valor),0);
      const minha=itens.reduce((t,l)=>t+meuValor(l),0);
      const n=itens.length;
      return {p,dela,minha,n};
    }).sort((a,b)=>b.dela-a.dela);
  const total=linhas.reduce((t,x)=>t+x.dela,0);
  /* Aberto por dentro: o total já existia, o que faltava era o "de quê". A
     lista fica recolhida para não empurrar o resto da tela — quem só quer o
     número continua vendo o número. */
  const prev={}; cobrancas(doCiclo()).forEach(g=>{ prev[g.id]=g; });
  el.innerHTML=linhas.map(({p,dela,minha,n})=>`<div class="item">
    <div class="ic" style="background:color-mix(in srgb,${p.cor} 14%,transparent);color:${p.cor}"
      ><span class="pessoa-ini">${esc(p.nome.trim().charAt(0).toUpperCase()||'?')}</span></div>
    <div class="tx"><div class="nm">${esc(p.nome)}</div>
      <div class="dt">${n?n+' gasto'+(n===1?'':'s')+' no ciclo · sua parte '+brl(minha):'nenhum gasto dividido neste ciclo'}
        ${achaPessoa(p.id)?`<button class="link" data-ren="${esc(p.id)}">renomear</button>`:''}</div></div>
    <div class="vl" style="color:${dela>0?p.cor:'var(--txt-3)'}">${brl(dela)}${dela>0?'<small>não é seu</small>':''}</div>
    ${achaPessoa(p.id)?`<button class="rm" data-rmp="${esc(p.id)}" aria-label="Remover ${esc(p.nome)}">×</button>`:''}
  </div>`+(prev[p.id]?`<details class="previa"><summary>${prev[p.id].itens.length===1?'ver o gasto':'ver os '+prev[p.id].itens.length+' gastos'} de ${esc(p.nome)}</summary>
    <div class="cb-itens">${prev[p.id].itens.map(i=>`<div class="cb-i">
      <span class="pt" style="background:${CATS[i.cat]?CATS[i.cat].c:'var(--cout)'}"></span>
      <span class="cb-in">${esc(i.nome)}</span>
      <span class="cb-iv">${brl(i.valor)}${i.cheio>i.valor+0.005?`<small>de ${brl(i.cheio)}</small>`:''}</span></div>`).join('')}</div>
    <button class="btn sec" data-prev="${esc(p.id)}" style="margin-top:10px">${navigator.share?'Enviar':'Copiar'} prévia</button>
   </details>`:'')).join('')
   +`<p class="ajuda" style="margin:12px 0 0">${total>0
      ? 'Ao todo <b>'+brl(total)+'</b> da fatura deste ciclo é de outra pessoa. Esse valor aparece na fatura, mas não entra nos seus tetos. A cobrança fechada, item a item e com o “já recebi”, aparece quando a fatura fechar — em <b>Análises → Faturas</b>.'
      : 'Marque quem divide cada gasto na coluna <b>Quem paga</b>, em “Todos os gastos do ciclo”.'}</p>
    <div class="nova-pessoa">
      <input id="pNome" maxlength="28" placeholder="Ex.: Mãe" aria-label="Nome da pessoa">
      <button class="btn sec" id="addPessoa">Adicionar pessoa</button></div>`;
  el.querySelectorAll('[data-prev]').forEach(b=>b.onclick=()=>{
    const g=prev[b.dataset.prev];
    // Prévia é prévia: o rótulo diz que a fatura ainda não fechou, senão a
    // pessoa do outro lado recebe uma cobrança que ainda vai mudar.
    if(g) enviarCobranca(g,'até agora (fecha em '+ddmm(faturaAberta().fecha)+')');
  });
  el.querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>renomearPessoa(b.dataset.ren));
  el.querySelectorAll('[data-rmp]').forEach(b=>b.onclick=()=>removerPessoa(b.dataset.rmp));
  const add=()=>{
    const p=criarPessoa($('#pNome').value);
    if(!p){ toast('Escreva um nome para a pessoa',true); $('#pNome').focus(); return; }
    $('#pNome').value=''; render(); salvar(); vibrar(12); toast(p.nome+' entrou na lista');
  };
  $('#addPessoa').onclick=add;
  $('#pNome').onkeydown=e=>{ if(e.key==='Enter') add(); };
}

function renderLanc(c){
  const fs=Object.entries(c.fontes).sort((a,b)=>b[1]-a[1]);
  $('#cards2').innerHTML='<div class="cards">'+
    `<div class="card"><div class="l">Fatura do cartão</div><div class="v">${brl(c.bruto)}</div><div class="n">é isto que vence</div></div>`+
    (c.avista>0?`<div class="card" style="border-color:var(--teal)"><div class="l">Fora da fatura</div><div class="v" style="color:var(--teal)">${brl(c.avista)}</div><div class="n">Pix, débito ou dinheiro — já saiu da conta</div></div>`:'')+
    `<div class="card" style="border-color:var(--verde)"><div class="l">Meu</div><div class="v" style="color:var(--verde)">${brl(c.gasto)}</div></div>`+
    c.fatias.map(f=>`<div class="card" style="border-color:${f.cor}"><div class="l">De ${esc(f.nome)}</div><div class="v" style="color:${f.cor}">${brl(f.valor)}</div><div class="n">está na fatura, não é gasto seu</div></div>`).join('')+
    fs.map(([f,v])=>`<div class="card"><div class="l">${esc(f)}</div><div class="v">${brl(v)}</div></div>`).join('')+
    (c.proxN>0?`<div class="card" style="border-color:var(--indigo)"><div class="l">Guardado pra próxima</div><div class="v" style="color:var(--indigo)">${brl(c.proxBruto)}</div><div class="n">${c.proxN} gasto${c.proxN===1?'':'s'} que só entram na fatura seguinte</div></div>`:'')+
    (c.futuro>0?`<div class="card" style="border-color:var(--alerta)"><div class="l">Parcelas por vir</div><div class="v" style="color:var(--alerta)">${brl(c.futuro)}</div><div class="n">sua parte, nos próximos meses</div></div>`:'')+'</div>';

  const tb=$('#tbLanc');
  if(!S.lanc.length){ tb.innerHTML='<tr><td colspan="7" class="vazio">Nenhum gasto neste ciclo.</td></tr>'; return; }
  const selo=l=>(l.tipo==='rec'||l.tipo==='fixo')?'<span class="tag ciclor">fixo</span>'
    :l.tipo==='var'?'<span class="tag ciclov">variável</span>'
    :l.tipo==='parc'?`<span class="tag ciclop">faltam ${l.pRest||0}x</span>`:'<span class="tag ciclo1">única</span>';
  /* Uma linha só, usada nas duas listas: a fatura aberta e a fila da seguinte.
     O botão do fim da segunda linha é o que move o gasto entre elas. */
  const linha=l=>`<tr${+l.prox>0?' class="lin-prox"':''}>
    <td>${esc(l.nome)} ${selo(l)}${+l.prox>0?' <span class="tag cicloprox">próxima fatura</span>':''}${naFatura(l)?'':' <span class="tag avista">à vista</span>'}<div style="font-size:11.5px;color:var(--txt-3)">${esc(l.fonte||'Conta')} · <span class="tag ${TIER[l.tier].cl}">${TIER[l.tier].n}</span>${+l.pai>0?` · <b style="color:${corPessoa(l.com)}">${esc(nomePessoa(l.com))}</b>`:''}
      · <button class="link mini" data-editar="${l.id}">editar</button>
      · <button class="link mini" data-meio="${l.id}">${naFatura(l)?'foi no Pix':'foi no cartão'}</button>${naFatura(l)?`
      · <button class="link mini" data-prox="${l.id}">${+l.prox>0?'trazer pra esta fatura':'jogar pra próxima'}</button>`:''}</div></td>
    <td><span class="pt" style="background:${CATS[l.cat].c}"></span><select data-cat="${l.id}" aria-label="Categoria de ${esc(l.nome)}"
        style="padding:5px 6px;font-size:12.5px;min-width:104px">${opcoesCat(l.cat)}</select></td>
    <td><select data-pag="${l.id}" style="padding:5px 6px;font-size:12.5px;min-width:102px">${opcoesPagador(l,true)}</select></td>
    <td class="v"><input type="number" min="0" step="0.01" data-val="${l.id}" value="${l.valor||''}" placeholder="0,00"
        style="width:100px;padding:5px 7px;text-align:right;font-size:13px">
        ${(!l.valor&&l.ref)?`<div style="font-size:11px;color:var(--txt-3)">mês passado ${brl(l.ref)}</div>`:''}</td>
    <td class="v"><input type="number" min="0" step="0.01" data-pai="${l.id}" value="${l.pai||''}" placeholder="0,00"
        style="width:96px;padding:5px 7px;text-align:right;font-size:13px"
        aria-label="Quanto ${+l.pai>0?esc(nomePessoa(l.com)):'a outra pessoa'} cobre em ${esc(l.nome)}"></td>
    <td class="v" style="font-weight:700;color:${meuValor(l)===0?'var(--pai)':'inherit'}">${brl(meuValor(l))}</td>
    <td style="text-align:right"><button class="btn-x" data-del="${l.id}" aria-label="Remover">×</button></td></tr>`;
  const prox=daProxima(), fab=faturaAberta();
  tb.innerHTML=doCiclo().sort((a,b)=>b.valor-a.valor).map(linha).join('')
    /* Com gasto à vista no meio, uma linha de total só mentiria: a coluna
       "Na fatura" e a coluna "Meu" passam a somar coisas diferentes. Três
       linhas dizem a verdade inteira — o que vence no cartão, o que já saiu, e
       o que o ciclo custou ao todo. */
    +(c.avista>0
      ? `<tr class="total"><td colspan="3">Na fatura do cartão</td><td class="v">${brl(c.bruto)}</td><td></td><td></td><td></td></tr>`
       +`<tr class="total"><td colspan="3" style="font-weight:500;color:var(--txt-3)">Fora dela — Pix, débito ou dinheiro</td>
         <td class="v" style="color:var(--teal)">${brl(c.avista)}</td><td></td><td></td><td></td></tr>`
       +`<tr class="total"><td colspan="3">Total do ciclo</td><td class="v">${brl(c.bruto+c.avista)}</td>
         <td class="v" style="color:var(--pai)">${brl(c.pai)}</td><td class="v">${brl(c.gasto)}</td><td></td></tr>`
      : `<tr class="total"><td colspan="3">Total desta fatura</td><td class="v">${brl(c.bruto)}</td>
         <td class="v" style="color:var(--pai)">${brl(c.pai)}</td><td class="v">${brl(c.gasto)}</td><td></td></tr>`)
    +(prox.length?`<tr class="sep-prox"><td colspan="7">Guardado para a fatura seguinte — cobrada só em
        ${dataBR(iso(vencDaFatura(new Date(fab.fecha.getFullYear(),fab.fecha.getMonth()+1,fab.fecha.getDate()))))}.
        Não entra nos totais acima nem nos tetos deste ciclo.</td></tr>`
      +prox.sort((a,b)=>b.valor-a.valor).map(linha).join('')
      +`<tr class="total"><td colspan="3">Total da próxima</td><td class="v">${brl(c.proxBruto)}</td>
        <td class="v" style="color:var(--pai)">${brl(c.proxBruto-c.proxMeu)}</td><td class="v">${brl(c.proxMeu)}</td><td></td></tr>`:'');
  /* Trocar o meio de pagamento na própria lista: quem lançou no automático e
     só depois lembrou que pagou no Pix resolve aqui, sem reabrir formulário. */
  tb.querySelectorAll('[data-meio]').forEach(b=>b.onclick=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.currentTarget.dataset.meio); if(!l) return;
    if(naFatura(l)){
      l.meio='avista'; l.prox=0;                       // fora da fatura não tem "próxima fatura"
      if(!l.fonte||l.fonte==='Conta') l.fonte='Pix';
      toast(l.nome+' saiu da fatura — continua no seu gasto');
    }else{
      l.meio='cartao';
      if(l.fonte==='Pix') l.fonte='Conta';
      toast(l.nome+' voltou pra fatura do cartão');
    }
    render(); salvar(); vibrar(10);
  });
  tb.querySelectorAll('[data-prox]').forEach(b=>b.onclick=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.currentTarget.dataset.prox); if(!l) return;
    l.prox=+l.prox>0?0:1;
    render(); salvar(); vibrar(10);
    toast(+l.prox>0?'Só entra na próxima fatura':'Voltou pra fatura aberta');
  });
  /* Trocar a CATEGORIA na própria linha.

     Até aqui o palpite do nome era a única forma de categorizar: se ele errasse
     — "agua" caindo em Casa e contas quando era uma garrafa de água — o único
     jeito de arrumar era apagar o gasto e lançar de novo. E o erro se repetia,
     porque palpiteDoNome() aprende com o histórico: um nome já usado herda a
     categoria do lançamento anterior, errada inclusive.

     Por isso a correção vale para o futuro também: mudar aqui é o que ensina o
     app. O select é irmão do de "quem paga", que já morava nesta linha. */
  tb.querySelectorAll('[data-cat]').forEach(sl=>sl.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.cat); if(!l) return;
    l.cat=e.target.value; l.catManual=true;   // escolha da pessoa: é ela que ensina o app
    render(); salvar(); vibrar(10);
    toast(l.nome+' agora é '+CATS[l.cat].n);
  });
  tb.querySelectorAll('[data-val]').forEach(i=>i.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.val);
    if(l){ l.valor=+e.target.value||0; l.pai=Math.min(+l.pai||0,l.valor); render(); salvar(); }});
  tb.querySelectorAll('[data-pai]').forEach(i=>i.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.pai);
    if(l){ l.pai=Math.min(+e.target.value||0,l.valor); render(); salvar(); }});
  tb.querySelectorAll('[data-pag]').forEach(s=>s.onchange=e=>{
    const l=S.lanc.find(x=>String(x.id)===e.target.dataset.pag); if(!l) return;
    if(e.target.value==='+'){
      const p=pedirPessoa();
      /* Sem nome não muda nada — mas o select precisa voltar ao que era, senão
         a linha fica mostrando "Nova pessoa…" como se fosse quem paga. */
      if(!p){ render(); return; }
      aplicarPagador(l,'d:'+p.id);
    } else aplicarPagador(l,e.target.value);
    render(); salvar();});
}


/* ---------- as barras 3D de onde cortar ----------

   Quem desenha é o `viz3d.js`; daqui sai só o DADO e a frase embaixo. A
   separação importa: o gráfico não sabe nada de fatura, de teto ou de pessoa —
   ele recebe uma lista de barras com valor, categoria e peso.

   Duas coisas que custaram atenção:

   1. **O gráfico não é recriado a cada render.** `render()` roda a cada
      digitação, e remontar a cena zeraria o giro no meio do dedo da pessoa.
      Uma CHAVE resume o que está desenhado (categoria, peso, valor e tema);
      só quando ela muda a cena é remontada.
   2. **A ordem das categorias é a do gasto**, da maior para a menor, da
      esquerda para a direita — a mesma ordem da lista embaixo. Se as duas
      discordassem, o gráfico viraria enfeite. */
function barras3D(){
  const itens=doCiclo();
  const totalCat={};
  itens.forEach(l=>{ const v=meuValor(l); if(v>0) totalCat[l.cat]=(totalCat[l.cat]||0)+v; });
  const ordem=Object.keys(totalCat).sort((a,b)=>totalCat[b]-totalCat[a]);
  const barras=[];
  ordem.forEach(k=>{
    [1,2,3].forEach(t=>{
      const v=itens.filter(l=>l.cat===k&&l.tier===t).reduce((s,l)=>s+meuValor(l),0);
      if(v>0.5) barras.push({cat:k,nome:CATS[k].n,cor:CATS[k].c,tier:t,valor:v,total:totalCat[k]});
    });
  });
  return barras;
}
function frase3D(b){
  const el=$('#viz3dDiz'); if(!el) return;
  if(!b){
    el.innerHTML='Arraste para girar · toque numa barra para ver o que ela é. '
      +'<b>Altura</b> é quanto você gasta, <b>profundidade</b> é o peso — o que dá pra cortar fica na frente.';
    return;
  }
  const ano=b.valor*12;
  el.innerHTML=`<span class="pt" style="background:${CATS[b.cat].c}"></span>`
    +`<b>${esc(b.nome)}</b> · ${TIER[b.tier].n} · <b>${brl(b.valor)}</b> neste ciclo`
    +(b.tier===3?` — zerar isso devolve <b>${brl(ano)}</b> no ano.`
      :b.tier===2?' — dá pra reduzir sem doer muito.'
      :' — essencial: aqui não se corta, se negocia (plano, fornecedor, prazo).');
}
function renderViz3D(){
  const caixa=$('#viz3d'), tela=$('#viz3dTela');
  if(!caixa||!tela) return;
  const barras=barras3D();
  /* Menos de duas barras não é gráfico, é uma caixa girando. A lista embaixo
     já diz tudo que há para dizer nesse caso. */
  if(!window.Viz3D||barras.length<2){
    caixa.hidden=true;
    if(viz3d){ viz3d.encerrar(); viz3d=null; viz3dChave=''; }
    return;
  }
  caixa.hidden=false;
  const chave=barras.map(b=>b.cat+b.tier+Math.round(b.valor)).join('|')+'#'+temaAtual();
  if(chave===viz3dChave) return;
  viz3dChave=chave;
  if(viz3d) viz3d.encerrar();
  viz3d=Viz3D.montar(tela,barras,{aoSelecionar:frase3D});
  frase3D(null);
  const vistas=[]; barras.forEach(b=>{ if(!vistas.includes(b.cat)) vistas.push(b.cat); });
  $('#viz3dLeg').innerHTML=vistas.map(k=>
    `<span class="viz3d-c"><span class="pt" style="background:${CATS[k].c}"></span>${esc(CATS[k].n)}</span>`).join('');
}

function renderCortes(c){
  renderViz3D();
  const lista=[];
  Object.entries(c.excesso).forEach(([k,v])=>{
    const itens=doCiclo().filter(l=>l.cat===k&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a));
    lista.push({tipo:'teto',nome:CATS[k].n,valor:v,alvo:c.tetos[k],hoje:c.porCat[k],
      itens:itens.slice(0,3).map(l=>l.nome+' ('+brl(meuValor(l))+')')});
  });
  doCiclo().filter(l=>l.tier===3&&!c.excesso[l.cat]&&meuValor(l)>0).forEach(l=>{
    lista.push({tipo:'zerar',nome:l.nome,valor:meuValor(l),alvo:0,hoje:meuValor(l),itens:[CATS[l.cat].n]});
  });
  lista.sort((a,b)=>b.valor-a.valor);
  const total=lista.reduce((s,x)=>s+x.valor,0), nova=c.sobra+total;

  /* A lista sai ordenada do maior pro menor, e os três primeiros resolvem a
     maior parte. Mostrar os oito de uma vez enterrava esse fato: eram cinco
     telas de rolagem de coisas cada vez menos relevantes. O resto continua
     ali, a um toque. */
  const CORTES_TOPO=3;
  const linha=(x,i)=>`<div class="corte${i>=CORTES_TOPO?' corte-extra':''}">
       <div class="ord num">${String(i+1).padStart(2,'0')}</div>
       <div class="txt">
         <div class="nome">${esc(x.nome)}</div>
         <div class="det" style="margin:4px 0 6px">
           hoje <b class="num">${brl(x.hoje)}</b> →
           <b style="color:${x.alvo>0?'var(--verde)':'var(--alerta)'}">
             ${x.alvo>0?'gaste no máximo '+brl(x.alvo):'ZERE ISSO'}</b>
         </div>
         <div class="trilho"><i style="--p:1;background:var(--alerta)"></i></div>
         <div class="det" style="margin-top:5px">${esc(x.itens.join(' · '))}</div>
       </div>
       <div class="ano">−${brl(x.valor)}<div class="det" style="font-weight:400">por mês</div>
         <div class="det" style="font-weight:600;color:var(--txt)">${brl(x.valor*12)}/ano</div></div>
      </div>`;

  const sobrando=Math.max(lista.length-CORTES_TOPO,0);
  const juntam=lista.slice(0,CORTES_TOPO).reduce((s,x)=>s+x.valor,0);

  $('#cortes').innerHTML=lista.length
    ? (c.renda>0
        ? `<div class="nota">Vá de cima pra baixo e pare quando for suficiente.
             Só os três primeiros já devolvem <b>${brl(juntam)}</b> por mês.</div>` : '')
      + lista.map(linha).join('')
      + (sobrando
        ? `<button class="btn sec larg" id="verMaisCortes" type="button"
             aria-expanded="false">Ver mais ${sobrando} ${sobrando===1?'item':'itens'}</button>`
        : '')
    : '<p class="vazio">Preencha a renda e a meta pra ver o que está fora do teto.</p>';

  const btMais=$('#verMaisCortes');
  if(btMais) btMais.onclick=()=>{
    const abrir=btMais.getAttribute('aria-expanded')!=='true';
    $('#cortes').classList.toggle('mostra-tudo', abrir);
    btMais.setAttribute('aria-expanded', abrir?'true':'false');
    btMais.textContent = abrir ? 'Ver menos'
      : `Ver mais ${sobrando} ${sobrando===1?'item':'itens'}`;
  };

  $('#cardsCorte').innerHTML=`
   <div class="card"><div class="l">Sobra hoje</div><div class="v" style="color:${c.sobra<0?'var(--alerta)':'var(--txt)'}">${brl(c.sobra)}</div></div>
   <div class="card" style="border-color:var(--alerta)"><div class="l">Dá pra cortar</div><div class="v" style="color:var(--alerta)">${brl(total)}</div><div class="n">por mês</div></div>
   <div class="card" style="border-color:var(--verde)"><div class="l">Sobra depois do corte</div><div class="v" style="color:var(--verde)">${brl(nova)}</div><div class="n">${c.renda>0?pct(Math.max(nova,0)/c.renda)+' da renda':''}</div></div>
   <div class="card"><div class="l">Em 12 meses</div><div class="v">${brl(Math.max(nova,0)*12)}</div><div class="n">se guardar tudo isso</div></div>`;

  const zerar=lista.filter(x=>x.tipo==='zerar').reduce((s,x)=>s+x.valor,0);
  let txt='';
  /* O antigo "Plano de ataque" dizia o mesmo que a nota do topo da lista, e
     ainda calculava um valor que dava R$ 0,00 sempre que a meta já estava
     coberta. Ficou só o aviso que a nota do topo NÃO dá: o caso em que cortar
     tudo ainda não basta. */
  if(c.renda>0 && c.meta>0 && nova<c.meta){
    txt = `<div class="nota aviso"><b>Mesmo cortando tudo faltam ${brl(c.meta-nova)}.</b> Aqui apertar mais o dia a dia não resolve — o caminho é renda maior ou meta menor. Corte o que dá e ajuste a meta pra um número que você consiga manter.</div>`;
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
$('#lCat').innerHTML=opcoesCat();
let tDeb=null;
function agendarRender(){ clearTimeout(tDeb); tDeb=setTimeout(()=>{ render(); salvar(); },220); }
['salario','extra','meses','jaTem','metaPct','metaVal','diaFech','diaVenc'].forEach(id=>$('#'+id).addEventListener('input',e=>{
  S[id]=+e.target.value||0;
  if(id==='metaVal'&&+e.target.value>0) S.metaPct=0;
  if(id==='metaPct'&&+e.target.value>0){ S.metaVal=0; $('#metaVal').value=''; }
  if(id==='diaFech') S.ultimoFech=iso(ultimoFechPassado());
  agendarRender();
}));
/* ---------- atalhos de quanto guardar ----------
   O caso comum — 10%, 20% ou 30% da renda — vira um toque. Os campos exatos
   continuam existindo, mas fechados: quem só quer começar não precisa mais
   decidir entre dois campos numa tela que já tinha seis. */
function pintarChipsMeta(){
  const usaValor=(+S.metaVal>0);
  const pct=usaValor?null:(+S.metaPct||0);
  let algumMarcado=false;
  document.querySelectorAll('#chipsMeta [data-meta]').forEach(b=>{
    const v=b.dataset.meta;
    const on = v==='ajustar' ? !$('#camposMeta').hidden : (!usaValor && pct===+v);
    if(on && v!=='ajustar') algumMarcado=true;
    b.setAttribute('aria-pressed', on?'true':'false');
  });
  // Valor fixo ou percentual fora dos atalhos: os campos precisam estar à vista.
  if(!algumMarcado && (usaValor || (pct && ![10,20,30].includes(pct)))) abrirCamposMeta(true);
}
function abrirCamposMeta(abrir){
  const g=$('#camposMeta'); if(!g) return;
  g.hidden=!abrir;
  const b=document.querySelector('#chipsMeta [data-meta="ajustar"]');
  if(b) b.setAttribute('aria-pressed', abrir?'true':'false');
}
document.querySelectorAll('#chipsMeta [data-meta]').forEach(b=>b.onclick=()=>{
  vibrar(8);
  if(b.dataset.meta==='ajustar'){
    const abrir=$('#camposMeta').hidden;
    abrirCamposMeta(abrir);
    if(abrir) setTimeout(()=>$('#metaPct').focus(),60);
    return;
  }
  S.metaPct=+b.dataset.meta; S.metaVal=0;
  $('#metaPct').value=S.metaPct; $('#metaVal').value='';
  abrirCamposMeta(false);
  pintarChipsMeta();
  render(); salvar();
});

/* O mesmo select de "quem paga" da tabela, agora no formulário de "Mais
   opções" — as opções são as pessoas cadastradas, então ele é repintado
   sempre que a lista muda. */
function pintarPagadorForm(valor){
  const sel=$('#lPagador'); if(!sel) return;
  const antes=valor||sel.value||'eu';
  const v=+$('#lValor').value||0, pago=+$('#lPai').value||0;
  const [modo,id]=String(antes).split(':');
  sel.innerHTML=opcoesPagador({valor:v,pai:antes==='eu'?0:(pago||v),com:antes==='eu'?'':(id||'')});
  sel.value=[...sel.options].some(o=>o.value===antes)?antes:'eu';
  rotularPai();
}
function rotularPai(){
  const lab=$('#labPai'), sel=$('#lPagador'); if(!lab||!sel) return;
  const [,id]=String(sel.value).split(':');
  lab.textContent=(sel.value==='eu'||sel.value==='+')?'Quanto a outra pessoa cobre'
    :'Quanto '+nomePessoa(id)+' cobre';
}
$('#lPagador').onchange=e=>{
  if(e.target.value==='+'){
    const p=pedirPessoa();
    pintarPagadorForm(p?'d:'+p.id:'eu');
    if(p){ render(); salvar(); }
  }
  const v=+$('#lValor').value||0, escolha=$('#lPagador').value;
  if(escolha==='eu') $('#lPai').value='';
  else if(escolha.startsWith('t:')) $('#lPai').value=v||'';
  else if(v) $('#lPai').value=(v/2).toFixed(2);
  rotularPai();
  ajustarCamposForm();   // escolheu alguém: o campo do quanto aparece agora
};
/* Campo desabilitado é campo que ocupa espaço sem servir pra nada. Parcelas só
   existe quando o gasto é parcelado; "quanto a outra pessoa cobre" só quando
   alguém divide. O formulário encolhe e cresce conforme a resposta anterior —
   é o que faz ele caber numa olhada. */
function ajustarCamposForm(){
  const tipo=$('#lTipo').value, parc=tipo==='parc';
  const cp=$('#campoParc'); if(cp) cp.hidden=!parc;
  if(!parc) $('#lParc').value='';
  /* O dia de vencimento só faz sentido para o que volta — e para o que volta
     ele é ESSENCIAL, porque é dele que sai a posição da conta no calendário.
     Numa compra única o campo some, e o valor some com ele. */
  const cv=$('#campoVenc'); if(cv) cv.hidden=(tipo==='unico');
  if(tipo==='unico') $('#lVenc').value='';
  const pz=$('#lPrazo');
  if(pz){
    const txt=fraseDoPrazo(tipo,+$('#lParc').value||0,+$('#lVenc').value||0);
    pz.innerHTML=txt; pz.hidden=!txt;
  }
  const pag=$('#lPagador').value, divide=(pag!=='eu'&&pag!=='+');
  const cpai=$('#campoPai'); if(cpai) cpai.hidden=!divide;
  if(!divide) $('#lPai').value='';
}
$('#lTipo').onchange=()=>{ ajustarCamposForm(); if($('#lTipo').value==='parc') $('#lParc').focus(); };
['#lParc','#lVenc'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input',ajustarCamposForm); });

/* O palpite pelo NOME, no formulário completo. Enquanto a pessoa não mexer na
   categoria à mão, ela vai sendo preenchida sozinha — e a linha embaixo diz o
   que o app entendeu, com o caminho para discordar. Se ela mexer, o app para
   de adivinhar: a escolha dela vale mais que a regra. */
let catNaMao=false;
function pintarMeio(){
  const g=$('#lMeio'); if(!g) return;
  g.querySelectorAll('[data-meio]').forEach(b=>{
    const on=b.dataset.meio===meioForm;
    b.classList.toggle('on',on);
    b.setAttribute('aria-checked',on?'true':'false');
  });
  // "entra na fatura" não existe pra quem já pagou à vista
  const cf=$('#lFatura'); if(cf){ const box=cf.closest('div'); if(box) box.hidden=(meioForm==='avista'); }
  if(meioForm==='avista'&&cf) cf.value='0';
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#lMeio [data-meio]'); if(!b) return;
  meioForm=b.dataset.meio; pintarMeio(); linhaFaturaDaFolha(meioForm==='avista'); vibrar(8);
  const f=$('#lFonte');
  if(meioForm==='avista'&&(!f.value.trim()||f.value.trim()==='Conta')) f.value='Pix';
  if(meioForm==='cartao'&&f.value.trim()==='Pix') f.value='';
});
function palpitarNoForm(){
  const nome=$('#lNome').value.trim();
  const p=$('#lPalpite');
  if(!nome){ if(p){ p.hidden=true; p.innerHTML=''; } return; }
  const g=palpiteDoNome(nome);
  if(!catNaMao){
    $('#lCat').value=g.cat;
    $('#lTier').value=String(g.tier);
    $('#lTipo').value=g.tipo;
    if(!$('#lFonte').value.trim()&&g.fonte&&g.fonte!=='Conta') $('#lFonte').value=g.fonte;
    ajustarCamposForm();
  }
  if(!p) return;
  const c=CATS[$('#lCat').value]||CATS.outros;
  p.hidden=false;
  p.innerHTML=`<span class="pt" style="background:${c.c}"></span>`
    +(catNaMao?`Categoria escolhida por você: <b>${c.n}</b>.`
      :`Entendi como <b>${c.n}</b>${g.herdado?' (como da última vez)':''}. `
       +`<button type="button" class="link" id="lTrocarCat">trocar</button>`);
  const t=$('#lTrocarCat');
  if(t) t.onclick=()=>{ const m=$('#mais2'); if(m) m.open=true; $('#lCat').focus(); };
}
$('#lNome').addEventListener('input',palpitarNoForm);
$('#lCat').addEventListener('change',()=>{ catNaMao=true; palpitarNoForm(); });
/* ==========================================================================
   Tema: uma preferência do APARELHO, aplicada antes de qualquer tela

   Antes o tema morava só no estado da conta, que só é lido depois do login —
   então a abertura e o login abriam sempre no claro, com o texto branco da
   capa sobre um fundo claro. Agora a escolha fica também no localStorage,
   como as outras preferências de aparelho, e é aplicada no primeiro quadro.
   O valor da conta continua existindo e mandando quando ela carrega: quem
   troca de aparelho leva o gosto junto.
   ========================================================================== */
const CHAVE_TEMA='sobra:tema';
function temaGuardado(){
  try{ const t=localStorage.getItem(CHAVE_TEMA); return (t==='claro'||t==='escuro')?t:null; }
  catch(e){ return null; }
}
/* O app ABRE CLARO — mas isto é o ÚLTIMO recurso, não o primeiro. A ordem em
   temaAtual() é: o que a conta escolheu, depois o que o aparelho guardou
   (`sobra:tema`), e só então este padrão. O tema do sistema não decide por
   ninguém. O tema.js repete a mesma regra no <head>, antes da splash: os dois
   precisam concordar, então mexer aqui é mexer lá também. */
const TEMA_PADRAO='claro';
function alternarTema(){
  S.tema=(temaAtual()==='escuro')?'claro':'escuro';
  aplicarTema();
  /* Só grava o estado da conta se houver conta. Na capa e no login o tema já
     ficou guardado no aparelho por aplicarTema(); chamar salvar() aqui
     escreveria o estado VAZIO por cima dos dados que existiam neste aparelho
     antes de alguém entrar. */
  if(window.Auth && Auth.logado()) salvar();
  vibrar(8);
}
function temaAtual(){
  if(S.tema==='claro'||S.tema==='escuro') return S.tema;
  return temaGuardado()||TEMA_PADRAO;
}
/* Todos os botões de tema do app — cabeçalho, tela de cartas e o flutuante da
   abertura — são a mesma função. Um botão de tema que existe só em algumas
   telas é um botão que a pessoa procura e não acha. */
const BOTOES_TEMA=['#btnTema','#portalTema','#temaFlutua'];
BOTOES_TEMA.forEach(id=>{ const b=$(id); if(b) b.onclick=alternarTema; });

function aplicarTema(){
  S.tema=temaAtual();
  const esc=(S.tema==='escuro');
  try{ localStorage.setItem(CHAVE_TEMA,S.tema); }catch(e){}
  const cor=esc?'#000000':'#F4F8FD';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',cor));
  document.documentElement.setAttribute('data-tema',esc?'escuro':'claro');
  if(viz3d) viz3d.repintar();      // as cores das barras vêm do CSS: mudou o tema, mudaram elas
  const rotulo=esc?'Mudar para o tema claro':'Mudar para o tema escuro';
  /* Esta função roda ANTES do resto do arquivo — é o que evita a abertura
     piscar no tema errado —, e nesse instante a tabela de ícones ainda não
     existe. Sem o try, o erro de acesso antecipado derrubava o script inteiro
     e o app não abria. O desenho entra na segunda chamada, no fim do arquivo. */
  let ic='';
  try{ ic=icone(esc?'sol':'lua',20); }catch(e){}
  BOTOES_TEMA.forEach(id=>{
    const b=$(id); if(!b) return;
    // O botão do cabeçalho é liso; os outros dois têm a face da tecla.
    if(ic) b.innerHTML = b.classList.contains('tecla') ? '<span class="tecla-face">'+ic+'</span>' : ic;
    b.setAttribute('aria-label',rotulo);
    b.setAttribute('title',rotulo);
  });
  /* A esfera atrás do app também tem tema. Sem esta linha o botão parecia
     quebrado: as variáveis de cor trocavam, mas o fundo — que ocupa a tela
     inteira — continuava escuro, e a impressão era de que nada acontecia. */
  if(cena && cena.repintar) cena.repintar();
}
// Antes da capa, antes do login, antes de qualquer pintura.
aplicarTema();

ajustarCamposForm(); pintarMeio();
$('#resetTetos').onclick=()=>{ S.tetos={}; render(); salvar(); };
$('#fecharAgora').onclick=()=>{
  const n=doCiclo().length, fila=daProxima().length;
  if(!confirm('Fechar a fatura agora?\n\nOs '+n+' lançamentos desta fatura vão pro arquivo. Os de uma vez só saem da lista, os parcelados perdem uma parcela e os fixos e variáveis continuam.'
    +(fila?'\n\nOs '+fila+' gastos guardados pra próxima entram na fatura que abre agora.':''))) return;
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
  const l={id:Date.now()+Math.random(),criadoEm:Date.now(),nome,valor,cat:$('#lCat').value,tier:+$('#lTier').value,
    catManual:catNaMao,
    fonte:$('#lFonte').value.trim()||'Conta',tipo,pRest:tipo==='parc'?(+$('#lParc').value||1):0,
    com:'',pai:Math.min(+$('#lPai').value||0,valor),ref:0,venc:Math.min(Math.max(+$('#lVenc').value||0,0),31),
    meio:meioForm,
    prox:(meioForm==='cartao'&&+$('#lFatura').value===1)?1:0};
  const pag=$('#lPagador').value;
  if(pag==='eu'||pag==='+'){ l.pai=0; l.com=''; }
  else{
    const [modo,id]=pag.split(':');
    l.com=id||'';
    l.pai=modo==='t'?valor:(l.pai>0?Math.min(l.pai,valor):+(valor/2).toFixed(2));
  }
  S.lanc.push(l);
  ['lNome','lValor','lParc','lPai','lVenc'].forEach(i=>$('#'+i).value=''); $('#lFatura').value='0';
  /* A repetição volta ao padrão a cada lançamento. Sem isto, o "todo mês"
     escolhido para o aluguel continuaria selecionado no cinema lançado logo
     depois — e ninguém confere um campo que já estava certo da última vez. */
  $('#lTipo').value='unico';
  catNaMao=false; meioForm='cartao'; pintarMeio();
  pintarPagadorForm('eu'); ajustarCamposForm(); palpitarNoForm();
  $('#lNome').focus();
  render(); salvar();
  const f=faturaAberta();
  toast(l.meio==='avista'?'Fora da fatura — já saiu da conta'
    :l.prox?'Guardado pra próxima fatura':'Entra na fatura cobrada em '+ddmm(f.vence));
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
  S=Object.assign({},S,{salario:0,extra:0,metaPct:20,metaVal:0,diaFech:5,diaVenc:12,
     ultimoFech:iso(ultimoFechPassado()),hist:[],tetos:{},lanc:[],div:[],obj:[],pessoas:[],meses:6,jaTem:0,notifLog:{},agendaLog:{},retroVista:null,orcaOculto:null,orcaEm:null});
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
  /* Conta de consumo vem PRIMEIRO de propósito. Desde que água sozinha passou a
     ser bebida (regra de comida, logo abaixo), a conta precisa de contexto pra ser
     reconhecida — e precisa ser lida ANTES, senão "conta de água" cairia em comida
     pelo próprio \bagua\b. */
  [/conta de (agua|luz|energia|gas)|agua e esgoto|\bsanepar\b|\bsabesp\b|\bcopasa\b|\bcedae\b|\bcagece\b|\bcaesb\b|\bembasa\b|\bcorsan\b|\bcasan\b|aguas d[eo]\b/,'casa',1],
  [/mercadolivre|mercado livre|\bmp\*|shopee|amazon|magalu|aliexpress|shein|americanas|renner|riachuelo|zara|centauro|nike|adidas|steam|playstation|xbox|nintendo|cinema|ingresso|barbearia|barbeiro|cabelereir|salao|manicure|pedicure|tatuagem|cerveja|bar\b|balada|\bshow\b|teatro|boliche|festa|viagem|hotel|pousada|airbnb|\bspa\b|presente|roupa|tenis|perfum/,'lazer',3],
  [/ifood|rappi|delivery|\beats\b|food|mcdonald|burger|pizza|lanche|lanchonete|hamburg|sushi|padaria|panificadora|restaurante|subway|\bcafe|starbucks|habib|marmita|quentinha|self.?service|almoco|jantar|sorvete|acai|doceria|agua mineral|agua de coco|\bagua\b|\bsuco\b|refrigerante|salgado|coxinha|pastel|espetinho|churrasc/,'comida',3],
  [/supermerc|\bmercado\b|mercado |carrefour|assai|atacad|condor|muffato|angeloni|hortifruti|acougue|pao de acucar|big\b|extra\b|tenda|dia\b|sacolao|feira|quitanda|compra do mes/,'mercado',1],
  [/posto|ipiranga|shell|petrobr|combust|gasolin|etanol|alcool|diesel|\buber\b|99app|99pop|indriver|taxi|onibus|metro|\bbus\b|passagem|pedagio|estacion|\bpark|zona azul|oficina|mecanic|manutencao|borracharia|alinhament|balanceament|troca de oleo|lava.?(rapido|jato)|\bipva\b|licenciam|detran|multa|seguro (auto|do carro|do veiculo|veicular)|pneu|lavagem|revisao|\bcarro\b|\bmoto\b/,'transporte',1],
  [/netflix|spotify|disney|hbo|\bmax\b|prime video|deezer|youtube|apple\.com|\bicloud|google \*|canva|chatgpt|anthropic|claude|assinatura|globoplay|paramount|crunchyroll|telecine|plano do cartao|anuidade/,'assinatura',3],
  [/farmacia|drogaria|drogasil|pacheco|panvel|raia|nissei|remedio|unimed|amil|hapvida|plano de saude|dentista|ortodont|medic|consulta|clinica|exame|laborator|oculos|optica|fisioterap|nutricion|academia|smartfit|bluefit|gympass|suplement|whey|psicolog|terapia|vacina/,'saude',1],
  [/aluguel|condominio|energia|copel|cemig|enel|light\b|\bluz\b|sanepar|sabesp|\bgas\b|comgas|ultragaz|internet|\bvivo\b|claro|\btim\b|oi fibra|nextfibra|\biptu\b|celular|telefone|recarga|faxin|diarist|empregada|jardineir|encanador|eletricista|pedreiro|dedetiza|seguro residencial|gato|racao|\bpet|veterinar/,'casa',1],
  [/faculdade|mensalidade|matricula|semestre|pos.?graduacao|escola|colegio|curso|idiomas|\bingles\b|autoescola|udemy|alura|coursera|ieduc|apostila|livro|material escolar|impress|xerox|papelaria|certifica/,'estudo',2],
  [/fatura|cartao|emprestimo|financiamento|consorcio|parcela|juros|rotativo|nubank|inter\b|itau|bradesco|santander|caixa\b|sicredi|sicoob|banrisul|banco pan|crefisa|agibank|picpay|\bneon\b|\bc6\b|dm ?card/,'divida',1]
];
/* O app NUNCA decide sozinho que um gasto se repete.

   Esta é a regra, e ela vale mais que qualquer acerto de adivinhação: repetir é
   escolha da pessoa, feita no campo "Repetição". O palpite do nome cuida de
   categoria, peso e conta — nunca da repetição, que sai sempre como `unico`.

   Por que tão duro: `fixo` e `var` são linhas que SOBREVIVEM ao fechamento. Um
   gasto marcado assim por engano volta na fatura do mês seguinte, e do outro, e
   do outro — sozinho, sem ninguém ter pedido, engordando o mês com dinheiro que
   não saiu. Uma compra única marcada como única não corre risco nenhum: no pior
   caso a pessoa lança de novo no mês que vem, que é o que ela faria de qualquer
   jeito. O erro tem custos MUITO diferentes dos dois lados, e é por isso que o
   lado barato é o padrão.

   Nem o histórico reabre essa porta: `palpiteDoNome()` deixou de herdar a
   repetição do lançamento anterior, e `addLanc` devolve o campo a "compra única"
   depois de cada lançamento — senão o "todo mês" escolhido para o aluguel
   pegaria carona no cinema lançado logo em seguida. Conta fixa de verdade é
   lançada UMA vez e o app a carrega ciclo a ciclo; não é caso de adivinhar. */
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
/* Deixa passar só <b>, </b> e <br>. Todo o resto vira texto. */
function soNegritoEQuebra(html){
  return String(html==null?'':html)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/&lt;(\/?b)&gt;/gi,'<$1>')
    .replace(/&lt;br\s*\/?&gt;/gi,'<br>');
}
function ligarTip(fig){
  const tip=fig.querySelector('.viz-tip'); if(!tip) return;
  fig.querySelectorAll('[data-tip]').forEach(el=>{
    const mostra=ev=>{
      /* O texto do balão faz o caminho atributo → dataset → innerHTML, e nesse
         caminho o navegador DESFAZ o escape uma vez: um nome com "<script" que
         entrou escapado sai cru do outro lado. Hoje só entram nomes de
         categoria, que são do app; a lista branca abaixo garante que isso
         continue verdade mesmo quando alguém passar um nome digitado por aqui. */
      tip.innerHTML=soNegritoEQuebra(el.dataset.tip);
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
  /* A tabela vai dentro de um container que rola no eixo x. Numa tela de
     320 px ela é mais larga que a janela, e sem isto empurrava a página
     inteira para o lado. Rolar dentro da própria tabela resolve sem espremer
     as colunas até virarem ilegíveis. */
  return `<details class="viz-tab"><summary>ver os números em tabela</summary>
   <div class="tab-rol"><table><thead><tr>${cab.map((c,i)=>`<th${i?' style="text-align:right"':''}>${c}</th>`).join('')}</tr></thead>
   <tbody>${linhas.map(l=>`<tr>${l.map((c,i)=>`<td${i?' class="v"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
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
  /* Só categorias em que houve gasto. Uma linha "Outros 0%" não informa nada e
     empurra o resto da tela para baixo — e com dez categorias sempre havia
     três ou quatro dessas. */
  const its=Object.entries(CATS).map(([k,cat])=>({k,nome:cat.n,g:c.porCat[k]||0,t:c.tetos[k]||0}))
    .filter(x=>x.g>0.005).sort((a,b)=>(b.g/(b.t||1))-(a.g/(a.t||1)));
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

/* ==========================================================================
   Análises: a resposta primeiro, o gráfico depois

   A aba tinha quatro gráficos abertos ao mesmo tempo, cada um com um
   parágrafo de explicação — quase cinco telas de rolagem antes de a pessoa
   saber se gastou demais ou não. E o número que importa (quatro categorias
   estouradas) ficava no meio do terceiro gráfico.

   Agora a aba abre com uma frase que responde "e aí, como estou?", e os
   gráficos ficam dobrados atrás de títulos clicáveis. Quem quiser o detalhe
   abre; quem só queria saber, já soube.
   ========================================================================== */
function renderResumoAnalise(c){
  const el=$('#resumoAnalise'); if(!el) return;

  if(!S.lanc.length){
    el.innerHTML=`<div class="resumo-vazio">Lance alguns gastos e este resumo te diz,
      em uma frase, se o mês está de pé.</div>`;
    return;
  }
  if(!c.renda){
    el.innerHTML=`<div class="resumo-vazio">Falta dizer quanto você ganha.
      <button class="link" data-ir="plano:renda">Preencher agora</button></div>`;
    return;
  }

  const folga = c.disponivel - c.gasto;
  const bem = folga >= 0;
  const estouros = Object.entries(c.excesso).sort((a,b)=>b[1]-a[1]);

  const veredito = bem
    ? `Sobram <b>${brl(folga)}</b> para gastar neste ciclo`
    : `Você passou <b>${brl(-folga)}</b> do que dava para gastar`;
  const conta = `Gastou ${brl(c.gasto)} de ${brl(c.disponivel)} — o que sobra da renda
     depois de guardar ${brl(c.meta)}.`;

  let alerta = '';
  if(estouros.length){
    const [k,v] = estouros[0];
    const nome = CATS[k] ? CATS[k].n : k;
    alerta = estouros.length===1
      ? `<b>${esc(nome)}</b> passou do teto em ${brl(v)}.`
      : `<b>${estouros.length} categorias</b> passaram do teto. A maior é
         ${esc(nome)}, ${brl(v)} acima.`;
  }

  el.innerHTML =
    `<div class="resumo ${bem?'ok':'passou'}">
       <div class="resumo-tit">${veredito}</div>
       <div class="resumo-sub">${conta}</div>
       ${alerta?`<div class="resumo-alerta">${alerta}
         <button class="link" data-ir="analise:cortes">ver o que cortar</button></div>`:''}
     </div>`;
}

/* Transforma um gráfico num bloco que abre e fecha. Move os nós em vez de
   reescrever o HTML: os gráficos já têm ouvintes presos neles (a dica que
   segue o dedo), e reescrever o innerHTML os perderia. */
const DOBRAS='sobra:dobras';
function dobrasAbertas(){
  try{ return JSON.parse(localStorage.getItem('sobra:dobras')||'{}'); }catch(e){ return {}; }
}
function dobrarFig(id, padraoAberto){
  const fig=$('#'+id); if(!fig || fig.dataset.dobrada) return;
  const cap=fig.querySelector('figcaption'); if(!cap) return;
  const tit=cap.querySelector('.viz-tit'); if(!tit) return;

  const guardado=dobrasAbertas()[id];
  const aberto = guardado===undefined ? padraoAberto : guardado;

  const corpo=document.createElement('div');
  corpo.className='dobra-corpo';
  while(cap.nextSibling) corpo.appendChild(cap.nextSibling);

  const bt=document.createElement('button');
  bt.type='button';
  bt.className='dobra-cab';
  bt.setAttribute('aria-expanded', aberto?'true':'false');
  bt.innerHTML=`<span class="dobra-tit"></span>
    <svg class="dobra-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
  bt.querySelector('.dobra-tit').textContent=tit.textContent;

  cap.remove();
  fig.prepend(bt);
  fig.appendChild(corpo);
  fig.classList.add('dobra');
  fig.classList.toggle('aberta', !!aberto);
  fig.dataset.dobrada='1';

  bt.onclick=()=>{
    const ab=!fig.classList.contains('aberta');
    fig.classList.toggle('aberta', ab);
    bt.setAttribute('aria-expanded', ab?'true':'false');
    try{ const m=dobrasAbertas(); m[id]=ab; localStorage.setItem(DOBRAS, JSON.stringify(m)); }catch(e){}
  };
}

function renderGraficos(c){
  ['figDonut','figEvol','figTeto','figProj'].forEach(id=>{
    const f=$('#'+id); if(f){ delete f.dataset.dobrada; f.hidden=false; }
  });
  grafDonut(c); grafEvolucao(c); grafTetos(c); grafProjecao(c);
  renderResumoAnalise(c);

  /* Um gráfico vazio não vira uma caixa cinza ocupando meia tela: ele
     simplesmente não aparece. O único que fica é o primeiro, para a aba nunca
     abrir completamente em branco. */
  ['figEvol','figTeto','figProj'].forEach(id=>{
    const f=$('#'+id);
    if(f && f.querySelector('.viz-vazio')) f.hidden=true;
  });

  // Só o primeiro abre sozinho; o resto fica à mão, sem ocupar a tela.
  dobrarFig('figDonut', true);
  dobrarFig('figEvol', false);
  dobrarFig('figTeto', true);
  dobrarFig('figProj', false);
}

/* ---------- contas a vencer (recorrências com dia marcado) ---------- */
function proximoVenc(dia){
  const h=hojeD(), d=Math.min(Math.max(+dia||0,1),31);
  const noMes=(y,m)=>{const u=new Date(y,m+1,0).getDate(); return new Date(y,m,Math.min(d,u));};
  let alvo=noMes(h.getFullYear(),h.getMonth());
  if(alvo<h) alvo=noMes(h.getFullYear(),h.getMonth()+1);
  return alvo;
}
/* "Já paguei" é por OCORRÊNCIA, não um interruptor: `l.pagoAte` guarda a data
   do vencimento que foi quitado. No mês seguinte essa data muda sozinha e a
   conta volta a cobrar atenção — ninguém precisa lembrar de desmarcar nada.

   E pagar tem DUAS formas, que não significam a mesma coisa no cartão:

   • **do bolso** (pix, débito, dinheiro): o dinheiro saiu agora, acabou.
   • **no cartão**: a conta está paga — não vence mais, não avisa mais — mas o
     dinheiro só sai quando a fatura vencer. Pagando hoje, dia 8, com a fatura
     fechando dia 5, essa despesa entra na fatura que fecha em 05/10 e é
     cobrada em 12/10. É esse dia que `pagoVence` guarda, congelado no momento
     da marcação: o ciclo vira, mas a conta continua sabendo quando o dinheiro
     de verdade sai.

   O valor não se move quando se marca "no cartão": o lançamento JÁ está na
   fatura aberta e já conta em `calc()`. A marca só diz que a obrigação foi
   resolvida — somar de novo seria contar o mesmo gasto duas vezes. */
const contaPaga=(l,d)=>!!l.pagoAte&&l.pagoAte===iso(d);
/* Qual conta está com as duas opções abertas na tela. Mora fora da render
   porque a escolha é passageira: some no próximo desenho. */
let escolhendoPago=null;
function contasAVencer(comAsPagas){
  return doCiclo().filter(l=>+l.venc>0&&meuValor(l)>0)
    .map(l=>{const d=proximoVenc(l.venc);
      return {l,data:d,dias:Math.round((d-hojeD())/86400000),pago:contaPaga(l,d)};})
    .filter(x=>comAsPagas||!x.pago)
    .sort((a,b)=>(a.pago-b.pago)||(a.dias-b.dias));
}
function marcarPago(id,como){
  const l=S.lanc.find(x=>String(x.id)===String(id)); if(!l) return;
  escolhendoPago=null;
  l.pagoAte=iso(proximoVenc(l.venc));
  l.pagoCom=(como==='cartao')?'cartao':'bolso';
  if(l.pagoCom==='cartao'){ l.pagoVence=iso(faturaAberta().vence); toast(l.nome+' pago no cartão · sai em '+ddmm(dataDeISO(l.pagoVence))); }
  else { delete l.pagoVence; toast(l.nome+' pago'); }
  vibrar(12); render(); salvar();
}
/* Desmarcar é o mesmo botão de marcado: quem clicou por engano desfaz no
   mesmo lugar, sem menu e sem confirmação. */
function desmarcarPago(id){
  const l=S.lanc.find(x=>String(x.id)===String(id)); if(!l) return;
  delete l.pagoAte; delete l.pagoCom; delete l.pagoVence;
  escolhendoPago=null;
  toast(l.nome+' voltou pra lista'); render(); salvar();
}


/* ══════════════════════ EDITAR UM LANÇAMENTO ══════════════════════

   Até aqui a tabela deixava mudar valor, categoria, quem paga e a forma de
   pagamento — direto na linha, que é o certo para esses. O resto (nome errado,
   virou parcelado, faltam 8 parcelas e não 10, o dia de vencimento) só tinha um
   caminho: apagar e lançar de novo, perdendo o histórico que o app usa para
   aprender com os nomes.

   Esta folha edita TUDO de um lançamento que já existe. Ela é irmã da folha de
   novo gasto e usa os mesmos rótulos de propósito: quem aprendeu a lançar não
   precisa aprender a editar. */
let edId=null, edMeio='cartao';
function abrirEdicao(id){
  const l=S.lanc.find(x=>String(x.id)===String(id)); if(!l) return;
  edId=l.id;
  $('#eNome').value=l.nome||'';
  $('#eValor').value=l.valor||'';
  $('#eFonte').value=l.fonte||'';
  $('#eCat').innerHTML=opcoesCat(l.cat);
  $('#eTier').value=String(l.tier||2);
  $('#eTipo').value=l.tipo==='rec'?'fixo':(l.tipo||'unico');
  $('#eParc').value=(+l.pRest||0)||'';
  $('#eVenc').value=(+l.venc||0)||'';
  $('#eFatura').value=(+l.prox>0)?'1':'0';
  edMeio=naFatura(l)?'cartao':'avista';
  $('#ePagador').innerHTML=opcoesPagador(l);
  $('#ePai').value=(+l.pai||0)||'';
  pintarMeioEd(); ajustarEdicao();
  $('#edBg').classList.add('abre');
  $('#edFolha').classList.add('abre');
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#eNome').focus(),240);
}
function fecharEdicao(){
  edId=null;
  $('#edBg').classList.remove('abre');
  $('#edFolha').classList.remove('abre');
  document.body.style.overflow='';
}
function pintarMeioEd(){
  const g=$('#eMeio'); if(!g) return;
  g.querySelectorAll('[data-emeio]').forEach(b=>{
    const on=b.dataset.emeio===edMeio;
    b.classList.toggle('on',on); b.setAttribute('aria-checked',on?'true':'false');
  });
  const cf=$('#eCampoFatura'); if(cf) cf.hidden=(edMeio==='avista');
}
/* Mesma ideia do formulário de lançar: campo que não vale para a resposta
   anterior não fica na tela ocupando espaço. E aqui há uma frase a mais — a que
   diz até quando a coisa vai. */
function ajustarEdicao(){
  const tipo=$('#eTipo').value;
  $('#eCampoParc').hidden=(tipo!=='parc');
  const pag=$('#ePagador').value, divide=(pag!=='eu'&&pag!=='+');
  $('#eCampoPai').hidden=!divide;
  if(!divide) $('#ePai').value='';
  $('#eAviso').innerHTML=fraseDoPrazo(tipo,+$('#eParc').value||0,+$('#eVenc').value||0);
}
/* "Faltam 8 parcelas" é um número; "termina em maio de 2027" é uma resposta.
   A mesma frase serve para a conta fixa, e ali ela diz o contrário: que não
   termina — que era a dúvida de quem não sabe quantas mensalidades ainda vêm. */
function fraseDoPrazo(tipo,faltam,dia){
  if(tipo==='parc'){
    if(!(faltam>0)) return 'Diga quantas parcelas ainda faltam, <b>contando a do próximo vencimento</b>.';
    if(!(dia>0)) return `Faltam <b>${faltam}</b>. Marque <b>Vence todo dia</b> e o app espalha as parcelas pelo calendário, uma por mês.`;
    const fim=new Date(proximoVenc(dia).getFullYear(),proximoVenc(dia).getMonth()+faltam-1,1);
    return `Faltam <b>${faltam}</b> parcelas — a última cai em <b>${MES_LONGO[fim.getMonth()]} de ${fim.getFullYear()}</b>. Todas já aparecem no calendário.`;
  }
  if(tipo==='fixo'||tipo==='var'){
    if(!(dia>0)) return 'Marque <b>Vence todo dia</b> para esta conta aparecer no calendário todo mês.';
    return `Vence <b>todo dia ${Math.min(dia,31)}</b>, <b>sem data de fim</b> — segue mês a mês no calendário até você mudar a repetição ou apagar o gasto.`;
  }
  return dia>0?'Compra única: aparece no calendário só neste vencimento.':'';
}
function salvarEdicao(){
  const l=S.lanc.find(x=>String(x.id)===String(edId)); if(!l){ fecharEdicao(); return; }
  const nome=$('#eNome').value.trim(), valor=+$('#eValor').value;
  if(!nome||!(valor>0)){ toast('Precisa de nome e valor',true); $('#eNome').focus(); return; }
  const tipo=$('#eTipo').value;
  l.nome=nome; l.valor=valor;
  l.cat=$('#eCat').value; l.tier=+$('#eTier').value;
  /* Mexeu na categoria à mão é ESCOLHA, e escolha ensina o app: é a mesma
     marca que o select da tabela grava. */
  l.catManual=true;
  l.fonte=$('#eFonte').value.trim()||'Conta';
  l.tipo=tipo;
  l.pRest=(tipo==='parc')?Math.max(+$('#eParc').value||0,0):0;
  l.venc=Math.min(Math.max(+$('#eVenc').value||0,0),31);
  l.meio=edMeio;
  l.prox=(edMeio==='cartao'&&+$('#eFatura').value===1)?1:0;
  const pag=$('#ePagador').value;
  if(pag==='eu'||pag==='+'){ l.pai=0; l.com=''; }
  else{
    const [modo,id]=pag.split(':');
    l.com=id||'';
    const informado=+$('#ePai').value||0;
    l.pai=modo==='t'?valor:Math.min(informado>0?informado:+(valor/2).toFixed(2),valor);
  }
  /* Trocou o dia de vencimento? A marca de "já paguei" era sobre a data
     ANTIGA e deixou de valer — mantê-la esconderia a conta do mês inteiro. */
  if(l.pagoAte&&(!(l.venc>0)||l.pagoAte!==iso(proximoVenc(l.venc)))){
    delete l.pagoAte; delete l.pagoCom; delete l.pagoVence;
  }
  fecharEdicao(); render(); salvar(); vibrar(12);
  toast(l.nome+' atualizado');
}

/* ══════════════════════ CALENDÁRIO DE CONTAS ══════════════════════

   A pergunta que ele responde é "o que vence quando", e ela não cabia em
   nenhuma tela: *Contas a vencer* mostra só a próxima ocorrência de cada conta,
   e o gráfico de parcelas mostra o total do mês sem dizer o dia.

   O que o calendário faz que as outras telas não fazem é PROJETAR o futuro a
   partir do que já está lançado — e cada tipo de gasto se projeta de um jeito:

   * **parcelado** — sabe onde termina. `pRest` diz quantas faltam e o dia de
     vencimento diz em que dia elas caem; a última ganha o rótulo de última,
     que é a informação que a pessoa quer ("quando é que essa moto acaba?").
   * **todo mês (fixo ou variável)** — não termina. Segue mês a mês até alguém
     mudar o gasto, que é literalmente "até eu dizer que não quero mais".
   * **compra única** — aparece uma vez, no vencimento dela.
   * **a fatura do cartão** — todo mês no dia do vencimento, porque é a maior
     conta do mês e ficaria estranho não estar ali.

   O passado NÃO é reconstituído. O app guarda faturas fechadas, não um diário
   de pagamentos por dia; desenhar ocorrências passadas a partir das regras de
   hoje seria inventar um histórico que ninguém viveu. Mês passado mostra o que
   ele tem: nada, e uma linha dizendo por quê. */

const DIAS_SEM=['dom','seg','ter','qua','qui','sex','sáb'];
const MES_LONGO=['janeiro','fevereiro','março','abril','maio','junho','julho',
  'agosto','setembro','outubro','novembro','dezembro'];
const mesesEntre=(a,b)=>(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());

/* Um dia do mês pedido, respeitando meses curtos: quem vence dia 31 vence no
   dia 28 de fevereiro, não some do mês. */
function diaNoMes(ano,mes,dia){
  const ultimo=new Date(ano,mes+1,0).getDate();
  return new Date(ano,mes,Math.min(Math.max(dia,1),ultimo));
}

function contasDoMes(ano,mes){
  const porDia={};
  const põe=(data,item)=>{ const d=data.getDate(); (porDia[d]=porDia[d]||[]).push(item); };
  const hoje=hojeD(), mesAtual=new Date(hoje.getFullYear(),hoje.getMonth(),1);
  const esteMes=new Date(ano,mes,1);
  const passado=esteMes<mesAtual;

  if(!passado) S.lanc.forEach(l=>{
    const dia=+l.venc||0; if(!(dia>0)) return;
    const v=meuValor(l); if(!(v>0)) return;
    const data=diaNoMes(ano,mes,dia);
    const p0=proximoVenc(dia);                      // a próxima ocorrência real
    const i=mesesEntre(p0,data);
    if(i<0) return;                                 // antes da próxima: já passou
    if(l.tipo==='parc'){
      const faltam=+l.pRest||0;
      if(i>=faltam) return;
      põe(data,{l,valor:v,cat:l.cat,nome:l.nome,
        selo: i===faltam-1?'última parcela':`parcela · faltam ${faltam-i}`,
        ultima: i===faltam-1,
        pago: i===0&&contaPaga(l,data)});
    }else if(l.tipo==='unico'){
      if(i>0) return;
      põe(data,{l,valor:v,cat:l.cat,nome:l.nome,selo:'compra única',pago:contaPaga(l,data)});
    }else{
      põe(data,{l,valor:v,cat:l.cat,nome:l.nome,
        selo: l.tipo==='fixo'?'todo mês':'todo mês, valor muda',
        semFim:true, pago: i===0&&contaPaga(l,data)});
    }
  });

  /* A fatura do cartão. Só a PRÓXIMA tem valor conhecido — as outras ainda vão
     ser formadas, e escrever um número ali seria chute com cara de dado. */
  if(!passado&&+S.diaVenc>0){
    const data=diaNoMes(ano,mes,+S.diaVenc);
    const aPagar=faturaAPagar();
    const mesmaData=aPagar&&iso(aPagar.vence)===iso(data);
    if(data>=new Date(hoje.getFullYear(),hoje.getMonth(),1))
      põe(data,{fatura:true,cat:'divida',nome:'Fatura do cartão',
        valor: mesmaData?aPagar.meu:0,
        selo: mesmaData?'fechada, a pagar':'fecha dia '+(+S.diaFech||5),
        pago: !!(aPagar&&aPagar.ref&&aPagar.ref.pago&&mesmaData)});
  }
  return {porDia,passado};
}

let calAno=0, calMes=0, calDia=null;
function abrirCalendario(){
  const h=hojeD();
  if(!calAno){ calAno=h.getFullYear(); calMes=h.getMonth(); }
  calDia=(calAno===h.getFullYear()&&calMes===h.getMonth())?h.getDate():null;
  $('#cal').hidden=false;
  document.body.classList.add('cal-aberto');
  document.body.style.overflow='hidden';
  desenharCalendario();
  setTimeout(()=>{ const b=$('#calFechar'); if(b) b.focus(); },40);
}
function fecharCalendario(){
  calEdFat=false;
  $('#cal').hidden=true;
  document.body.classList.remove('cal-aberto');
  document.body.style.overflow='';
}
function andarMes(n){
  const d=new Date(calAno,calMes+n,1);
  calAno=d.getFullYear(); calMes=d.getMonth(); calDia=null;
  desenharCalendario();
  /* O painel do lado volta ao topo: virar o mês com ele rolado no meio mostra
     um pedaço de texto sem cabeça e parece que a tela não mudou. */
  const lado=$('#calLado'); if(lado) lado.scrollTop=0;
}
function desenharCalendario(){
  const cx=$('#cal'); if(!cx||cx.hidden) return;
  const {porDia,passado}=contasDoMes(calAno,calMes);
  const h=hojeD();
  const ehHoje=d=>calAno===h.getFullYear()&&calMes===h.getMonth()&&d===h.getDate();
  const nomeMes=MES_LONGO[calMes];
  $('#calTit').textContent=nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)+' de '+calAno;

  const primeiro=new Date(calAno,calMes,1).getDay();
  const ultimo=new Date(calAno,calMes+1,0).getDate();
  let html='<div class="cal-sem">'+DIAS_SEM.map(d=>`<span>${d}</span>`).join('')+'</div><div class="cal-dias troca">';
  for(let i=0;i<primeiro;i++) html+='<span class="cal-vazio"></span>';
  for(let d=1;d<=ultimo;d++){
    const itens=porDia[d]||[];
    const total=itens.reduce((s,x)=>s+(x.pago?0:x.valor),0);
    const cores=[...new Set(itens.map(x=>CATS[x.cat]?CATS[x.cat].c:'var(--cout)'))].slice(0,4);
    html+=`<button class="cal-d${itens.length?' tem':''}${ehHoje(d)?' hoje':''}${calDia===d?' sel':''}"
      data-dia="${d}" aria-label="${d} de ${MES_LONGO[calMes]}${itens.length?', '+itens.length+' conta'+(itens.length>1?'s':''):''}">
      <span class="n">${d}</span>
      ${itens.length?`<span class="pontos">${cores.map(c=>`<i style="background:${c}"></i>`).join('')}</span>`:''}
      ${total>0?`<span class="vl">${brlCurto(total)}</span>`:''}</button>`;
  }
  html+='</div>';
  $('#calGrade').innerHTML=html;

  $('#calGrade').querySelectorAll('[data-dia]').forEach(b=>{
    const d=+b.dataset.dia;
    /* Passar o mouse já mostra — é o pedido, e no desktop é o gesto natural.
       No toque não existe "passar por cima", então o clique faz o mesmo. */
    b.addEventListener('mouseenter',()=>{ calDia=d; pintarLado(porDia,passado); marcarSel(d); });
    b.addEventListener('focus',()=>{ calDia=d; pintarLado(porDia,passado); marcarSel(d); });
    b.onclick=()=>{ calDia=d; pintarLado(porDia,passado); marcarSel(d); };
  });
  pintarLado(porDia,passado);
}
function marcarSel(d){
  $('#calGrade').querySelectorAll('[data-dia]').forEach(b=>
    b.classList.toggle('sel',+b.dataset.dia===d));
}
/* O painel do lado tem dois estados: o resumo do mês (quando nenhum dia está
   escolhido) e o dia escolhido. Nunca fica vazio — painel vazio parece defeito. */
function pintarLado(porDia,passado){
  const el=$('#calLado'); if(!el) return;
  const dias=Object.keys(porDia).map(Number).sort((a,b)=>a-b);
  const totalMes=dias.reduce((s,d)=>s+porDia[d].reduce((t,x)=>t+(x.pago?0:x.valor),0),0);

  if(passado){
    el.innerHTML=`<div class="cal-vaziolado"><b>Mês já fechado.</b>
      O app guarda faturas fechadas, não um diário de pagamentos por dia — desenhar
      aqui as contas de um mês passado a partir das regras de hoje seria inventar um
      histórico que você não viveu. O que aconteceu está em
      <button class="link" data-calir="analise:hist">Análises → Faturas</button>.</div>`;
    ligarIrDoCal(el); return;
  }
  const itens=(calDia&&porDia[calDia])||null;
  if(!itens||!itens.length){
    el.innerHTML=`<div class="cal-resumo">
        <div class="rot">Total do mês</div>
        <div class="cal-total">${brl(totalMes)}</div>
        <div class="cal-n">${dias.length?dias.length+' dia'+(dias.length>1?'s':'')+' com conta':'nenhuma conta com dia marcado'}</div>
      </div>
      ${tiraDosMeses()}
      ${dias.length?`<div class="cal-lista">${dias.map(d=>{
        const t=porDia[d].reduce((s,x)=>s+(x.pago?0:x.valor),0);
        return `<button class="cal-li" data-dia="${d}"><b>${String(d).padStart(2,'0')}</b>
          <span>${porDia[d].map(x=>esc(x.nome)).join(' · ')}</span>
          <em>${t>0?brl(t):'pago'}</em></button>`;}).join('')}</div>`
      :`<p class="cal-vaziolado">Marque <b>Vence todo dia</b> num gasto e ele passa a aparecer aqui —
         parcela sabe onde termina, conta fixa segue mês a mês.</p>`}
      ${blocoObs(porDia,calAno,calMes)}`;
    ligarTira(el);
    el.querySelectorAll('[data-dia]').forEach(b=>b.onclick=()=>{
      calDia=+b.dataset.dia; pintarLado(porDia,passado); marcarSel(calDia);
      const alvo=$('#calGrade').querySelector('[data-dia="'+calDia+'"]'); if(alvo) alvo.focus();
    });
    return;
  }
  const soma=itens.reduce((s,x)=>s+(x.pago?0:x.valor),0);
  el.innerHTML=`<div class="cal-resumo">
      <div class="rot">${String(calDia).padStart(2,'0')} de ${MES_LONGO[calMes]}</div>
      <div class="cal-total">${brl(soma)}</div>
      <div class="cal-n">${itens.length} lançamento${itens.length>1?'s':''} neste dia</div>
    </div>
    <div class="cal-itens">${itens.map(x=>`<div class="cal-item${x.pago?' pago':''}">
      <span class="pt" style="background:${CATS[x.cat]?CATS[x.cat].c:'var(--cout)'}"></span>
      <div class="cal-tx"><b>${esc(x.nome)}</b>
        <small>${x.selo}${x.pago?' · <b>pago</b>':''}${x.semFim?' · sem data de fim':''}</small></div>
      <div class="cal-vl">${x.valor>0?brl(x.valor):'—'}</div>
      ${x.l?`<button class="link mini" data-caled="${x.l.id}">editar</button>`:''}
      ${x.fatura?`<button class="link mini" data-calfat="1">editar</button>`:''}
    </div>`).join('')}</div>
    <button class="btn sec mini" id="calVoltaMes" style="margin-top:12px">Ver o mês inteiro</button>
    ${blocoObs(porDia,calAno,calMes)}`;
  if(calEdFat) el.insertAdjacentHTML('beforeend',editorDaFatura());
  const vm=$('#calVoltaMes'); if(vm) vm.onclick=()=>{ calDia=null; calEdFat=false; pintarLado(porDia,passado); marcarSel(-1); };
  el.querySelectorAll('[data-caled]').forEach(b=>b.onclick=()=>{ fecharCalendario(); abrirEdicao(b.dataset.caled); });
  el.querySelectorAll('[data-calfat]').forEach(b=>b.onclick=()=>{ calEdFat=!calEdFat; pintarLado(porDia,passado); });
  ligarEditorDaFatura(porDia,passado);
}

/* ---------- as observações do lado ----------

   Um calendário que só marca dias responde "quando". As frases daqui respondem
   "e daí" — que é a pergunta seguinte, e a única que muda alguma decisão. Cada
   uma só aparece quando tem o que dizer: observação genérica em toda tela vira
   ruído e a pessoa para de ler o painel inteiro.

   Elas são calculadas do mesmo `porDia` que desenhou o mês, e não de uma
   segunda fonte — se um dia divergir, é porque o desenho e o texto discordam,
   e aí a culpa é minha, não do dado. */
function observacoesDoMes(porDia,ano,mes){
  const out=[], c=calc();
  const dias=Object.keys(porDia).map(Number).sort((a,b)=>a-b);
  if(!dias.length) return out;
  const itens=dias.flatMap(d=>porDia[d].map(x=>Object.assign({dia:d},x)));
  const aPagar=itens.filter(x=>!x.pago);
  const total=aPagar.reduce((s,x)=>s+x.valor,0);
  const hoje=hojeD(), esteMes=(ano===hoje.getFullYear()&&mes===hoje.getMonth());

  // o dia mais pesado
  let pior=null;
  dias.forEach(d=>{ const t=porDia[d].reduce((s,x)=>s+(x.pago?0:x.valor),0);
    if(!pior||t>pior.t) pior={d,t,n:porDia[d].length}; });
  if(pior&&pior.t>0&&dias.length>1)
    out.push({e:'atencao',txt:`O dia <b>${pior.d}</b> é o mais pesado do mês: <b>${brl(pior.t)}</b> em ${pior.n} conta${pior.n>1?'s':''}. `
      +(pior.n>1?'Se der pra empurrar uma delas, é aí que alivia.':'Se der pra empurrar, é aí que alivia.')});

  // quanto disso é parcela — dinheiro comprometido antes do mês começar
  const parc=aPagar.filter(x=>x.l&&x.l.tipo==='parc');
  const somaParc=parc.reduce((s,x)=>s+x.valor,0);
  if(somaParc>0)
    out.push({e:'calendario',txt:`<b>${brl(somaParc)}</b> ${parc.length>1?'são parcelas':'é parcela'} — dinheiro comprometido antes de o mês começar, e <b>${pct(somaParc/(total||1))}</b> de tudo que vence.`});

  // a parcela que está acabando
  const ultima=itens.find(x=>x.ultima);
  if(ultima)
    out.push({t:'bom',e:'festa',txt:`<b>${esc(ultima.nome)}</b> termina neste mês. A partir do mês que vem sobram <b>${brl(ultima.valor)}</b> por mês que hoje já têm dono.`});

  // o peso na renda
  if(c.renda>0&&total>0){
    const p=total/c.renda;
    out.push({t:p>0.5?'ruim':'',e:p>0.5?'subindo':'nota',
      txt:`As contas com dia marcado somam <b>${pct(p)}</b> da sua renda${p>0.5?' — mais da metade do mês já sai antes de qualquer escolha.':'.'}`});
  }

  // a folga: quantos dias corridos sem nada vencendo, a partir de hoje
  if(esteMes){
    const proximos=dias.filter(d=>d>=hoje.getDate());
    if(!proximos.length) out.push({t:'bom',e:'certo',txt:'Nada mais vence neste mês. O que aparecer daqui pra frente é escolha, não obrigação.'});
    else{
      const d=proximos[0], falta=d-hoje.getDate();
      out.push({e:'calendario',txt: falta===0?`Tem conta vencendo <b>hoje</b>: ${porDia[d].map(x=>esc(x.nome)).join(', ')}.`
        :`Próxima conta em <b>${falta} dia${falta>1?'s':''}</b> (dia ${d}): ${porDia[d].map(x=>esc(x.nome)).join(', ')}.`});
    }
  }

  // conta que não termina nunca — o que a pessoa perguntou ao pedir o calendário
  const semFim=[...new Set(aPagar.filter(x=>x.semFim).map(x=>x.nome))];
  if(semFim.length)
    out.push({e:'nota',txt:`${semFim.length===1?'<b>'+esc(semFim[0])+'</b> não tem':'<b>'+semFim.length+' contas</b> não têm'} data de fim — ${semFim.length===1?'ela segue':'elas seguem'} mês a mês até você mudar a repetição do gasto.`});

  return out;
}

/* A tira dos 12 meses: cada barra é o total daquele mês, e ela é clicável.

   É o que mostra o que nenhum mês sozinho mostra — que as parcelas acabam. A
   barra cai de degrau em degrau, e é possível ver com o olho em que mês o
   compromisso encolhe. */
function tiraDosMeses(){
  /* A tira começa no mês de HOJE, não no mês que está sendo olhado. Duas razões:
     o passado não é reconstituído (barras vazias pareceriam meses sem conta), e
     uma régua que anda junto com a navegação não é régua — a pessoa perde a
     referência de onde está. Quem navegar para fora da faixa simplesmente não vê
     nenhuma barra acesa. */
  const h=hojeD(), base=new Date(h.getFullYear(),h.getMonth(),1);
  const meses=[];
  for(let i=0;i<12;i++){
    const d=new Date(base.getFullYear(),base.getMonth()+i,1);
    const {porDia}=contasDoMes(d.getFullYear(),d.getMonth());
    const t=Object.keys(porDia).reduce((s,k)=>s+porDia[k].reduce((a,x)=>a+(x.pago?0:x.valor),0),0);
    meses.push({ano:d.getFullYear(),mes:d.getMonth(),total:t,
      atual:d.getFullYear()===calAno&&d.getMonth()===calMes});
  }
  const maior=Math.max(...meses.map(m=>m.total),1);
  return `<div class="rot" style="margin-top:2px">O que vence nos próximos 12 meses</div>
  <div class="cal-tira" role="group" aria-label="Total de contas por mês">
    ${meses.map(m=>`<button class="cal-tb${m.atual?' on':''}" data-ir-mes="${m.ano}-${m.mes}"
       title="${MES_LONGO[m.mes]} de ${m.ano}: ${brl(m.total)}"
       aria-label="${MES_LONGO[m.mes]} de ${m.ano}, ${brl(m.total)}">
       <i style="height:${Math.max(Math.round(m.total/maior*100),3)}%"></i>
       <span>${MES_CURTO[m.mes]}</span></button>`).join('')}
  </div>`;
}

/* ---------- editar a fatura pelo calendário ----------

   A fatura é a única linha do calendário que não é um lançamento: ela nasce de
   `S.diaFech` e `S.diaVenc`, os dois dias do cartão. Editá-la, então, é mexer
   nesses dias — e não em um gasto. Por isso ela abre este bloco em vez da folha
   de edição: o que está em jogo é a régua do mês inteiro, não uma linha.

   Os mesmos dois campos existem em *Planejamento → Renda e meta*. Ter os dois
   lugares é de propósito: quem está olhando o calendário e percebe que a data
   está errada conserta ali, sem procurar onde fica. A verdade continua sendo
   uma só — `S.diaFech` e `S.diaVenc`. */
let calEdFat=false;
function editorDaFatura(){
  const fech=+S.diaFech||5, venc=+S.diaVenc||12;
  const pagar=faturaAPagar();
  const seteAntes=((venc-7-1+31)%31)+1;
  return `<div class="cal-fat">
    <div class="rot">Datas do cartão</div>
    <div class="cal-fat-campos">
      <label>Fecha todo dia<input type="number" inputmode="numeric" min="1" max="31" step="1" id="calFech" value="${fech}"></label>
      <label>Vence todo dia<input type="number" inputmode="numeric" min="1" max="31" step="1" id="calVenc" value="${venc}"></label>
    </div>
    <p class="cal-fat-diz">O que você gastar hoje entra na fatura que fecha em
      <b>${dataBR(iso(faturaAberta().fecha))}</b> e é cobrada em <b>${dataBR(iso(faturaAberta().vence))}</b>.
      Mudar o dia do fechamento move a régua do ciclo — o app refaz a conta sozinho.</p>
    ${fech===venc?`<div class="nota aviso" style="margin:10px 0 0">Fechar e vencer no mesmo dia significa "fecha hoje e paga no mesmo dia do mês que vem" — 30 dias de folga que nenhum cartão dá.
      <div style="margin-top:8px"><button class="btn sec mini" id="calFecha7">Fechar dia ${seteAntes}, sete dias antes</button></div></div>`:''}
    ${pagar?`<div class="cal-fat-pagar">
      <div><b>${brl(pagar.bruto)}</b><small>fatura fechada em ${dataBR(iso(pagar.fecha))}, vence ${dataBR(iso(pagar.vence))}</small></div>
      <button class="btn mini" id="calPagouFat">Já paguei</button></div>`
     :`<p class="cal-fat-diz">Nenhuma fatura fechada esperando pagamento.</p>`}
  </div>`;
}
function ligarEditorDaFatura(porDia,passado){
  const f=$('#calFech'), v=$('#calVenc');
  const aplicar=()=>{
    const nf=Math.min(Math.max(+f.value||0,1),31), nv=Math.min(Math.max(+v.value||0,1),31);
    const mudouFech=nf!==(+S.diaFech||5);
    S.diaFech=nf; S.diaVenc=nv;
    /* Mudar o dia do fechamento move a régua do ciclo. Sem refazer `ultimoFech`
       o app acharia que a fatura atual já fechou (ou ainda não) e viraria o
       ciclo na hora errada — é o mesmo cuidado do campo em Renda e meta. */
    if(mudouFech) S.ultimoFech=iso(ultimoFechPassado());
    preencherCampos(); render(); salvar(); vibrar(10);
    desenharCalendario();
  };
  if(f) f.onchange=aplicar;
  if(v) v.onchange=aplicar;
  const b7=$('#calFecha7');
  if(b7) b7.onclick=()=>{ f.value=((+S.diaVenc||12)-7-1+31)%31+1; aplicar(); };
  const bp=$('#calPagouFat');
  if(bp) bp.onclick=()=>{
    const pagar=faturaAPagar(); if(!pagar) return;
    pagar.ref.pago=iso(hojeD());
    render(); salvar(); vibrar(14); desenharCalendario();
    snack('Fatura de '+dataBR(iso(pagar.fecha))+' marcada como paga.','Desfazer',()=>{
      delete pagar.ref.pago; render(); salvar(); desenharCalendario(); toast('Desfeito');
    });
  };
}
function ligarTira(el){
  el.querySelectorAll('[data-ir-mes]').forEach(b=>b.onclick=()=>{
    const [a,m]=b.dataset.irMes.split('-').map(Number);
    calAno=a; calMes=m; calDia=null; desenharCalendario();
  });
}
function blocoObs(porDia,ano,mes){
  const obs=observacoesDoMes(porDia,ano,mes);
  if(!obs.length) return '';
  return `<div class="cal-obs">${obs.map(o=>`<div class="insight ${o.t||''}">
    <div class="ie">${icone(o.e,17)}</div><div class="it2">${o.txt}</div></div>`).join('')}</div>`;
}
function ligarIrDoCal(el){
  el.querySelectorAll('[data-calir]').forEach(b=>b.onclick=()=>{ fecharCalendario(); irPara(b.dataset.calir); });
}

function renderVenc(){
  const el=$('#blocoVenc'); const cs=contasAVencer(true);
  if(!cs.length){ el.innerHTML=''; escolhendoPago=null; return; }
  const falta=cs.filter(x=>!x.pago), pagas=cs.length-falta.length;
  const total=falta.reduce((s,x)=>s+meuValor(x.l),0);
  const noCartao=cs.filter(x=>x.pago&&x.l.pagoCom==='cartao'&&x.l.pagoVence);
  /* Uma frase por conta paga no cartão, com o dia em que o dinheiro sai. */
  const legenda=x=>{
    if(!x.pago) return x.dias===0?'vence hoje':x.dias===1?'vence amanhã':'em '+x.dias+' dias';
    // curto de propósito: o selo "✓ pago" ao lado já diz que está paga, e numa
    // tela de 430 px a frase inteira empurrava o valor pra terceira linha
    if(x.l.pagoCom==='cartao'&&x.l.pagoVence) return 'no cartão · sai '+ddmm(dataDeISO(x.l.pagoVence));
    return 'pago · vencia '+ddmm(x.data);
  };
  const botao=x=>{
    if(x.pago) return `<button class="btn-pago on" data-despago="${x.l.id}"
      aria-label="Desmarcar ${esc(x.l.nome)} como pago">✓ pago</button>`;
    if(String(escolhendoPago)===String(x.l.id)) return `<span class="pago-escolha">
      <button data-pagocom="cartao" data-id="${x.l.id}">no cartão</button>
      <button data-pagocom="bolso" data-id="${x.l.id}">do bolso</button></span>`;
    return `<button class="btn-pago" data-abrepago="${x.l.id}"
      aria-label="Marcar ${esc(x.l.nome)} como pago">Paguei</button>`;
  };
  el.innerHTML=`<h3>Contas a vencer · ${brl(total)}</h3>
   <p class="ajuda">Lançamentos com dia de vencimento marcado. Toque em <b>Paguei</b> quando quitar: a conta sai da contagem e para de avisar até o vencimento do mês que vem.
   Pagou <b>no cartão</b>? Continua paga — só que o dinheiro sai quando a fatura vencer, e o app mostra o dia.${pagas?` <b>${pagas}</b> já ${pagas===1?'está paga':'estão pagas'} neste mês.`:''}</p>`+
   cs.map(x=>`<div class="venc${x.pago?' pago':(x.dias<=3?' perto':'')}">
     <div class="dia"><b>${x.data.getDate()}</b><span>${MES_CURTO[x.data.getMonth()]}</span></div>
     <div class="vn">${esc(x.l.nome)}<small>${legenda(x)} · ${esc(x.l.fonte||'Conta')}</small></div>
     <div class="vv">${brl(meuValor(x.l))}</div>
     ${botao(x)}
   </div>`).join('')+
   (noCartao.length?`<p class="ajuda" style="margin:10px 0 0"><b>${noCartao.length===1?'Uma conta paga no cartão':noCartao.length+' contas pagas no cartão'}</b> —
     ${noCartao.length===1?'ela já está':'elas já estão'} dentro da fatura acima, então o valor não é cobrado duas vezes.</p>`:'');
  el.querySelectorAll('[data-abrepago]').forEach(b=>b.onclick=()=>{ escolhendoPago=b.dataset.abrepago; renderVenc(); });
  el.querySelectorAll('[data-despago]').forEach(b=>b.onclick=()=>desmarcarPago(b.dataset.despago));
  el.querySelectorAll('[data-pagocom]').forEach(b=>b.onclick=()=>marcarPago(b.dataset.id,b.dataset.pagocom));
}

/* ---------- exportar CSV ---------- */
function exportarCSV(){
  const cab=['descricao','categoria','peso','tipo','valor_fatura','dividido_com','pago_por_outro','meu_valor','fonte','parcelas_restantes','vence_dia','entra_na_fatura','pago_como'];
  const fab=faturaAberta();
  const lin=S.lanc.map(l=>[l.nome,CATS[l.cat]?CATS[l.cat].n:l.cat,TIER[l.tier].n,l.tipo,
    l.valor,+l.pai>0?nomePessoa(l.com):'',+l.pai||0,meuValor(l),l.fonte||'Conta',+l.pRest||0,+l.venc||0,
    +l.prox>0?'próxima':'aberta ('+dataBR(iso(fab.fecha))+')',
    naFatura(l)?'cartão':'à vista']);
  const hist=S.hist.flatMap(x=>{
    // O nome vem da fatura arquivada, não da lista de hoje: pessoa apagada
    // continua nomeada na linha do mês em que ela dividiu o gasto.
    const nomes={}; fatiasDoHist(x).forEach(f=>{ nomes[f.id]=f.nome; });
    return (x.itens||[]).map(l=>['[fatura '+dataBR(x.data)+'] '+l.nome,
      CATS[l.cat]?CATS[l.cat].n:l.cat,TIER[l.tier]?TIER[l.tier].n:l.tier,l.tipo,l.valor,
      +l.pai>0?(nomes[l.com||'']||nomePessoa(l.com)):'',+l.pai||0,
      Math.max(l.valor-(+l.pai||0),0),l.fonte||'Conta',+l.pRest||0,+l.venc||0,
      'fechada em '+dataBR(x.data), (l.meio==='avista'?'à vista':'cartão')]);});
  const cel=v=>typeof v==='number'?String(v).replace('.',','):'"'+String(v).replace(/"/g,'""')+'"';
  const csv='﻿'+[cab.join(';'),...lin.concat(hist).map(l=>l.map(cel).join(';'))].join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='sobra-mais-'+iso(hojeD())+'.csv'; a.click();
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
        corpo:`Estão na fatura ${brl(c.bruto)}, cobrados em ${dataBR(iso(vencDaFatura(prox)))}.`
          +(c.avista>0?` Fora dela, ${brl(c.avista)} já saíram à vista.`:'')
          +` Seu gasto no ciclo está em ${brl(c.gasto)} — confira os variáveis antes de virar.`,
        peso:2});
    }
  }
  /* O que se paga é a fatura JÁ FECHADA — a que está aberta ainda nem virou
     cobrança. Avisar com o total do ciclo aberto era misturar as duas. */
  if(on('vencimento')){
    const fp=faturaAPagar();
    if(fp){
      const d=Math.round((fp.vence-h)/86400000);
      if(d<=(+S.aDiasVenc||2)){
        fora.push({tag:'venc:'+iso(fp.vence), icone:'💳', ico:'cartao', aba:'hoje',
          titulo:d===0?'A fatura vence hoje':`A fatura vence em ${d} dia${d===1?'':'s'}`,
          corpo:`${brl(fp.bruto)} da fatura que fechou em ${dataBR(iso(fp.fecha))}. Pague até ${dataBR(iso(fp.vence))} pra não entrar no rotativo — é o juro mais caro que existe.`,
          peso:3});
      }
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
    const zerados=doCiclo().filter(l=>l.tipo==='var'&&!(l.valor>0)&&(+l.ref||0)>0);
    if(zerados.length){
      fora.push({tag:'var:'+ck, icone:'✏️', ico:'lapis', aba:'hoje',
        titulo:`${zerados.length} gasto${zerados.length===1?'':'s'} variáve${zerados.length===1?'l':'is'} sem valor`,
        corpo:`${zerados.slice(0,3).map(l=>l.nome).join(', ')}${zerados.length>3?' e outros':''} estão zerados desde a virada. Preencha pra a conta do mês fechar certa.`,
        peso:1});
    }
  }
  if(on('parcela')){
    doCiclo().filter(l=>l.tipo==='parc'&&+l.pRest===1).forEach(l=>{
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

/* Escotilha de resgate. Abrir o site com ?sw=off apaga o service worker e todos
   os caches de casca. É a saída para o dia em que uma versão salva ficar
   quebrada e o app não abrir mais — os dados financeiros NÃO são tocados: eles
   moram em localStorage/IndexedDB e na conta, não no cache de arquivos.
   O sw.js também reconhece este endereço e sai da frente, então ele abre mesmo
   com o cache corrompido. */
const RESGATE = new URLSearchParams(location.search).get('sw')==='off';
if(RESGATE){
  (async()=>{
    try{
      const rs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map(r=>r.unregister().catch(()=>{})));
    }catch(e){}
    try{
      const ks=await caches.keys();
      await Promise.all(ks.map(k=>caches.delete(k).catch(()=>{})));
    }catch(e){}
    // Volta para o endereço limpo, agora sem service worker nenhum no caminho.
    location.replace('/');
  })();
}

if('serviceWorker' in navigator&&location.protocol!=='file:'&&!RESGATE){
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
  ajustes: {titulo:'Ajustes',     subs:['alertas','conta','assinatura','extrato','dados']}
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
  if(area==='ajustes'){ renderAlertas(calc()); renderAssinatura(); }
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
      : `É o que cabe por dia nos <b>${dias} dia${dias===1?'':'s'}</b> que faltam até a fatura fechar (cobrada em ${ddmm(faturaAberta().vence)}), já descontando o que você quer guardar.`;
  }
  document.querySelector('.hero-mini').hidden=!c.renda;
  document.querySelector('.hero-pista').hidden=!c.renda;
  const ant=ultimoFechPassado(), total=Math.max(Math.round((proximoFech()-ant)/86400000),1);
  $('#hoje-pista').style.setProperty('--p', ((total-dias)/total).toFixed(4));
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
      <div class="trilho" style="margin-top:7px"><i style="--p:${(p/100).toFixed(4)};background:${passou?'var(--vermelho)':CATS[k].c}"></i></div>
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
  const selo=l=>(l.tipo==='fixo')?'todo mês':l.tipo==='var'?'todo mês, valor muda':l.tipo==='parc'?`faltam ${l.pRest||0}x`:'compra única';
  el.innerHTML=its.map(l=>`<div class="item">
    <div class="ic" style="background:color-mix(in srgb,${CATS[l.cat].c} 13%,transparent);color:${CATS[l.cat].c}"
      >${icone(ICONE_CAT[l.cat]||'outros')}</div>
    <div class="tx" data-editar="${l.id}" role="button" tabindex="0" title="Editar ${esc(l.nome)}"><div class="nm">${esc(l.nome)}</div>
      <div class="dt">${CATS[l.cat].n} · ${selo(l)}${l.fonte&&l.fonte!=='Conta'?' · '+esc(l.fonte):''}${+l.prox>0?' · <b style="color:var(--indigo)">próxima fatura</b>':''}</div></div>
    <div class="vl">${brl(l.valor)}${(+l.pai>0)?`<small>meu ${brl(meuValor(l))} · ${esc(nomePessoa(l.com))}</small>`:''}</div>
    <button class="rm" data-del="${l.id}" aria-label="Remover ${esc(l.nome)}">×</button>
  </div>`).join('');
  if(S.lanc.length>6) el.innerHTML+=`<p class="ajuda" style="margin:12px 0 0;text-align:center">
    e mais ${S.lanc.length-6} lançado${S.lanc.length-6===1?'':'s'}</p>`;
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
    const variavel=doCiclo().filter(l=>l.tipo==='var'||l.tipo==='unico').reduce((s,l)=>s+meuValor(l),0);
    const jaFechado=c.gasto-variavel;
    const projetado=jaFechado+variavel/decorridos*(decorridos+dias);
    if(projetado>c.disponivel*1.05)
      out.push({t:'ruim',e:'subindo',txt:`No ritmo dos variáveis, o ciclo fecha em <b>${brl(projetado)}</b> — ${brl(projetado-c.disponivel)} acima do que cabe. Segurar <b>${brl((projetado-c.disponivel)/dias)}</b> por dia já resolve.`});
    else if(projetado<c.disponivel*0.9)
      out.push({t:'bom',e:'raio',txt:`No ritmo de agora o ciclo fecha em <b>${brl(projetado)}</b> e sobram <b>${brl(c.disponivel-projetado)}</b> além da meta.`});
  }
  /* Previsão de estouro: o aviso que chega ANTES. O de "passou do teto" já
     existe e é um recado sobre dinheiro que saiu; este é sobre dinheiro que
     ainda dá pra segurar, e por isso vem primeiro na lista. */
  previsoes(c).slice(0,2).forEach(x=>{
    out.push({t:'atencao',e:'subindo',
      txt:`Você já usou <b>${pct(x.usoPct)}</b> do teto de <b>${CATS[x.k].n}</b> e, no ritmo de agora, passa dele em <b>${x.faltam} dia${x.faltam===1?'':'s'}</b> — o ciclo fecharia em ${brl(x.proj)}. `
         +`<button class="link" data-ir="plano:tetos">Remanejar o teto</button>`});
  });
  // categoria que mais subiu contra a média
  Object.keys(CATS).forEach(k=>{
    const m=mediaHist(k), hoje=c.porCat[k]||0;
    if(m&&m>50&&hoje>m*1.18)
      out.push({t:'atencao',e:'atencao',txt:`<b>${CATS[k].n}</b> está ${pct(hoje/m-1)} acima da sua média dos últimos meses — ${brl(hoje)} contra ${brl(m)}.`});
    if(m&&m>50&&hoje<m*0.8&&hoje>0)
      out.push({t:'bom',e:'descendo',txt:`<b>${CATS[k].n}</b> caiu ${pct(1-hoje/m)} em relação à sua média: ${brl(m-hoje)} a menos este mês.`});
  });
  // o maior cortável
  const corta=doCiclo().filter(l=>l.tier===3&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a))[0];
  if(corta&&c.sobra<c.meta)
    out.push({t:'atencao',e:'tesoura',txt:`Zerar <b>${esc(corta.nome)}</b> devolve ${brl(meuValor(corta))} por mês — ${brl(meuValor(corta)*12)} no ano.`});
  // fatura chegando
  if(dias<=5)
    out.push({t:'atencao',e:'calendario',txt:`A fatura fecha em <b>${dias} dia${dias===1?'':'s'}</b> com ${brl(c.bruto)} — cobrada só em <b>${dataBR(iso(faturaAberta().vence))}</b>. Confira os variáveis antes que o ciclo vire.`});
  // variáveis zerados
  const zerados=doCiclo().filter(l=>l.tipo==='var'&&!(l.valor>0)&&(+l.ref||0)>0);
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
  const cru=String(txt||'').trim();
  if(!cru) return null;
  /* A forma de pagamento sai ANTES de procurar o valor. Em "moto 890 pix" o
     número não é o último pedaço da frase, e o leitor — que procura o valor no
     fim — respondia "falta o valor". Tirando o "pix" primeiro sobra
     "moto 890", que ele entende. */
  const mp=meioDoTexto(cru);
  const bruto=mp.nome;
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
  return Object.assign({nome:nome.charAt(0).toUpperCase()+nome.slice(1),valor,meio:mp.meio},
    palpiteDoNome(nome));
}
/* O que o app deduz de um NOME de gasto: categoria, peso, repetição e conta.

   Isto era código de dentro do campo rápido, e por isso o formulário completo
   não adivinhava nada: quem escrevia "Estacionamento" ali tinha que procurar
   "Carro e transporte" na lista à mão, com a resposta certa a um `classificar()`
   de distância. Agora é um lugar só, e os dois caminhos de lançamento sabem a
   mesma coisa.

   O histórico manda por cima das regras: se já existe um gasto com esse nome,
   herda tudo dele — inclusive uma categoria que a pessoa tenha corrigido na
   mão antes. É o app aprendendo com ela em vez de insistir na regra. */
/* "moto 890 pix" — a forma de pagamento dita no meio da frase. Sai do nome
   (senão o gasto se chamaria "Moto pix") e vira o meio. */
const DITO_AVISTA=/\b(pix|debito|dinheiro|a vista|avista|especie)\b/;
function meioDoTexto(nome){
  if(!DITO_AVISTA.test(semAcento(nome))) return {nome,meio:'cartao'};
  const corte=String(nome).replace(/\b(pix|d[ée]bito|dinheiro|[àa] vista|avista|esp[ée]cie)\b/gi,'')
    .replace(/\s{2,}/g,' ').replace(/\s*[-–—,]\s*$/,'').trim();
  return {nome:corte||nome,meio:'avista'};
}
function palpiteDoNome(nome){
  const txt=String(nome||'');
  const [cat,tier]=classificar(txt);
  /* Aqui é `S.lanc` inteiro, não `doCiclo()`: aprender o nome não tem nada a
     ver com em qual fatura o gasto caiu. */
  const mesmoNome=l=>l.nome&&l.nome.toLowerCase()===txt.toLowerCase();
  const antes=S.lanc.concat(S.hist.flatMap(h=>h.itens||[])).filter(mesmoNome);
  /* O app aprende com as CORREÇÕES da pessoa, não com os próprios palpites.

     Antes qualquer lançamento com o mesmo nome mandava por cima das regras — e
     um palpite errado se perpetuava: "agua" tinha caído em Casa e contas uma vez,
     então continuava caindo lá para sempre, mesmo depois de a regra ser
     corrigida. `catManual` marca quem escolheu a categoria à mão (no formulário
     ou no select da tabela); só essa escolha vale mais que a regra de hoje. */
  const corrigido=antes.find(l=>l.catManual);
  return {
    cat: corrigido?corrigido.cat:cat,
    tier: corrigido?corrigido.tier:tier,
    tipo: 'unico',                       // repetir é escolha, nunca palpite
    fonte: antes.length?(antes[0].fonte||'Conta'):'Conta',
    herdado: !!corrigido
  };
}
function renderEco(){
  const el=$('#rapidoEco'), p=lerRapido($('#rapido').value);
  linhaFaturaDaFolha((p&&!p.incompleto)?p.meio==='avista':meioForm==='avista');
  if(!p){ el.innerHTML='<span class="aviso">Escreva o gasto e o valor — <b>qualquer</b> palavra serve, o app acha a categoria. Ex.: <b>'+esc(exemploRapido)+'</b></span>'; return; }
  if(p.incompleto){ el.innerHTML='<span class="aviso">Falta o valor no fim. Ex.: <b>'+esc(p.nome)+' 45</b></span>'; return; }
  el.innerHTML=`<span class="pt" style="background:${CATS[p.cat].c}"></span>
    <span><b>${esc(p.nome)}</b> · ${brl(p.valor)} · ${CATS[p.cat].n} · ${TIER[p.tier].n}${p.meio==='avista'?' · <b>à vista, fora da fatura</b>':''}</span>
    ${p.herdado?'<span class="aviso">(como da última vez)</span>':''}`;
}
function salvarRapido(){
  const p=lerRapido($('#rapido').value);
  if(!p||p.incompleto){ toast('Escreva a descrição e o valor. Ex.: ifood 45',true); $('#rapido').focus(); return; }
  const l={id:Date.now()+Math.random(),criadoEm:Date.now(),nome:p.nome,valor:p.valor,cat:p.cat,
    tier:p.tier,tipo:p.tipo,fonte:p.meio==='avista'?'Pix':p.fonte,pRest:0,pai:0,ref:0,venc:0,prox:0,
    meio:p.meio||'cartao'};
  S.lanc.push(l);
  $('#rapido').value=''; renderEco();
  render(); salvar(); vibrar(14);
  toast(p.nome+' · '+brl(p.valor));
  snack('Lançamento adicionado.','Desfazer',()=>{
    S.lanc=S.lanc.filter(x=>x.id!==l.id); render(); salvar(); toast('Desfeito');
  });
  $('#rapido').focus();
}

/* Um atalho por CATEGORIA, não uma lista fixa de nomes.

   O defeito: existem dez categorias em CATS, e os padrões daqui cobriam
   quatro (mercado, transporte, comida, saúde). Estudo, Casa, Assinaturas,
   Lazer e Dívidas não tinham como ser alcançadas pela folha de gasto rápido
   — quem quisesse lançar uma mensalidade de faculdade só chegava lá abrindo
   "Mais opções". Pior: os padrões só apareciam com menos de três lançamentos
   no histórico, então esse caminho sumia justamente para quem já usa o app.

   Cada nome abaixo foi conferido contra classificar(): digitado no campo, cai
   na categoria que promete. Se mexer nesta lista, confira de novo — um chip
   que cai na categoria errada é pior do que não existir.

   "Outros" fica de fora de propósito: é o destino de quem não se encaixa, não
   um atalho que alguém queira tomar. */
const CHIP_PADRAO=[
  ['Mercado','mercado'], ['Combustível','transporte'], ['iFood','comida'],
  ['Aluguel','casa'],    ['Farmácia','saude'],         ['Faculdade','estudo'],
  ['Netflix','assinatura'], ['Roupa','lazer'],         ['Fatura do cartão','divida']
];
/* Um nome por categoria não basta para quem gasta MUITO numa delas. Quem
   abastece, estaciona e paga pedágio tem três gastos de transporte por semana
   e via um chip só: "Combustível". Estes extras entram para as categorias em
   que a pessoa realmente gasta, na ordem do dinheiro — é o que faz a folha
   deixar de ser a mesma para todo mundo.

   Mesma regra da lista de cima, e ela é séria: cada nome foi conferido contra
   classificar() e cai na categoria que promete. Se mexer aqui, rode a
   conferência de novo. */
const CHIP_EXTRA={
  transporte:['Estacionamento','Uber','Pedágio','Oficina'],
  comida:['Almoço','Padaria','Lanche'],
  mercado:['Feira','Açougue'],
  casa:['Luz','Internet','Conta de água','Condomínio'],
  lazer:['Cinema','Bar','Presente'],
  saude:['Academia','Consulta','Dentista'],
  estudo:['Curso','Apostila','Impressão'],
  assinatura:['Spotify','Disney'],
  divida:['Empréstimo','Parcela']
};
const CHIPS_MAX=12;
/* Valor de exemplo por categoria, para o atalho que a pessoa ainda não lançou
   nenhuma vez. Serve só para ensinar o formato "nome valor" com um número que
   não soa absurdo — assim que ela lançar o gasto de verdade, o exemplo passa a
   usar o valor dela. */
const VALOR_EXEMPLO={mercado:820,transporte:15,comida:45,casa:120,assinatura:30,
                     lazer:90,saude:60,estudo:400,divida:250,outros:50};
/* O exemplo que aparece embaixo do campo de gasto. Nasce genérico e passa a
   ser o do primeiro atalho da pessoa assim que renderChips roda. */
let exemploRapido='mercado 820';

/* ---------- chips: o que você mais lança ---------- */
/* As categorias na ordem do DINHEIRO da pessoa — do ciclo aberto e das quatro
   últimas faturas. É esta ordem que manda na folha: quem gasta em transporte
   vê transporte primeiro, e quem quase não faz mercado vê mercado por último.
   Categoria sem gasto nenhum vai para o fim, mas continua na lista: sumir com
   ela deixaria a pessoa sem caminho para lançar o primeiro. */
function categoriasPorGasto(){
  const g={};
  const soma=(l,peso)=>{ if(!l||!CATS[l.cat]) return; g[l.cat]=(g[l.cat]||0)+(+l.valor||0)*peso; };
  doCiclo().forEach(l=>soma(l,3));
  S.hist.slice(0,4).forEach(h=>(h.itens||[]).forEach(l=>soma(l,1)));
  return {ordem:Object.keys(CATS).sort((a,b)=>(g[b]||0)-(g[a]||0)),gasto:g};
}
function renderChips(){
  const el=$('#chips'); if(!el) return;
  const conta={};
  const registra=(nome,cat,peso)=>{ if(!nome) return;
    const k=nome.toLowerCase();
    conta[k]=conta[k]||{nome,cat,n:0,ult:0};
    conta[k].n+=peso; };
  doCiclo().forEach(l=>registra(l.nome,l.cat,3));
  S.hist.slice(0,4).forEach(h=>(h.itens||[]).forEach(l=>registra(l.nome,l.cat,1)));
  // Primeiro o que a pessoa mais lança — esses são os atalhos que valem.
  let its=Object.values(conta).sort((a,b)=>b.n-a.n).slice(0,6);
  const temCat=new Set(its.map(x=>x.cat));
  const temNome=new Set(its.map(x=>x.nome.toLowerCase()));
  const poe=(nome,cat)=>{
    if(its.length>=CHIPS_MAX) return;
    if(temNome.has(nome.toLowerCase())) return;
    its.push({nome,cat,n:0}); temNome.add(nome.toLowerCase()); temCat.add(cat);
  };
  const {ordem,gasto}=categoriasPorGasto();
  /* 1. Os extras das DUAS categorias onde o dinheiro mais vai. É o que resolve
        o "gasto com estacionamento e não tem atalho": quem gasta em transporte
        passa a ver estacionamento, Uber e pedágio, não só combustível. */
  ordem.filter(c=>gasto[c]>0).slice(0,2)
    .forEach(cat=>(CHIP_EXTRA[cat]||[]).slice(0,3).forEach(n=>poe(n,cat)));
  /* 2. Uma entrada para cada categoria ainda não coberta, também na ordem do
        gasto — toda categoria continua a um toque, mas as que pesam vêm antes. */
  ordem.forEach(cat=>{
    if(temCat.has(cat)) return;
    const d=CHIP_PADRAO.find(([,c])=>c===cat);
    if(d) poe(d[0],cat);
  });
  /* 3. Sobrou espaço? Mais nomes das categorias seguintes. */
  ordem.filter(c=>gasto[c]>0).slice(2)
    .forEach(cat=>(CHIP_EXTRA[cat]||[]).forEach(n=>poe(n,cat)));
  /* "Ex.: mercado 820" para quem não faz mercado ensina o formato com um gasto
     que a pessoa não tem. O exemplo passa a ser o do primeiro atalho — que já
     é, por construção, o mais provável dela — com o valor que ela mesma lançou
     naquela linha, quando existe. */
  if(its.length){
    const um=its[0];
    const ref=doCiclo().concat(S.hist.slice(0,4).flatMap(h=>h.itens||[]))
      .find(l=>l.nome&&l.nome.toLowerCase()===um.nome.toLowerCase()&&+l.valor>0);
    exemploRapido=um.nome.toLowerCase()+' '+(ref?Math.round(+ref.valor):(VALOR_EXEMPLO[um.cat]||50));
    const inp=$('#rapido'); if(inp) inp.placeholder=exemploRapido;
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
  const fp=faturaAPagar();
  const diasV=fp?Math.round((fp.vence-hojeD())/86400000):null;
  const estourou=Object.entries(c.excesso||{}).sort((a,b)=>b[1]-a[1])[0];
  const cortavel=doCiclo().filter(l=>l.tier===3&&meuValor(l)>0).sort((a,b)=>meuValor(b)-meuValor(a))[0];

  if(!c.renda) return {titulo:'👋 Falta pouco pra começar',
    corpo:'Coloque sua renda e quanto quer guardar — aí eu passo a te dizer todo dia quanto dá pra gastar.',aba:'plano:renda'};

  if(tipo==='fatura'){
    // Sem fatura fechada em aberto não há nada a pagar: o ciclo de agora só
    // vira cobrança depois de fechar.
    if(!fp||diasV>7) return null;                  // fora da janela: não incomoda
    const guardar=fp.bruto/Math.max(diasV,1);
    return {titulo:`💳 Fatura de ${brl(fp.bruto)} em ${diasV} dia${diasV===1?'':'s'}`,
      corpo:diasV<=1?`Vence ${diasV===0?'hoje':'amanhã'}. Pagar tudo evita o rotativo, que é o juro mais caro que existe.`
        :`Separando ${brl(guardar)} por dia até lá, a fatura fica paga sem susto. O que você gasta agora é da fatura seguinte.`,aba:'hoje'};
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
  /* Confete na família azul da marca, com o verde de "deu certo" e um
     dourado de contraponto: em cinco cores frias o confete some no fundo. */
  const cores=['#5CBDFF','#2E86D6','#9BE1FF','#34C759','#FFC65C'];
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
      ${+x.avista>0?`<div class="d">${brl(x.bruto)} vencem na fatura do cartão; ${brl(x.avista)} já saíram à vista.</div>`:''}
    </div>

    ${x.pai>0?`<div class="re-card" style="animation-delay:.1s">
      <div class="l">${fatiasDoHist(x).length===1?esc(fatiasDoHist(x)[0].nome)+' cobriu':'Dividido com outras pessoas'}</div>
      <div class="re-n" style="font-size:30px;color:${fatiasDoHist(x).length===1?fatiasDoHist(x)[0].cor:'var(--pai)'}">${brl(x.pai)}</div>
      ${fatiasDoHist(x).length>1?fatiasDoHist(x).map(f=>`<div class="re-linha">
        <span class="pt" style="background:${f.cor}"></span><span class="rn">${esc(f.nome)}</span>
        <span class="rv">${brl(f.valor)}</span><span class="rd"></span></div>`).join(''):''}
      <div class="d">Estava na fatura, mas não saiu do seu bolso — é isso que você tem a cobrar.
        A lista item a item de cada pessoa está em <b>Ver a fatura</b>, aqui embaixo.</div></div>`:''}

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

/* ---------- ligações do calendário e da folha de edição ---------- */
['#abrirCal','#btnCalTopo'].forEach(id=>{
  const b=$(id); if(b) b.onclick=()=>{ abrirCalendario(); vibrar(8); };
});
$('#calFechar').onclick=fecharCalendario;
$('#calAnt').onclick=()=>andarMes(-1);
$('#calProx').onclick=()=>andarMes(1);
$('#calAnoAnt').onclick=()=>andarMes(-12);
$('#calAnoProx').onclick=()=>andarMes(12);
$('#calHoje').onclick=()=>{ const h=hojeD(); calAno=h.getFullYear(); calMes=h.getMonth(); calDia=h.getDate(); desenharCalendario(); };
/* Esc fecha e as setas andam pelos meses — num calendário que ocupa a tela
   inteira, mexer só com o mouse é caminho longo. `stopImmediatePropagation`
   pelo mesmo motivo do menu de perfil: os dois ouvintes de Esc estão no mesmo
   document, e um Esc aqui não pode fechar a tela de cartas junto. */
document.addEventListener('keydown',e=>{
  const cal=$('#cal'); if(!cal||cal.hidden) return;
  if(e.key==='Escape'){ e.stopImmediatePropagation(); fecharCalendario(); return; }
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='ArrowUp'&&e.key!=='ArrowDown') return;
  /* Com um dia em foco as setas andam pelo MÊS, dia a dia (e ±7 na vertical,
     que é a semana). Fora da grade elas andam pelos meses. Duas coisas
     diferentes na mesma tecla, decididas pelo lugar onde a pessoa está — que é
     o que ela espera de um calendário. */
  const cel=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.cal-d');
  if(!cel){
    if(e.key==='ArrowLeft'){ e.preventDefault(); andarMes(-1); }
    if(e.key==='ArrowRight'){ e.preventDefault(); andarMes(1); }
    return;
  }
  e.preventDefault();
  const passo=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-7:7;
  const alvo=+cel.dataset.dia+passo;
  const b=$('#calGrade').querySelector('[data-dia="'+alvo+'"]');
  if(b){ b.focus(); return; }
  /* Saiu do mês: vira a página e para na borda do mês vizinho. Tentar acertar
     "o dia correspondente" atravessando meses de tamanhos diferentes gera mais
     surpresa que ajuda — a borda é previsível. */
  andarMes(passo<0?-1:1);
  const ultimo=new Date(calAno,calMes+1,0).getDate();
  const vizinho=$('#calGrade').querySelector('[data-dia="'+(passo<0?ultimo:1)+'"]');
  if(vizinho) vizinho.focus();
});

$('#edFechar').onclick=fecharEdicao;
$('#edBg').onclick=fecharEdicao;
$('#edSalvar').onclick=salvarEdicao;
$('#edApagar').onclick=()=>{
  const l=S.lanc.find(x=>String(x.id)===String(edId)); if(!l) return;
  const i=S.lanc.indexOf(l), nome=l.nome;
  S.lanc.splice(i,1); fecharEdicao(); render(); salvar(); vibrar(10);
  snack(nome+' apagado.','Desfazer',()=>{
    S.lanc.splice(Math.min(i,S.lanc.length),0,l); render(); salvar(); toast('Restaurado');
  });
};
$('#eTipo').onchange=()=>{ ajustarEdicao(); if($('#eTipo').value==='parc') $('#eParc').focus(); };
['#eParc','#eVenc'].forEach(id=>{ const el=$(id); if(el) el.oninput=ajustarEdicao; });
$('#ePagador').onchange=e=>{
  if(e.target.value==='+'){
    const p=pedirPessoa();
    const l=S.lanc.find(x=>String(x.id)===String(edId))||{valor:+$('#eValor').value||0};
    $('#ePagador').innerHTML=opcoesPagador(l);
    $('#ePagador').value=p?'d:'+p.id:'eu';
    if(p){ render(); salvar(); }
  }
  const v=+$('#eValor').value||0, escolha=$('#ePagador').value;
  if(escolha==='eu') $('#ePai').value='';
  else if(escolha.startsWith('t:')) $('#ePai').value=v||'';
  else if(v&&!(+$('#ePai').value>0)) $('#ePai').value=(v/2).toFixed(2);
  const lab=$('#eLabPai'), [,id]=String(escolha).split(':');
  if(lab) lab.textContent=(escolha==='eu'||escolha==='+')?'Quanto a outra pessoa cobre':'Quanto '+nomePessoa(id)+' cobre';
  ajustarEdicao();
};
document.addEventListener('click',e=>{
  const b=e.target.closest('#eMeio [data-emeio]'); if(!b) return;
  edMeio=b.dataset.emeio; pintarMeioEd(); vibrar(8);
});
/* Abrir a edição de qualquer lugar que mostre um lançamento. */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-editar]'); if(!b) return;
  e.preventDefault(); abrirEdicao(b.dataset.editar);
});

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
function abrirTodosOsGastos(){
  $('#blocoTodos').hidden=false;
  $('#blocoTodos').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#verTodos').onclick=abrirTodosOsGastos;
// O "ver os gastos" do bloco Dividido com leva pra mesma tabela: é lá que se
// marca quem paga cada linha.
document.querySelectorAll('[data-ver-todos]').forEach(b=>b.onclick=abrirTodosOsGastos);
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
/* Por que a falha aparecia e ficava: uma gravação que dava errado marcava
   'erro' e parava por ali. Não havia nova tentativa — o app só voltava a
   tentar quando a pessoa editasse alguma coisa (o que reagenda o envio) ou
   tocasse no chip. Numa oscilação de dois segundos de rede, o resultado era
   um "Falha ao sincronizar" que ficava na tela até alguém mexer, mesmo com a
   internet já de volta.

   Agora quase toda falha é passageira até prova em contrário: o app tenta de
   novo sozinho, com espera crescente, e DIZ que vai tentar. `sincMotivo`
   guarda a frase do erro real, porque "falha" sem motivo não ajuda ninguém a
   resolver — e havia dois motivos que nenhuma tentativa resolve (estado
   grande demais e sessão expirada), que precisam de resposta diferente. */
const ESPERA_SINC=[4000,12000,40000,120000,300000];
let sincMotivo='', sincTentativa=0, sincProxima=0, sincFatal=false;
const ERRO_SEM_VOLTA=/ESTADO_GRANDE|SESSAO_EXPIRADA|SEM_SESSAO|INVALID_ID_TOKEN|TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED/;

function pintarSinc(){
  const el=$('#sinc'); if(!el) return;
  const hora=sincQuando?new Date(sincQuando).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
  const txt={
    ok:       hora?('Sincronizado '+hora):'Sincronizado',
    enviando: 'Sincronizando…',
    offline:  'Offline — salvo aqui',
    // Com nova tentativa marcada, "falha" é alarme falso: o app está no meio
    // de resolver sozinho, e dizer isso evita o susto e o toque desnecessário.
    erro:     sincProxima?'Tentando de novo…':'Falha ao sincronizar',
    local:    'Só neste aparelho'
  }[sincEstado]||'—';
  /* Ponto vermelho é "preciso de você". Enquanto o app está tentando de novo
     sozinho isso não é verdade — e numa tela de até 430px o span some e o
     ponto é a mensagem inteira. Laranja pulsando: pendente, mas cuidando. */
  el.dataset.e=(sincEstado==='erro'&&sincProxima)?'retentando':sincEstado;
  el.querySelector('span').textContent=txt;
  el.setAttribute('aria-label','Sincronização: '+txt+'. Toque para sincronizar agora.');
  const c=$('#contaSinc');
  const traco={ok:'certo',offline:'lua',erro:'atencao',enviando:'relogio',local:'nota'}[sincEstado]||'relogio';
  /* O cartão da conta é o lugar de explicar: o que falhou, se o app vai
     tentar de novo e o que a pessoa precisa fazer — quando precisa. */
  const daquiA=sincProxima?Math.max(Math.round((sincProxima-Date.now())/1000),1):0;
  const textoErro = sincFatal
    ? `<b>Não consegui sincronizar.</b> ${esc(sincMotivo||'')} Seus dados continuam salvos neste aparelho — nada foi perdido.`
    : `<b>A última sincronização falhou.</b> ${esc(sincMotivo||'')} Seus dados estão salvos neste aparelho${daquiA?` e o app tenta de novo em ${daquiA} segundo${daquiA===1?'':'s'}`:''}. Toque em “Sincronizar agora” se quiser tentar já.`;
  if(c) c.innerHTML=`<div class="aviso-card ${sincEstado==='ok'?'ok':(sincEstado==='erro'&&sincFatal)?'ruim':''}">
    <span class="av-ic">${icone(traco,18)}</span>
    <div>${sincEstado==='ok'?`<b>Tudo salvo na sua conta.</b> Última sincronização às ${hora}. Abrindo em outro aparelho com este mesmo login, os dados estarão lá.`
      :sincEstado==='offline'?'<b>Sem internet agora.</b> Continue usando normalmente — está tudo salvo neste aparelho e sobe sozinho quando a conexão voltar.'
      :sincEstado==='erro'?textoErro
      :'Sincronizando…'}</div></div>`;
}
function marcarSinc(e){
  sincEstado=e;
  if(e==='ok'){ sincQuando=Date.now(); sincMotivo=''; sincTentativa=0; sincProxima=0; sincFatal=false; }
  pintarSinc();
}

function agendarEnvio(){
  if(!Auth.logado()) return;
  /* Uma edição nova cancela a espera da tentativa anterior de propósito: ela
     JÁ é a próxima tentativa, e adiar meia hora o que a pessoa acabou de
     escrever seria o pior dos dois mundos. */
  sincProxima=0;
  clearTimeout(envioT);
  envioT=setTimeout(enviarParaNuvem,1200);
}
/* Espera crescente: 4s, 12s, 40s, 2min e daí 5 em 5 minutos. Curta no começo
   porque a maioria das falhas é um soluço de rede que passa em segundos;
   longa depois para não martelar um servidor que está fora do ar. */
function agendarRetentativa(){
  if(!Auth.logado()) return;
  const espera=ESPERA_SINC[Math.min(sincTentativa,ESPERA_SINC.length-1)];
  sincTentativa++;
  sincProxima=Date.now()+espera;
  clearTimeout(envioT);
  envioT=setTimeout(()=>{ sincProxima=0; enviarParaNuvem(); },espera);
  pintarSinc();
}
async function enviarParaNuvem(){
  if(!Auth.logado()) return;
  if(enviando){ pendente=true; return; }
  if(!navigator.onLine){ marcarSinc('offline'); pendente=true; agendarRetentativa(); return; }
  if(estaVazio(S) && S._revisao){ marcarSinc('ok'); return; }
  enviando=true; marcarSinc('enviando');
  try{
    const r=await Auth.enviarEstado(S);
    if(r) S._revisao=r.revisao;
    marcarSinc('ok');
  }catch(e){
    const cru=String(e.codigo||e.message||'').toUpperCase();
    sincFatal=ERRO_SEM_VOLTA.test(cru);
    sincMotivo=Auth.mensagemDeErro(e);
    if(cru.includes('SEM_REDE')||!navigator.onLine){ marcarSinc('offline'); agendarRetentativa(); }
    else if(sincFatal){ sincTentativa=0; sincProxima=0; marcarSinc('erro'); }   // repetir não resolve: precisa de ação
    else { marcarSinc('erro'); agendarRetentativa(); }
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
      migrarPessoas(); rodarCiclos(); aplicarTema(); preencherCampos(); render();
      await storeSet(KEY,JSON.stringify(S));
      marcarSinc('ok');
      if(!silencioso) toast('Dados atualizados desta conta');
    }else if(tLocal>tRemoto && !estaVazio(S)){
      await enviarParaNuvem();
    }else{
      S._revisao=linha.revisao; marcarSinc('ok');
    }
  }catch(e){
    const cru=String(e.codigo||e.message||'').toUpperCase();
    sincFatal=ERRO_SEM_VOLTA.test(cru);
    sincMotivo=Auth.mensagemDeErro(e);
    marcarSinc(cru.includes('SEM_REDE')?'offline':'erro');
    if(!sincFatal) agendarRetentativa();
  }
}
/* A conexão voltou: recomeça a contagem de espera do zero, senão o app ficaria
   parado no intervalo de cinco minutos herdado de quando estava sem rede. */
window.addEventListener('online',()=>{ if(Auth.logado()){ sincTentativa=0; marcarSinc('enviando'); puxarDaNuvem(true); } });
window.addEventListener('offline',()=>{ if(Auth.logado()) marcarSinc('offline'); });
/* Voltar para o app é o momento mais provável de a rede estar boa de novo — e
   é quando a pessoa vai OLHAR para o aviso. Tentar aqui é o que faz a falha
   sumir sozinha antes de ela reparar. */
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible') return;
  if(!Auth.logado()) return;
  if(sincEstado==='erro'&&sincFatal) return;          // esperar não muda nada
  if(sincEstado==='erro'||sincEstado==='offline'||pendente){
    sincTentativa=0; clearTimeout(envioT); enviarParaNuvem();
  }
});

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
let modoAuth='entrar';   // entrar | cadastrar | recuperar | novaSenha
let codigoRecuperacao=null;   // oobCode do link de "esqueci minha senha" (Firebase)
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
  const tit={entrar:'Entrar',cadastrar:'Criar conta',recuperar:'Recuperar senha',novaSenha:'Nova senha'}[modoAuth];
  const sub={
    entrar:'Seus dados ficam na sua conta, e só nela.',
    cadastrar:'Leva 20 segundos: seu nome, um e-mail e uma senha.',
    recuperar:'Digite seu e-mail e enviamos um link para criar uma senha nova.',
    novaSenha:'Escolha uma senha nova para sua conta.'
  }[modoAuth];
  const rotulo={entrar:'Entrar',cadastrar:'Criar minha conta',recuperar:'Enviar o link',novaSenha:'Salvar nova senha'}[modoAuth];
  $a('authTit').textContent=tit;
  $a('authSub').textContent=sub;
  $a('authEnviar').dataset.rotulo=rotulo;
  $a('authEnviar').textContent=rotulo;
  $a('campoNome').hidden=(modoAuth!=='cadastrar');
  $a('campoEmail').hidden=(modoAuth==='novaSenha');
  $a('campoSenha').hidden=(modoAuth==='recuperar');
  $a('campoConfirma').hidden=(modoAuth!=='cadastrar');
  $a('forcaSenha').hidden=(modoAuth!=='cadastrar');
  $a('authEsqueci').hidden=(modoAuth!=='entrar');
  $a('authSenha').setAttribute('autocomplete',modoAuth==='cadastrar'||modoAuth==='novaSenha'?'new-password':'current-password');
  $a('authTrocaTxt').textContent=(modoAuth==='entrar')?'Ainda não tem conta?':'Já tem conta?';
  $a('authTroca').textContent=(modoAuth==='entrar')?'Criar conta':'Entrar';
  const troca=$('.auth-troca');
  if(troca) troca.hidden=(modoAuth==='novaSenha');
  ['Nome','Email','Senha','Confirma'].forEach(c=>mostrarErroCampo(c,''));
  avisoAuth('');
}
function trocarModo(novo){
  modoAuth=novo; pintarModo();
  $a(modoAuth==='cadastrar'?'authNome':modoAuth==='novaSenha'?'authSenha':'authEmail').focus();
}

function validarFormulario(){
  let ok=true;
  if(modoAuth==='cadastrar'){
    const n=Auth.validarNome($a('authNome').value);
    mostrarErroCampo('Nome',n); if(n) ok=false;
  }
  if(modoAuth!=='novaSenha'){
    const e=Auth.validarEmail($a('authEmail').value);
    mostrarErroCampo('Email',e); if(e) ok=false;
  }
  if(modoAuth!=='recuperar'){
    const s=(modoAuth==='cadastrar'||modoAuth==='novaSenha')
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
      await abrirApp(true,false);
    }else if(modoAuth==='cadastrar'){
      await Auth.cadastrar(email,senha,nome);
      // Rede de segurança: se o nome não voltou junto da sessão, gravamos
      // agora — a saudação nunca pode cair no pedaço do e-mail.
      if(nome && !(Auth.usuario()||{}).nome){
        try{ await Auth.definirNome(nome); }catch(e2){}
      }
      await abrirApp(true,true);
    }else if(modoAuth==='novaSenha'){
      await Auth.trocarSenhaComCodigo(codigoRecuperacao,senha);
      codigoRecuperacao=null;
      history.replaceState(null,'',location.pathname);
      await abrirApp(true,false);
      toast('Senha definida. Você já está com a conta aberta.');
    }else{
      await Auth.recuperarSenha(email, location.origin+'/?recuperar=1');
      avisoAuth(`Se existir uma conta com <b>${esc(email)}</b>, o link para criar uma senha nova já está a caminho. Confira também o spam.`,'ok');
      modoAuth='entrar';
      const guardado=$a('authOk').innerHTML;
      pintarModo(); avisoAuth(guardado,'ok');
    }
  }catch(e){
    avisoAuth(Auth.mensagemDeErro(e));
    if(/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i.test(String(e.codigo||e.message||''))) $a('authSenha').select();
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
  sairFoco();                      // sair da conta desfaz qualquer área em foco
  pintarModo();
  focarEntrada();
}

/* Coloca o cursor no primeiro campo — mas nunca por trás da capa, senão o
   teclado do celular abre escondido. Enquanto a capa estiver por cima, o foco
   fica adiado; quem chama de novo é a saída da capa. */
function focarEntrada(){
  setTimeout(()=>{
    // "Ainda cobrindo" é a capa visível E que não começou a sair: no momento
    // em que ela sai o login já está à frente, e aí o foco pode ir.
    const capa=$('#capa');
    if(capa && !capa.hidden && !capa.classList.contains('sai')) return;
    if($('#auth').hidden) return;             // já entrou no app
    const alvo=$a(modoAuth==='cadastrar'?'authNome':modoAuth==='novaSenha'?'authSenha':'authEmail');
    if(alvo) alvo.focus();
  },380);
}

/* ==========================================================================
   Entrar no app depois de autenticado
   ========================================================================== */
/* `recemLogado` quer dizer "autenticou nesta sessão", e vale tanto para quem
   entrou quanto para quem se cadastrou — é o que dispara a importação dos
   dados de antes do login. Quem acabou de CRIAR a conta é outra coisa, e vem
   em `contaNova`: para essa pessoa o caminho útil é o passo a passo em Hoje,
   não uma escolha de área. */
async function abrirApp(recemLogado, contaNova){
  /* Espera a capa sair antes de revelar o app. Reabrindo com sessão salva,
     abrirApp() é chamada na partida, com a capa ainda na tela: sem esta linha
     o app aparecia atrás dela e as duas telas se sobrepunham. Depois de um
     login pelo formulário a capa já saiu, e esperar aqui não custa nada. */
  await capaPronta;
  const u=Auth.usuario();
  usarChaveDe(u&&u.id);
  document.body.classList.remove('sem-barra');
  if(fundoLigado()) cenaAoFundo(); else encerrarCena();
  $('#auth').hidden=true;
  $('#appWrap').hidden=false;
  $('#tabbar').hidden=false;
  $('#fab').hidden=false;
  /* O portal só na entrada, e não para quem acabou de criar a conta: ali o
     caminho útil é o passo a passo em Hoje, não uma escolha de área. */
  sairFoco();
  if(!contaNova) abrirPortal();
  ligarVoltarPortal();

  await carregar();

  // Dados que já existiam neste aparelho antes de haver conta: importa uma vez.
  if(recemLogado && !S.lanc.length && !((+S.salario||0)+(+S.extra||0))){
    try{
      const antigo=await storeGet(KEY_ANTIGA);
      if(antigo){
        const d=JSON.parse(antigo);
        if(d && (d.lanc||[]).length){
          S=Object.assign(S,d); delete S._revisao;
          migrarPessoas(); rodarCiclos(); preencherCampos(); render(); await salvar();
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
  renderAssinatura(); pintarMenuPerfil(); pintarSwitchCapa(); pintarSwitchFundo(); pintarSwitchPortal();

  // Local primeiro: o app já está pronto com o que estava no aparelho. A nuvem
  // é consultada em segundo plano, sem segurar a tela. Se vier algo mais novo,
  // a tela se atualiza sozinha.
  marcarSinc(navigator.onLine?'enviando':'offline');
  puxarDaNuvem(true);

  /* A retrospectiva é uma TELA, não um aviso: não pode dividir o vídeo com a
     escolha de área. Ela nasce em z-index 70 e o portal vive em 120, então
     abrir as duas juntas escondia a retrospectiva ATRÁS das cartas — ilegível
     e sem como fechar. Com o portal na tela ela fica na fila e entra assim
     que a pessoa escolhe uma área. */
  if(avisoCiclo&&S.hist.length&&S.retroVista!==S.hist[0].data){
    const mes=S.hist[0];
    S.retroVista=mes.data; salvar();
    if(document.body.classList.contains('com-portal')) retroPendente=mes;
    else setTimeout(()=>mostrarRetro(mes),650);
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
        pintarSaudacao(); pintarConta(); pintarMenuPerfil();
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
  montarEscolhaAvatar();
  pintarAvatares();
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
      pintarSaudacao(); pintarConta(); pintarMenuPerfil(); render();
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
$('#btnSincAgora').onclick=async()=>{
  /* Tentativa a pedido zera a espera: a pessoa não deve esperar o relógio de
     uma tentativa automática que estava marcada para daqui a cinco minutos. */
  sincTentativa=0; sincProxima=0; clearTimeout(envioT);
  await puxarDaNuvem(); await enviarParaNuvem();
  // Dizer "Sincronizado" depois de falhar é mentir na cara de quem tocou.
  if(sincEstado==='ok') toast('Sincronizado');
  else toast(sincMotivo||'Não consegui sincronizar agora',true);
};
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
  capaPronta=mostrarCapa();          // some ao primeiro toque
  const capa=capaPronta;
  try{
    // Voltou do e-mail de recuperação: o Firebase manda um "oobCode" de uso
    // único na URL (não uma sessão pronta), que a pessoa troca por uma senha
    // nova na própria tela de entrada.
    const params=new URLSearchParams(location.search);
    if(params.get('mode')==='resetPassword' && params.get('oobCode')){
      codigoRecuperacao=params.get('oobCode');
      history.replaceState(null,'',location.pathname);
      tirarCapaAgora();
      modoAuth='novaSenha';
      mostrarAuth();
      esconderSplash();
      return;
    }
    if(Auth.logado()) await abrirApp(false);
    else mostrarAuth();
  }catch(e){
    /* Se a partida falhar, a capa NÃO pode continuar por cima: a pessoa ficaria
       olhando o texto da abertura sobreposto ao formulário, sem entender nada.
       Tira a capa da frente antes de mostrar o login e o aviso. */
    tirarCapaAgora();
    mostrarAuth();
    avisoAuth('Algo saiu do lugar ao abrir o app. Entre de novo, por favor.');
  }finally{
    esconderSplash();
    await capa;                      // o app só aparece depois do toque
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

/* ==========================================================================
   v5.2 — menu de perfil e esqueleto de assinatura
   ========================================================================== */

/* O plano fica registrado no estado só para a interface saber o que mostrar.
   ATENÇÃO para quando isto virar SaaS de verdade: assinatura NÃO pode morar
   aqui. Este objeto é gravado pelo próprio usuário na coluna `dados`, então
   qualquer pessoa poderia se dar um plano pago editando o navegador. A fonte
   da verdade tem que ser uma tabela separada, escrita só pelo servidor (ou
   pelo webhook do meio de pagamento) e apenas legível pelo dono. */
const PLANOS={
  gratuito:{nome:'Gratuito', desc:'Tudo o que existe hoje, sem limite'},
  pago:    {nome:'Pro',      desc:'Ainda não existe'}
};
function planoAtual(){
  const p=(S.plano&&S.plano.tipo)||'gratuito';
  return PLANOS[p]?p:'gratuito';
}

const RECURSOS_HOJE=[
  ['Lançamentos sem limite','Quantos gastos você quiser, em quantos ciclos precisar.'],
  ['Sua conta em qualquer aparelho','Celular, tablet e computador com os mesmos dados.'],
  ['Alertas e lembretes com hora marcada','Sem limite de horários nem de tipos de aviso.'],
  ['Gráficos e histórico de faturas','As últimas 24 faturas guardadas, item a item.'],
  ['Importar extrato do banco','OFX e CSV, lidos no seu aparelho.'],
  ['Funciona sem internet','E sincroniza sozinho quando a conexão volta.']
];
const IDEIAS_PAGAS=[
  ['Vários cartões e contas','Cada um com fechamento e vencimento próprios.'],
  ['Lembrete na hora exata com o app fechado','Exige um servidor de notificação — é o que hoje não dá para garantir.'],
  ['Orçamento compartilhado','Duas pessoas, a mesma casa, os mesmos tetos.'],
  ['Histórico sem limite de meses','Hoje guardamos as últimas 24 faturas.'],
  ['Relatório do ano em PDF','Para levar ao contador ou guardar.'],
  ['Categorias suas','Além das dez que já vêm prontas.']
];

function renderAssinatura(){
  const cx=$('#planoAtual'); if(!cx) return;
  const p=planoAtual();
  cx.innerHTML=`<div class="plano-cartao">
    <div class="pc-ic">${icone('certo',20)}</div>
    <div><b>Seu plano: ${PLANOS[p].nome}</b><span>${PLANOS[p].desc}</span></div>
  </div>`;
  $('#listaGratuito').innerHTML=RECURSOS_HOJE.map(([t,d])=>
    `<li>${icone('certo',18)}<div><b>${esc(t)}</b><span class="obs">${esc(d)}</span></div></li>`).join('');
  $('#listaPago').innerHTML=IDEIAS_PAGAS.map(([t,d])=>
    `<li>${icone('relogio',18)}<div><b>${esc(t)}</b><span class="obs">${esc(d)}</span></div></li>`).join('');
}

/* ---------- menu de perfil ---------- */
let menuAberto=false;
function pintarMenuPerfil(){
  const u=Auth.usuario(); if(!u) return;
  const nome=Auth.primeiroNome();
  const inicial=(nome||u.email||'?').charAt(0);
  $('#perfilBtn').classList.add('logado');
  $('#mpAvatar').textContent=inicial;
  pintarAvatares();
  $('#mpNome').textContent=(u.nome||'').trim()||'Sem nome ainda';
  $('#mpEmail').textContent=u.email||'—';
  const p=planoAtual();
  $('#mpPlano').innerHTML=`<span>Plano <b>${PLANOS[p].nome}</b></span>`+
    (p==='gratuito'?'<em class="selo">Grátis</em>':'');
}
/* O menu vive fora do app (no fim do body) para poder abrir também por cima
   da tela de cartas, onde o conteúdo do app está escondido. Como ele não está
   mais ancorado no cabeçalho por CSS, quem o posiciona é esta função: embaixo
   do botão que o chamou, e nunca para fora da tela. */
let menuDono=null;
function ancorarMenu(botao){
  const m=$('#menuPerfil'); if(!m||!botao) return;
  const r=botao.getBoundingClientRect();
  const larg=m.offsetWidth||300;
  const x=Math.max(12, Math.min(r.left, window.innerWidth-larg-12));
  m.style.left=Math.round(x)+'px';
  m.style.top=Math.round(r.bottom+8)+'px';
}
function abrirMenu(botao){
  pintarMenuPerfil();
  menuAberto=true;
  menuDono=botao||$('#perfilBtn');
  $('#menuPerfil').hidden=false;
  ancorarMenu(menuDono);
  menuDono.setAttribute('aria-expanded','true');
  const primeiro=$('#menuPerfil').querySelector('.mp-item');
  if(primeiro) setTimeout(()=>primeiro.focus(),40);
}
window.addEventListener('resize',()=>{ if(menuAberto) ancorarMenu(menuDono); });
function fecharMenu(devolverFoco){
  if(!menuAberto) return;
  menuAberto=false;
  $('#menuPerfil').hidden=true;
  ['#perfilBtn','#portalPerfil'].forEach(id=>{
    const b=$(id); if(b) b.setAttribute('aria-expanded','false');
  });
  if(devolverFoco && menuDono) menuDono.focus();
  menuDono=null;
}
$('#perfilBtn').onclick=()=>{ menuAberto?fecharMenu(true):abrirMenu($('#perfilBtn')); };
$('#portalPerfil').onclick=()=>{ menuAberto?fecharMenu(true):abrirMenu($('#portalPerfil')); };
/* "Veio de dentro daqui?" perguntado ao CAMINHO do evento, não ao alvo.

   `composedPath()` é calculado no momento do disparo e não muda depois — então
   ele responde certo mesmo que algum ouvinte anterior tenha tirado o alvo do
   documento no meio da propagação, que é exatamente o que acontecia com o ícone
   do perfil. `closest` fica como reserva para navegador sem composedPath. */
function cliqueVeioDe(e,sel){
  const caminho=(typeof e.composedPath==='function')?e.composedPath():null;
  if(caminho) for(const n of caminho){ if(n&&n.nodeType===1&&n.matches&&n.matches(sel)) return true; }
  return !!(e.target&&e.target.closest&&e.target.closest(sel));
}
document.addEventListener('click',e=>{
  if(!menuAberto) return;
  if(cliqueVeioDe(e,'#menuPerfil,#perfilBtn,#portalPerfil')) return;
  fecharMenu(false);
});
document.addEventListener('keydown',e=>{
  if(!menuAberto) return;
  /* stopImmediatePropagation, e não stopPropagation: os dois ouvintes de Esc
     estão no MESMO document, e propagação parada não impede o vizinho de
     rodar — era assim que um Esc no menu fechava a tela de cartas junto. */
  if(e.key==='Escape'){ e.stopImmediatePropagation(); fecharMenu(true); return; }
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp') return;
  const itens=[...$('#menuPerfil').querySelectorAll('.mp-item')];
  const i=itens.indexOf(document.activeElement);
  e.preventDefault();
  const proximo=e.key==='ArrowDown' ? (i+1)%itens.length : (i<=0?itens.length-1:i-1);
  itens[proximo].focus();
});
$('#menuPerfil').addEventListener('click',e=>{
  const item=e.target.closest('[data-menu]'); if(!item) return;
  const acao=item.dataset.menu;
  fecharMenu(false);
  if(acao==='sair'){ sairDaConta(); return; }
  const destino={conta:'ajustes:conta', assinatura:'ajustes:assinatura',
                 alertas:'ajustes:alertas', dados:'ajustes:dados'}[acao];
  if(!destino) return;
  /* Vindo da tela de cartas, o menu é mais uma porta: fecha as cartas e entra
     em Ajustes no mesmo modo foco, com o botão "Áreas" para voltar. */
  const naEscolha=!$('#portal').hidden;
  irPara(destino);
  if(naEscolha){ fecharPortal(); entrarFoco(); }
});

/* ==========================================================================
   v5.6 — abertura cinematográfica

   Uma cena só, viva do primeiro segundo até o login terminar:

     cena de fundo  ← nunca é trocada, só recua
       └ capa       ← logo, nome, frase, "clique em qualquer lugar"
       └ login      ← entra por cima, em painel de vidro

   O clique não corta para outra tela: ele afasta o fundo (escala, desfoque,
   véu) e traz o formulário à frente. O degradê por baixo do canvas já é a
   versão final para quem está sem o campo de partículas — offline, aparelho
   antigo ou menos movimento —, então nada fica feio se o canvas não subir.
   ========================================================================== */
/* Desmonta a cena e devolve o fundo normal do app. */
function encerrarCena(){
  document.body.classList.remove('tem-cena','capa-aberta','fundo-vivo');
  const el=$('#cena');
  if(!el || el.hidden) return;
  el.classList.add('sai');
  if(cena){ cena.encerrar(); cena=null; }
  setTimeout(()=>{ el.hidden=true; el.classList.remove('sai','mergulha','fundo'); },520);
}

/* A esfera pode continuar viva atrás do app depois do login. É preferência de
   aparelho, não de conta: quem usa um celular fraco desliga ali, e isso não
   deve seguir a pessoa para o computador dela. */
const FUNDO_APP='sobra:fundo-app';
function fundoLigado(){
  try{ return localStorage.getItem('sobra:fundo-app')!=='0'; }catch(e){ return true; }
}

/* Leva a cena para trás do app: z-index abaixo do conteúdo, e o campo entra em
   modo decoração — mais apagado, mais devagar, metade dos quadros. Se a
   abertura estiver desligada não existe cena nenhuma ainda, então ela é criada
   aqui mesmo. */
function cenaAoFundo(){
  const el=$('#cena');
  if(!el) return;
  el.hidden=false;
  el.classList.add('mergulha','fundo');
  el.classList.remove('sai');
  document.body.classList.add('fundo-vivo');
  document.body.classList.remove('tem-cena','capa-aberta');
  if(cena){ cena.recuar(); $('#capaCena').classList.add('pronta'); return; }
  import('/intro.js')
    .then(m=>m.iniciarAbertura($('#capaCena'),'fundo'))
    .then(c=>{ if(!fundoLigado()){ c.encerrar(); return; }
      cena=c; $('#capaCena').classList.add('pronta'); })
    .catch(()=>{ /* fica o degradê do CSS, que já é um fundo escuro inteiro */ });
}

const CAPA_DESLIGADA='sobra:capa-off';
/* A chave vai escrita à mão aqui de propósito. Esta função é chamada na
   partida, que roda ANTES desta linha do arquivo — ler a constante ali dá
   ReferenceError, o catch engolia e a preferência de quem desligou a abertura
   era ignorada. Depender de uma const declarada mais abaixo é armadilha. */
function capaLigada(){
  try{ return localStorage.getItem('sobra:capa-off')!=='1'; }catch(e){ return true; }
}
function mostrarCapa(){
  /* No resgate a página vai embora em seguida: montar a esfera aqui só
     atrasaria a saída, competindo pela thread justamente na hora em que a
     pessoa está tentando destravar o app. */
  if(RESGATE) return Promise.resolve();
  if(!capaLigada()) return Promise.resolve();
  const capa=$('#capa'), fundo=$('#cena');
  fundo.hidden=false;
  capa.hidden=false;
  document.body.classList.add('tem-cena','capa-aberta');
  esconderSplash();               // uma tela de espera de cada vez
  document.body.style.overflow='hidden';

  // O campo de partículas é um módulo à parte: carrega sem segurar nada.
  // Se falhar, fica o degradê — que já é a tela final, não um remendo.
  import('/intro.js')
    .then(m=>m.iniciarAbertura($('#capaCena')))
    .then(c=>{ if(capaSaindo && !cena){ c.encerrar(); return; }
      cena=c; $('#capaCena').classList.add('pronta'); })
    .catch(()=>{});

  return new Promise(resolve=>{
    const entrar=()=>{
      if(capaSaindo) return;
      capaSaindo=true;
      vibrar(12);

      /* O fundo recua e o texto da capa sai junto — as duas coisas ao mesmo
         tempo, senão a troca parece um corte. O login só é revelado no meio
         do caminho, quando o desfoque já pegou. */
      fundo.classList.add('mergulha');
      capa.classList.add('sai');

      const revelar=()=>{
        document.body.classList.remove('capa-aberta');   // o login entra agora
        document.body.style.overflow='';
        resolve();                 // daqui o app decide: login ou direto pro app
        focarEntrada();
      };
      if(cena) cena.mergulhar(revelar);
      else setTimeout(revelar,380);

      setTimeout(()=>{ capa.hidden=true; },650);
    };
    capa.addEventListener('click',entrar);
    capa.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); entrar(); }
    });
    // A tela inteira é o botão, então é ela que recebe o foco do teclado.
    setTimeout(()=>{ if(!capa.hidden) capa.focus(); },700);
  });
}

/* Saída de emergência da capa: sem animação, sem esperar clique. Só é usada
   quando a partida falhou — em uso normal quem tira a capa é o toque. */
function tirarCapaAgora(){
  capaSaindo=true;
  const capa=$('#capa');
  if(capa){ capa.classList.add('sai'); capa.hidden=true; }
  document.body.classList.remove('capa-aberta');
  document.body.style.overflow='';
}

/* preferência de abertura: por aparelho, não por conta (é gosto de quem usa
   aquele celular, e precisa ser lida antes de qualquer login) */
function pintarSwitchCapa(){
  const b=$('#swCapa'); if(!b) return;
  b.setAttribute('aria-checked', capaLigada()?'true':'false');
}
$('#swCapa').onclick=()=>{
  const ligar=!capaLigada();
  try{ localStorage.setItem(CAPA_DESLIGADA, ligar?'0':'1'); }catch(e){}
  pintarSwitchCapa();
  toast(ligar?'Abertura animada ligada':'Abertura animada desligada');
};

function pintarSwitchPortal(){
  const b=$('#swPortal'); if(!b) return;
  b.setAttribute('aria-checked', portalLigado()?'true':'false');
}
$('#swPortal').onclick=()=>{
  const ligar=!portalLigado();
  try{ localStorage.setItem(PORTAL_OFF, ligar?'0':'1'); }catch(e){}
  pintarSwitchPortal();
  toast(ligar?'Cartas ligadas na entrada':'Cartas desligadas');
};

function pintarSwitchFundo(){
  const b=$('#swFundo'); if(!b) return;
  b.setAttribute('aria-checked', fundoLigado()?'true':'false');
}
$('#swFundo').onclick=()=>{
  const ligar=!fundoLigado();
  try{ localStorage.setItem(FUNDO_APP, ligar?'1':'0'); }catch(e){}
  pintarSwitchFundo();
  // Vale na hora: ligar traz a esfera, desligar devolve o fundo normal.
  if(ligar) cenaAoFundo(); else encerrarCena();
  toast(ligar?'Esfera ligada atrás do app':'Esfera desligada');
};

/* ==========================================================================
   v6 — Física de interface

   O que separa uma interface "animada" de uma que parece ter peso é ela
   responder ao ponteiro de forma contínua, e não em degraus. Aqui isso é
   feito com interpolação: a cada quadro o valor atual anda uma fração do
   caminho até o alvo. É o que elimina o serrilhado de mover direto para a
   posição do mouse.

   Três regras que este arquivo respeita, e que são o motivo de ele não pesar:

   1. UM ouvinte de ponteiro para a página inteira, não um por cartão. Um
      cartão entra e sai da tela o tempo todo; prender ouvintes neles seria
      criar e destruir centenas por sessão, e é assim que se vaza memória.
   2. O laço de animação NÃO fica rodando à toa. Ele começa quando o ponteiro
      encontra um cartão e para sozinho quando tudo voltou ao lugar.
   3. Só `transform` e `opacity` são animados. Mexer em width, margin ou top
      obriga o navegador a recalcular o layout da página a cada quadro, e aí
      não existe 60 fps que resista.

   Nada disso vale no toque: sem cursor não há inclinação a seguir, e gastar
   bateria com isso num celular seria só desperdício.
   ========================================================================== */
/* Cartões E teclas. O laço é o mesmo — quatro números por quadro, escritos
   como variáveis CSS — então incluir os botões não custa um segundo laço nem
   um segundo listener: custa o mesmo quadro que já estava rodando. */
const ALVOS_TILT = '.carta, .card, .hero, .corte, .re-card, .tecla, .btn, .sub, .fab, .tb';

function ligarFisica(){
  let fino=false, quieto=false;
  try{
    fino = matchMedia('(hover:hover) and (pointer:fine)').matches;
    quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }catch(e){}
  if(!fino || quieto) return;          // toque ou "menos movimento": nada disso

  let alvo=null;                       // elemento sob o ponteiro
  let ax=0, ay=0;                      // para onde ele deve inclinar (-1..1)
  let cx=0, cy=0;                      // onde ele está agora
  let rodando=false;

  function passo(){
    // Anda 16% do caminho por quadro: rápido o bastante para acompanhar o
    // mouse, lento o bastante para o movimento ter inércia.
    cx += (ax-cx)*0.16;
    cy += (ay-cy)*0.16;

    if(alvo){
      alvo.style.setProperty('--rx', cx.toFixed(4));
      alvo.style.setProperty('--ry', cy.toFixed(4));
    }

    // Parou de valer a pena continuar? Encerra o laço em vez de girar à toa.
    if(!alvo && Math.abs(cx)<0.002 && Math.abs(cy)<0.002){
      rodando=false;
      return;
    }
    requestAnimationFrame(passo);
  }
  function acordar(){ if(!rodando){ rodando=true; requestAnimationFrame(passo); } }

  function soltar(){
    if(alvo){
      /* Ao sair, o elemento volta ao lugar por CSS, não pelo laço: assim o
         ponteiro pode entrar noutro cartão no quadro seguinte sem que os dois
         disputem a mesma variável. */
      alvo.classList.remove('tilt-ativo');
      alvo.style.removeProperty('--rx');
      alvo.style.removeProperty('--ry');
      alvo.style.removeProperty('--mx');
      alvo.style.removeProperty('--my');
      alvo=null;
    }
    ax=ay=cx=cy=0;
  }

  document.addEventListener('pointermove', e=>{
    const el = e.target.closest ? e.target.closest(ALVOS_TILT) : null;
    if(el!==alvo){
      soltar();
      if(el){ alvo=el; el.classList.add('tilt-ativo'); }
    }
    if(!alvo) return;

    const r=alvo.getBoundingClientRect();
    if(!r.width || !r.height) return;
    const px=(e.clientX-r.left)/r.width;      // 0..1 dentro do elemento
    const py=(e.clientY-r.top)/r.height;
    ax=Math.max(-1,Math.min(1,(px-0.5)*2));
    ay=Math.max(-1,Math.min(1,(py-0.5)*2));
    // Posição do brilho que segue o cursor — direto, sem suavizar: ele é luz,
    // e luz não tem inércia.
    alvo.style.setProperty('--mx', (px*100).toFixed(1)+'%');
    alvo.style.setProperty('--my', (py*100).toFixed(1)+'%');
    acordar();
  }, {passive:true});

  // Sair da janela, trocar de aba ou rolar a página tira a mão do cartão.
  document.addEventListener('pointerleave', soltar, {passive:true});
  window.addEventListener('blur', soltar);
  document.addEventListener('scroll', ()=>{ if(alvo) soltar(); }, {passive:true});
}
ligarFisica();

/* ==========================================================================
   v6.1 — Portal de cartas

   Quatro cartas, uma por área que existe de verdade no app. Aparece uma vez
   por abertura, depois do login; a partir daí a barra de navegação assume.
   É o meio-termo entre as duas coisas que foram pedidas: as cartas dão a
   entrada, e trocar de aba durante o dia continua custando um toque só.

   A arte de cada carta é DESENHADA AQUI, em SVG. Não é imagem baixada: são
   quatro composições geométricas com o degradê da marca, cada uma falando do
   que a área faz. Isso mantém o app funcionando offline, sem licença de
   terceiro, sem um único quilobyte de download — e, ao contrário de uma foto
   de banco de imagens, casa com a esfera da abertura.
   ========================================================================== */
const CARTAS = [
  { a:'hoje',    rotulo:'Hoje',     titulo:'Quanto posso gastar',
    sub:'O número do dia, já descontado o que você quer guardar.' },
  { a:'plano',   rotulo:'Plano',    titulo:'Renda, tetos e metas',
    sub:'O que entra, quanto cada categoria pode levar e o que você quer juntar.' },
  { a:'analise', rotulo:'Análises', titulo:'Para onde foi o dinheiro',
    sub:'O mês em números, o que estourou e o que dá para cortar.' },
  { a:'ajustes', rotulo:'Ajustes',  titulo:'Alertas, conta e dados',
    sub:'Quando o app te avisa, seus dados e as preferências deste aparelho.' }
];

/* As artes. Cada uma é um SVG de 400×260 que preenche a carta inteira.
   Todas partem do mesmo degradê para as quatro se lerem como um conjunto. */
function arteCarta(qual){
  const id='g'+qual;
  /* As cores saem de variáveis CSS, não de códigos fixos aqui dentro — e por
     isso a arte troca de tema junto com o app, sem precisar redesenhar nada.
     `var()` não vale em atributo de apresentação (fill="..."), só em style:
     é por isso que cada peça abaixo usa style= em vez do atributo. */
  const base=`<defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:var(--arte-1)"/>
      <stop offset=".55" style="stop-color:var(--arte-2)"/>
      <stop offset="1" style="stop-color:var(--arte-3)"/></linearGradient>
    <radialGradient id="${id}b" cx=".3" cy=".2" r=".9">
      <stop offset="0" style="stop-color:var(--arte-fundo-1)"/>
      <stop offset="1" style="stop-color:var(--arte-fundo-2)"/></radialGradient>
  </defs>
  <rect width="400" height="260" style="fill:url(#${id}b)"/>`;

  const arte={
    // Anéis concêntricos, um deles preenchido: o dia em progresso.
    hoje:`<g fill="none" style="stroke:url(#${id})" stroke-linecap="round">
      <circle cx="200" cy="130" r="86" style="stroke:var(--arte-fio-forte)" stroke-width="16"/>
      <circle cx="200" cy="130" r="86" stroke-width="16" stroke-dasharray="352 540"
              transform="rotate(-90 200 130)"/>
      <circle cx="200" cy="130" r="56" style="stroke:var(--arte-fio)" stroke-width="2"/>
      <circle cx="200" cy="130" r="118" style="stroke:var(--arte-fio-fraco)" stroke-width="1.5"/>
    </g>
    <circle cx="200" cy="44" r="6" style="fill:var(--arte-3)"/>`,

    // Barras de alturas diferentes: o plano, categoria a categoria.
    plano:`<g>
      ${[[96,150],[140,96],[184,190],[228,124],[272,70]].map((b,i)=>
        `<rect x="${b[0]}" y="${232-b[1]}" width="34" height="${b[1]}" rx="10"
               style="fill:url(#${id})" opacity="${(0.42+i*0.14).toFixed(2)}"/>`).join('')}
      <path d="M78 232h250" style="stroke:var(--arte-fio-forte)" stroke-width="1.5"/>
      <path d="M96 62h64" style="stroke:url(#${id})" stroke-width="4" stroke-linecap="round"/>
    </g>`,

    // Malha de nós ligados: o dado analisado.
    analise:(()=>{
      const ns=[[92,72],[168,132],[124,196],[236,68],[292,148],[214,210],[330,96]];
      const ls=[[0,1],[1,2],[1,3],[3,4],[4,5],[1,5],[3,6],[4,6]];
      return `<g>
        ${ls.map(([a,b])=>`<path d="M${ns[a][0]} ${ns[a][1]}L${ns[b][0]} ${ns[b][1]}"
          style="stroke:url(#${id})" stroke-opacity=".45" stroke-width="1.5"/>`).join('')}
        ${ns.map((n,i)=>`<circle cx="${n[0]}" cy="${n[1]}" r="${i%3===0?7:4.5}"
          style="fill:url(#${id})"/>`).join('')}
      </g>`;
    })(),

    // Arcos concêntricos interrompidos: mecanismo, sem virar desenho de engrenagem.
    ajustes:`<g fill="none" style="stroke:url(#${id})" stroke-linecap="round">
      <path d="M200 46a84 84 0 0 1 84 84" stroke-width="9"/>
      <path d="M284 130a84 84 0 0 1-84 84" stroke-width="9" stroke-opacity=".45"/>
      <path d="M200 214a84 84 0 0 1-84-84" stroke-width="9" stroke-opacity=".7"/>
      <path d="M116 130a84 84 0 0 1 40-72" stroke-width="9" stroke-opacity=".3"/>
      <circle cx="200" cy="130" r="30" stroke-width="9"/>
    </g>`
  }[qual]||'';

  return `<svg class="carta-arte" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice"
     aria-hidden="true" focusable="false">${base}${arte}</svg>`;
}

/* ==========================================================================
   Avatares

   Dez bichos e companhia, desenhados aqui em SVG. Nenhuma imagem baixada:
   são formas geométricas simples, o que resolve três coisas de uma vez — o
   app continua funcionando offline, o avatar fica nítido em qualquer tela
   (36 px no cabeçalho, 52 px na conta) e não há licença de terceiro no meio.

   Cada um traz o próprio fundo colorido, então eles se leem igual no tema
   claro e no escuro sem precisar de duas versões.

   A escolha vive no estado da CONTA, não do aparelho: o rosto que a pessoa
   escolheu acompanha ela no celular e no computador.
   ========================================================================== */
const AVATARES={
  raposa:{nome:'Raposa', cor:'#F2872C', arte:`
    <path d="M8 17 L13 3 L22 12 Z" fill="#C7621B"/><path d="M40 17 L35 3 L26 12 Z" fill="#C7621B"/>
    <path d="M24 25c7 0 11 4 11 8s-5 8-11 8-11-3-11-8 4-8 11-8z" fill="#FFF1E2"/>
    <circle cx="17" cy="23" r="2.7" fill="#2A1608"/><circle cx="31" cy="23" r="2.7" fill="#2A1608"/>
    <ellipse cx="24" cy="31" rx="2.8" ry="2.2" fill="#2A1608"/>
    <path d="M24 33v3" stroke="#2A1608" stroke-width="1.6" stroke-linecap="round"/>`},

  gato:{nome:'Gato', cor:'#8B8CA7', arte:`
    <path d="M9 16 L12 3 L22 11 Z" fill="#6D6E88"/><path d="M39 16 L36 3 L26 11 Z" fill="#6D6E88"/>
    <path d="M12.5 13 L14 6.5 L18.5 11 Z" fill="#F2909F"/><path d="M35.5 13 L34 6.5 L29.5 11 Z" fill="#F2909F"/>
    <ellipse cx="17" cy="24" rx="3" ry="3.4" fill="#20223A"/><ellipse cx="31" cy="24" rx="3" ry="3.4" fill="#20223A"/>
    <circle cx="18" cy="23" r="1" fill="#fff"/><circle cx="32" cy="23" r="1" fill="#fff"/>
    <path d="M24 30l3 2-3 2-3-2z" fill="#F2909F"/>
    <g stroke="#FFFFFF" stroke-opacity=".62" stroke-width="1.3" stroke-linecap="round">
      <path d="M8 29h7M8 33h7M40 29h-7M40 33h-7"/></g>`},

  coruja:{nome:'Coruja', cor:'#8A6A4B', arte:`
    <path d="M11 11 L15 2 L22 10 Z" fill="#6D5238"/><path d="M37 11 L33 2 L26 10 Z" fill="#6D5238"/>
    <circle cx="17" cy="23" r="7.5" fill="#FFF4E4"/><circle cx="31" cy="23" r="7.5" fill="#FFF4E4"/>
    <circle cx="17.6" cy="23" r="3.4" fill="#2A1608"/><circle cx="30.4" cy="23" r="3.4" fill="#2A1608"/>
    <circle cx="18.6" cy="22" r="1.1" fill="#fff"/><circle cx="31.4" cy="22" r="1.1" fill="#fff"/>
    <path d="M24 28l4.5 4.5L24 37l-4.5-4.5z" fill="#F2B23C"/>
    <path d="M14 40c3-2 7-3 10-3s7 1 10 3" stroke="#6D5238" stroke-width="2" fill="none" stroke-linecap="round"/>`},

  panda:{nome:'Panda', cor:'#F0ECEA', arte:`
    <circle cx="11" cy="12" r="6.5" fill="#2E2C33"/><circle cx="37" cy="12" r="6.5" fill="#2E2C33"/>
    <ellipse cx="16.5" cy="24" rx="6" ry="7" fill="#2E2C33" transform="rotate(-14 16.5 24)"/>
    <ellipse cx="31.5" cy="24" rx="6" ry="7" fill="#2E2C33" transform="rotate(14 31.5 24)"/>
    <circle cx="16.5" cy="24" r="2.4" fill="#FFFFFF"/><circle cx="31.5" cy="24" r="2.4" fill="#FFFFFF"/>
    <ellipse cx="24" cy="32" rx="3.4" ry="2.6" fill="#2E2C33"/>
    <path d="M24 35c0 2-2 3-3.6 2.6M24 35c0 2 2 3 3.6 2.6" stroke="#2E2C33" stroke-width="1.5"
          fill="none" stroke-linecap="round"/>`},

  sapo:{nome:'Sapo', cor:'#4FA83C', arte:`
    <circle cx="15" cy="14" r="7" fill="#7BC96A"/><circle cx="33" cy="14" r="7" fill="#7BC96A"/>
    <circle cx="15" cy="14" r="4.6" fill="#FFFFFF"/><circle cx="33" cy="14" r="4.6" fill="#FFFFFF"/>
    <circle cx="15.8" cy="14.6" r="2.4" fill="#1F3A16"/><circle cx="32.2" cy="14.6" r="2.4" fill="#1F3A16"/>
    <path d="M12 28q12 11 24 0" stroke="#1F5A18" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="21" cy="24" r="1.1" fill="#1F5A18"/><circle cx="27" cy="24" r="1.1" fill="#1F5A18"/>
    <circle cx="10" cy="31" r="2.6" fill="#7BC96A" opacity=".8"/>
    <circle cx="38" cy="31" r="2.6" fill="#7BC96A" opacity=".8"/>`},

  pinguim:{nome:'Pinguim', cor:'#2B3245', arte:`
    <path d="M24 12c7 0 12 7 12 15s-5 14-12 14-12-6-12-14 5-15 12-15z" fill="#F7F7FA"/>
    <circle cx="19" cy="23" r="2.6" fill="#20243A"/><circle cx="29" cy="23" r="2.6" fill="#20243A"/>
    <circle cx="19.8" cy="22.2" r="0.9" fill="#fff"/><circle cx="29.8" cy="22.2" r="0.9" fill="#fff"/>
    <path d="M24 27l5.5 3.5L24 34l-5.5-3.5z" fill="#F5A623"/>
    <path d="M9 26c-1 6 1 11 4 13" stroke="#20243A" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M39 26c1 6-1 11-4 13" stroke="#20243A" stroke-width="3" fill="none" stroke-linecap="round"/>`},

  urso:{nome:'Urso', cor:'#A3714A', arte:`
    <circle cx="11" cy="13" r="6.5" fill="#845838"/><circle cx="37" cy="13" r="6.5" fill="#845838"/>
    <circle cx="11" cy="13" r="3.2" fill="#C79A72"/><circle cx="37" cy="13" r="3.2" fill="#C79A72"/>
    <ellipse cx="24" cy="32" rx="9.5" ry="7" fill="#E8CBA9"/>
    <circle cx="17.5" cy="23" r="2.6" fill="#3A2416"/><circle cx="30.5" cy="23" r="2.6" fill="#3A2416"/>
    <ellipse cx="24" cy="29" rx="3.2" ry="2.4" fill="#3A2416"/>
    <path d="M24 31.5v2.5M24 34c0 1.6-1.7 2.6-3 2.2M24 34c0 1.6 1.7 2.6 3 2.2"
          stroke="#3A2416" stroke-width="1.5" fill="none" stroke-linecap="round"/>`},

  dragao:{nome:'Dragão', cor:'#2FA88C', arte:`
    <path d="M13 13 L8 1 L20 8 Z" fill="#1B6E5B"/><path d="M35 13 L40 1 L28 8 Z" fill="#1B6E5B"/>
    <path d="M24 6 l3 5 -6 0 z" fill="#1B6E5B"/>
    <ellipse cx="24" cy="33" rx="7.6" ry="5.6" fill="#6FD9BE"/>
    <circle cx="21.4" cy="32" r="1.3" fill="#134539"/><circle cx="26.6" cy="32" r="1.3" fill="#134539"/>
    <path d="M20 36.4l1.6 2.4 1.6-2.4M24.8 36.4l1.6 2.4 1.6-2.4" fill="#FFFFFF"/>
    <ellipse cx="17" cy="22" rx="3.4" ry="4.4" fill="#FFD36B"/><ellipse cx="31" cy="22" rx="3.4" ry="4.4" fill="#FFD36B"/>
    <path d="M17 19.2v5.6M31 19.2v5.6" stroke="#134539" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M11 27c1.6 1.6 3.4 2.4 5.4 2.6M37 27c-1.6 1.6-3.4 2.4-5.4 2.6"
          stroke="#1B6E5B" stroke-width="1.6" fill="none" stroke-linecap="round"/>`},

  robo:{nome:'Robô', cor:'#5A6BE8', arte:`
    <path d="M24 3v6" stroke="#FFD36B" stroke-width="2" stroke-linecap="round"/>
    <circle cx="24" cy="4" r="2.6" fill="#FFD36B"/>
    <rect x="9" y="11" width="30" height="27" rx="9" fill="#E9EDFF"/>
    <rect x="13.5" y="18" width="21" height="11" rx="5.5" fill="#1E2445"/>
    <circle cx="19.5" cy="23.5" r="2.4" fill="#62E6FF"/><circle cx="28.5" cy="23.5" r="2.4" fill="#62E6FF"/>
    <path d="M18 33h12" stroke="#9AA3C7" stroke-width="2" stroke-linecap="round"/>
    <rect x="4" y="20" width="4" height="9" rx="2" fill="#3D4CBF"/>
    <rect x="40" y="20" width="4" height="9" rx="2" fill="#3D4CBF"/>`},

  astronauta:{nome:'Astronauta', cor:'#8FA2C4', arte:`
    <rect x="3" y="19" width="5.5" height="11" rx="2.75" fill="#6E7F9E"/>
    <rect x="39.5" y="19" width="5.5" height="11" rx="2.75" fill="#6E7F9E"/>
    <circle cx="24" cy="24" r="16" fill="#F6F8FF"/>
    <circle cx="24" cy="24" r="16" fill="none" stroke="#D3DBEC" stroke-width="1.6"/>
    <rect x="12" y="17" width="24" height="15" rx="7.5" fill="#16233D"/>
    <path d="M16.6 26.6c-.6-3.4 1.6-6.6 5-7.6" stroke="#79A6F2" stroke-width="2.6"
          fill="none" stroke-linecap="round"/>
    <path d="M21 29.4c-1.4-.6-2.4-1.6-2.8-3" stroke="#79A6F2" stroke-width="1.8"
          fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M18 9.6h12" stroke="#FFD36B" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="20" y="37" width="8" height="5" rx="2.5" fill="#6E7F9E"/>`}
};

/* A letra é o padrão e continua sendo uma opção: nem todo mundo quer um bicho. */
function avatarEscolhido(){ return AVATARES[S.avatar] ? S.avatar : ''; }
function avatarSVG(chave){
  const a=AVATARES[chave]; if(!a) return '';
  return `<svg class="av" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle cx="24" cy="24" r="24" fill="${a.cor}"/>${a.arte}
    <circle cx="24" cy="24" r="23.2" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.6"/>
  </svg>`;
}
/* O ícone genérico de pessoa, para quando nenhum bicho foi escolhido. */
const ICONE_PESSOA='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'+
  '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg>';

/* Um único lugar pinta o rosto em todos os cantos onde ele aparece: cabeçalho,
   tela de cartas, menu e a aba da conta. */
function pintarAvatares(){
  const chave=avatarEscolhido();
  const svg=chave?avatarSVG(chave):'';
  const botao=svg||ICONE_PESSOA;
  /* `pintarSeMudou` existe por causa de um defeito que custou caro achar: o
     botão do perfil abria o menu e ele fechava no mesmo clique.

     Trocar o innerHTML DESTRÓI o <svg> de dentro do botão. E `pintarAvatares()`
     roda dentro de `abrirMenu()` — então o nó que a pessoa acabou de clicar era
     apagado no meio da propagação do evento. Quando o clique chegava ao ouvinte
     de "clicou fora, fecha o menu", `e.target.closest('#perfilBtn')` já dava
     null: o alvo não estava mais no documento. O menu abria e fechava em
     sequência, e o botão parecia morto.

     Clicar na BORDA do botão funcionava (ali o alvo é o próprio botão, que não
     é substituído) — foi o que separou este defeito de "o botão não recebe
     clique". Não reescrever o que já está certo resolve na origem, e ainda
     evita repintar o cabeçalho a cada render. */
  const pintarSeMudou=(el,html)=>{ if(el&&el.innerHTML!==html) el.innerHTML=html; };
  const pb=$('#perfilBtn');
  if(pb){ pintarSeMudou(pb,botao); pb.classList.toggle('com-bicho',!!chave); }
  const pp=$('#portalPerfil');
  if(pp){
    pintarSeMudou(pp,'<span class="tecla-face">'+botao+'</span>');
    pp.classList.toggle('com-bicho',!!chave);
  }
  const u=(window.Auth&&Auth.usuario())||null;
  const inicial=((Auth&&Auth.primeiroNome())||(u&&u.email)||'?').charAt(0);
  [['#mpAvatar',true],['#contaAvatar',true]].forEach(([id])=>{
    const el=$(id); if(!el) return;
    pintarSeMudou(el,svg||esc(inicial));
    el.classList.toggle('com-bicho',!!chave);
  });
  document.querySelectorAll('#gradeAvatares [data-av]').forEach(b=>{
    b.setAttribute('aria-pressed', b.dataset.av===(chave||'letra') ? 'true':'false');
  });
}

function montarEscolhaAvatar(){
  const g=$('#gradeAvatares'); if(!g || g.dataset.pronto) return;
  const opcoes=[['letra','Letra do seu nome',ICONE_PESSOA]]
    .concat(Object.keys(AVATARES).map(k=>[k,AVATARES[k].nome,avatarSVG(k)]));
  g.innerHTML=opcoes.map(([k,nome,arte])=>`
    <button type="button" class="av-op" data-av="${esc(k)}" aria-pressed="false"
            title="${esc(nome)}" aria-label="${esc(nome)}">${arte}</button>`).join('');
  g.dataset.pronto='1';
  g.addEventListener('click',e=>{
    const b=e.target.closest('[data-av]'); if(!b) return;
    S.avatar = b.dataset.av==='letra' ? '' : b.dataset.av;
    vibrar(10);
    pintarAvatares();
    salvar();
  });
}

const PORTAL_OFF='sobra:portal-off';
function portalLigado(){
  try{ return localStorage.getItem('sobra:portal-off')!=='1'; }catch(e){ return true; }
}

function montarPortal(){
  const g=$('#portalGrade'); if(!g || g.dataset.pronto) return;
  g.innerHTML=CARTAS.map(c=>`
    <button class="carta" type="button" data-carta="${c.a}"
            aria-label="${esc(c.rotulo)}: ${esc(c.titulo)}">
      ${arteCarta(c.a)}
      <span class="carta-veu" aria-hidden="true"></span>
      <span class="carta-txt">
        <span class="carta-rot">${esc(c.rotulo)}</span>
        <span class="carta-tit">${esc(c.titulo)}</span>
        <span class="carta-sub">${esc(c.sub)}</span>
      </span>
    </button>`).join('');
  g.dataset.pronto='1';

  g.addEventListener('click', e=>{
    const b=e.target.closest('[data-carta]'); if(!b) return;
    /* Compressão e volta antes de trocar de tela: o toque tem de ter resposta
       física ANTES da navegação, senão parece que o app travou por um quadro. */
    b.classList.add('carta-aperta');
    vibrar(10);
    setTimeout(()=>{
      b.classList.remove('carta-aperta');
      fecharPortal();
      irPara(b.dataset.carta);
      /* A carta abre UMA área e fecha a porta atrás de si: a barra de abas
         sai de cena e o único caminho para outra área é o botão de voltar.
         É o pedido de navegação espacial — quem entra por uma porta sai
         por ela, em vez de se teletransportar entre telas. */
      entrarFoco();
    },170);
  });
}

function abrirPortal(){
  if(!portalLigado()) return false;
  montarPortal();
  const p=$('#portal'); if(!p) return false;
  const o=$('#portalOlho');
  if(o){
    const h=new Date().getHours();
    const hora=h<5?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
    const nome=Auth.primeiroNome();
    o.textContent=hora+(nome?', '+nome:'');
  }
  p.hidden=false;
  document.body.classList.add('com-portal');
  requestAnimationFrame(()=>p.classList.add('abre'));
  return true;
}
function fecharPortal(){
  const p=$('#portal'); if(!p || p.hidden) return;
  p.classList.remove('abre');
  document.body.classList.remove('com-portal');
  setTimeout(()=>{ p.hidden=true; },360);
  // Agora que a tela está livre, mostra a retrospectiva que ficou na fila.
  if(retroPendente){
    const mes=retroPendente; retroPendente=null;
    setTimeout(()=>mostrarRetro(mes),420);
  }
}

document.addEventListener('keydown',e=>{
  const p=$('#portal');
  if(e.key!=='Escape') return;
  if(menuAberto) return;      // com o menu aberto, ele é o dono da tecla
  if(p && !p.hidden){ fecharPortal(); irPara(AREA||'hoje'); return; }
  // Dentro de uma área aberta por carta, Esc é o mesmo que o botão de voltar.
  if(document.body.classList.contains('modo-foco') && !$('#sheet').classList.contains('abre')){
    voltarAsAreas();
  }
});

/* ==========================================================================
   Modo foco — uma área de cada vez

   Entrando por uma carta, a barra de abas sai da tela. A pessoa fica só na
   área que escolheu, e para ir a outra volta primeiro para as cartas. Isso
   troca dois toques por um caminho que se enxerga: existe um lugar de onde se
   veio, e um botão que leva de volta a ele.

   Quem prefere a navegação livre continua tendo: "Ir direto para Hoje" nas
   cartas, e o ajuste que desliga a tela de entrada por completo. */
function entrarFoco(){
  document.body.classList.add('modo-foco');
  const b=$('#voltarFoco'); if(b) b.hidden=false;
  // A barra sai da ordem de leitura enquanto não está na tela.
  const t=$('#tabbar'); if(t) t.setAttribute('aria-hidden','true');
}
function sairFoco(){
  document.body.classList.remove('modo-foco');
  const b=$('#voltarFoco'); if(b) b.hidden=true;
  const t=$('#tabbar'); if(t) t.removeAttribute('aria-hidden');
}
function voltarAsAreas(){
  vibrar(8);
  sairFoco();
  /* Se as cartas estiverem desligadas nos ajustes não há para onde voltar:
     nesse caso a barra de abas simplesmente reaparece. */
  abrirPortal();
}

/* Voltar às cartas. Fica no cabeçalho, ancorado, com estado de hover próprio —
   é o caminho de volta que a navegação espacial exige para a pessoa nunca se
   sentir teletransportada. */
function ligarVoltarPortal(){
  const b=$('#voltarPortal');
  if(b) b.onclick=voltarAsAreas;
  const f=$('#voltarFoco');
  if(f) f.onclick=voltarAsAreas;
}
/* Os dois botões existem no HTML desde a partida: ligar aqui, e não só ao
   entrar no app, garante que o caminho de volta nunca dependa de por qual
   porta a sessão começou (login novo, sessão salva ou recarga da página). */
ligarVoltarPortal();

// As cartas entram na mesma física dos cartões: inclinação, parallax e brilho.

/* Segunda passada, agora com a tabela de ícones já montada: é ela que desenha
   o sol e a lua nos botões. A primeira, lá em cima, serve para o tema já
   estar certo no primeiro quadro. */
aplicarTema();
