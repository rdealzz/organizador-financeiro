/* Valida o COFRE e as ENTRADAS EXTRAS (v10.16).

   O que está em jogo aqui é identidade contábil: guardar não pode virar gasto,
   sacar não pode virar renda, e um extra não pode inflar sozinho a meta. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const cmp=(n,a,b,tol=0.01)=>{const p=typeof a==='number'?Math.abs(a-b)<=tol:JSON.stringify(a)===JSON.stringify(b);
  (p?ok:bad).push(n+(p?'':`  →  ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};

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
  const base=()=>{
    S.salario=5000; S.extra=0; S.metaPct=20; S.metaVal=0; S.tetos={}; S.hist=[];
    S.diaFech=5; S.diaVenc=12; S.pessoas=[]; S.obj=[]; S.entradas=[]; S.guard=[]; S.jaTem=1000; S.meses=6;
    S.lanc=[{id:1,criadoEm:Date.now(),nome:'mercado',valor:800,cat:'mercado',tier:1,tipo:'unico',
             fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'}];
  };
  const entrada=(nome,valor,guardar,data)=>{
    const e={id:Date.now()+Math.random(),data:data||iso(hojeD()),nome,valor,guardar};
    S.entradas.push(e); sincronizarEntrada(e); return e;
  };
  const mov=(valor,tipo,obj,data)=>{
    const m={id:Date.now()+Math.random(),data:data||iso(hojeD()),valor,tipo,obj:obj||'',nota:'teste'};
    S.guard.push(m); return m;
  };

  // 1. estado limpo: nada mudou em relação ao motor de sempre
  base(); const c0=calc();
  R.c0={renda:c0.renda,meta:c0.meta,metaMes:c0.metaMes,disponivel:c0.disponivel,gasto:c0.gasto,cofre:c0.cofre,guardado:c0.guardado};

  // 2. entrada só pra gastar
  base(); entrada('freela',600,0); const cg=calc();
  R.gastar={renda:cg.renda,meta:cg.meta,metaMes:cg.metaMes,disponivel:cg.disponivel,gasto:cg.gasto,
            cofre:cg.cofre,entrouGastar:cg.entrouGastar,entrouGuardar:cg.entrouGuardar};

  // 3. entrada só pra guardar
  base(); entrada('venda da bike',600,600); const cq=calc();
  R.guardar={renda:cq.renda,meta:cq.meta,metaMes:cq.metaMes,disponivel:cq.disponivel,gasto:cq.gasto,
             cofre:cq.cofre,guardado:cq.guardado,movs:S.guard.length};

  // 4. meio a meio
  base(); entrada('venda',600,300); const cm=calc();
  R.meio={disponivel:cm.disponivel,metaMes:cm.metaMes,cofre:cm.cofre};

  // 5. a meta percentual NÃO infla com o extra
  base(); entrada('bônus',2000,0); R.metaComExtra=calc().meta;

  // 6. cofre: depósito e saque, e o que eles NÃO mexem
  base(); const antes=calc();
  mov(300,'dep'); mov(100,'saq'); const cc=calc();
  R.cofreMov={saldo:cc.cofre,guardado:cc.guardado,gastoIgual:cc.gasto===antes.gasto,
              rendaIgual:cc.renda===antes.renda,dispIgual:cc.disponivel===antes.disponivel};

  // 7. objetivo anda sozinho com o depósito
  base(); S.obj=[{id:'viagem',nome:'Viagem',alvo:3000,tem:500,prazo:10}];
  mov(400,'dep','viagem'); R.objetivo={juntou:juntadoDo(S.obj[0]),livre:livreNoCofre(),saldo:saldoGuardado()};

  // 8. editar quanto vai pro cofre não duplica o movimento
  base(); const e8=entrada('venda',500,500);
  e8.guardar=200; sincronizarEntrada(e8);
  R.edita={movs:S.guard.length,valor:S.guard[0]&&S.guard[0].valor,cofre:calc().cofre};
  // e zerar tira o movimento junto
  e8.guardar=0; sincronizarEntrada(e8); R.editaZero={movs:S.guard.length,cofre:calc().cofre};

  // 9. fechamento: arquiva, compacta e o saldo NÃO muda
  base(); S.obj=[{id:'viagem',nome:'Viagem',alvo:3000,tem:0,prazo:10}];
  entrada('freela',900,400,'2020-01-02'); mov(250,'dep','viagem','2020-01-03');
  S.metaCiclo={ate:iso(proximoFech()),valor:700};
  const saldoAntes=saldoGuardado();
  fecharCiclo('2020-02-05');
  R.fech={saldoIgual:Math.abs(saldoGuardado()-saldoAntes)<0.01, saldo:saldoGuardado(),
          entrou:S.hist[0].entrou, entrouGuardar:S.hist[0].entrouGuardar, guardado:S.hist[0].guardado,
          nEntradasHist:(S.hist[0].entradas||[]).length,
          sobrouGuard:S.guard.length, sobrouEntradas:S.entradas.length,
          objTem:S.obj[0].tem, jaTem:S.jaTem, ajusteLimpo:!S.metaCiclo};

  // 10. ajuste da meta de UM ciclo
  base(); const semAjuste=calc();
  S.metaCiclo={ate:iso(proximoFech()),valor:400};
  const cAj=calc();
  R.ajuste={meta:cAj.meta,padrao:cAj.metaPadrao,disp:cAj.disponivel,ajustada:cAj.ajustada,
            dispAntes:semAjuste.disponivel,metaAntes:semAjuste.meta,
            pctIntacto:S.metaPct,valIntacto:S.metaVal};
  // o extra mandado pro cofre continua somando POR CIMA do ajuste
  entrada('venda',600,600); R.ajusteComExtra={metaMes:calc().metaMes,disp:calc().disponivel};
  // e ele morre sozinho quando a data passa
  S.entradas=[]; S.guard=[]; S.metaCiclo={ate:'2020-01-01',valor:400};
  R.ajusteVelho={meta:calc().meta,ajustada:calc().ajustada};

  // 11. depois do fechamento o ciclo novo começa zerado
  R.aposFech=(()=>{const c=calc();return {entrou:c.entrou,guardado:c.guardado,metaMes:c.metaMes,meta:c.meta};})();
  return R;
 });

 cmp('estado limpo: renda é só o salário',r.c0.renda,5000);
 cmp('estado limpo: meta de 20%',r.c0.meta,1000);
 cmp('estado limpo: meta do ciclo = meta base',r.c0.metaMes,1000);
 cmp('estado limpo: disponível = renda − meta',r.c0.disponivel,4000);
 cmp('estado limpo: cofre = o que já tinha',r.c0.cofre,1000);

 cmp('entrada pra gastar sobe a renda',r.gastar.renda,5600);
 cmp('entrada pra gastar sobe o disponível',r.gastar.disponivel,4600);
 cmp('entrada pra gastar NÃO mexe na meta',r.gastar.meta,1000);
 cmp('entrada pra gastar NÃO mexe na meta do ciclo',r.gastar.metaMes,1000);
 cmp('entrada pra gastar NÃO é gasto',r.gastar.gasto,800);
 cmp('entrada pra gastar NÃO vai pro cofre',r.gastar.cofre,1000);

 cmp('entrada pro cofre NÃO muda o disponível',r.guardar.disponivel,4000);
 cmp('entrada pro cofre sobe a meta DESTE ciclo',r.guardar.metaMes,1600);
 cmp('entrada pro cofre vira depósito',r.guardar.cofre,1600);
 cmp('o depósito da entrada é um movimento só',r.guardar.movs,1);
 cmp('entrada pro cofre NÃO é gasto',r.guardar.gasto,800);
 cmp('guardado no ciclo = o que foi pro cofre',r.guardar.guardado,600);

 cmp('meio a meio: metade sobe o disponível',r.meio.disponivel,4300);
 cmp('meio a meio: metade sobe a meta do ciclo',r.meio.metaMes,1300);
 cmp('meio a meio: metade entra no cofre',r.meio.cofre,1300);

 cmp('um extra de R$ 2.000 não aumenta a meta de 20%',r.metaComExtra,1000);

 cmp('saldo do cofre = início + depósito − saque',r.cofreMov.saldo,1200);
 cmp('guardado no ciclo soma o saque como negativo',r.cofreMov.guardado,200);
 eh('depósito e saque NÃO são gasto',r.cofreMov.gastoIgual,r.cofreMov);
 eh('saque NÃO é renda',r.cofreMov.rendaIgual,r.cofreMov);
 eh('mexer no cofre NÃO muda o quanto posso gastar',r.cofreMov.dispIgual,r.cofreMov);

 cmp('depósito com destino faz o objetivo andar',r.objetivo.juntou,900);
 cmp('o que tem dono sai da reserva livre',r.objetivo.livre,1000);
 cmp('o saldo total conta os dois',r.objetivo.saldo,1900);

 cmp('mudar quanto vai pro cofre não duplica o movimento',r.edita.movs,1);
 cmp('o movimento passa a valer o novo número',r.edita.valor,200);
 cmp('e o cofre acompanha',r.edita.cofre,1200);
 cmp('zerar o destino apaga o movimento',r.editaZero.movs,0);
 cmp('e o cofre volta ao que era',r.editaZero.cofre,1000);

 eh('o fechamento não cria nem some dinheiro do cofre',r.fech.saldoIgual,r.fech);
 cmp('a fatura arquivada guarda o que entrou',r.fech.entrou,900);
 cmp('e quanto disso foi pro cofre',r.fech.entrouGuardar,400);
 cmp('e quanto foi guardado no mês',r.fech.guardado,650);
 cmp('as entradas do mês vão itemizadas',r.fech.nEntradasHist,1);
 cmp('os movimentos saem da lista viva',r.fech.sobrouGuard,0);
 cmp('as entradas saem da lista viva',r.fech.sobrouEntradas,0);
 cmp('o depósito com destino virou saldo do objetivo',r.fech.objTem,250);
 cmp('o resto virou ponto de partida do cofre',r.fech.jaTem,1400);
 eh('o fechamento apaga o ajuste daquele mês',r.fech.ajusteLimpo,r.fech);

 cmp('ajustar o mês muda a meta só dele',r.ajuste.meta,400);
 cmp('a regra permanente continua onde estava',r.ajuste.padrao,1000);
 cmp('guardar R$ 600 a menos libera R$ 600 pra gastar',r.ajuste.disp-r.ajuste.dispAntes,600);
 eh('o app sabe que o mês está ajustado',r.ajuste.ajustada,r.ajuste);
 cmp('o percentual configurado não é tocado',r.ajuste.pctIntacto,20);
 cmp('nem o valor fixo',r.ajuste.valIntacto,0);
 cmp('o extra pro cofre soma POR CIMA do ajuste',r.ajusteComExtra.metaMes,1000);
 cmp('e não mexe no disponível ajustado',r.ajusteComExtra.disp,4600);
 cmp('ajuste de ciclo passado não vale mais',r.ajusteVelho.meta,1000);
 eh('e o app volta a dizer que o mês é normal',!r.ajusteVelho.ajustada,r.ajusteVelho);

 cmp('o ciclo novo começa sem entradas',r.aposFech.entrou,0);
 cmp('o ciclo novo começa sem nada guardado',r.aposFech.guardado,0);
 cmp('e a meta do ciclo volta a ser a meta base',r.aposFech.metaMes,r.aposFech.meta);

 // ---- interface: as duas abas abrem e mostram número de verdade
 const ui=await p.evaluate(async()=>{
  S.salario=5000; S.metaPct=20; S.metaVal=0; S.hist=[]; S.entradas=[]; S.guard=[]; S.jaTem=800;
  S.obj=[{id:'viagem',nome:'Viagem',alvo:3000,tem:0,prazo:10}];
  S.lanc=[]; render();
  const vis=el=>!!el&&el.checkVisibility({checkVisibilityCSS:true,contentVisibilityAuto:true});
  irPara('plano:entrou');
  document.querySelector('#eNome').value='venda da bicicleta';
  document.querySelector('#eValor').value='600';
  document.querySelector('#chipsDestino [data-dest="meio"]').click();
  const ecoMeio=document.querySelector('#ecoEntrada').innerText;
  const campoDepois=+document.querySelector('#eGuardar').value;
  document.querySelector('#addEntrada').click();
  const linhas=document.querySelectorAll('#tbEntrada tr').length;
  const cards=document.querySelector('#cardsEntrou').innerText;
  irPara('plano:guardar');
  document.querySelector('#gValor').value='150';
  document.querySelector('#gObj').value='viagem';
  document.querySelector('#addGuard').click();
  const texto=document.querySelector('#t-guardar').innerText;
  return {abaEntrou:vis(document.querySelector('#t-entrou'))===false,
          visGuardar:vis(document.querySelector('#t-guardar')),
          ecoMeio,campoDepois,linhas,cards,texto,
          movLinhas:document.querySelectorAll('#tbGuard tr').length,
          cofre:calc().cofre, objJuntou:juntadoDo(S.obj[0]),
          sujo:/NaN|undefined|\[object Object\]|Invalid Date/.test(document.body.innerText)};
 });
 eh('a aba Guardar abre',ui.visGuardar,ui);
 eh('o atalho meio a meio escreve metade no campo',ui.campoDepois===300,ui);
 eh('o eco diz os dois números em reais',/300,00/.test(ui.ecoMeio),ui.ecoMeio);
 eh('a entrada aparece na lista do ciclo',ui.linhas===1,ui);
 eh('os cartões somam o que entrou',/600,00/.test(ui.cards),ui.cards);
 eh('o depósito aparece nos movimentos',ui.movLinhas===2,ui);
 cmp('o cofre soma entrada + depósito',ui.cofre,800+300+150);
 cmp('o depósito com destino foi para o objetivo',ui.objJuntou,150);
 eh('nenhum NaN/undefined nas telas novas',!ui.sujo,ui);

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página:');[...new Set(e)].slice(0,8).forEach(x=>console.log('  '+x));}
 await b.close(); process.exit(bad.length?1:0);
})();
