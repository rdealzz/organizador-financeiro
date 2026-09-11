/* Varredura por NaN / undefined / Invalid Date vazando pra tela, em estados
   que a vida produz: conta nova, renda zero, valores absurdos, datas nas bordas. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1300);

 const casos={
  'conta nova, nada lançado':()=>{S.salario=0;S.extra=0;S.metaPct=20;S.metaVal=0;S.lanc=[];S.hist=[];S.pessoas=[];S.tetos={};},
  'renda zero com gastos':()=>{S.salario=0;S.lanc=[{id:1,nome:'a',valor:500,cat:'mercado',tier:1,tipo:'unico',pai:0}];},
  'meta maior que a renda':()=>{S.salario=1000;S.metaVal=5000;},
  'gasto de valor zero':()=>{S.salario=3000;S.metaVal=0;S.lanc=[{id:2,nome:'zero',valor:0,cat:'lazer',tier:3,tipo:'unico',pai:0}];},
  'terceiros cobrem mais que o gasto':()=>{S.lanc=[{id:3,nome:'x',valor:100,cat:'casa',tier:1,tipo:'unico',pai:900,com:'z'}];},
  'valor gigante':()=>{S.lanc=[{id:4,nome:'y',valor:9e12,cat:'casa',tier:1,tipo:'unico',pai:0}];},
  'parcelas absurdas':()=>{S.lanc=[{id:5,nome:'p',valor:100,cat:'casa',tier:1,tipo:'parc',pRest:999,venc:31,pai:0}];},
  'fatura sem itens no histórico':()=>{S.hist=[{data:'2026-01-05',bruto:0,meu:0,pai:0,itens:[]}];},
  'histórico antigo sem campos novos':()=>{S.hist=[{data:'2025-12-05',bruto:500}];},
  'vencimento dia 31 em fevereiro':()=>{S.diaFech=28;S.diaVenc=28;
    S.lanc=[{id:6,nome:'f',valor:200,cat:'casa',tier:1,tipo:'fixo',venc:31,pai:0}];},
 };
 const achados=[];
 for(const [nome,semear] of Object.entries(casos)){
   await p.evaluate(fn=>{ document.querySelector('#auth').hidden=true;document.querySelector('#appWrap').hidden=false;
     eval('('+fn+')()'); }, semear.toString());
   for(const [area,sub] of [['hoje',''],['gastos',''],['analise','graficos'],['analise','cortes'],['analise','faturas'],['config','']]){
     const r=await p.evaluate(([a,s])=>{
       try{ irPara(a,s||undefined); render(); }catch(e){ return {erro:e.message}; }
       const t=document.querySelector('#appWrap').innerText;
       const m=t.match(/NaN|undefined|Invalid Date|\[object Object\]|R\$\s*$/g);
       return {ruins:m?[...new Set(m)]:[]};
     },[area,sub]);
     if(r.erro) achados.push(`${nome} › ${area}${sub?'/'+sub:''}: QUEBROU — ${r.erro}`);
     else if(r.ruins.length) achados.push(`${nome} › ${area}${sub?'/'+sub:''}: ${r.ruins.join(', ')}`);
   }
   // e o calendário
   const c=await p.evaluate(()=>{ try{ abrirCalendario(); const t=document.querySelector('#cal').innerText;
       fecharCalendario(); const m=t.match(/NaN|undefined|Invalid Date/g); return {ruins:m?[...new Set(m)]:[]};
     }catch(e){ return {erro:e.message}; } });
   if(c.erro) achados.push(`${nome} › calendário: QUEBROU — ${c.erro}`);
   else if(c.ruins.length) achados.push(`${nome} › calendário: ${c.ruins.join(', ')}`);
 }
 console.log(achados.length?('⚠ '+achados.length+' achados:\n  '+achados.join('\n  ')):'✓ nenhum NaN/undefined/Invalid Date na tela em 10 estados × 7 telas');
 const e=errs.filter(x=>!/favicon|sw\.js|manifest/i.test(x));
 if(e.length) console.log('erros:',[...new Set(e)].slice(0,5));
 await b.close();
})();
