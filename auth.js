/* ==========================================================================
   Sobra do Mês — autenticação e sincronização
   Falamos direto com as APIs REST do Firebase (Identity Toolkit + Firestore)
   por fetch puro: sem SDK, sem CDN, funciona com o app em cache offline.

   Por que isto é seguro de verdade, e não uma tela de login decorativa:
   o isolamento não está aqui no navegador — está nas regras do Firestore
   (arquivo firestore.rules). Cada documento da coleção `estado` tem como id
   o próprio uid do usuário, e a regra só libera leitura/escrita quando
   `request.auth.uid == resource id`. Mesmo que alguém pegue a Web API Key
   (ela é pública mesmo, vai no HTML) e chame a API na mão, o Firestore
   devolve permissão negada para qualquer documento que não seja o dela.
   ========================================================================== */
const FB = {
  // Preencha com os dados do SEU projeto Firebase (Configurações do projeto
  // → Geral → "Seus apps" → app da Web). Nenhum dos dois é secreto: a Web
  // API Key é feita para ir no cliente, quem protege os dados são as regras
  // do Firestore, não este valor.
  apiKey: 'SUBSTITUA_PELA_SUA_WEB_API_KEY',
  projectId: 'substitua-pelo-id-do-seu-projeto'
};
const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token?key=' + FB.apiKey;
const DB_BASE = 'https://firestore.googleapis.com/v1/projects/' + FB.projectId + '/databases/(default)/documents';
const CHAVE_SESSAO = 'sobra:sessao';

/* ---------- sessão ---------- */
let sessao = null;   // {access_token, refresh_token, expires_at, user:{id,email,nome}}

