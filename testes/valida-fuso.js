const {chromium}=require('playwright');
(async()=>{
 let falhou=false;
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 for(const tz of ['America/Sao_Paulo','Europe/Berlin','Asia/Tokyo','Pacific/Auckland']){
  const ctx=await b.newContext({timezoneId:tz});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{
    document.querySelector('#auth').hidden=true;document.querySelector('#appWrap').hidden=false;
    const h=hojeD();
    const local=h.getFullYear()+'-'+String(h.getMonth()+1).padStart(2,'0')+'-'+String(h.getDate()).padStart(2,'0');
    S.diaFech=5;S.diaVenc=12;S.lanc=[{id:1,nome:'luz',valor:100,cat:'casa',tier:1,tipo:'fixo',venc:h.getDate(),pai:0}];
    marcarPago(1,'bolso');
    const l=S.lanc[0];
    return {hojeLocal:local, iso:iso(h), pagoAte:l.pagoAte,
            contaSaiuDaLista:contasAVencer().length===0};
  });
  const ok=r.iso===r.hojeLocal&&r.contaSaiuDaLista;
  console.log((ok?'✓ ':'✗ ')+tz.padEnd(20)+' hoje='+r.hojeLocal+'  iso()='+r.iso+(ok?'':'   ⚠ A DATA SAIU DE OUTRO DIA'));
  if(!ok) falhou=true;
  await ctx.close();
 }
 await b.close();
 process.exit(falhou?1:0);
})();
