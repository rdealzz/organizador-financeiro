/* Valida a SINCRONIZAÇÃO entre dois aparelhos (v10.18).

   Esta suíte nasceu de uma perda de dados real: três dias de lançamentos feitos
   num aparelho desapareceram — dos dois lados — depois de o app ser aberto em
   outro. O que ela guarda é a regra que faltava: **duas versões do mesmo estado
   se juntam, não se apagam.**

   O cenário original é reproduzido inteiro no teste 6: aparelho parado há três
   dias, com a fatura fechando nesse meio-tempo (que era o que carimbava `_ts`
   novo na abertura), abre e sincroniza. Antes, o resultado era a nuvem ficar
   com o estado velho. Agora tem que sair a união dos dois. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const cmp=(n,a,b,tol=0.01)=>{const p=typeof a==='number'?Math.abs(a-b)<=tol:JSON.stringify(a)===JSON.stringify(b);
  (p?ok:bad).push(n+(p?'':`  →  ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);

 const r=await p.evaluate(async()=>{
  const R={};
  const gasto=(id,nome,valor,extra)=>Object.assign({id,criadoEm:Date.now(),nome,valor,cat:'mercado',tier:1,
    tipo:'unico',fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},extra||{});

  // ── 1. o caso da perda, na função pura: cada lado lançou o seu
  const base={lanc:[gasto(1,'aluguel',1200)],salario:5000,_ts:1000};
  const aparelhoA={lanc:[gasto(1,'aluguel',1200),gasto(2,'mercado',300),gasto(3,'posto',200)],salario:5000,_ts:3000};
  const aparelhoB={lanc:[gasto(1,'aluguel',1200),gasto(4,'farmacia',80)],salario:5000,_ts:2000};
  const j=mesclarEstado(base,aparelhoB,aparelhoA);      // B é o local, A é a nuvem
  R.union=j.lanc.map(l=>l.nome).sort();
  R.unionTotal=j.lanc.reduce((a,l)=>a+l.valor,0);

  // ── 2. sem base, a mesclagem é união (nada pode ser dado por apagado)
  const semBase=mesclarEstado(null,aparelhoB,aparelhoA);
  R.semBase=semBase.lanc.map(l=>l.nome).sort();

  // ── 3. apagar de propósito continua valendo
  const semAluguel={lanc:[gasto(2,'mercado',300)],salario:5000,_ts:4000};
  const comAluguel={lanc:[gasto(1,'aluguel',1200),gasto(2,'mercado',300)],salario:5000,_ts:3000};
  R.apagou=mesclarEstado(comAluguel,semAluguel,comAluguel).lanc.map(l=>l.nome).sort();
  // ...mas edição vence apagamento: o outro lado mexeu no valor
  const editado={lanc:[gasto(1,'aluguel',1350),gasto(2,'mercado',300)],salario:5000,_ts:5000};
  const je=mesclarEstado(comAluguel,semAluguel,editado);
  R.edicaoVence=je.lanc.map(l=>l.nome+':'+l.valor).sort();

  // ── 4. o MESMO gasto mexido nos dois lados, em campos diferentes
  const b4={lanc:[gasto(1,'mercado',300)],_ts:1000};
  const l4={lanc:[gasto(1,'mercado',300,{pagoAte:'2026-09-12'})],_ts:2000};
  const r4={lanc:[gasto(1,'mercado',420)],_ts:3000};
  const j4=mesclarEstado(b4,l4,r4).lanc[0];
  R.campoACampo={valor:j4.valor,pagoAte:j4.pagoAte||''};

  // ── 5. pai/com/divs/acerto viajam juntos (v10.11): nada de estado híbrido
  const b5={lanc:[gasto(1,'jantar',300)],_ts:1000};
  const l5={lanc:[gasto(1,'jantar',300,{pai:150,com:'pA',divs:[{id:'pA',valor:150}]})],_ts:2000};
  const r5={lanc:[gasto(1,'jantar',300,{pai:200,com:'pB',divs:[{id:'pB',valor:200}]})],_ts:3000};
  const j5=mesclarEstado(b5,l5,r5).lanc[0];
  R.divisaoInteira={pai:j5.pai,com:j5.com,divs:j5.divs};
  R.divisaoFecha=Math.abs(j5.pai-(j5.divs||[]).reduce((a,d)=>a+d.valor,0))<0.01;

  // ── 6. escalares: quem mexeu ganha; ninguém perde por não ter mexido
  const j6=mesclarEstado({salario:5000,metaPct:20,_ts:1},
                         {salario:5000,metaPct:30,_ts:2},   // local mexeu na meta
                         {salario:7000,metaPct:20,_ts:3});  // nuvem mexeu no salário
  R.escalares={salario:j6.salario,metaPct:j6.metaPct};

  // ── 7. a fatura arquivada continua com a mais recente na frente
  const j7=mesclarEstado({hist:[]},
    {hist:[{data:'2026-08-05',bruto:100}],_ts:2},
    {hist:[{data:'2026-09-05',bruto:200}],_ts:1});
  R.hist=j7.hist.map(h=>h.data);

  // ── 8. tetos e notifLog são mapas: mesclam chave por chave
  const j8=mesclarEstado({tetos:{mercado:800}},{tetos:{mercado:800,transporte:400},_ts:2},{tetos:{mercado:900},_ts:1});
  R.mapa=j8.tetos;

  // ── 9. o carimbo da mesclagem é o mais novo dos dois
  R.carimbo=mesclarEstado(base,aparelhoB,aparelhoA)._ts;

  // ── 10. nada de gravar na nuvem sem ter lido: a trava responde
  R.travaExiste=(typeof nuvemLida!=='undefined');

  /* ── 11. texto estável: a mesma coisa escrita em outra ordem é a MESMA coisa.
     Sem isto, a mesclagem "mudava" o estado a cada leitura só por reordenar as
     chaves, e o app gravava na nuvem de graça — criando conflito no outro
     aparelho sem ninguém ter mexido em nada. */
  R.estavel=textoEstavel({b:1,a:[{y:2,x:1}]})===textoEstavel({a:[{x:1,y:2}],b:1});
  R.ordemDoArrayImporta=textoEstavel([1,2])!==textoEstavel([2,1]);
  return R;
 });

 cmp('1. os gastos dos DOIS aparelhos sobrevivem',r.union,['aluguel','farmacia','mercado','posto']);
 cmp('1. e a soma é a dos dois lados',r.unionTotal,1780);
 cmp('2. sem base, a mesclagem é união',r.semBase,['aluguel','farmacia','mercado','posto']);
 cmp('3. apagar de propósito continua apagando',r.apagou,['mercado']);
 cmp('3. mas edição do outro lado vence o apagamento',r.edicaoVence,['aluguel:1350','mercado:300']);
 cmp('4. mesmo gasto, campos diferentes: os dois valem',r.campoACampo,{valor:420,pagoAte:'2026-09-12'});
 cmp('5. pai/com/divs vêm do MESMO lado',r.divisaoInteira,{pai:200,com:'pB',divs:[{id:'pB',valor:200}]});
 eh('5. e a divisão fecha com o total',r.divisaoFecha,r.divisaoInteira);
 cmp('6. escalar mexido em cada lado: os dois valem',r.escalares,{salario:7000,metaPct:30});
 cmp('7. o histórico fica com a fatura mais recente na frente',r.hist,['2026-09-05','2026-08-05']);
 cmp('8. mapa mesclado chave por chave',r.mapa,{mercado:900,transporte:400});
 cmp('9. o carimbo é o mais novo dos dois',r.carimbo,3000);
 eh('10. existe a trava de não gravar antes de ler',r.travaExiste,r.travaExiste);
 eh('11. chave em outra ordem é o mesmo conteúdo',r.estavel,r.estavel);
 eh('11. mas a ordem de um array continua sendo informação',r.ordemDoArrayImporta,r.ordemDoArrayImporta);

 /* ── O cenário da perda, de ponta a ponta, com nuvem falsa ──
    Aparelho B está parado há três dias e a fatura fechou nesse meio-tempo — era
    isso que carimbava `_ts` novo na abertura e fazia o aparelho PARADO ganhar o
    conflito. A nuvem tem os três dias que a pessoa lançou no aparelho A. */
 const fim=await p.evaluate(async()=>{
  const R={};
  const gasto=(id,nome,valor)=>({id,criadoEm:Date.now(),nome,valor,cat:'mercado',tier:1,
    tipo:'unico',fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'});
  const tresDias=Date.now()-3*864e5;

  // a nuvem, como o aparelho A a deixou ontem
  let nuvem={dados:{lanc:[gasto(1,'aluguel',1200),gasto(2,'mercado',300),gasto(3,'posto',200),gasto(4,'farmacia',80)],
                    salario:5000,hist:[],_ts:Date.now()-864e5},revisao:7,marca:'v1'};
  let recusas=0;
  Auth.logado=()=>true;
  Auth.usuario=()=>({id:'teste',nome:'Teste'});
  Auth.puxarEstado=async()=>JSON.parse(JSON.stringify(nuvem));
  Auth.enviarEstado=async(dados,marca)=>{
    if(marca!==undefined && marca!==nuvem.marca){ recusas++; const e=new Error('conflito'); e.codigo='conflito'; throw e; }
    nuvem={dados:JSON.parse(JSON.stringify(dados)),revisao:nuvem.revisao+1,marca:'v'+(nuvem.revisao+1)};
    return {dados,revisao:nuvem.revisao,marca:nuvem.marca};
  };

  // o aparelho B: o estado de três dias atrás, e nada da nuvem lido ainda
  zerarSinc();
  S.lanc=[gasto(1,'aluguel',1200)]; S.salario=5000; S.hist=[]; S._ts=tresDias;
  S.ultimoFech=null; ultimoConteudo=conteudoDe(S);

  // 1) o envio agendado pela abertura NÃO pode subir sozinho
  await enviarParaNuvem();
  R.nuvemDepoisDoEnvioCego=(nuvem.dados.lanc||[]).map(l=>l.nome).sort();

  // 2) e a sincronização normal junta os dois lados
  await puxarDaNuvem(true);
  R.aqui=(S.lanc||[]).map(l=>l.nome).sort();
  R.la=(nuvem.dados.lanc||[]).map(l=>l.nome).sort();
  R.recusas=recusas;

  // 3) conflito de verdade: a nuvem mudou embaixo de nós entre ler e gravar
  nuvem={dados:Object.assign({},nuvem.dados,{lanc:(nuvem.dados.lanc||[]).concat([gasto(9,'padaria',15)]),
         _ts:Date.now()}),revisao:99,marca:'v99'};
  marcaNuvem='velha';                       // é o que o aparelho pensa que leu
  S.lanc.push(gasto(8,'cinema',40)); S._ts=Date.now();
  await salvar(); await enviarParaNuvem();
  await new Promise(r2=>setTimeout(r2,300));
  R.aposConflito=(nuvem.dados.lanc||[]).map(l=>l.nome).sort();
  R.houveRecusa=recusas>0;

  /* 4) gravação idêntica não vai para a nuvem: mexer na versão do documento sem
        nada novo só cria conflito para o outro aparelho. */
  const revAntes=nuvem.revisao;
  await enviarParaNuvem(); await enviarParaNuvem();
  R.revisaoParada=(nuvem.revisao===revAntes);
  return R;
 });

 cmp('12. envio antes da leitura não toca na nuvem',fim.nuvemDepoisDoEnvioCego,['aluguel','farmacia','mercado','posto']);
 cmp('13. depois de sincronizar, o aparelho parado tem tudo',fim.aqui,['aluguel','farmacia','mercado','posto']);
 cmp('13. e a nuvem continua com tudo',fim.la,['aluguel','farmacia','mercado','posto']);
 eh('14. o servidor recusou a gravação com versão velha',fim.houveRecusa,fim);
 cmp('15. e depois do conflito nada se perdeu',fim.aposConflito,
     ['aluguel','cinema','farmacia','mercado','padaria','posto']);
 eh('16. gravação idêntica não mexe na versão do documento',fim.revisaoParada,fim);

 /* ── A tela de recuperar cópia ── */
 await p.evaluate(()=>{ document.querySelector('#auth').hidden=true; document.querySelector('#appWrap').hidden=false; });
 const tela=await p.evaluate(async()=>{
  const R={};
  await idbSet('copia:2026-09-18',JSON.stringify({lanc:[{id:1,nome:'mercado',valor:300,cat:'mercado',tier:1,tipo:'unico'}],
    salario:5000,hist:[],_ts:Date.now()-3*864e5}));
  const lista=await lerCopias();
  R.achou=lista.some(x=>x.chave==='copia:2026-09-18');
  R.rotulo=rotuloDaCopia('copia:2026-09-18');
  R.rotuloVersao=rotuloDaCopia('copia:versao-v10.17');
  await pintarCopias();
  const c=document.querySelector('#copias');
  R.visivel=!c.hidden && /Recuperar/.test(c.innerHTML);
  R.temBotoes=!!c.querySelector('[data-usar-copia]')&&!!c.querySelector('[data-baixar-copia]');
  return R;
 });
 eh('17. a cópia diária é encontrada',tela.achou,tela);
 cmp('17. com rótulo legível',tela.rotulo,'Cópia do dia 18/09/2026');
 cmp('17. e a cópia de versão também',tela.rotuloVersao,'Antes de atualizar para depois da v10.17');
 eh('18. a lista aparece na tela',tela.visivel,tela);
 eh('18. com botão de baixar e de recuperar',tela.temBotoes,tela);

 errs.forEach(e=>bad.push('erro no console: '+e));
 await b.close();
 console.log(ok.map(s=>'  ok  '+s).join('\n'));
 if(bad.length){ console.log('\nFALHARAM:\n'+bad.map(s=>'  X   '+s).join('\n')); }
 console.log(`\n${ok.length} de ${ok.length+bad.length} verificações passaram.`);
 process.exit(bad.length?1:0);
})();