function guardarSessao(s){
  sessao = s;
  try{
    if(s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
  }catch(e){}
}
function lerSessaoSalva(){
  try{
    const t = localStorage.getItem(CHAVE_SESSAO);
    if(!t) return null;
    const s = JSON.parse(t);
    return (s && s.access_token && s.user) ? s : null;
  }catch(e){ return null; }
}
const usuario   = () => sessao && sessao.user;
const logado    = () => !!(sessao && sessao.access_token);
const expiraEm  = () => (sessao && sessao.expires_at) ? sessao.expires_at*1000 : 0;

/* Monta a sessão a partir da resposta do Identity Toolkit (signUp,
   signInWithPassword ou accounts:update — todas usam os mesmos nomes de
   campo, em camelCase). O signUp não devolve displayName mesmo quando ele
   é enviado no pedido; quem chama cadastrar() completa isso na volta. */
function montarSessao(r){
  if(!r || !r.idToken) return null;
  const anterior = (sessao && sessao.user) || {};
  return {
    access_token: r.idToken,
    refresh_token: r.refreshToken || (sessao && sessao.refresh_token) || '',
    expires_at: Math.floor(Date.now()/1000) + (+r.expiresIn || 3600),
    user: {
      id: r.localId || anterior.id || '',
      email: r.email || anterior.email || '',
      nome: (r.displayName != null ? r.displayName : (anterior.nome || '')).trim()
    }
  };
}

/* ---------- chamadas ---------- */
function formEncode(obj){
  return Object.keys(obj).map(k => encodeURIComponent(k)+'='+encodeURIComponent(obj[k])).join('&');
}
/* Base de toda chamada HTTP: erros de rede viram 'sem_rede', erros do
   servidor viram Error com .status e .codigo (o `error.message` que o
   Firebase devolve, tipo "EMAIL_EXISTS" ou "PERMISSION_DENIED"). */
async function chamar(url, opcoes){
  const o = opcoes || {};
  let r;
  try{
    r = await fetch(url, {
      method: o.method || 'GET',
      headers: o.headers,
      body: o.body !== undefined ? (o.form ? formEncode(o.body) : JSON.stringify(o.body)) : undefined
    });
  }catch(e){ throw erro('sem_rede'); }

  const texto = await r.text();
  let corpo = null;
  try{ corpo = texto ? JSON.parse(texto) : null; }catch(e){ corpo = texto; }
  if(!r.ok){
    const msg = (corpo && corpo.error && corpo.error.message) || ('HTTP '+r.status);
    const e = new Error(msg);
    e.status = r.status;
    e.codigo = msg;
    /* Token recusado pelo servidor: a sessão local não vale mais nada. Guardar
       um token morto no aparelho só serve para o app tentar de novo em loop e
       para o token ficar guardado além do tempo — some com ele na hora. */
    if(o.encerraSessaoSeInvalido && (r.status === 401 || r.status === 403 ||
       /INVALID_ID_TOKEN|TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED/.test(msg))){
      guardarSessao(null);
    }
    throw e;
  }
  return corpo;
}
function erro(codigo){ const e = new Error(codigo); e.codigo = codigo; return e; }

/* Chamadas ao Identity Toolkit (cadastro, login, troca de senha etc.): a
   autenticação de quem já tem sessão vai como campo `idToken` no corpo, não
   como cabeçalho Authorization — é assim que essa API funciona. */
function chamarIdentidade(caminho, opcoes){
  const o = opcoes || {};
  const headers = {'Content-Type': o.form ? 'application/x-www-form-urlencoded' : 'application/json'};
  return chamar(AUTH_BASE + caminho + '?key=' + FB.apiKey, Object.assign({}, o, {headers}));
}
async function chamarComToken(caminho, corpoExtra){
  const t = await tokenValido();
  if(!t) throw erro('sessao_expirada');
  return chamarIdentidade(caminho, {
    method:'POST', body: Object.assign({idToken:t}, corpoExtra||{}),
    encerraSessaoSeInvalido: true
  });
}
/* Chamadas ao Firestore: aqui sim é cabeçalho Authorization: Bearer. */
async function chamarFirestore(caminho, opcoes){
  const o = opcoes || {};
  const t = await tokenValido();
  if(!t) throw erro('sessao_expirada');
  return chamar(DB_BASE + caminho, Object.assign({}, o, {
    headers: Object.assign({'Content-Type':'application/json', 'Authorization':'Bearer '+t}, o.headers||{}),
    encerraSessaoSeInvalido: true
  }));
}

/* Renova o token sozinho um minuto antes de vencer. O endpoint de refresh é
   outro (securetoken, não identitytoolkit), pede o corpo como formulário e
   devolve os campos em snake_case — por isso não passa por montarSessao(). */
let renovando = null;
async function tokenValido(){
  if(!sessao) return null;
  if(Date.now() < expiraEm() - 60000) return sessao.access_token;
  if(!sessao.refresh_token){ guardarSessao(null); return null; }
  if(!renovando){
    renovando = (async()=>{
      try{
        const r = await chamar(TOKEN_URL, {method:'POST', form:true,
          body:{grant_type:'refresh_token', refresh_token: sessao.refresh_token}});
        if(!r || !r.id_token) throw erro('sessao_expirada');
        const nova = {
          access_token: r.id_token,
          refresh_token: r.refresh_token || sessao.refresh_token,
          expires_at: Math.floor(Date.now()/1000) + (+r.expires_in || 3600),
          user: sessao.user
        };
        guardarSessao(nova);
        return nova.access_token;
      }catch(e){
        // Sem rede a sessão continua válida localmente: o app segue offline.
        if(e.codigo === 'sem_rede') return sessao ? sessao.access_token : null;
        guardarSessao(null);
        return null;
      }finally{ renovando = null; }
    })();
  }
  return renovando;
}

/* ---------- freio de tentativas ----------
   O Firebase já limita tentativas do lado dele, e é ele quem manda. Este
   freio é o degrau anterior: segura a força bruta feita PELO app, no próprio
   aparelho, antes de a rede ser usada. Cresce a cada erro (1s, 2s, 4s… até
   5 min), zera no acerto, e vale por e-mail para não punir quem só errou a
   senha uma vez. Não substitui o limite do servidor: soma. */
const CHAVE_FREIO = 'sobra:freio';
const FREIO_MAX = 300000;                     // 5 minutos
function lerFreio(){
  try{ return JSON.parse(localStorage.getItem(CHAVE_FREIO) || '{}') || {}; }
  catch(e){ return {}; }
}
function gravarFreio(f){
  try{ localStorage.setItem(CHAVE_FREIO, JSON.stringify(f)); }catch(e){}
}
function chaveFreio(email){ return String(email || '').trim().toLowerCase(); }
function esperaDoFreio(email){
  const f = lerFreio()[chaveFreio(email)];
  if(!f || !f.ate) return 0;
  return Math.max(0, f.ate - Date.now());
}
function registrarErroDeLogin(email){
  const f = lerFreio(), k = chaveFreio(email);
  const n = ((f[k] && f[k].n) || 0) + 1;
  // 3 tentativas de graça; a partir daí dobra.
  const espera = n <= 3 ? 0 : Math.min(FREIO_MAX, 1000 * Math.pow(2, n - 4));
  f[k] = {n, ate: Date.now() + espera};
  gravarFreio(f);
}
function limparFreio(email){
  const f = lerFreio(); delete f[chaveFreio(email)]; gravarFreio(f);
}

/* ---------- entrar, cadastrar, recuperar, sair ---------- */
async function entrar(email, senha){
  const espera = esperaDoFreio(email);
  if(espera > 0){
    const e = erro('freio');
    e.segundos = Math.ceil(espera / 1000);
    throw e;
  }
  let r;
  try{
    r = await chamarIdentidade('/accounts:signInWithPassword', {method:'POST',
      body:{email:String(email).trim().toLowerCase(), password:senha, returnSecureToken:true}});
  }catch(e){
    if(e.codigo !== 'sem_rede') registrarErroDeLogin(email);
    throw e;
  }
  limparFreio(email);
  const s = montarSessao(r);
  if(!s) throw erro('sem_sessao');
  guardarSessao(s);
  return s;
}
/* Cadastro sem etapa de confirmação: cria a conta e já entra — o Firebase
   deixa fazer login por e-mail/senha mesmo sem o e-mail ter sido verificado,
   então não existe aqui o vaivém de "confirme para poder entrar" que o
   Supabase exigia. `confirmar` continua na resposta só por compatibilidade
   com quem chama, mas nunca vem `true`. */
async function cadastrar(email, senha, nome){
  const emailLimpo = String(email).trim().toLowerCase();
  const nomeLimpo = String(nome||'').trim();
  const r = await chamarIdentidade('/accounts:signUp', {method:'POST',
    body:{email:emailLimpo, password:senha, displayName:nomeLimpo, returnSecureToken:true}});
  const s = montarSessao(r);
  if(!s) throw erro('sem_sessao');
  s.user.nome = nomeLimpo;   // accounts:signUp não devolve displayName na resposta
  guardarSessao(s);
  return {sessao:s, confirmar:false};
}
async function recuperarSenha(email, redirecionar){
  const body = {requestType:'PASSWORD_RESET', email:String(email).trim().toLowerCase()};
  if(redirecionar) body.continueUrl = redirecionar;
  await chamarIdentidade('/accounts:sendOobCode', {method:'POST', body});
}
/* O link do e-mail de recuperação traz um `oobCode` (não uma sessão pronta,
   como no Supabase). Trocamos a senha com ele e, para manter a mesma
   experiência de antes — cair direto dentro do app —, já fazemos login em
   seguida com a senha nova. */
async function trocarSenhaComCodigo(oobCode, novaSenha){
  const r = await chamarIdentidade('/accounts:resetPassword', {method:'POST',
    body:{oobCode, newPassword:novaSenha}});
  const email = r && r.email;
  if(!email) throw erro('codigo_invalido');
  return entrar(email, novaSenha);
}
async function definirNovaSenha(senha){
  const r = await chamarComToken('/accounts:update', {password:senha, returnSecureToken:true});
  const s = montarSessao(r);
  if(s){ guardarSessao(s); }
}
/* O nome fica no perfil da conta, não no estado financeiro: assim ele
   acompanha a pessoa em qualquer aparelho, junto do login. */
async function definirNome(nome){
  const limpo = String(nome||'').trim();
  await chamarComToken('/accounts:update', {displayName:limpo});
  if(sessao && sessao.user){ sessao.user.nome = limpo; guardarSessao(sessao); }
  return limpo;
}
/* Primeiro nome, com inicial maiúscula — nunca o pedaço do e-mail. */
function primeiroNome(){
  const n = (sessao && sessao.user && sessao.user.nome || '').trim();
  if(!n) return '';
  const p = n.split(/\s+/)[0];
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1);
}
async function sair(){
  // O Identity Toolkit não tem um endpoint de "derrubar sessão em todo
  // aparelho" chamável pelo cliente (isso exige o Admin SDK, do lado do
  // servidor). O que dá para fazer daqui é esquecer a sessão neste aparelho;
  // o token de acesso ainda válido expira sozinho em até uma hora.
  guardarSessao(null);
}

