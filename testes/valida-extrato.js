/* Valida o ACERTO por gasto ("ele já me pagou") e o EXTRATO em PDF.

   Duas coisas são o coração daqui e valem o arquivo inteiro:

   1. marcar que alguém já pagou NÃO pode mexer em número nenhum do orçamento —
      a parte dela nunca foi sua, e contar o Pix como dinheiro que entrou
      contaria o mesmo dinheiro duas vezes;
   2. o que já foi acertado tem que sair da COBRANÇA — cobrar de novo o que já
      foi pago é o defeito que este bloco existe para evitar. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+(d!==undefined?JSON.stringify(d):'falso')));};
const cmp=(n,a,b,tol=0.01)=>{const p=typeof a==='number'?Math.abs(a-b)<=tol:JSON.stringify(a)===JSON.stringify(b);
  (p?ok:bad).push(n+(p?'':`  →  ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);

 const r=await p.evaluate(()=>{
  const R={};
  document.querySelector('#auth').hidden=true; document.querySelector('#appWrap').hidden=false;
  const g=(id,cat,tier,valor,e)=>Object.assign({id,criadoEm:Date.now(),nome:id,valor,cat,tier,tipo:'unico',
    fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},e||{});

  S.salario=5000; S.extra=0; S.metaPct=10; S.metaVal=0; S.tetos={}; S.hist=[]; S.diaFech=5; S.diaVenc=12;
  S.pessoas=[{id:'pai',nome:'Pai',cor:'var(--pes1)'},{id:'gui',nome:'Gui',cor:'var(--pes2)'},
             {id:'ana',nome:'Ana',cor:'var(--pes3)'}];
  S.lanc=[
    g('mercado','mercado',1,800,{pai:400,com:'pai'}),          // o pai cobre metade
    g('posto','transporte',1,300,{pai:300,com:'pai'}),         // o pai cobre tudo
    g('jantar','comida',3,300,{divs:[{id:'gui',valor:100},{id:'ana',valor:100}]}),
    g('cinema','lazer',3,60),
  ];
  S.lanc.forEach(l=>{ if(l.divs) sincronizarDivs(l); });

  const antes=calc();
  R.antes={gasto:antes.gasto,sobra:antes.sobra,bruto:antes.bruto,pai:antes.pai,disponivel:antes.disponivel};

  // ── 1. o pai já mandou o Pix do posto (gasto dele, pago antes de fechar)
  const posto=S.lanc.find(l=>l.id==='posto');
  marcarAcerto(posto,'pai',true);
  const dps=calc();
  R.depois={gasto:dps.gasto,sobra:dps.sobra,bruto:dps.bruto,pai:dps.pai,disponivel:dps.disponivel};
  R.acertadoPosto=acertado(posto,'pai');
  R.dataAcerto=dataAcerto(posto,'pai')===iso(hojeD());
  R.tudoAcertadoPosto=tudoAcertado(posto);
  R.aReceberPosto=aReceberDe(posto);
  R.recebidoPosto=recebidoDe(posto);

  // ── 2. a cobrança do pai: 800/2 + 300, com 300 já acertado
  const gPai=cobrancas(doCiclo()).find(x=>x.id==='pai');
  R.paiTotal=gPai.total; R.paiAberto=gPai.aberto; R.paiQuitado=gPai.quitado; R.paiTudoPago=gPai.tudoPago;
  R.txtPai=textoCobranca(gPai,'setembro');
  R.txtSemPosto=!/• posto: R\$/.test(R.txtPai.split('Já acertado antes')[0]);
  R.txtDizAcertado=/Já acertado antes/.test(R.txtPai);

  // divisão em três: um paga, o outro não
  const jantar=S.lanc.find(l=>l.id==='jantar');
  marcarAcerto(jantar,'gui',true);
  R.jantarGui=cobrancas(doCiclo()).find(x=>x.id==='gui').tudoPago;
  R.jantarAna=cobrancas(doCiclo()).find(x=>x.id==='ana').aberto;

  // ── 3. o extrato
  const eEu=extratoDe('eu','aberto');
  R.euTotal=eEu.total;
  R.euSomaMeuValor=doCiclo().reduce((s,l)=>s+meuValor(l),0);
  R.euSemPagos=eEu.blocos.every(bl=>bl.linhas.every(x=>!x.pg));
  const ePai=extratoDe('pai','aberto');
  R.paiExtTotal=ePai.total; R.paiExtPago=ePai.pago; R.paiExtAberto=ePai.aberto; R.paiExtN=ePai.n;
  R.paiExtNome=ePai.nome;
  R.somaFatiasPai=fatiasPessoa(doCiclo()).find(f=>f.id==='pai').valor;
  R.txtExtrato=textoExtrato(ePai).slice(0,40);
  R.extratoTemData=/\d{2}\/\d{2}\/\d{4}/.test(textoExtrato(ePai));

  // ── 4. fechamento: o acerto vai arquivado e vira a marca da fatura
  fecharCiclo(iso(hojeD()));
  const x=S.hist[0];
  const arqPosto=(x.itens||[]).find(i=>i.nome==='posto');
  R.arqTemAcerto=!!(arqPosto&&arqPosto.acerto&&arqPosto.acerto.pai);
  R.arqTemData=!!(arqPosto&&arqPosto.criadoEm>0);
  R.recebidoGui=!!(x.recebido&&x.recebido.gui);       // o Gui acertou tudo antes de fechar
  R.recebidoPai=!!(x.recebido&&x.recebido.pai);       // o pai ainda deve o mercado
  const gArq=cobrancas(x.itens,fatiasDoHist(x)).find(y=>y.id==='pai');
  R.arqPaiAberto=gArq.aberto; R.arqPaiQuitado=gArq.quitado;

  // ── 5. o extrato da fatura arquivada, e o de tudo
  const eHist=extratoDe('pai','h:0');
  R.histTotal=eHist.total; R.histPago=eHist.pago;
  R.tudoN=extratoDe('pai','tudo').n;

  // ── 6. pessoa apagada continua com nome no extrato arquivado
  S.pessoas=S.pessoas.filter(q=>q.id!=='gui');
  R.nomeCongelado=extratoDe('gui','h:0').nome;
  return R;
 });

 cmp('marcar "já pagou" não mexe no gasto do mês',r.depois.gasto,r.antes.gasto);
 cmp('não mexe na sobra',r.depois.sobra,r.antes.sobra);
 cmp('não mexe na fatura',r.depois.bruto,r.antes.bruto);
 cmp('não mexe no que é de terceiros',r.depois.pai,r.antes.pai);
 cmp('não mexe no disponível',r.depois.disponivel,r.antes.disponivel);
 eh('o gasto fica marcado, com a data de hoje',r.acertadoPosto&&r.dataAcerto);
 eh('gasto com um pagador só vira "tudo acertado"',r.tudoAcertadoPosto);
 cmp('nada a receber nesse gasto',r.aReceberPosto,0);
 cmp('300 já recebidos nele',r.recebidoPosto,300);

 cmp('total do pai no ciclo',r.paiTotal,700);
 cmp('em aberto com o pai (só o mercado)',r.paiAberto,400);
 cmp('já acertado com o pai',r.paiQuitado,300);
 eh('o pai ainda não está quitado',r.paiTudoPago===false);
 eh('a cobrança não pede de novo o que já foi pago',r.txtSemPosto,r.txtPai);
 eh('mas diz o que já foi acertado',r.txtDizAcertado);
 eh('num gasto rachado em três, um pode ter pago e o outro não',r.jantarGui===true&&r.jantarAna===100,[r.jantarGui,r.jantarAna]);

 cmp('o extrato "Eu" é a soma da MINHA parte',r.euTotal,r.euSomaMeuValor);
 eh('o extrato "Eu" não fala de pagamento de ninguém',r.euSemPagos);
 cmp('o extrato do pai é a soma das fatias dele',r.paiExtTotal,r.somaFatiasPai);
 cmp('com 300 já acertados',r.paiExtPago,300);
 cmp('e 400 em aberto',r.paiExtAberto,400);
 cmp('dois lançamentos dele no ciclo',r.paiExtN,2);
 cmp('o extrato sai com o nome da pessoa',r.paiExtNome,'Pai');
 eh('o texto do extrato traz a data de cada gasto',r.extratoTemData,r.txtExtrato);

 eh('o acerto é arquivado junto do item',r.arqTemAcerto);
 eh('a data do lançamento sobrevive ao fechamento',r.arqTemData);
 eh('quem acertou tudo já entra quitado na fatura',r.recebidoGui);
 eh('quem ainda deve, não',r.recebidoPai===false);
 cmp('na fatura arquivada o pai deve o mercado',r.arqPaiAberto,400);
 cmp('e já pagou o posto',r.arqPaiQuitado,300);

 cmp('o extrato da fatura fechada tem o mesmo total',r.histTotal,700);
 cmp('e o mesmo já acertado',r.histPago,300);
 cmp('"tudo" junta o ciclo aberto e o histórico',r.tudoN,2);
 cmp('pessoa apagada mantém o nome no extrato antigo',r.nomeCongelado,'Gui');

 // ── interface: a aba, o papel, a impressão e a esfera
 await p.evaluate(()=>{irPara('analise:extratos'); render();});
 eh('a sub-aba Extrato abre',await p.evaluate(()=>!document.querySelector('#t-extratos').hidden));
 eh('o select traz as pessoas e o "Eu"',
    await p.evaluate(()=>document.querySelector('#extPessoa').options.length>=2));
 await p.evaluate(()=>{const s=document.querySelector('#extPessoa');
   s.value='pai'; s.onchange();
   /* O ciclo foi fechado ali em cima: o que o pai divide está na fatura
      ARQUIVADA, e é ela que o extrato tem que saber mostrar. */
   const q=document.querySelector('#extPeriodo'); q.value='h:0'; q.onchange();});
 eh('a tabela do extrato aparece',await p.evaluate(()=>!!document.querySelector('#extCorpo table')));
 eh('o resumo mostra o que falta receber',
    await p.evaluate(()=>/Em aberto/.test(document.querySelector('#extResumo').textContent)));

 await p.evaluate(()=>document.querySelector('#extPdf').click());
 await p.waitForTimeout(100);
 eh('a folha do extrato abre',await p.evaluate(()=>!document.querySelector('#recibo').hidden));
 const folha=await p.evaluate(()=>document.querySelector('#recFolha').textContent);
 eh('o papel traz o nome, a data de geração e o total',
    /Pai/.test(folha)&&/Gerado em/.test(folha)&&/R\$/.test(folha),folha.slice(0,80));

 await p.emulateMedia({media:'print'});
 const imp=await p.evaluate(()=>({
   recibo:getComputedStyle(document.querySelector('#recibo')).display,
   app:getComputedStyle(document.querySelector('#appWrap')).display,
   barra:getComputedStyle(document.querySelector('.rec-barra')).display}));
 eh('na impressão sobra só o papel',imp.recibo!=='none'&&imp.app==='none'&&imp.barra==='none',imp);
 await p.emulateMedia({media:'screen'});

 // A regra do projeto: toda camada de tela cheia tem que ser opaca NOS DOIS
 // temas com a esfera ligada. Foi assim que o calendário apareceu quebrado.
 await p.evaluate(()=>document.body.classList.add('fundo-vivo'));
 for(const tema of ['claro','escuro']){
   await p.evaluate(t=>{document.documentElement.dataset.tema=t;},tema);
   await p.waitForTimeout(60);
   const f=await p.evaluate(()=>getComputedStyle(document.querySelector('#recibo')).backgroundColor);
   eh(`o extrato é opaco no tema ${tema}`,!/rgba\(0, 0, 0, 0\)|transparent/.test(f),f);
   const folhaCor=await p.evaluate(()=>getComputedStyle(document.querySelector('#recFolha')).backgroundColor);
   eh(`o papel é branco no tema ${tema}`,/255, 255, 255/.test(folhaCor),folhaCor);
 }
 await p.evaluate(()=>{document.body.classList.remove('fundo-vivo'); fecharRecibo();});
 eh('a folha fecha',await p.evaluate(()=>document.querySelector('#recibo').hidden));

 // o checkbox da folha de lançar
 await p.evaluate(()=>{
   irPara('hoje');
   document.querySelector('#lNome').value='uber do pai';
   document.querySelector('#lValor').value='50';
   pintarPagadorForm('t:pai');
   document.querySelector('#lPagador').value='t:pai';
   ajustarCamposForm();
   document.querySelector('#lPai').value='50';
   document.querySelector('#lJaPago').checked=true;
   document.querySelector('#addLanc').click();
 });
 const novo=await p.evaluate(()=>{
   const l=S.lanc.find(x=>x.nome==='uber do pai');
   return l?{pai:l.pai,acertado:acertado(l,'pai'),limpou:!document.querySelector('#lJaPago').checked}:null;});
 eh('lançado como "já me pagou", o gasto nasce acertado',!!novo&&novo.acertado&&novo.pai===50,novo);
 eh('e a caixa volta desmarcada para o próximo gasto',!!novo&&novo.limpou);

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|blob:x|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página ('+e.length+'):');[...new Set(e)].slice(0,10).forEach(x=>console.log('  '+x));}
 await b.close();
 process.exit(bad.length?1:0);
})();
