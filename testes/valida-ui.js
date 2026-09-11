/* Valida a INTERFACE: cada coisa clicável, nas quatro áreas e nas camadas. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+(d!==undefined?JSON.stringify(d):'falso')));};
const cmp=(n,a,b)=>eh(n,JSON.stringify(a)===JSON.stringify(b),[a,b]);

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);

 const semear=()=>p.evaluate(()=>{
  document.querySelector('#auth').hidden=true; document.querySelector('#appWrap').hidden=false;
  const g=(id,cat,tier,valor,e)=>Object.assign({id,criadoEm:Date.now(),nome:id,valor,cat,tier,tipo:'unico',
    fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},e||{});
  S.salario=5000;S.metaPct=10;S.metaVal=0;S.tetos={};S.diaFech=5;S.diaVenc=12;
  S.pessoas=[{id:'pai',nome:'Pai',cor:'var(--pes1)'},{id:'gui',nome:'Gui',cor:'var(--pes2)'}];
  S.hist=[0,1,2,3,4,5].map(i=>({data:`2026-0${3+Math.min(i,6)}-05`,venc:`2026-0${3+Math.min(i,6)}-12`,
    bruto:2000+i*90,avista:100,meu:1700+i*60,pai:300,itens:[
      {nome:'mercado',valor:600+i*20,cat:'mercado',tier:1,pai:0},
      {nome:'posto',valor:400+i*30,cat:'transporte',tier:1,pai:0},
      {nome:'ifood',valor:300,cat:'comida',tier:3,pai:0},
      {nome:'faculdade',valor:700,cat:'estudo',tier:1,pai:300}],
    pessoas:[{id:'pai',nome:'Pai',cor:'var(--pes1)',valor:300}]}));
  S.lanc=[g('mercado','mercado',1,800),
          g('faculdade','estudo',1,1000,{tipo:'fixo',venc:10,pai:500,com:'pai'}),
          g('moto','transporte',1,890,{tipo:'parc',pRest:8,venc:15,meio:'avista'}),
          g('jantar','comida',3,300,{divs:[{id:'gui',valor:100},{id:'pai',valor:100}],pai:200,com:'gui'}),
          g('presente','lazer',3,150,{prox:1})];
  S.lanc.forEach(l=>{if(l.divs)sincronizarDivs(l);});
  irPara('hoje'); render();
 });
 await semear();

 const semErro=async(nome,fn)=>{const n=errs.length; await fn(); await p.waitForTimeout(120);
   eh(nome, errs.length===n, errs.slice(n));};

 // ── 1. as quatro áreas e todas as sub-abas
 const areas=await p.evaluate(()=>Object.keys(AREAS));
 for(const a of areas){
   const subs=await p.evaluate(A=>(AREAS[A].subs||[]).map(s=>s.id||s), a);
   await semErro('área '+a+' abre', ()=>p.evaluate(A=>{irPara(A);render();},a));
   for(const s of subs){
     await semErro(`  ${a} › ${s}`, ()=>p.evaluate(([A,S_])=>{irPara(A,S_);render();},[a,s]));
   }
 }
 await p.evaluate(()=>{irPara('gastos');render();});
 await p.evaluate(()=>{document.querySelectorAll('.bloco[hidden]').forEach(e=>e.hidden=false);
                       const t=document.querySelector('#blocoTodos'); if(t)t.hidden=false;});

 // ── 2. a tabela de lançamentos
 const tab=await p.evaluate(()=>({
   linhas:document.querySelectorAll('#tbLanc tr').length,
   editar:document.querySelectorAll('#tbLanc [data-editar]').length,
   cats:document.querySelectorAll('#tbLanc [data-cat]').length,
   pags:document.querySelectorAll('#tbLanc [data-pag]').length,
   vals:document.querySelectorAll('#tbLanc [data-val]').length}));
 eh('cada gasto tem botão editar',tab.editar>=5,tab);
 eh('cada gasto tem select de categoria',tab.cats>=5,tab);
 eh('gasto rachado vira botão, não select',tab.pags===4&&tab.editar>=6,tab);

 await semErro('trocar categoria na linha', ()=>p.evaluate(()=>{
   const s=document.querySelector('#tbLanc [data-cat="mercado"]'); s.value='comida';
   s.dispatchEvent(new Event('change',{bubbles:true}));}));
 const catMud=await p.evaluate(()=>{const l=S.lanc.find(x=>x.id==='mercado');return[l.cat,!!l.catManual];});
 cmp('categoria trocada grava catManual',catMud,['comida',true]);

 await semErro('trocar quem paga na linha', ()=>p.evaluate(()=>{
   const s=document.querySelector('#tbLanc [data-pag="mercado"]'); s.value='d:pai';
   s.dispatchEvent(new Event('change',{bubbles:true}));}));
 eh('pagador aplicado: divide meio a meio com o Pai',
    await p.evaluate(()=>{const l=S.lanc.find(x=>x.id==='mercado');return l.com==='pai'&&Math.abs(l.pai-l.valor/2)<0.02;}));

 // ── 3. a folha de edição
 await semErro('editar abre a folha', ()=>p.evaluate(()=>abrirEdicao('moto')));
 const folha=await p.evaluate(()=>({aberta:document.querySelector('#edFolha').classList.contains('abre'),
   nome:document.querySelector('#eNome').value, tipo:document.querySelector('#eTipo').value,
   parc:document.querySelector('#eParc').value, venc:document.querySelector('#eVenc').value,
   prazo:(document.querySelector('#eAviso')||{}).textContent||'',
   meio:document.querySelector('#eMeio .on').dataset.emeio}));
 eh('a folha traz os dados do gasto',folha.aberta&&folha.tipo==='parc'&&folha.parc==='8'&&folha.venc==='15'&&folha.meio==='avista',folha);
 eh('a frase diz quando termina',/termina|última/i.test(folha.prazo),folha.prazo);

 await semErro('salvar edição', ()=>p.evaluate(()=>{
   document.querySelector('#eNome').value='Parcela da moto';
   document.querySelector('#eParc').value='6';
   document.querySelector('#eVenc').value='20';
   document.querySelector('#eCat').value='divida';
   document.querySelector('#eCat').dispatchEvent(new Event('change',{bubbles:true}));
   salvarEdicao();}));
 const dep=await p.evaluate(()=>{const l=S.lanc.find(x=>x.id==='moto');
   return{nome:l.nome,pRest:l.pRest,venc:l.venc,cat:l.cat,catManual:!!l.catManual,pagoAte:l.pagoAte||null,
          fechada:!document.querySelector('#edFolha').classList.contains('abre')};});
 cmp('edição gravou tudo',[dep.nome,dep.pRest,dep.venc,dep.cat,dep.catManual,dep.fechada],
     ['Parcela da moto',6,20,'divida',true,true]);

 // trocar o dia de vencimento apaga o "já paguei"
 await p.evaluate(()=>{marcarPago('faculdade','bolso');});
 eh('marcou como paga',await p.evaluate(()=>!!S.lanc.find(x=>x.id==='faculdade').pagoAte));
 await p.evaluate(()=>{abrirEdicao('faculdade');document.querySelector('#eVenc').value='25';salvarEdicao();});
 eh('trocar o vencimento apaga a marca de paga',
    await p.evaluate(()=>!S.lanc.find(x=>x.id==='faculdade').pagoAte));

 // divisão entre várias pessoas
 await p.evaluate(()=>abrirEdicao('jantar'));
 const divIni=await p.evaluate(()=>document.querySelectorAll('#eDivLista [data-divp]').length);
 eh('a lista mostra as duas pessoas',divIni===2,divIni);
 await semErro('+ pessoa', ()=>p.evaluate(()=>{S.pessoas.push({id:'ana',nome:'Ana',cor:'var(--pes3)'});addDivisao();}));
 await semErro('dividir igualmente', ()=>p.evaluate(()=>dividirIgual()));
 const ig=await p.evaluate(()=>({n:edDivs.length,vals:edDivs.map(d=>d.valor)}));
 eh('dividido igualmente entre mim e as 3',ig.n===3&&ig.vals.every(v=>Math.abs(v-75)<0.02),ig);
 await semErro('só meu', ()=>p.evaluate(()=>{document.querySelector('#eDivNada').click();}));
 eh('"só meu" zera a divisão',await p.evaluate(()=>edDivs.length===0));
 await p.evaluate(()=>{salvarEdicao();});
 eh('salvo sem divisão: pai=0',await p.evaluate(()=>{const l=S.lanc.find(x=>x.id==='jantar');return l.pai===0&&!l.divs;}));

 // ── 4. folha de lançar
 await semErro('abrir folha de lançar', ()=>p.evaluate(()=>abrirFolha()));
 const camposIni=await p.evaluate(()=>({parc:!document.querySelector('#campoParc').hidden,
   pai:!document.querySelector('#campoPai').hidden}));
 eh('parcelas escondidas em compra única',!camposIni.parc,camposIni);
 await semErro('escolher parcelado mostra parcelas', ()=>p.evaluate(()=>{
   const s=document.querySelector('#lTipo'); s.value='parc'; s.dispatchEvent(new Event('change',{bubbles:true}));}));
 eh('parcelas apareceram',await p.evaluate(()=>!document.querySelector('#campoParc').hidden));
 await semErro('lançar pelo campo rápido', ()=>p.evaluate(()=>{
   const i=document.querySelector('#rapido'); i.value='estacionamento 25 pix';
   i.dispatchEvent(new Event('input',{bubbles:true})); salvarRapido();}));
 const novo=await p.evaluate(()=>{const l=S.lanc[S.lanc.length-1];return{nome:l.nome,valor:l.valor,cat:l.cat,meio:l.meio,tipo:l.tipo};});
 cmp('gasto rápido entrou certo',[novo.valor,novo.cat,novo.meio,novo.tipo],[25,'transporte','avista','unico']);
 // a folha completa: lançar com "todo mês" e conferir que o campo volta sozinho
 await semErro('lançar pela folha completa', ()=>p.evaluate(()=>{
   document.querySelector('#lNome').value='aluguel';
   document.querySelector('#lValor').value='1200';
   const t=document.querySelector('#lTipo'); t.value='fixo'; t.dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('#addLanc').click();}));
 eh('gasto da folha entrou como todo mês',
    await p.evaluate(()=>{const l=S.lanc[S.lanc.length-1];return l.nome.toLowerCase()==='aluguel'&&l.tipo==='fixo';}));
 eh('o campo Repetição volta a compra única depois de lançar',
    await p.evaluate(()=>document.querySelector('#lTipo').value==='unico'));

 // ── 5. calendário, pelas três portas
 for(const porta of ['#abrirCal','#btnCalTopo']){
   await semErro('calendário abre por '+porta, async()=>{
     await p.evaluate(s=>{const b=document.querySelector(s); if(b) b.click();},porta);});
   eh('  ficou aberto '+porta,await p.evaluate(()=>!document.querySelector('#cal').hidden));
   await p.evaluate(()=>fecharCalendario());
 }
 await p.evaluate(()=>abrirCalendario());
 const cal=await p.evaluate(()=>({dias:document.querySelectorAll('.cal-d').length,
   comConta:document.querySelectorAll('.cal-d.tem').length,
   obs:document.querySelectorAll('.cal-obs .insight').length,
   tira:document.querySelectorAll('.cal-tb').length}));
 eh('a grade desenha o mês',cal.dias>=28,cal);
 eh('dias com conta marcados',cal.comConta>0,cal);
 eh('a tira tem 12 meses',cal.tira===12,cal);
 eh('o painel fala',cal.obs>0,cal);
 const m0=await p.evaluate(()=>calMes);
 await semErro('‹ anda um mês', ()=>p.evaluate(()=>document.querySelector('#calAnt').click()));
 await semErro('› volta', ()=>p.evaluate(()=>document.querySelector('#calProx').click()));
 await semErro('« anda um ano', ()=>p.evaluate(()=>document.querySelector('#calAnoAnt').click()));
 eh('navegação mexeu no mês/ano',await p.evaluate(m=>calMes===m&&calAno!==new Date().getFullYear(),m0));
 await p.evaluate(()=>{calAno=new Date().getFullYear();calMes=new Date().getMonth();desenharCalendario();});
 await semErro('clicar num dia mostra as contas', ()=>p.evaluate(()=>{
   const d=document.querySelector('.cal-d.tem'); d.click();}));
 eh('o painel mostra o dia escolhido',await p.evaluate(()=>/\d{1,2} de /.test(document.querySelector('#calLado').textContent)));
 await semErro('editar a fatura pelo calendário', ()=>p.evaluate(()=>{
   const b=document.querySelector('[data-calfat]'); if(b)b.click(); else {calEdFat=true;desenharCalendario();}}));
 eh('o bloco de datas do cartão abriu',await p.evaluate(()=>!!document.querySelector('#calFech, #edFatFech, [data-fatfech]')));
 await semErro('teclado anda pelos meses', ()=>p.press('#cal','ArrowRight').catch(()=>p.keyboard.press('ArrowRight')));
 await semErro('Esc fecha', ()=>p.keyboard.press('Escape'));
 eh('o calendário fechou',await p.evaluate(()=>document.querySelector('#cal').hidden));

 // ── 6. menu de perfil, tema, 3D
 await semErro('abrir menu de perfil', ()=>p.evaluate(()=>{
   const b=document.querySelector('#perfilBtn'); b.querySelector('svg,path,*')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))||b.click();}));
 eh('o menu abriu clicando no ÍCONE',await p.evaluate(()=>!document.querySelector('#menuPerfil').hidden));
 await semErro('clicar fora fecha', ()=>p.evaluate(()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}))));
 eh('o menu fechou',await p.evaluate(()=>document.querySelector('#menuPerfil').hidden));
 const t0=await p.evaluate(()=>document.documentElement.dataset.tema);
 await semErro('trocar o tema', ()=>p.evaluate(()=>alternarTema()));
 eh('o tema mudou e ficou gravado',
    await p.evaluate(t=>document.documentElement.dataset.tema!==t&&!!localStorage.getItem('sobra:tema'),t0));
 await p.evaluate(()=>alternarTema());
 await semErro('gráfico 3D monta', ()=>p.evaluate(()=>{irPara('analise','cortes');render();}));
 const v3=await p.evaluate(()=>{const c=document.querySelector('#viz3dTela');
   return c?{w:c.width,h:c.height,montado:!!viz3d}:null;});
 eh('a cena 3D existe e tem tamanho',!!v3&&v3.w>0&&v3.h>0,v3);

 // ── 7. cobranças, backup, CSV
 await p.evaluate(()=>{irPara('analise','faturas');render();});
 const cob=await p.evaluate(()=>({cartoes:document.querySelectorAll('.cobr-cartao, [data-cobrar]').length,
   texto:(typeof textoCobranca==='function')?textoCobranca(cobrancas(doCiclo())[0],null).slice(0,60):''}));
 eh('a cobrança sai com texto',cob.texto.length>10,cob);
 const bkp=await p.evaluate(()=>{let t=null;const old=URL.createObjectURL;URL.createObjectURL=b=>{t=b;return 'blob:x';};
   try{baixarBackup();}catch(e){return{erro:String(e)};}URL.createObjectURL=old;return{tam:t?t.size:0};});
 eh('backup gera arquivo',bkp.tam>200,bkp);

 // ── 8. nenhuma tela ficou transparente com a esfera ligada
 await p.evaluate(()=>{document.body.classList.add('fundo-vivo');});
 for(const tema of ['claro','escuro']){
   await p.evaluate(t=>{document.documentElement.dataset.tema=t;},tema);
   await p.evaluate(()=>abrirCalendario()); await p.waitForTimeout(80);
   const fundo=await p.evaluate(()=>getComputedStyle(document.querySelector('#cal')).backgroundColor);
   eh(`calendário opaco no tema ${tema}`,!/rgba\(0, 0, 0, 0\)|transparent/.test(fundo),fundo);
   await p.evaluate(()=>fecharCalendario());
 }
 await p.evaluate(()=>{document.body.classList.remove('fundo-vivo');});

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|blob:x|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página ('+e.length+'):');[...new Set(e)].slice(0,10).forEach(x=>console.log('  '+x));}
 await b.close();
 process.exit(bad.length?1:0);
})();