/* ---------- estado do usuário na nuvem ---------- */
/* `dados` vai como uma única string JSON dentro do documento — mais simples
   e menos sujeito a erro do que converter cada campo para o formato tipado
   do Firestore, e a Console do Firebase nunca precisa consultar dentro dele. */
function nomeDoDocumento(uid){
  return 'projects/' + FB.projectId + '/databases/(default)/documents/estado/' + uid;
}
async function puxarEstado(){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  let doc;
  try{
    doc = await chamarFirestore('/estado/'+u.id, {method:'GET'});
  }catch(e){
    if(e.status === 404) return null;
    throw e;
  }
  const f = doc.fields || {};
  const dados = (f.dados && typeof f.dados.stringValue === 'string') ? JSON.parse(f.dados.stringValue) : {};
  const revisao = (f.revisao && f.revisao.integerValue != null) ? +f.revisao.integerValue : 1;
  return {dados, revisao};
}
/* O Firestore recusa documentos acima de 1 MiB; a gente barra bem antes
   disso (o mesmo teto de sempre) e avisa com uma frase que se entende, em
   vez de deixar o erro cru do servidor chegar à tela. A revisão sobe sozinha
   e de forma atômica: `increment` é uma transformação do próprio Firestore,
   não uma leitura-e-escrita feita daqui. */
