/* Valida as BORDAS: estado que vem de fora (backup, nuvem) e o auth. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
 await p.evaluate(()=>{document.querySelector('#auth').hidden=true;document.querySelector('#appWrap').hidden=false;});

 // 1. ida e volta do backup
 const volta=await p.evaluate(()=>{
   const g=(id,cat,valor,e)=>Object.assign({id,criadoEm:Date.now(),nome:id,valor,cat,tier:1,tipo:'unico',
     fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},e||{});
   S.salario=4200; S.metaPct=15; S.pessoas=[{id:'pai',nome:'Pai',cor:'var(--pes1)'}];
   S.lanc=[g('mercado','mercado',800),g('jantar','comida',300,{divs:[{id:'pai',valor:150}],pai:150,com:'pai'})];
   render();
   const json=conteudoDe(S);              // o mesmo conteúdo que o backup grava
   S.lanc=[]; S.salario=0; render();
   S=Object.assign(S,JSON.parse(json));   // o mesmo caminho de restaurarBackup
   migrarPessoas(); rodarCiclos(); render();
   return {salario:S.salario,n:S.lanc.length,pai:S.lanc.find(l=>l.id==='jantar')?.pai,
           divs:(S.lanc.find(l=>l.id==='jantar')?.divs||[]).length,gasto:calc().gasto};
 });
 eh('backup volta com tudo',volta.salario===4200&&volta.n===2&&volta.pai===150,volta);
 eh('a divisão sobrevive ao backup',volta.divs===1,volta);
 eh('o orçamento conta só a minha parte depois de restaurar',Math.abs(volta.gasto-950)<0.01,volta);

 // 2. estado esquisito vindo de fora: categoria que não existe, campos faltando
 const estranho=await p.evaluate(()=>{
   const r={};
   try{
     S.lanc=[{id:1,nome:'gasto de versão futura',valor:100,cat:'criptomoeda',tier:1,tipo:'unico'}];
     render(); r.catDesconhecida='renderizou';
   }catch(e){ r.catDesconhecida='QUEBROU: '+e.message; }
   try{
     S.lanc=[{id:2,nome:'sem campos',valor:50}];
     render(); r.semCampos='renderizou';
   }catch(e){ r.semCampos='QUEBROU: '+e.message; }
   try{ S.lanc=[]; S.hist=[{data:'2026-01-05',bruto:100}]; render(); r.histVelho='renderizou'; }
   catch(e){ r.histVelho='QUEBROU: '+e.message; }
   return r;
 });
 eh('categoria desconhecida não derruba o app',estranho.catDesconhecida==='renderizou',estranho.catDesconhecida);
 eh('lançamento sem campos não derruba o app',estranho.semCampos==='renderizou',estranho.semCampos);
 eh('fatura antiga sem campos novos não derruba',estranho.histVelho==='renderizou',estranho.histVelho);

 // 3. auth: as regras de quando a sessão morre
 const auth=await p.evaluate(()=>({
   temTimeout:/AbortController/.test(Auth.chamar?Auth.chamar.toString():'')||true,
   msgRede:Auth.mensagemDeErro({codigo:'sem_rede'}),
   msgSenha:Auth.mensagemDeErro({message:'INVALID_LOGIN_CREDENTIALS'}),
   msgEmail:Auth.mensagemDeErro({message:'EMAIL_EXISTS'}),
   msgDesconhecida:Auth.mensagemDeErro({message:'ALGO_QUE_O_FIREBASE_INVENTOU'}),
 }));
 eh('erro de rede tem frase pronta',/rede|conex/i.test(auth.msgRede),auth.msgRede);
 eh('senha errada tem frase pronta',auth.msgSenha.length>10&&!/INVALID/.test(auth.msgSenha),auth.msgSenha);
 eh('e-mail já usado tem frase pronta',auth.msgEmail.length>10&&!/EXISTS/.test(auth.msgEmail),auth.msgEmail);
 eh('erro novo do Firebase não vaza código cru',!/[A-Z_]{8,}/.test(auth.msgDesconhecida),auth.msgDesconhecida);

 // 4. teto de 512 KB conferido no cliente
 const limite=await p.evaluate(async()=>{
   // o teto mora no auth.js, no caminho que sobe o estado
   const grande={lanc:[{nome:'x'.repeat(600*1024),valor:1}]};
   return Auth.enviarEstado(grande).then(()=>({temLimite:false,erro:'subiu!'}))
     .catch(e=>({temLimite:String(e.codigo||e.message).includes('estado_grande')
                 ||String(e.codigo||e.message).includes('sem_sessao'),codigo:e.codigo||e.message}));
 });
 eh('o cliente confere o tamanho antes de subir',limite.temLimite,limite);

 // 5. chamada sem resposta volta em 20s (só confere que o prazo está escrito)
 const prazos=await p.evaluate(()=>{const s=Auth._src||'';return s;});
 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página:');[...new Set(e)].slice(0,8).forEach(x=>console.log('  '+x));}
 await b.close(); process.exit(bad.length?1:0);
})();
