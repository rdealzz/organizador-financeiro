/* Valida a PLANILHA (v11): digitar como numa planilha de verdade — teclado,
   Tab, Enter — e conferir que a coluna Sobra e o "posso gastar" fecham com o
   motor (calc). */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+(d!==undefined?JSON.stringify(d):'falso')));};
const cmp=(n,a,b)=>eh(n,JSON.stringify(a)===JSON.stringify(b),[a,b]);
const SHOT=process.env.SHOT;

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 for(const larg of [390,1200]){
 const p=await b.newPage({viewport:{width:larg,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
 await p.evaluate(()=>{
  document.querySelector('#auth').hidden=true; document.querySelector('#appWrap').hidden=false;
  document.querySelector('#tabbar').hidden=false;
  S.salario=0;S.extra=0;S.metaPct=20;S.metaVal=0;S.tetos={};S.lanc=[];S.hist=[];S.entradas=[];S.guard=[];
  S.pessoas=[{id:'pai',nome:'Pai',cor:'var(--pes1)'}];
  delete S.metaCiclo;
  irPara('planilha'); render();
 });
 const pre=`[${larg}px] `;
 eh(pre+'planilha é a tela inicial', await p.evaluate(()=>!document.querySelector('#a-planilha').hidden&&AREA==='planilha'));
 eh(pre+'botão flutuante some na planilha', await p.evaluate(()=>getComputedStyle(document.querySelector('#fab')).display==='none'));

 // salário: digitar e Enter
 const cel=k=>p.locator(`#plTab [data-k="${k}"]`);
 await cel('renda|salario').click(); await p.keyboard.type('3.000'); await p.keyboard.press('Enter');
 await p.waitForTimeout(80);
 eh(pre+'salário gravado', await p.evaluate(()=>S.salario===3000));
 eh(pre+'Enter no salário desce para Outra renda', await p.evaluate(()=>document.activeElement.dataset.k==='renda|extra'));
 await p.keyboard.press('Enter'); await p.waitForTimeout(60);
 eh(pre+'Enter desce para Guardar', await p.evaluate(()=>document.activeElement.dataset.k==='renda|guardar'));
 await p.keyboard.type('500'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
 eh(pre+'guardar vira valor fixo', await p.evaluate(()=>S.metaVal===500&&calc().meta===500));
 eh(pre+'Enter no guardar vai para a linha nova', await p.evaluate(()=>document.activeElement.dataset.k==='novo|nome'));

 // gasto 1: nome, Tab, valor, Enter
 await p.keyboard.type('mercado'); await p.keyboard.press('Tab'); await p.keyboard.type('300,50'); await p.keyboard.press('Enter');
 await p.waitForTimeout(80);
 eh(pre+'gasto criado pelo Enter', await p.evaluate(()=>S.lanc.length===1&&S.lanc[0].nome==='Mercado'&&S.lanc[0].valor===300.5&&S.lanc[0].tipo==='unico'));
 eh(pre+'foco volta para o nome da linha nova', await p.evaluate(()=>document.activeElement.dataset.k==='novo|nome'));
 eh(pre+'linha nova ficou vazia', await p.evaluate(()=>[...document.querySelectorAll('#plTab [data-k^="novo|"]')].filter(x=>x.tagName==='INPUT').every(x=>!x.value)));

 // gasto 2: parcelado digitado na coluna Vezes, criação ao sair do valor (Tab)
 await p.keyboard.type('geladeira'); await p.keyboard.press('Tab'); await p.keyboard.type('250'); await p.keyboard.press('Tab');
 await p.waitForTimeout(80);
 const idG=await p.evaluate(()=>String(S.lanc[1]&&S.lanc[1].id));
 eh(pre+'Tab saindo do valor cria o gasto', await p.evaluate(()=>S.lanc.length===2));
 eh(pre+'o foco segue para a célula Vezes do gasto criado', await p.evaluate(id=>document.activeElement.dataset.k===id+'|vezes',idG));
 await p.keyboard.type('12x'); await p.keyboard.press('Tab'); await p.waitForTimeout(80);
 eh(pre+'12x vira parcelado com 12', await p.evaluate(()=>S.lanc[1].tipo==='parc'&&S.lanc[1].pRest===12));
 eh(pre+'Tab depois do Vezes vai para Quem paga', await p.evaluate(id=>document.activeElement.dataset.k===id+'|quem',idG));
 // quem paga: Pai paga tudo
 await p.evaluate(id=>{const s=document.querySelector(`#plTab [data-k="${id}|quem"]`); s.value='t:pai'; s.dispatchEvent(new Event('change',{bubbles:true}));},idG);
 await p.waitForTimeout(60);
 eh(pre+'"Pai paga" põe a parte toda no pai', await p.evaluate(()=>S.lanc[1].pai===250&&S.lanc[1].com==='pai'));

 // jeito do campo rápido numa célula só
 await cel('novo|nome').click(); await p.keyboard.type('tv 1200 10x pix'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
 eh(pre+'"tv 1200 10x pix" num campo só', await p.evaluate(()=>{const l=S.lanc[2]; return l&&l.nome==='Tv'&&l.valor===1200&&l.tipo==='parc'&&l.pRest===10&&l.meio==='avista';}), await p.evaluate(()=>S.lanc[2]));
 // 3/12 e fixo
 await cel('novo|nome').click(); await p.keyboard.type('aluguel'); await p.keyboard.press('Tab'); await p.keyboard.type('900'); await p.keyboard.press('Tab');
 await p.keyboard.type('fixo'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
 eh(pre+'fixo', await p.evaluate(()=>S.lanc[3]&&S.lanc[3].tipo==='fixo'), await p.evaluate(()=>[document.activeElement.dataset.k,S.lanc.map(l=>l.nome+':'+l.tipo)]));
 const idT=await p.evaluate(()=>String(S.lanc[2].id));
 await cel(idT+'|vezes').fill('3/12'); await cel(idT+'|vezes').press('Enter'); await p.waitForTimeout(80);
 eh(pre+'3/12 deixa 10 parcelas', await p.evaluate(()=>S.lanc[2].pRest===10));
 await cel(idT+'|vezes').fill('abc'); await cel(idT+'|vezes').press('Enter'); await p.waitForTimeout(80);
 eh(pre+'"abc" em Vezes é recusado', await p.evaluate(()=>S.lanc[2].pRest===10&&S.lanc[2].tipo==='parc'));

 // mudar valor de gasto que o pai paga: acompanha
 await cel(idG+'|valor').fill('300'); await cel(idG+'|valor').press('Enter'); await p.waitForTimeout(80);
 eh(pre+'valor novo: pai continua pagando tudo', await p.evaluate(()=>S.lanc[1].valor===300&&S.lanc[1].pai===300));

 // a conta fecha com o motor
 const conta=await p.evaluate(()=>{
   const c=calc();
   const ult=[...document.querySelectorAll('#plTab tbody .pl-gasto .pl-saldo')].pop().textContent;
   const fim=document.querySelector('#plTab .pl-final .pl-num').textContent;
   return {esperado:brl(c.disponivel-c.gasto), ult, fim, res:document.querySelector('#plResumo .pl-res b').textContent};
 });
 eh(pre+'sobra da última linha = posso gastar = disponível − gasto', [conta.ult,conta.fim,conta.res].every(x=>x.replace(/[^\d,−-]/g,'')===conta.esperado.replace(/[^\d,−-]/g,'')), conta);
 eh(pre+'parte do pai não desconta', await p.evaluate(()=>Math.abs((3000-500-300.5-0-1200-900)-(calc().disponivel-calc().gasto))<0.01));

 // render de fora no meio da digitação não apaga o que está escrito
 await cel('novo|nome').click(); await p.keyboard.type('pada');
 await p.evaluate(()=>render()); await p.keyboard.type('ria');
 eh(pre+'render externo preserva a digitação', await p.evaluate(()=>document.activeElement.dataset.k==='novo|nome'&&document.activeElement.value==='padaria'));
 await p.keyboard.press('Escape');
 await cel('novo|nome').fill('');

 // apagar e desfazer
 const n0=await p.evaluate(()=>S.lanc.length);
 await p.locator(`#plTab [data-plx="${idT}"]`).click(); await p.waitForTimeout(60);
 eh(pre+'× apaga', await p.evaluate(n=>S.lanc.length===n-1,n0));
 await p.locator('#snack button').first().click().catch(()=>{}); await p.waitForTimeout(60);
 eh(pre+'Desfazer devolve', await p.evaluate(n=>S.lanc.length===n,n0));
 // ✎ abre a edição
 await p.locator(`#plTab [data-pled="${idG}"]`).first().click(); await p.waitForTimeout(80);
 eh(pre+'✎ abre a folha de edição', await p.evaluate(()=>document.querySelector('#edFolha').classList.contains('abre')));
 await p.evaluate(()=>fecharEdicao&&fecharEdicao()).catch(()=>{});
 // guardar zero vale zero
 await cel('renda|guardar').fill('0'); await cel('renda|guardar').press('Enter'); await p.waitForTimeout(60);
 eh(pre+'guardar 0 vale 0 (não volta aos 20%)', await p.evaluate(()=>calc().meta===0));

 // ── Quem me deve
 await p.evaluate(()=>{ S.pessoas.push({id:'mae',nome:'Mãe',cor:'var(--pes2)'});
   S.lanc.push({id:'jantar',criadoEm:Date.now(),nome:'Jantar',valor:300,cat:'comida',tier:3,tipo:'unico',fonte:'Conta',pRest:0,ref:0,venc:0,prox:0,meio:'cartao',
     divs:[{id:'pai',valor:100},{id:'mae',valor:100}],pai:200,com:'pai'});
   S.hist=[{data:'2026-09-05',venc:'2026-09-12',bruto:500,meu:300,pai:200,itens:[{nome:'Mercado set',valor:400,cat:'mercado',tier:1,pai:200,com:'mae'}],
     pessoas:[{id:'mae',nome:'Mãe',cor:'var(--pes2)',valor:200}]}];
   render(); });
 const deve=await p.evaluate(()=>[...document.querySelectorAll('#plDeve tbody tr')].map(t=>t.innerText.replace(/\s+/g,' ').trim()));
 eh(pre+'quadro lista as duas pessoas', deve.length===2, deve);
 const valores=await p.evaluate(()=>Object.fromEntries(devedores().map(e=>[e.nome,[e.aberto,e.pago]])));
 eh(pre+'Pai deve geladeira (300) + jantar (100); Mãe deve jantar (100) + fatura de setembro (200)',
    JSON.stringify(valores)===JSON.stringify({'Pai':[400,0],'Mãe':[300,0]}), valores);
 const gastoAntes=await p.evaluate(()=>{const c=calc();return [c.gasto,c.disponivel];});
 await p.evaluate(()=>{ window.confirm=()=>true; });
 await p.locator('#plDeve [data-deve-ok="mae"]').click(); await p.waitForTimeout(80);
 const depois=await p.evaluate(()=>Object.fromEntries(devedores().map(e=>[e.nome,[e.aberto,e.pago]])));
 eh(pre+'"Recebi tudo" zera o que a Mãe deve, nos dois lugares', JSON.stringify(depois['Mãe'])==='[0,300]', depois);
 eh(pre+'Pai continua devendo', JSON.stringify(depois['Pai'])==='[400,0]', depois);
 eh(pre+'receber não muda o orçamento', JSON.stringify(await p.evaluate(()=>{const c=calc();return [c.gasto,c.disponivel];}))===JSON.stringify(gastoAntes));
 eh(pre+'fatura de setembro marcada como recebida da Mãe', await p.evaluate(()=>!!(S.hist[0].recebido&&S.hist[0].recebido.mae)));
 await p.locator('#snack button').first().click().catch(()=>{}); await p.waitForTimeout(60);
 eh(pre+'Desfazer devolve a dívida da Mãe', await p.evaluate(()=>devedores().find(e=>e.nome==='Mãe').aberto===300));
 await p.locator('#plDeve [data-deve-pdf="pai"]').click(); await p.waitForTimeout(80);
 eh(pre+'PDF abre o extrato do Pai', await p.evaluate(()=>!document.querySelector('#recibo').hidden&&/Extrato de Pai/.test(document.querySelector('#recFolha').innerText)&&/400,00/.test(document.querySelector('#recFolha').innerText)));
 await p.evaluate(()=>fecharRecibo());
 const txt=await p.evaluate(()=>textoExtrato(extratoDe('mae','tudo')));
 eh(pre+'texto do extrato termina em "Em aberto: R$ 300"', /Em aberto: R\$\s300,00$/.test(txt), txt);
 // texto com NaN/undefined
 eh(pre+'sem NaN/undefined na planilha', await p.evaluate(()=>!/NaN|undefined|Invalid/.test(document.querySelector('#a-planilha').innerText)));
 // Mais → Resumo do dia e Gastos por cartão continuam alcançáveis
 await p.evaluate(()=>irPara('mais'));
 eh(pre+'Mais lista Resumo do dia', await p.evaluate(()=>/Resumo do dia/.test(document.querySelector('#maisLista').innerText)));
 await p.evaluate(()=>irPara('hoje'));
 eh(pre+'Hoje abre com Voltar', await p.evaluate(()=>!document.querySelector('#voltarMais').hidden&&document.querySelector('#tituloArea').textContent==='Resumo do dia'));
 await p.evaluate(()=>irPara('planilha'));
 // esfera ligada nos dois temas: célula presa é opaca
 for(const t of ['claro','escuro']){
   const op=await p.evaluate(t=>{document.documentElement.dataset.tema=t;document.body.classList.add('fundo-vivo');
     const td=document.querySelector('#plTab tbody .pl-desc'); const bg=getComputedStyle(td).backgroundColor;
     document.body.classList.remove('fundo-vivo'); return bg;},t);
   eh(pre+'descrição presa é opaca com esfera ('+t+')', !/rgba\(.*,\s*0?\.\d+\)$/.test(op)&&op!=='rgba(0, 0, 0, 0)', op);
 }
 await p.evaluate(()=>{document.documentElement.dataset.tema='claro';});
 if(SHOT){ await p.evaluate(()=>{document.activeElement&&document.activeElement.blur(); scrollTo(0,0); document.querySelectorAll('.pl-rola').forEach(x=>x.scrollLeft=0); document.querySelector('#tabbar').hidden=true; const s=document.querySelector('#snack'); if(s) s.hidden=true;}); await p.screenshot({path:SHOT+'-'+larg+'.png',fullPage:true}); }
 eh(pre+'sem erro no console', errs.length===0, errs);
 await p.close();
 }
 await b.close();
 console.log(`\n${ok.length} ok, ${bad.length} falharam`);
 bad.forEach(x=>console.log('  ✗ '+x));
 process.exit(bad.length?1:0);
})();