const TETO_ESTADO = 512 * 1024;
async function enviarEstado(dados){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  const texto = JSON.stringify(dados);
  const tamanho = new Blob([texto]).size;
  if(tamanho > TETO_ESTADO) throw erro('estado_grande');
  const r = await chamarFirestore(':commit', {method:'POST', body:{
    writes: [{
      update: {name: nomeDoDocumento(u.id), fields: {dados: {stringValue: texto}}},
      updateMask: {fieldPaths: ['dados']},
      updateTransforms: [{fieldPath: 'revisao', increment: {integerValue: '1'}}]
    }]
  }});
  const resultado = r && r.writeResults && r.writeResults[0];
  const transformado = resultado && resultado.transformResults && resultado.transformResults[0];
  const revisao = transformado && transformado.integerValue != null ? +transformado.integerValue : 1;
  return {dados, revisao};
}
async function apagarEstadoNaNuvem(){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  await chamarFirestore('/estado/'+u.id, {method:'DELETE'});
}

/* ---------- mensagens amigáveis ---------- */
function mensagemDeErro(e){
  const cru = String((e && (e.codigo || e.message)) || '').toUpperCase();
  if(cru.includes('SEM_REDE'))            return 'Sem internet agora. Verifique a conexão e tente de novo.';
  if(cru.includes('FREIO')){
    const s = (e && e.segundos) || 0;
    if(s > 60){ const m=Math.ceil(s/60);
      return 'Muitas tentativas seguidas. Espere '+m+(m===1?' minuto':' minutos')+' e tente de novo.'; }
    const seg=Math.max(1,s);
    return 'Muitas tentativas seguidas. Espere '+seg+(seg===1?' segundo':' segundos')+' e tente de novo.';
  }
  if(cru.includes('ESTADO_GRANDE'))       return 'Seus dados passaram do tamanho que a nuvem aceita. Arquive meses antigos ou baixe um backup.';
  if(cru.includes('PERMISSION_DENIED'))   return 'O servidor recusou essa gravação. Se continuar, entre de novo.';
  if(cru.includes('INVALID_LOGIN_CREDENTIALS')||cru.includes('INVALID_PASSWORD')||cru.includes('EMAIL_NOT_FOUND'))
                                          return 'E-mail ou senha não conferem. Confira e tente de novo.';
  if(cru.includes('EMAIL_EXISTS')||cru.includes('EMAIL_ALREADY'))
                                          return 'Já existe uma conta com este e-mail. Tente entrar, ou use “Esqueci minha senha”.';
  if(cru.includes('WEAK_PASSWORD'))       return 'Senha muito curta. Use pelo menos 8 caracteres.';
  if(cru.includes('INVALID_EMAIL'))       return 'Esse e-mail não parece válido. Confira se digitou certo.';
  if(cru.includes('TOO_MANY_ATTEMPTS')||cru.includes('RATE_LIMIT_EXCEEDED')||cru.includes('BLOCKED_ALL_REQUESTS'))
                                          return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if(cru.includes('USER_DISABLED'))       return 'Esta conta foi desativada.';
  if(cru.includes('OPERATION_NOT_ALLOWED')) return 'O cadastro está desativado neste momento.';
  if(cru.includes('EXPIRED_OOB_CODE')||cru.includes('INVALID_OOB_CODE')||cru.includes('CODIGO_INVALIDO'))
                                          return 'Esse link de recuperação expirou ou já foi usado. Peça um novo.';
  if(cru.includes('TOKEN_EXPIRED')||cru.includes('INVALID_ID_TOKEN')||cru.includes('USER_NOT_FOUND')
     ||cru.includes('SESSAO_EXPIRADA')||cru.includes('SEM_SESSAO'))
                                          return 'Sua sessão expirou. Entre de novo, por favor.';
  return 'Não consegui completar agora. Tente de novo em instantes.';
}

