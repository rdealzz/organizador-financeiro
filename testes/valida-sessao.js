/* Sessão que fica: o login sobrevive a recarregar/atualizar o app, um token
   recusado pelo servidor é RENOVADO (não desloga), e a tela de entrada volta
   com o e-mail preenchido. Firebase emulado na rede da página. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};
const jsonOK=o=>({status:200,contentType:'application/json',body:JSON.stringify(o)});
const jsonErro=(m,s)=>({status:s||400,contentType:'application/json',body:JSON.stringify({error:{code:s||400,message:m}})});

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:430,height:900}});
 const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 let refreshes=0, refreshMorto=false, recusar=0, negar=0;
 await p.route('https://identitytoolkit.googleapis.com/**',r=>r.fulfill(jsonOK(
   {idToken:'id0',refreshToken:'ref0',expiresIn:'3600',localId:'uid1',email:'ana@x.com'})));
 await p.route('https://securetoken.googleapis.com/**',r=>{
   refreshes++;
   if(refreshMorto) return r.fulfill(jsonErro('INVALID_REFRESH_TOKEN'));
   return r.fulfill(jsonOK({id_token:'id'+refreshes,refresh_token:'ref0',expires_in:'3600'}));
 });
 await p.route('https://firestore.googleapis.com/**',r=>{
   if(negar>0){ negar--; return r.fulfill(jsonErro('Missing or insufficient permissions.',403)); }
   if(recusar>0){ recusar--; return r.fulfill(jsonErro('Request had invalid authentication credentials.',401)); }
   return r.fulfill(jsonOK({}));
 });
 await p.goto('http://localhost:8765/');
 await p.waitForTimeout(800);
 await p.evaluate(()=>Auth.entrar('ana@x.com','senha-boa-123'));
 await p.reload(); await p.waitForTimeout(1200);
 eh('recarregar mantém a sessão', await p.evaluate(()=>Auth.logado()));

 // 401 do Firestore com refresh bom: renova e continua logado
 recusar=1; const antes=refreshes;
 const r1=await p.evaluate(async()=>{ try{ await Auth.puxarEstado(); return 'ok'; }catch(e){ return e.codigo; } });
 eh('401 renova o token e repete', r1==='ok' && refreshes===antes+1, {r1,refreshes,antes});
 eh('401 não desloga', await p.evaluate(()=>Auth.logado()));
 eh('token novo guardado', await p.evaluate(()=>JSON.parse(localStorage.getItem('sobra:sessao')).access_token)==='id'+refreshes);

 // 403 — o que o Firestore REAL devolve para token inválido (medido por curl)
 negar=1; const a2=refreshes;
 const r3=await p.evaluate(async()=>{ try{ await Auth.puxarEstado(); return 'ok'; }catch(e){ return e.codigo; } });
 eh('403 renova o token e repete', r3==='ok' && refreshes===a2+1, {r3,refreshes,a2});
 // 403 que persiste é recusa das regras: dá erro, mas NÃO desloga (v9.5)
 negar=2;
 const r4=await p.evaluate(async()=>{ try{ await Auth.puxarEstado(); return 'ok'; }catch(e){ return e.codigo; } });
 eh('403 das regras dá erro sem deslogar', r4!=='ok' && await p.evaluate(()=>Auth.logado()), r4);

 // refresh morto: aí sim a sessão acaba
 recusar=1; refreshMorto=true;
 const r2=await p.evaluate(async()=>{ try{ await Auth.puxarEstado(); return 'ok'; }catch(e){ return e.codigo; } });
 eh('refresh recusado encerra a sessão', r2==='sessao_expirada' && !(await p.evaluate(()=>Auth.logado())), r2);

 // e-mail lembrado na tela de entrada
 await p.reload(); await p.waitForTimeout(1500);
 await p.evaluate(()=>{ const c=document.getElementById('capa'); if(c) c.click(); });
 await p.waitForTimeout(600);
 eh('tela de entrada volta com o e-mail', await p.inputValue('#authEmail')==='ana@x.com', await p.inputValue('#authEmail'));
 eh('senha NÃO é guardada pelo app', !(await p.evaluate(()=>JSON.stringify(localStorage).includes('senha-boa-123'))));
 eh('sem erro de página', errs.length===0, errs);

 await b.close();
 ok.forEach(x=>console.log('  ok  '+x)); bad.forEach(x=>console.log('  FALHOU  '+x));
 console.log(bad.length?`\n✗ ${bad.length} falharam`:`\n✓ ${ok.length} verificações passaram`);
 process.exit(bad.length?1:0);
})();
