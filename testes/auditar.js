/* Auditoria estática: parseia os arquivos e procura classes de defeito que
   o olho não pega num arquivo de 5000 linhas. */
const acorn=require('acorn'), walk=require('acorn-walk'), fs=require('fs');
const BASE=require('path').join(__dirname,'..')+'/';
const ARQS=['app.js','auth.js','viz3d.js','intro.js','tema.js','sw.js'];

const GLOBAIS=new Set(`window document navigator location history localStorage sessionStorage indexedDB
console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame
fetch Promise JSON Math Date Object Array String Number Boolean Symbol Map Set WeakMap WeakSet
Intl RegExp Error TypeError RangeError parseInt parseFloat isNaN isFinite encodeURIComponent
decodeURIComponent encodeURI decodeURI Blob File FileReader URL URLSearchParams FormData Headers
Request Response AbortController TextEncoder TextDecoder crypto atob btoa alert confirm prompt
CustomEvent Event MouseEvent KeyboardEvent TouchEvent PointerEvent Notification ServiceWorker
caches self clients skipWaiting registration performance screen matchMedia getComputedStyle
DOMParser XMLHttpRequest Image Audio Worker structuredClone queueMicrotask globalThis undefined
NaN Infinity Node Element HTMLElement CanvasRenderingContext2D DataTransfer IntersectionObserver
ResizeObserver MutationObserver Proxy Reflect BigInt Uint8Array Float32Array Int32Array ArrayBuffer
exports module require process __dirname`.split(/\s+/).filter(Boolean));

const achados=[];
const dec={}, usos={};

for(const a of ARQS){
  const src=fs.readFileSync(BASE+a,'utf8');
  const ast=acorn.parse(src,{ecmaVersion:2022,sourceType:'module',locations:true,allowAwaitOutsideFunction:true});
  const linha=n=>n.loc.start.line;

  // declarações de topo, por arquivo
  const topo=new Map();
  const declara=(nome,n,tipo)=>{
    if(topo.has(nome)) achados.push({t:'DUPLICADA',a,l:linha(n),
      m:`"${nome}" declarada duas vezes (linha ${topo.get(nome)} e ${linha(n)}) — a segunda apaga a primeira`});
    topo.set(nome,linha(n));
    (dec[nome]=dec[nome]||[]).push(a+':'+linha(n));
  };
  for(const n of ast.body){
    if(n.type==='FunctionDeclaration'&&n.id) declara(n.id.name,n,'fn');
    if(n.type==='VariableDeclaration') n.declarations.forEach(d=>{
      if(d.id.type==='Identifier') declara(d.id.name,d,'var');});
  }

  walk.simple(ast,{
    Identifier(n){ (usos[n.name]=usos[n.name]||new Set()).add(a); },
    BinaryExpression(n){
      if((n.operator==='=='||n.operator==='!=')&&
         !(n.left.type==='Literal'&&n.left.value===null)&&
         !(n.right.type==='Literal'&&n.right.value===null))
        achados.push({t:'IGUALDADE FROUXA',a,l:linha(n),m:`${n.operator} em vez de ${n.operator}=`});
    },
    IfStatement(n){
      if(n.test.type==='AssignmentExpression')
        achados.push({t:'ATRIBUIÇÃO NO IF',a,l:linha(n),m:'= dentro da condição; era == que se queria?'});
    },
    CatchClause(n){
      if(n.body.body.length===0)
        achados.push({t:'CATCH VAZIO',a,l:linha(n),m:'erro engolido sem nenhum rastro'});
    },
    SwitchCase(n){
      const corpo=n.consequent;
      if(corpo.length&&!/Break|Return|Throw|Continue/.test(corpo[corpo.length-1].type)&&n.test)
        achados.push({t:'CASE SEM BREAK',a,l:linha(n),m:'cai no próximo case'});
    }
  });

  // chamadas a função async sem await nem .then nem .catch
  const assincronas=new Set();
  walk.simple(ast,{FunctionDeclaration(n){if(n.async&&n.id)assincronas.add(n.id.name);},
    VariableDeclarator(n){if(n.init&&(n.init.type==='ArrowFunctionExpression'||n.init.type==='FunctionExpression')&&n.init.async&&n.id.name)assincronas.add(n.id.name);}});
  walk.ancestor(ast,{CallExpression(n,anc){
    const nome=n.callee.type==='Identifier'?n.callee.name:null;
    if(!nome||!assincronas.has(nome)) return;
    const pai=anc[anc.length-2];
    const tratado=pai&&(pai.type==='AwaitExpression'||pai.type==='MemberExpression'||
      pai.type==='ReturnStatement'||pai.type==='ArrowFunctionExpression'||
      pai.type==='VariableDeclarator'||pai.type==='AssignmentExpression'||
      pai.type==='Property'||pai.type==='CallExpression'||pai.type==='BinaryExpression'||
      pai.type==='LogicalExpression'||pai.type==='ConditionalExpression');
    if(!tratado) achados.push({t:'ASYNC SOLTA',a,l:linha(n),
      m:`${nome}() é async e ninguém espera nem trata a falha`});
  }});
}

// identificadores usados e nunca declarados em lugar nenhum
const declarados=new Set(Object.keys(dec));
const locais=new Set();
for(const a of ARQS){
  const ast=acorn.parse(fs.readFileSync(BASE+a,'utf8'),{ecmaVersion:2022,sourceType:'module',locations:true,allowAwaitOutsideFunction:true});
  walk.full(ast,n=>{
    if(n.type==='VariableDeclarator'&&n.id.type==='Identifier') locais.add(n.id.name);
    if(n.type==='FunctionDeclaration'&&n.id) locais.add(n.id.name);
    if((n.type==='FunctionDeclaration'||n.type==='FunctionExpression'||n.type==='ArrowFunctionExpression'))
      n.params.forEach(p=>{ const ler=x=>{ if(!x)return;
        if(x.type==='Identifier')locais.add(x.name);
        else if(x.type==='ObjectPattern')x.properties.forEach(pr=>ler(pr.value||pr.argument));
        else if(x.type==='ArrayPattern')x.elements.forEach(ler);
        else if(x.type==='AssignmentPattern')ler(x.left);
        else if(x.type==='RestElement')ler(x.argument); }; ler(p); });
    if(n.type==='ObjectPattern') n.properties.forEach(pr=>{if(pr.value&&pr.value.type==='Identifier')locais.add(pr.value.name);});
    if(n.type==='ClassDeclaration'&&n.id) locais.add(n.id.name);
    if(n.type==='CatchClause'&&n.param&&n.param.type==='Identifier') locais.add(n.param.name);
    if(n.type==='LabeledStatement') locais.add(n.label.name);
  });
}
const orfaos=[...Object.keys(usos)].filter(n=>!declarados.has(n)&&!locais.has(n)&&!GLOBAIS.has(n));

const porTipo={};
achados.forEach(x=>{(porTipo[x.t]=porTipo[x.t]||[]).push(x);});
Object.entries(porTipo).sort((a,b)=>b[1].length-a[1].length).forEach(([t,xs])=>{
  console.log(`\n── ${t} (${xs.length})`);
  xs.slice(0,14).forEach(x=>console.log(`   ${x.a}:${x.l}  ${x.m}`));
  if(xs.length>14) console.log(`   … e mais ${xs.length-14}`);
});
console.log('\n── IDENTIFICADORES NUNCA DECLARADOS ('+orfaos.length+')');
console.log('   '+orfaos.join(' '));