/* ---------- validação de formulário ---------- */
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
function validarEmail(v){
  const e = String(v||'').trim();
  if(!e) return 'Digite seu e-mail.';
  if(!EMAIL_OK.test(e)) return 'Esse e-mail não parece válido.';
  return '';
}
function validarNome(v){
  const n = String(v||'').trim();
  if(!n) return 'Como você quer ser chamado?';
  if(n.length < 2) return 'Escreva pelo menos duas letras.';
  if(n.length > 40) return 'Um nome mais curto funciona melhor.';
  if(/^[\d\s\W]+$/.test(n)) return 'Use letras — é assim que vamos te chamar.';
  return '';
}
/* As senhas que aparecem primeiro em toda lista de vazamento. O Firebase não
   checa senha vazada por conta própria, então esta lista curta é o que
   existe entre uma conta e a senha mais óbvia do mundo. É pouco, e é
   honesto dizer que é pouco. */
const SENHAS_OBVIAS = new Set([
  '12345678','123456789','1234567890','12345678910','senha123','password',
  'password1','password123','qwerty123','qwertyui','abc12345','11111111',
  '00000000','iloveyou','princesa','brasil123','flamengo','corinthians',
  'sobradomes','admin123','letmein1','sunshine','football','trustno1'
]);
function validarSenha(v){
  const s = String(v||'');
  if(!s) return 'Digite uma senha.';
  if(s.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
  if(s.length > 72) return 'Senha longa demais — use até 72 caracteres.';
  if(SENHAS_OBVIAS.has(s.toLowerCase()))
    return 'Essa senha é das mais usadas do mundo. Escolha outra.';
  if(/^(.)\1+$/.test(s)) return 'Uma letra repetida não protege nada. Misture.';
  return '';
}
function forcaDaSenha(v){
  const s = String(v||'');
  let n = 0;
  if(s.length >= 8) n++;
  if(s.length >= 12) n++;
  if(/[a-z]/.test(s) && /[A-Z]/.test(s)) n++;
  if(/\d/.test(s)) n++;
  if(/[^\w\s]/.test(s)) n++;
  const nivel = Math.min(n, 4);
  return {nivel, rotulo:['muito fraca','fraca','razoável','boa','forte'][nivel]};
}

/* recupera a sessão salva assim que o arquivo carrega */
sessao = lerSessaoSalva();

window.Auth = {
  entrar, cadastrar, recuperarSenha, trocarSenhaComCodigo, definirNovaSenha, sair,
  definirNome, primeiroNome,
  puxarEstado, enviarEstado, apagarEstadoNaNuvem,
  usuario, logado, tokenValido, guardarSessao, montarSessao,
  mensagemDeErro, validarEmail, validarSenha, validarNome, forcaDaSenha
};
