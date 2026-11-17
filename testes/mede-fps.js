/* Mede os quadros por segundo de cada tela com animação (v12.5), como um
   celular (390px, densidade 2x), com a CPU normal e 4x mais lenta.
   Rodar com o servidor de pé: node mede-fps.js
   Não é teste de passa/falha: o número depende da máquina. Serve para
   comparar antes e depois de mexer em animação. */
const {chromium}=require('playwright');
const module_exports={}; module_exports.semear=async p=>p.evaluate(()=>{document.querySelector('#auth').hidden=true;document.querySelector('#appWrap').hidden=false;
  const g=(nome,cat,valor,e)=>Object.assign({id:'i'+Math.random().toString(36).slice(2),criadoEm:Date.now(),nome,valor,cat,tier:2,tipo:'unico',fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},e||{});
  S.salario=5200;S.metaPct=0;S.metaVal=1150;S.diaFech=5;S.diaVenc=12;
  S.pessoas=[{id:'pai',nome:'PAI',cor:'var(--pes1)'}];
  S.cartoes=[{id:'c0',nome:'Nubank'},{id:'c1',nome:'Itaú'}];
  S.lanc=[g('Aluguel','casa',1400,{tipo:'fixo'}),g('Mercado','mercado',620),g('Faculdade','estudo',900,{tipo:'fixo',pai:900,com:'pai'}),g('Moto','transporte',890,{tipo:'parc',pRest:8,cartao:'c1'}),g('Gasolina R3','transporte',58.67,{pai:29.34,com:'pai'}),g('Pizza','comida',84,{cartao:'c1'}),g('Cafeteira','casa',92.47,{tipo:'parc',pRest:4}),g('Combustível','transporte',180,{meio:'avista'}),g('Netflix','assinatura',44.9,{tipo:'fixo',cartao:'c1'})];
  const meses=['2026-05-05','2026-06-05','2026-07-05','2026-08-05','2026-09-05','2026-10-05','2026-11-05'];
  S.hist=meses.reverse().map((d,i)=>({data:d,venc:d.replace('-05','-12'),bruto:3000,avista:0,meu:2500,pai:300,itens:[
    {nome:'mercado',valor:500+((i*137)%300),cat:'mercado',tier:1,pai:0},{nome:'posto',valor:300+((i*91)%250),cat:'transporte',tier:1,pai:0},
    {nome:'ifood',valor:150+((i*53)%200),cat:'comida',tier:3,pai:0},{nome:'aluguel',valor:1400,cat:'casa',tier:1,pai:0},
    {nome:'cinema',valor:60+((i*31)%120),cat:'lazer',tier:3,pai:0},{nome:'faculdade',valor:900,cat:'estudo',tier:1,pai:450}]}));
  render();});

const semear=module_exports.semear;

(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const lento of [1,4]){
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 const cdp=await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate',{rate:lento});
 await p.goto('http://localhost:8765/index.html');await p.waitForTimeout(1500);await semear(p);
 for(const [nome,ir,rola] of [['planilha (maré+3D)','planilha','#pl3d'],['planilha rolando','planilha',null],['gastos por cartão','gastos','#gastos3dBox'],['meses anteriores','analise:hist','#hist3dBox'],['mais (sem 3D)','mais',null]]){
  await p.evaluate(([ir,rola])=>{ irPara(ir); window.scrollTo(0,0); if(rola) document.querySelector(rola).scrollIntoView({block:'center'}); },[ir,rola]);
  await p.waitForTimeout(1200);
  const r=await p.evaluate(async(rolar)=>{
    const ts=[]; let lt=0; const po=new PerformanceObserver(l=>l.getEntries().forEach(e=>lt=Math.max(lt,e.duration))); try{po.observe({type:'longtask'});}catch(e){}
    const fim=performance.now()+4000;
    await new Promise(ok=>{ const f=t=>{ ts.push(t); if(rolar) window.scrollBy(0,(ts.length%240<120)?6:-6); if(t<fim) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
    po.disconnect();
    const d=ts.slice(1).map((t,i)=>t-ts[i]);
    const media=d.reduce((a,b)=>a+b,0)/d.length;
    return {fps:+(1000/media).toFixed(1), lentos:+(100*d.filter(x=>x>20).length/d.length).toFixed(1), pior:+Math.max(...d).toFixed(1), longtask:+lt.toFixed(0)};
  }, nome==='planilha rolando');
  console.log(`CPU ${lento}x | ${nome.padEnd(20)} | ${r.fps} fps | quadros >20ms: ${r.lentos}% | pior quadro ${r.pior}ms | maior tarefa longa ${r.longtask}ms`);
 }
 await p.close();
}
await b.close()})()
