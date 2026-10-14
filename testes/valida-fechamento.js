/* Valida o FECHAMENTO DA FATURA NO DIA 5 com o relógio do navegador controlado
   (Playwright clock): o que acontece em 04/10 às 23h59, o que acontece depois
   da meia-noite com o app ABERTO na tela, o que fica gravado no aparelho e o
   que a reabertura encontra. E a meta fixa: R$ 1.150 todo mês, diminuída à mão
   só num mês, voltando sozinha no fechamento seguinte. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+(d!==undefined?JSON.stringify(d):'falso')));};
const cmp=(n,a,b)=>eh(n,JSON.stringify(a)===JSON.stringify(b),[a,b]);

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1200,height:900}});
 const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 await p.clock.install({time:new Date(2026,9,4,23,58)});
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.clock.runFor(1500);

 const montar=()=>p.evaluate(()=>{
  Auth.logado=()=>true;                       // o relógio de minuto só roda logado
  document.querySelector('#auth').hidden=true; document.querySelector('#appWrap').hidden=false;
  document.querySelector('#tabbar').hidden=false;
  const g=(id,nome,valor,tipo,x)=>Object.assign({id,criadoEm:Date.now(),nome,valor,cat:'outros',tier:2,tipo,pai:0,pRest:0,venc:0},x||{});
  Object.assign(S,{salario:6000,extra:0,metaPct:0,metaVal:1150,diaFech:5,diaVenc:12,
    ultimoFech:'2026-09-05',hist:[],entradas:[],guard:[],tetos:{},
    lanc:[g('u','Cinema',80,'unico'),g('p','Geladeira',300,'parc',{pRest:3}),
          g('f','Aluguel',1500,'fixo'),g('v','Mercado',600,'var'),
          g('x','Pix da moto',890,'unico',{meio:'avista'}),g('n','Tênis',200,'unico',{prox:1})]});
  delete S.metaCiclo;
  irPara('planilha'); render(); return salvar();
 });
 await montar();

 // ── 04/10, 23h58: nada fecha ainda
 eh('antes do dia 5: a fatura aberta fecha em 05/10', await p.evaluate(()=>iso(faturaAberta().fecha)==='2026-10-05'));
 eh('antes do dia 5: nada no histórico', await p.evaluate(()=>S.hist.length===0));
 cmp('meta do mês = R$ 1.150 fixo', await p.evaluate(()=>[calc().meta,calc().metaPadrao]),[1150,1150]);

 // ── diminuir à mão SÓ neste mês, pela planilha
 const cel=k=>p.locator(`#plTab [data-k="${k}"]`);
 await cel('renda|guardar').fill('700'); await cel('renda|guardar').press('Enter'); await p.clock.runFor(100);
 cmp('planilha: 700 vale só neste mês, o fixo continua 1.150',
   await p.evaluate(()=>[calc().meta,S.metaVal,S.metaCiclo&&S.metaCiclo.ate]),[700,1150,'2026-10-05']);
 eh('planilha avisa que é só este mês', await p.evaluate(()=>/só este mês/.test(document.querySelector('#plTab tr.pl-guarda').textContent)));
 eh('posso gastar sobe 450 com o ajuste', await p.evaluate(()=>calc().disponivel===6000-700));

 // ── vira a meia-noite com o app ABERTO, sem trocar de aba
 await p.clock.runFor(3*60*1000);
 const h=await p.evaluate(()=>{const x=S.hist[0]||{};return {n:S.hist.length,data:x.data,venc:x.venc,bruto:x.bruto,avista:x.avista,
   itens:(x.itens||[]).map(i=>i.nome).sort(),ult:S.ultimoFech,
   lanc:S.lanc.map(l=>l.nome+':'+l.valor+(l.tipo==='parc'?'/'+l.pRest:'')+(+l.prox>0?'>'+l.prox:'')).sort(),
   aberta:iso(faturaAberta().fecha),meta:calc().meta,ciclo:S.metaCiclo||null};});
 eh('05/10 00h01, app aberto: a fatura fechou sozinha', h.n===1&&h.data==='2026-10-05'&&h.ult==='2026-10-05',h);
 cmp('fatura arquivada vence 12/10', h.venc,'2026-10-12');
 cmp('arquivada: no cartão 80+300+1500+600, Pix fora', [h.bruto,h.avista],[2480,890]);
 cmp('arquivada: o gasto da próxima fatura não entrou', h.itens,['Aluguel','Cinema','Geladeira','Mercado','Pix da moto']);
 cmp('ficaram: fixo, var zerado, parcela andou, o adiado entrou',
   h.lanc,['Aluguel:1500','Geladeira:300/2','Mercado:0','Tênis:200']);
 cmp('a nova fatura fecha em 05/11', h.aberta,'2026-11-05');
 cmp('a meta voltou sozinha a 1.150 no mês novo', [h.meta,h.ciclo],[1150,null]);
 eh('a planilha redesenhou com a fatura nova', await p.evaluate(()=>/05\/11\/2026/.test(document.querySelector('#plTab').textContent)));

 // ── o fechamento fica gravado: reabrir encontra a mesma coisa, sem fechar duas vezes
 await p.evaluate(()=>salvar());
 const reabrir=async()=>{ await p.reload(); await p.clock.runFor(1500);
   await p.evaluate(()=>carregar()); };  // sem login a abertura não carrega sozinha
 await reabrir();
 const r=await p.evaluate(()=>({n:S.hist.length,data:S.hist[0]&&S.hist[0].data,ult:S.ultimoFech,meta:calc().meta,
   lanc:S.lanc.length}));
 cmp('reaberto: uma fatura só no histórico, mesmo estado', r,{n:1,data:'2026-10-05',ult:'2026-10-05',meta:1150,lanc:4});

 // ── o app fica parado dois meses e é aberto em 20/12: fecham 05/11 e 05/12
 await p.clock.setFixedTime(new Date(2026,11,20,9,0));
 await reabrir();
 cmp('aberto em 20/12: fecharam 05/11 e 05/12, um de cada',
   await p.evaluate(()=>S.hist.map(x=>x.data)),['2026-12-05','2026-11-05','2026-10-05']);
 cmp('a geladeira terminou na parcela certa', await p.evaluate(()=>S.lanc.map(l=>l.nome).sort()),['Aluguel','Mercado']);

 await p.evaluate(()=>{ Auth.logado=()=>true; document.querySelector('#auth').hidden=true;
   document.querySelector('#appWrap').hidden=false; irPara('planilha'); render(); });
 // ── sem valor fixo ainda: a célula vira a regra de todo mês
 await p.evaluate(()=>{ S.metaVal=0; S.metaPct=20; delete S.metaCiclo; render(); });
 await cel('renda|guardar').fill('1150'); await cel('renda|guardar').press('Enter'); await p.clock.runFor(100);
 cmp('primeira vez: 1.150 vira o fixo de todo mês', await p.evaluate(()=>[S.metaVal,S.metaPct,!!S.metaCiclo]),[1150,20,false]);
 eh('calc usa os 1.150 fixos', await p.evaluate(()=>calc().metaPadrao===1150));
 // voltar ao padrão pelo link da planilha
 await cel('renda|guardar').fill('900'); await cel('renda|guardar').press('Enter'); await p.clock.runFor(100);
 await p.locator('#plTab tr.pl-guarda [data-metavolta]').click(); await p.clock.runFor(100);
 cmp('"voltar a 1.150" desfaz o ajuste do mês', await p.evaluate(()=>[calc().meta,!!S.metaCiclo]),[1150,false]);

 eh('sem erro de página', errs.length===0, errs);
 await b.close();
 console.log(ok.length+' ok, '+bad.length+' falharam'); bad.forEach(x=>console.log('  ✗ '+x));
 process.exit(bad.length?1:0);
})();
