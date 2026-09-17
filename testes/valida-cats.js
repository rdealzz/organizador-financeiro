/* Valida a CLASSIFICAÇÃO por nome: a promessa de cada categoria, os atalhos e
   a migração das duas categorias novas (roupa, cuidados pessoais).

   Um atalho que cai na categoria errada é pior do que não existir, e uma regra
   nova que rouba um nome de outra categoria é silenciosa — é para isso que esta
   suíte existe. Quem mexer em REGRAS, CHIP_PADRAO ou CHIP_EXTRA roda de novo. */
const {chromium}=require('playwright');
const ok=[],bad=[];
const eh=(n,v,d)=>{(v?ok:bad).push(n+(v?'':'  →  '+JSON.stringify(d)));};

/* Nome → categoria que ele TEM que receber. Os da v10.15 vêm junto dos antigos:
   a garantia é que as regras novas não roubaram nada das velhas. */
const PROMESSAS={
  pessoal:['corte de cabelo','barbeiro','barbearia','cabeleireiro','manicure','pedicure',
           'perfume','esmalte','depilação','sobrancelha','maquiagem','shampoo','sabonete',
           'salão','progressiva','hidratante','barba','creme dental','unhas'],
  roupa:  ['jaqueta','JAQUETA ALPINESTARS','tênis','camiseta','calça jeans','moletom',
           'casaco','sapato','chinelo','bermuda','vestido','renner','riachuelo','zara',
           'shein','centauro','nike','adidas','óculos de sol','roupa',
           'calças','blusas','bonés','cintos','saias','botas','roupa de banho','sunga'],
  /* Os três últimos são os nomes que as regras novas QUASE roubaram: a loja
     Marisa contra o presente de uma pessoa chamada Marisa, o salão de festas do
     condomínio contra o salão de beleza, a meia entrada contra o par de meias. */
  lazer:  ['cinema','bar','balada','presente','viagem','hotel','airbnb','teatro','show',
           'mercado livre','shopee','amazon','steam','festa','cerveja',
           'presente da marisa','salão de festas','meia entrada cinema'],
  comida: ['ifood','uber eats','almoço','padaria','lanche','pizza','sushi','água','suco','marmita'],
  mercado:['supermercado','carrefour','feira','açougue','compra do mês'],
  transporte:['posto de gasolina','uber','estacionamento','estacionamento do parque','pedágio','oficina','ipva',
              'troca de óleo','capacete','parcela moto','seguro do carro'],
  casa:   ['aluguel','condomínio','internet','conta de água','luz','faxineira','ração',
           'roupa de cama','lençol'],
  assinatura:['netflix','spotify','disney','anuidade','claude'],
  saude:  ['farmácia','academia','dentista','consulta','remédio','óculos','óculos de grau','nutricionista'],
  estudo: ['faculdade','curso','matrícula','inglês','autoescola','apostila','mochila escolar','material escolar'],
  divida: ['fatura do cartão','empréstimo','financiamento','nubank','picpay']
};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:430,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('sobra:capa-off','1');localStorage.setItem('sobra:portal-off','1');}catch(e){}});
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelector('#auth').hidden=true;document.querySelector('#appWrap').hidden=false;});

 // 1. cada nome cai na categoria que promete
 const erradas=await p.evaluate(tab=>{
   const fora=[];
   Object.entries(tab).forEach(([cat,nomes])=>nomes.forEach(n=>{
     const [c]=classificar(n); if(c!==cat) fora.push([n,cat,c]);
   }));
   return fora;
 },PROMESSAS);
 const total=Object.values(PROMESSAS).reduce((s,v)=>s+v.length,0);
 eh(total+' nomes na categoria que prometem',erradas.length===0,erradas);

 // 2. todo atalho cai na categoria que o chip pinta
 const chips=await p.evaluate(()=>{
   const fora=[],lista=CHIP_PADRAO.slice();
   Object.entries(CHIP_EXTRA).forEach(([cat,ns])=>ns.forEach(n=>lista.push([n,cat])));
   lista.forEach(([n,cat])=>{ const [c]=classificar(n); if(c!==cat) fora.push([n,cat,c]); });
   return {fora,n:lista.length,semChip:Object.keys(CATS).filter(k=>k!=='outros'&&!CHIP_PADRAO.some(([,c])=>c===k))};
 });
 eh(chips.n+' atalhos caem na categoria que prometem',chips.fora.length===0,chips.fora);
 eh('toda categoria tem um atalho padrão',chips.semChip.length===0,chips.semChip);

 // 3. as categorias novas existem inteiras (cor, ícone, emoji, exemplo)
 const cad=await p.evaluate(()=>{
   const falta=[];
   ['roupa','pessoal'].forEach(k=>{
     if(!CATS[k]) return falta.push(k+': sem CATS');
     if(!ICONE_CAT[k]||!TRACOS[ICONE_CAT[k]]) falta.push(k+': sem ícone');
     if(!EMOJI[k]) falta.push(k+': sem emoji');
     if(!VALOR_EXEMPLO[k]) falta.push(k+': sem valor de exemplo');
     const d=document.createElement('div'); d.style.color=CATS[k].c;
     document.body.appendChild(d); const cor=getComputedStyle(d).color; d.remove();
     if(!cor||cor==='rgba(0, 0, 0, 0)') falta.push(k+': cor não resolve');
   });
   return falta;
 });
 eh('roupa e cuidados pessoais têm cor, ícone, emoji e exemplo',cad.length===0,cad);

 // 4. a migração mexe só no que pode
 const mig=await p.evaluate(()=>{
   const g=(id,nome,cat,e)=>Object.assign({id,criadoEm:Date.now(),nome,valor:80,cat,tier:2,
     tipo:'unico',fonte:'Conta',pRest:0,pai:0,com:'',ref:0,venc:0,prox:0,meio:'cartao'},e||{});
   S.catsOk=false;
   S.lanc=[g(1,'corte de cabelo','outros'), g(2,'JAQUETA ALPINESTARS','outros'),
           g(3,'tênis','lazer'),            g(4,'investimento','outros'),
           g(5,'perfume','outros',{catManual:true}),
           g(6,'cinema','lazer'),           g(7,'jaqueta','mercado')];
   S.hist=[{data:'2026-08-05',itens:[g(8,'corte de cabelo','outros')],porCat:{outros:80},meu:80}];
   migrarCategorias();
   const de=id=>S.lanc.find(l=>l.id===id).cat;
   return {cabelo:de(1),jaqueta:de(2),tenis:de(3),invest:de(4),manual:de(5),cinema:de(6),
           mercado:de(7),hist:S.hist[0].itens[0].cat,flag:S.catsOk};
 });
 eh('o corte de cabelo sai de Outros',mig.cabelo==='pessoal',mig);
 eh('a jaqueta sai de Outros',mig.jaqueta==='roupa',mig);
 eh('o tênis sai de Lazer',mig.tenis==='roupa',mig);
 eh('o que a regra não conhece fica onde está',mig.invest==='outros',mig);
 eh('escolha à mão da pessoa não é mexida',mig.manual==='outros',mig);
 eh('o que continua sendo lazer não se move',mig.cinema==='lazer',mig);
 eh('categoria de outra família não é tocada',mig.mercado==='mercado',mig);
 eh('fatura fechada não é reescrita',mig.hist==='outros',mig);
 eh('a migração roda uma vez só',mig.flag===true,mig);

 // 5. o app inteiro roda com as categorias novas na tela
 const tela=await p.evaluate(()=>{
   S.salario=5000; S.metaPct=10; S.tetos={}; render();
   const t=document.body.innerText;
   return {nan:/NaN|undefined|\[object Object\]/.test(t),
           temRoupa:t.includes('Roupa e calçado')||t.includes('Cuidados pessoais'),
           opcoes:document.querySelector('#lCat').options.length};
 });
 eh('nenhum NaN/undefined na tela com as categorias novas',!tela.nan,tela);
 eh('as duas entraram no select de categoria',tela.opcoes===12,tela);

 console.log('\n✓ '+ok.length+' verificações passaram');
 if(bad.length){console.log('\n✗ FALHAS ('+bad.length+'):');bad.forEach(x=>console.log('  '+x));}
 const e=errs.filter(x=>!/favicon|sw\.js|manifest|identitytoolkit|firestore|Failed to load/i.test(x));
 if(e.length){console.log('\nerros de página:');[...new Set(e)].slice(0,8).forEach(x=>console.log('  '+x));}
 await b.close(); process.exit(bad.length?1:0);
})();
