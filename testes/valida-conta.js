/* Conta: duplicidade de e-mail e recuperação por código.

   O Firebase é EMULADO na rede da página — com as respostas que o projeto real
   devolveu quando medidas por curl (EMAIL_EXISTS na segunda conta, endereços
   de Gmail com ponto e com +apelido tratados como contas DIFERENTES). Assim o
   teste roda em qualquer lugar e não cria conta em produção. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));

 // ── o Firebase de mentira, com as regras do de verdade
 const contas=new Map();            // e-mail EXATO → {senha,nome}
 const oobs=new Map();              // código → e-mail
 const enviados=[];                 // e-mails para quem o código foi pedido
 const jsonOK=o=>({status:200,contentType:'application/json',body:JSON.stringify(o)});
 const jsonErro=(m,s)=>({status:s||400,contentType:'application/json',
   body:JSON.stringify({error:{code:s||400,message:m}})});
 await p.route('https://identitytoolkit.googleapis.com/**',async rota=>{
   const url=rota.request().url(), corpo=JSON.parse(rota.request().postData()||'{}');
   const sessao=email=>({idToken:'id-'+email,refreshToken:'ref-'+email,expiresIn:'3600',
     localId:'uid-'+email,email});
   if(url.includes(':signUp')){
     if(contas.has(corpo.email)) return rota.fulfill(jsonErro('EMAIL_EXISTS'));
     contas.set(corpo.email,{senha:corpo.password,nome:corpo.displayName||''});
     return rota.fulfill(jsonOK(sessao(corpo.email)));
   }
   if(url.includes(':signInWithPassword')){
     const c=contas.get(corpo.email);
     if(!c||c.senha!==corpo.password) return rota.fulfill(jsonErro('INVALID_LOGIN_CREDENTIALS'));
     return rota.fulfill(jsonOK(sessao(corpo.email)));
   }
   if(url.includes(':sendOobCode')){
     /* Como o projeto real: continueUrl de domínio fora da lista é recusado,
        e o e-mail NÃO sai. Sem continueUrl, sai. */
     if(corpo.continueUrl&&!/organizador-financeiro-98e15/.test(corpo.continueUrl))
       return rota.fulfill(jsonErro('UNAUTHORIZED_DOMAIN : Domain not allowlisted by project'));
     enviados.push(corpo.email);
     // Como o de verdade: 200 mesmo para endereço sem conta.
     if(contas.has(corpo.email)) oobs.set('oob-'+corpo.email,corpo.email);
     return rota.fulfill(jsonOK({email:corpo.email}));
   }
   if(url.includes(':resetPassword')){
     const email=oobs.get(corpo.oobCode);
     if(!email) return rota.fulfill(jsonErro('INVALID_OOB_CODE'));
     contas.get(email).senha=corpo.newPassword; oobs.delete(corpo.oobCode);
     return rota.fulfill(jsonOK({email}));
   }
   if(url.includes(':lookup')) return rota.fulfill(jsonOK({users:[{localId:'uid',email:'x'}]}));
   if(url.includes(':update')) return rota.fulfill(jsonOK({email:corpo.email||'x'}));
   return rota.fulfill(jsonOK({}));
 });
 await p.route('https://securetoken.googleapis.com/**',r=>r.fulfill(jsonOK(
   {id_token:'id',refresh_token:'ref',expires_in:'3600',user_id:'uid'})));
 await p.route('https://firestore.googleapis.com/**',r=>r.fulfill(jsonOK({})));

 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1400);

 const comPontos='joao.teste@gmail.com', semPontos='joaoteste@gmail.com', comApelido='joao.teste+app@gmail.com';
 const preencher=c=>p.evaluate(c=>{for(const [id,v] of Object.entries(c)){const el=document.getElementById(id);if(el)el.value=v;}},c);
 const enviar=async()=>{ await p.evaluate(()=>enviarAuth()); await p.waitForTimeout(350); };
 const aviso=()=>p.evaluate(()=>{
   const e=document.getElementById('authErro'),k=document.getElementById('authOk');
   return {erro:e.hidden?'':e.innerText.trim(),ok:k.hidden?'':k.innerText.trim(),
           botoes:[...document.querySelectorAll('#authErro button')].map(b=>b.textContent.trim())};});
 const sair=async()=>{ await p.evaluate(()=>{try{Auth.sair();}catch(e){}}); await p.reload(); await p.waitForTimeout(900); };

 // ── canonização
 const can=await p.evaluate(([a,b,c])=>[Auth.canonizarEmail(a),Auth.canonizarEmail(b),Auth.canonizarEmail(c),
   Auth.canonizarEmail('maria.souza@empresa.com.br'),Auth.canonizarEmail('JOAO.Teste@GoogleMail.com')],
   [comPontos,semPontos,comApelido]);
 eh('as três formas do Gmail viram uma só',can[0]===can[1]&&can[1]===can[2]&&can[0]===semPontos,can);
 eh('outro domínio não é tocado (o ponto pode ser do endereço)',can[3]==='maria.souza@empresa.com.br',can[3]);
 eh('googlemail e maiúsculas também caem no mesmo lugar',can[4]===semPontos,can[4]);

 // ── 1. cria a conta escrevendo COM pontos
 await p.evaluate(()=>trocarModo('cadastrar'));
 await preencher({authNome:'João Teste',authEmail:comPontos,authSenha:'SenhaForte#2026',authConfirma:'SenhaForte#2026'});
 await enviar();
 const criado=await p.evaluate(()=>Auth.logado()&&Auth.usuario().email);
 eh('conta criada e sessão aberta',!!criado,criado);
 eh('a conta nasce no e-mail CANÔNICO',criado===semPontos,criado);
 await sair();

 // ── 2. a segunda conta é recusada, escreva-se como se escrever
 for(const [rot,end] of [['com +apelido',comApelido],['sem os pontos',semPontos],['com pontos de novo',comPontos]]){
   await p.evaluate(()=>trocarModo('cadastrar'));
   await preencher({authNome:'Outro',authEmail:end,authSenha:'OutraSenha#2026',authConfirma:'OutraSenha#2026'});
   await enviar();
   const a=await aviso();
   eh(`recusa a segunda conta (${rot})`,/já existe uma conta/i.test(a.erro),a.erro.slice(0,70));
   eh(`  oferece entrar e recuperar (${rot})`,a.botoes.length===2&&/esqueci/i.test(a.botoes.join(' ')),a.botoes);
   eh(`  nenhuma sessão foi aberta (${rot})`,!(await p.evaluate(()=>Auth.logado())));
 }
 eh('só existe UMA conta no fim das três tentativas',
    await p.evaluate(()=>true)&&contas.size===1,[...contas.keys()]);
 const aviso2=await aviso();
 eh('explica o apelido do Gmail quando ele é o caso',/mesma caixa de entrada/i.test(
    (await (async()=>{ await p.evaluate(()=>trocarModo('cadastrar'));
      await preencher({authNome:'Outro',authEmail:comApelido,authSenha:'X#senha2026',authConfirma:'X#senha2026'});
      await enviar(); return (await aviso()).erro; })())),'—');

 // ── 3. o botão "esqueci a senha" da mensagem já manda o código
 await p.evaluate(()=>trocarModo('cadastrar'));
 await preencher({authNome:'Outro',authEmail:comPontos,authSenha:'X#senha2026',authConfirma:'X#senha2026'});
 await enviar();
 const antes=enviados.length;
 await p.evaluate(()=>document.getElementById('btnIrRecuperar').click());
 await p.waitForTimeout(500);
 eh('o botão da mensagem já dispara o código',enviados.length>antes,{antes,depois:enviados.length});
 eh('o código foi pedido para a forma canônica',enviados.includes(semPontos),enviados);

 // ── 4. entrar digitando qualquer uma das formas
 for(const [rot,end] of [['canônico',semPontos],['com pontos',comPontos],['com apelido',comApelido]]){
   await sair();
   await p.evaluate(()=>trocarModo('entrar'));
   await preencher({authEmail:end,authSenha:'SenhaForte#2026'});
   await enviar();
   eh(`entra digitando o e-mail ${rot}`,await p.evaluate(()=>Auth.logado()));
 }
 // conta antiga, gravada COM pontos antes desta versão
 contas.set('maria.antiga@gmail.com',{senha:'SenhaAntiga#26',nome:'Maria'});
 contas.set('maria.a.ntiga@gmail.com',{senha:'SenhaAntiga#26',nome:'Maria'});
 contas.delete('mariaantiga@gmail.com');
 await sair();
 await p.evaluate(()=>trocarModo('entrar'));
 await preencher({authEmail:'maria.antiga@gmail.com',authSenha:'SenhaAntiga#26'});
 await enviar();
 eh('quem já tinha conta COM pontos continua entrando',await p.evaluate(()=>Auth.logado()));
 await sair();

 // ── 5. recuperação fala em código e oferece colar
 await p.evaluate(()=>trocarModo('recuperar'));
 await preencher({authEmail:comPontos});
 await enviar();
 const rec=await aviso();
 eh('o aviso fala em código e no caminho de colar',/código/i.test(rec.ok)&&/já tenho o código/i.test(rec.ok),rec.ok.slice(0,120));
 eh('o aviso não repete o e-mail de volta',!rec.ok.includes(comPontos),rec.ok.slice(0,60));
 eh('o atalho do código está à vista',await p.evaluate(()=>!document.getElementById('authTenhoCodigo').hidden));

 // ── 5b. domínio não autorizado: o e-mail sai mesmo assim, e a frase muda
 const antesDom=enviados.length;
 await p.evaluate(()=>trocarModo('recuperar'));
 await preencher({authEmail:comPontos});
 await enviar();
 const rd=await aviso();
 eh('domínio fora da lista não impede o envio',enviados.length>antesDom,{antesDom,depois:enviados.length});
 eh('e a instrução muda para colar o código',/página do Firebase/i.test(rd.ok)&&/copie o link/i.test(rd.ok),rd.ok.slice(0,140));

 // ── 6. a tela do código
 await p.evaluate(()=>trocarModo('codigo'));
 const tela=await p.evaluate(()=>({campo:!document.getElementById('campoCodigo').hidden,
   emailOculto:document.getElementById('campoEmail').hidden,
   senha:!document.getElementById('campoSenha').hidden,
   confirma:!document.getElementById('campoConfirma').hidden,
   forca:!document.getElementById('forcaSenha').hidden}));
 eh('pede código e senha nova, sem pedir e-mail de novo',
    tela.campo&&tela.emailOculto&&tela.senha&&tela.confirma&&tela.forca,tela);
 const ex=await p.evaluate(()=>[
   codigoColado('https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC-123_xyz&apiKey=K'),
   codigoColado('  ABC-123_xyz  '),codigoColado('')]);
 eh('tira o código de dentro do link colado',ex[0]==='ABC-123_xyz',ex);
 eh('aceita também o código sozinho',ex[1]==='ABC-123_xyz',ex);

 await preencher({authCodigo:'nao-existe-esse',authSenha:'NovaSenha#2026',authConfirma:'NovaSenha#2026'});
 await enviar();
 const ruim=await aviso();
 eh('código errado dá recado em português, sem código cru',
    ruim.erro.length>10&&!/OOB|INVALID_[A-Z_]+/.test(ruim.erro),ruim.erro.slice(0,80));

 // o código bom, colado como link inteiro
 await preencher({authCodigo:'https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=oob-'+semPontos+'&apiKey=K',
   authSenha:'NovaSenha#2026',authConfirma:'NovaSenha#2026'});
 await enviar(); await p.waitForTimeout(600);
 eh('código válido troca a senha e abre a conta',await p.evaluate(()=>Auth.logado()));
 eh('a senha nova é a que vale agora',contas.get(semPontos).senha==='NovaSenha#2026',contas.get(semPontos));

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest/i.test(x));
 if(e.length) console.log('\nerros de página:',[...new Set(e)].slice(0,5));
 await b.close(); process.exit(bad.length?1:0);
})();
