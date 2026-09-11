/* Valida o MOTOR: as contas que sustentam todas as telas. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const cmp=(nome,a,b,tol=0.01)=>{const p=typeof a==='number'?Math.abs(a-b)<=tol:JSON.stringify(a)===JSON.stringify(b);
  (p?ok:bad).push(nome+(p?'':`  →  ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const eh=(nome,v)=>{(v?ok:bad).push(nome+(v?'':'  →  falso'));};

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
  S.pessoas=[{id:'pai',nome:'Pai',cor:'var(--pes1)'},{id:'gui',nome:'Gui',cor:'var(--pes2)'},{id:'ana',nome:'Ana',cor:'var(--pes3)'}];
  S.lanc=[
    g('mercado','mercado',1,800),
    g('faculdade','estudo',1,1000,{tipo:'fixo',venc:10,pai:500,com:'pai'}),
    g('moto','transporte',1,890,{tipo:'parc',pRest:8,venc:15,meio:'avista'}),
    g('jantar','comida',3,300,{divs:[{id:'gui',valor:100},{id:'ana',valor:100}],pai:200,com:'gui'}),
    g('presente','lazer',3,150,{prox:1}),
    g('netflix','assinatura',2,55,{tipo:'fixo',venc:20}),
  ];
  S.lanc.forEach(l=>{ if(l.divs) sincronizarDivs(l); });

  const c=calc(); R.c={renda:c.renda,gasto:c.gasto,bruto:c.bruto,avista:c.avista,pai:c.pai,
    futuro:c.futuro,proxBruto:c.proxBruto,proxMeu:c.proxMeu,proxN:c.proxN,sobra:c.sobra,meta:c.meta,disponivel:c.disponivel};

  // identidades contábeis
  const itens=doCiclo();
  R.somaValores=itens.reduce((s,l)=>s+l.valor,0);
  R.somaMeu=itens.reduce((s,l)=>s+meuValor(l),0);
  R.somaTiers=c.t[1]+c.t[2]+c.t[3];
  R.somaCats=Object.values(c.porCat).reduce((s,v)=>s+v,0);
  R.brutoMaisAvista=c.bruto+c.avista;

  // divisões
  R.divsJantar=divisoes(S.lanc.find(l=>l.id==='jantar')).map(d=>d.id+':'+d.valor);
  R.divsFac=divisoes(S.lanc.find(l=>l.id==='faculdade')).map(d=>d.id+':'+d.valor);
  R.divsSozinho=divisoes(S.lanc.find(l=>l.id==='mercado')).length;
  // uma pessoa só não guarda divs
  const um={...g('x','lazer',3,100),divs:[{id:'pai',valor:40}]}; sincronizarDivs(um);
  R.umaPessoaSemDivs=!um.divs && um.pai===40 && um.com==='pai';
  // fatia nunca passa do valor
  const est={...g('y','lazer',3,100),divs:[{id:'pai',valor:80},{id:'gui',valor:80}]};
  R.corteExcesso=divisoes(est).reduce((s,d)=>s+d.valor,0);

  R.fatias=fatiasPessoa(itens).map(f=>f.nome+':'+f.valor);
  R.cobr=cobrancas(itens).map(x=>x.nome+':'+x.total+'('+x.itens.length+')');

  // datas da fatura
  R.venc12=vencDaFatura(new Date(2026,8,5)).getDate();
  S.diaFech=12; S.diaVenc=12; R.mesmoDia=vencDaFatura(new Date(2026,8,12)).getDate();
  S.diaFech=5; S.diaVenc=12;
  R.fatAberta=(()=>{const f=faturaAberta();return f.fecha.getDate()+'/'+f.vence.getDate();})();
  R.fatAPagarSemHist=faturaAPagar();

  // contas a vencer / pago por ocorrência
  R.aVencer=contasAVencer().map(x=>x.l.id);
  R.ordemPorDias=contasAVencer().map(x=>x.dias);
  marcarPago('netflix','bolso');
  R.depoisDePagar=contasAVencer().map(x=>x.l.id);
  R.pagoAte=S.lanc.find(l=>l.id==='netflix').pagoAte===iso(proximoVenc(20));
  desmarcarPago('netflix');
  R.voltou=contasAVencer().map(x=>x.l.id);

  // calendário: parcelas espalhadas, última marcada
  const hoje=new Date(); const m=(k)=>{const d=new Date(hoje.getFullYear(),hoje.getMonth()+k,1);return contasDoMes(d.getFullYear(),d.getMonth());};
  const nomes=k=>Object.values(m(k).porDia).flat().map(x=>x.nome+(x.ultima?'(última)':'')+(x.semFim?'(semFim)':''));
  R.cal0=nomes(0); R.cal7=nomes(7); R.cal8=nomes(8);

  // palpite e classificação
  R.agua=palpiteDoNome('agua'); R.contaAgua=palpiteDoNome('conta de agua');
  R.tipoSempreUnico=['agua','netflix','aluguel','uber','mercado'].every(n=>palpiteDoNome(n).tipo==='unico');
  R.rapido=lerRapido('moto 890 pix');
  R.rapido2=lerRapido('estacionamento 20');

  // CSV
  const csv=(()=>{let t=null;const old=URL.createObjectURL;URL.createObjectURL=(bl)=>{t=bl;return 'blob:x';};
    try{exportarCSV();}catch(e){R.csvErro=String(e);} URL.createObjectURL=old; return t;})();
  R.csvTam=csv?csv.size:0;

  // fechamento de ciclo
  const antes=S.lanc.length;
  fecharCiclo(iso(new Date()));
  R.fechou={hist:S.hist.length, lancDepois:S.lanc.map(l=>l.id+':'+l.tipo+':'+(l.pRest||0)+':prox'+(l.prox||0)),
            arquivado:{bruto:S.hist[0].bruto,avista:S.hist[0].avista,pai:S.hist[0].pai,venc:!!S.hist[0].venc,
                       pessoas:(S.hist[0].pessoas||[]).map(x=>x.nome+':'+x.valor)}};
  R.fatAPagarComHist=!!faturaAPagar();
  return R;
 });

 // ─── asserções ───
 cmp('renda = salário',r.c.renda,5000);
 cmp('meta = 10% da renda',r.c.meta,500);
 cmp('disponível = renda − meta',r.c.disponivel,4500);
 cmp('gasto = soma dos pesos',r.c.gasto,r.somaTiers);
 cmp('gasto = soma das categorias',r.c.gasto,r.somaCats);
 cmp('gasto = soma de meuValor (só do ciclo)',r.c.gasto,r.somaMeu);
 cmp('bruto+avista = total lançado no ciclo',r.brutoMaisAvista,r.somaValores);
 cmp('bruto = só o do cartão (800+1000+300+55)',r.c.bruto,2155);
 cmp('avista = só o Pix (moto)',r.c.avista,890);
 cmp('terceiros = 500 do pai + 200 do jantar',r.c.pai,700);
 cmp('total lançado = minha parte + terceiros',r.somaValores,r.somaMeu+r.c.pai);
 cmp('guardado pra próxima: 1 item de 150',[r.c.proxN,r.c.proxBruto],[1,150]);
 cmp('parcelas por vir = 890×8',r.c.futuro,7120);
 cmp('sobra = renda − gasto',r.c.sobra,5000-r.somaMeu);

 cmp('jantar rachado em três',r.divsJantar,['gui:100','ana:100']);
 cmp('faculdade: divs montado do par com+pai',r.divsFac,['pai:500']);
 cmp('gasto sem divisão → lista vazia',r.divsSozinho,0);
 eh('uma pessoa só não guarda divs',r.umaPessoaSemDivs);
 cmp('fatias nunca passam do valor do gasto',r.corteExcesso,100);
 cmp('fatias por pessoa',r.fatias,['Pai:500','Gui:100','Ana:100']);
 cmp('cobranças itemizadas',r.cobr,['Pai:500(1)','Gui:100(1)','Ana:100(1)']);

 cmp('fecha 5 → vence 12',r.venc12,12);
 cmp('fecha e vence no mesmo dia → mês seguinte',r.mesmoDia,12);
 cmp('fatura aberta fecha 5 e vence 12',r.fatAberta,'5/12');
 eh('sem histórico não há fatura a pagar',r.fatAPagarSemHist===null);
 eh('com histórico há fatura a pagar',r.fatAPagarComHist);

 cmp('contas a vencer',[...r.aVencer].sort(),['faculdade','moto','netflix']);
 eh('a mais próxima vem primeiro',r.ordemPorDias.every((d,i,a)=>!i||d>=a[i-1]));
 cmp('marcada como paga sai da lista',[...r.depoisDePagar].sort(),['faculdade','moto']);
 eh('pagoAte guarda a data do vencimento',r.pagoAte);
 cmp('desmarcar devolve à lista',[...r.voltou].sort(),['faculdade','moto','netflix']);

 eh('mês atual traz fatura + contas',r.cal0.length>0);
 eh('a 8ª e última parcela cai no 7º mês à frente',r.cal7.some(n=>n==='moto(última)'));
 eh('depois da última, a parcela some do calendário',!r.cal8.some(n=>/^moto/.test(n)));
 eh('conta todo mês é marcada sem fim',r.cal0.some(n=>/semFim/.test(n)));

 cmp('"agua" → comida',r.agua.cat,'comida');
 cmp('"conta de agua" → casa',r.contaAgua.cat,'casa');
 eh('palpite NUNCA cria repetição',r.tipoSempreUnico);
 cmp('"moto 890 pix" → valor 890',r.rapido&&r.rapido.valor,890);
 cmp('"moto 890 pix" → à vista',r.rapido&&r.rapido.meio,'avista');
 cmp('"moto 890 pix" → nome sem "pix"',(r.rapido&&r.rapido.nome||'').toLowerCase(),'moto');
 cmp('"estacionamento 20" → transporte',r.rapido2&&r.rapido2.cat,'transporte');
 eh('CSV sai com conteúdo',r.csvTam>100);

 cmp('fechou uma fatura',r.fechou.hist,1);
 cmp('fatura arquivada separa cartão e à vista',[r.fechou.arquivado.bruto,r.fechou.arquivado.avista],[2155,890]);
 eh('fatura arquivada grava o vencimento',r.fechou.arquivado.venc);
 cmp('fatura arquivada congela as pessoas',r.fechou.arquivado.pessoas,['Pai:500','Gui:100','Ana:100']);
 eh('compra única não sobrevive ao fechamento',!r.fechou.lancDepois.some(x=>/^mercado/.test(x)));
 eh('fixo sobrevive',r.fechou.lancDepois.some(x=>/^faculdade/.test(x)));
 eh('parcela anda uma casa (8→7)',r.fechou.lancDepois.some(x=>x==='moto:parc:7:prox0'));
 eh('guardado pra próxima entra na fatura agora',r.fechou.lancDepois.some(x=>x==='presente:unico:0:prox0'));

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):'); bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|Failed to load/i.test(x));
 if(e.length) console.log('\nerros de página:',e);
 await b.close();
 process.exit(bad.length?1:0);
})();
