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
                       abrirTodosOsGastos();});

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
 await p.evaluate(()=>fecharTodosOsGastos());   // camada aberta esconderia o resto do teste

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
 // o jeito antigo, tudo num campo só, continua sendo entendido
 await semErro('lançar escrevendo "estacionamento 25 pix" no nome', ()=>p.evaluate(()=>{
   const s=document.querySelector('#lTipo'); s.value='unico'; s.dispatchEvent(new Event('change',{bubbles:true}));
   const i=document.querySelector('#lNome'); i.value='estacionamento 25 pix';
   i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#addLanc').click();}));
 const novo=await p.evaluate(()=>{const l=S.lanc[S.lanc.length-1];return{nome:l.nome,valor:l.valor,cat:l.cat,meio:l.meio,tipo:l.tipo};});
 cmp('gasto num campo só entrou certo',[novo.nome,novo.valor,novo.cat,novo.meio,novo.tipo],['Estacionamento',25,'transporte','avista','unico']);
 eh('a folha fecha depois de salvar',await p.evaluate(()=>!document.querySelector('#sheet').classList.contains('abre')));
 // o caminho novo: atalho → valor com vírgula → Pix → Salvar
 await semErro('lançar pelo atalho com valor "12,50" e Pix', ()=>p.evaluate(()=>{
   abrirFolha();
   const chip=[...document.querySelectorAll('#chips [data-chip]')].find(b=>/uber/i.test(b.dataset.chip))
     ||document.querySelector('#chips [data-chip]');
   chip.click();
   document.querySelector('#lValor').value='12,50';
   document.querySelector('#lMeio [data-meio="avista"]').click();
   document.querySelector('#addLanc').click();}));
 const pelo=await p.evaluate(()=>{const l=S.lanc[S.lanc.length-1];return{valor:l.valor,meio:l.meio,fonte:l.fonte};});
 cmp('o atalho lançou R$ 12,50 à vista',[pelo.valor,pelo.meio,pelo.fonte],[12.5,'avista','Pix']);
 eh('o meio volta a cartão no próximo gasto',await p.evaluate(()=>{abrirFolha();return meioForm==='cartao';}));
 cmp('valorDe entende o jeito brasileiro',await p.evaluate(()=>['45','45,90','1.234,56','R$ 80','12.500','45.5','','abc'].map(valorDe)),
     [45,45.9,1234.56,80,12500,45.5,0,0]);
 await semErro('sem valor não salva', ()=>p.evaluate(()=>{const n=S.lanc.length;
   document.querySelector('#lNome').value='padaria'; document.querySelector('#lValor').value='';
   document.querySelector('#addLanc').click(); window.__n=[n,S.lanc.length];}));
 eh('sem valor não entra nada',await p.evaluate(()=>window.__n[0]===window.__n[1]));
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

 // ── 4b. o gasto de sempre já vem preenchido (v10.22)
 await p.evaluate(()=>{fecharFolha(); S.lanc.push({id:'cafe1',criadoEm:Date.now(),nome:'Café',valor:7.5,cat:'comida',tier:3,
   tipo:'unico',fonte:'Pix',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'avista'}); abrirFolha();});
 const pre=await p.evaluate(()=>{
   const chips=[...document.querySelectorAll('#chips [data-chip]')];
   const temValor=chips.length>0&&chips.every(b=>!!ultimoDoNome(b.dataset.chip)===!!b.querySelector('small'))
     &&chips.some(b=>b.querySelector('small'));
   document.querySelector('#lNome').value='café';
   document.querySelector('#lNome').dispatchEvent(new Event('change'));
   return {temValor,valor:document.querySelector('#lValor').value,meio:meioForm,
     dica:!document.querySelector('#lValorDica').hidden};});
 cmp('nome conhecido traz valor e Pix da última vez',[pre.valor,pre.meio,pre.dica],['7,50','avista',true]);
 eh('o atalho mostra o valor da última vez',pre.temValor,pre);
 eh('valor escrito à mão nunca é trocado',await p.evaluate(()=>{
   document.querySelector('#lValor').value='9'; preencherDoHistorico(); return document.querySelector('#lValor').value==='9';}));
 await p.evaluate(()=>{fecharFolha(); S.lanc=S.lanc.filter(l=>l.id!=='cafe1');});

 // ── 4c. modo simples: só o básico na barra
 const simp=await p.evaluate(()=>{
   localStorage.removeItem('sobra:completo'); irPara('plano');
   const plano={nav:document.querySelector('#a-plano .subnav').hidden, sub:SUB.plano};
   irPara('ajustes');
   const aj=[...document.querySelectorAll('#a-ajustes .sub')].filter(b=>!b.hidden).map(b=>b.dataset.s);
   irPara('plano:tetos');
   const link=!document.querySelector('#t-tetos').hidden;
   irPara('plano');
   const volta=SUB.plano;
   localStorage.setItem('sobra:completo','1'); irPara('plano');
   const todas=[...document.querySelectorAll('#a-plano .sub')].filter(b=>!b.hidden).length;
   localStorage.removeItem('sobra:completo');
   return {plano,aj,link,volta,todas};});
 cmp('simples: Planejamento é só Renda, sem barra',[simp.plano.nav,simp.plano.sub],[true,'renda']);
 cmp('simples: Ajustes mostra Conta, Alertas e Dados',simp.aj,['conta','alertas','dados']);
 eh('link direto para uma aba escondida abre ela mesmo assim',simp.link);
 cmp('voltando sem destino, cai de novo no básico',simp.volta,'renda');
 cmp('completo: as cinco abas de Planejamento',simp.todas,5);

 // ── 4d. três abas e vários cartões (v10.23)
 const nav=await p.evaluate(()=>{
   const tabs=[...document.querySelectorAll('#tabbar .tb')].map(b=>b.dataset.a);
   irPara('plano:renda');
   const maisAceso=document.querySelector('#tabbar [data-a="mais"]').getAttribute('aria-selected')==='true';
   const voltar=!document.querySelector('#voltarMais').hidden, tit=document.querySelector('#tituloArea').textContent;
   document.querySelector('#voltarMais').click();
   const emMais=AREA==='mais'&&document.querySelectorAll('#maisLista [data-mais]').length>=7;
   return {tabs,maisAceso,voltar,tit,emMais};});
 cmp('a barra tem três abas',nav.tabs,['hoje','gastos','mais']);
 eh('tela aberta por Mais acende Mais e mostra Voltar',nav.maisAceso&&nav.voltar&&nav.tit==='Minha renda',nav);
 eh('Voltar leva para a lista de Mais',nav.emMais,nav);
 const car=await p.evaluate(()=>{
   S.cartoes=[{id:'c0',nome:'Nubank'},{id:'cx',nome:'Itaú'}];
   abrirFolha();
   const botoes=[...document.querySelectorAll('#lMeio button')].map(b=>b.textContent);
   document.querySelector('#lNome').value='sapato'; document.querySelector('#lValor').value='200';
   document.querySelector('#lTipoSeg [data-tiposeg="parc"]').click();
   const parcVis=!document.querySelector('#campoParc').hidden;
   document.querySelector('#lParc').value='4';
   document.querySelector('#lMeio [data-cartao="cx"]').click();
   document.querySelector('#addLanc').click();
   const l=S.lanc[S.lanc.length-1];
   irPara('gastos'); render();
   const grupos=[...document.querySelectorAll('#listaGastos .g-cab b')].map(b=>b.textContent);
   const somaItau=[...document.querySelectorAll('#listaGastos .g-grupo')].find(g=>/Itaú/.test(g.textContent))
     .querySelector('.g-soma b').textContent;
   const total=document.querySelector('#listaGastos .g-total-l b').textContent;
   const esperado=brl(doCiclo().reduce((t,x)=>t+(+x.valor||0),0));
   return {botoes,parcVis,tipo:l.tipo,pRest:l.pRest,cartao:l.cartao,grupos,somaItau,total,esperado};});
 cmp('um botão por cartão e "sem cartão"',car.botoes,['Nubank','Itaú','Sem cartão']);
 eh('"Parcelado" mostra o campo de parcelas',car.parcVis);
 cmp('o gasto guardou tipo, parcelas e cartão',[car.tipo,car.pRest,car.cartao],['parc',4,'cx']);
 eh('a lista separa por cartão',car.grupos.includes('Nubank')&&car.grupos.includes('Itaú'),car.grupos);
 eh('a soma do Itaú inclui o gasto novo',/200,00/.test(car.somaItau),car.somaItau);
 cmp('o total do mês é a soma de tudo',car.total,car.esperado);
 eh('editar troca o cartão',await p.evaluate(()=>{const l=S.lanc[S.lanc.length-1]; abrirEdicao(l.id);
   document.querySelector('#eMeio [data-ecartao="c0"]').click(); salvarEdicao(); return !l.cartao&&cartaoDe(l)==='c0';}));
 await p.evaluate(()=>{S.lanc.pop(); S.cartoes=[]; irPara('hoje'); render();});

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

 // ── 7b. a lista completa é uma CAMADA: abre por cima, não rola a página
 /* Fecha o que as seções anteriores deixaram aberto: com a folha de edição na
    tela o Esc é dela, e com razão — é ela que está por cima. */
 const antesY=await p.evaluate(()=>{
   if(typeof folhaAberta!=='undefined'&&folhaAberta) fecharFolha();
   fecharTodosOsGastos(); window.scrollTo(0,0); return window.scrollY;});
 await p.waitForTimeout(150);
 await p.evaluate(()=>abrirTodosOsGastos()); await p.waitForTimeout(120);
 const cam=await p.evaluate(()=>({
   aberta:!document.querySelector('#blocoTodos').hidden,
   fixa:getComputedStyle(document.querySelector('#blocoTodos')).position,
   rolou:window.scrollY,
   dialogo:document.querySelector('#blocoTodos').getAttribute('role'),
   linhas:document.querySelectorAll('#tbLanc tr').length}));
 eh('ver todos abre a camada',cam.aberta&&cam.fixa==='fixed',cam);
 eh('e a página não sai do lugar',cam.rolou===antesY,cam);
 eh('a camada se anuncia como diálogo',cam.dialogo==='dialog',cam);
 eh('com as linhas dentro dela',cam.linhas>2,cam);

 // a busca filtra E o rodapé para de somar o ciclo inteiro
 const bus=await p.evaluate(()=>{
   const l=S.lanc[0]; const alvo=l.nome;
   const campo=document.querySelector('#todosBusca');
   campo.value=alvo; campo.dispatchEvent(new Event('input',{bubbles:true}));
   const html=document.querySelector('#tbLanc').innerHTML;
   return {alvo,linhas:document.querySelectorAll('#tbLanc tr').length,
     somaHonesta:/Soma do que está sendo mostrado/.test(html),
     semTotalDoCiclo:!/Total desta fatura|Total do ciclo/.test(html),
     resumoEscondido:getComputedStyle(document.querySelector('#cards2')).display==='none',
     sub:document.querySelector('#todosSub').textContent};
 });
 eh('a busca filtra a lista',bus.linhas>0&&bus.linhas<40,bus);
 eh('e o rodapé soma só o que está na tela',bus.somaHonesta&&bus.semTotalDoCiclo,bus);
 eh('o resumo do ciclo some enquanto filtra',bus.resumoEscondido,bus);
 eh('o subtítulo diz quantos de quantos',/de \d+ gastos/.test(bus.sub),bus);
 const vazio=await p.evaluate(()=>{
   const campo=document.querySelector('#todosBusca');
   campo.value='zzzznaoexiste'; campo.dispatchEvent(new Event('input',{bubbles:true}));
   return document.querySelector('#tbLanc').textContent;});
 eh('busca sem resultado diz isso',/Nenhum gasto/.test(vazio),vazio);
 // Esc fecha e limpa a busca: reabrir filtrado, sem lembrar do filtro, é a
 // lista mentindo sobre quantos gastos existem.
 const guarda=await p.evaluate(()=>({cal:document.querySelector('#cal').hidden,
   recibo:document.querySelector('#recibo').hidden,folha:folhaAberta}));
 eh('nenhuma outra camada está por cima na hora do Esc',guarda.cal&&guarda.recibo&&!guarda.folha,guarda);
 await p.keyboard.press('Escape'); await p.waitForTimeout(120);
 const fim=await p.evaluate(()=>({fechada:document.querySelector('#blocoTodos').hidden,
   busca:document.querySelector('#todosBusca').value,
   corpoLivre:document.body.style.overflow}));
 eh('Esc fecha a camada',fim.fechada,fim);
 eh('e a busca não sobrevive ao fechamento',fim.busca==='',fim);
 eh('a página volta a rolar',fim.corpoLivre!=='hidden',fim);

 // ── 8. nenhuma tela ficou transparente com a esfera ligada
 await p.evaluate(()=>{document.body.classList.add('fundo-vivo');});
 for(const tema of ['claro','escuro']){
   await p.evaluate(t=>{document.documentElement.dataset.tema=t;},tema);
   await p.evaluate(()=>abrirCalendario()); await p.waitForTimeout(80);
   const fundo=await p.evaluate(()=>getComputedStyle(document.querySelector('#cal')).backgroundColor);
   eh(`calendário opaco no tema ${tema}`,!/rgba\(0, 0, 0, 0\)|transparent/.test(fundo),fundo);
   await p.evaluate(()=>fecharCalendario());
   /* Tela cheia nova entra na mesma conferência: a lista completa usa as
      variáveis do tema, então escuro fixo a quebraria no claro — lição da
      v10.6, que nasceu exatamente assim no calendário. */
   await p.evaluate(()=>abrirTodosOsGastos()); await p.waitForTimeout(80);
   const ft=await p.evaluate(()=>getComputedStyle(document.querySelector('#blocoTodos')).backgroundColor);
   eh(`lista completa opaca no tema ${tema}`,!/rgba\(0, 0, 0, 0\)|transparent/.test(ft),ft);
   await p.evaluate(()=>fecharTodosOsGastos());
 }
 await p.evaluate(()=>{document.body.classList.remove('fundo-vivo');});

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|blob:x|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página ('+e.length+'):');[...new Set(e)].slice(0,10).forEach(x=>console.log('  '+x));}
 await b.close();
 process.exit(bad.length?1:0);
})();
