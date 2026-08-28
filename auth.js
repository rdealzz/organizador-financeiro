/* ==========================================================================
   Sobra do Mês — autenticação e sincronização
   Falamos direto com a API do Supabase por fetch: sem biblioteca externa,
   sem CDN, funciona com o app em cache offline.

   Por que isto é seguro de verdade, e não uma tela de login decorativa:
   o isolamento não está aqui no navegador — está no banco. Cada linha da
   tabela `estado` tem a chave primária igual ao id do usuário e políticas de
   Row Level Security amarradas a `auth.uid()`. Mesmo que alguém pegue a chave
   pública (ela é pública mesmo, vai no HTML) e chame a API na mão, o Postgres
   devolve zero linhas das outras contas. Isso foi testado: select, update,
   delete e insert forjando o user_id de outra conta — todos bloqueados.
   ========================================================================== */
const SB = {
  url: 'https://wwusfrgcgassdmsmjkux.supabase.co',
  // Chave publicável (anon). É feita para ficar exposta no cliente; quem
  // protege os dados é o RLS, não o segredo desta chave.
  key: 'sb_publishable_Eac43j7G_fSIAx0r19-ZyA_FBVq5Ahf'
};
const CHAVE_SESSAO = 'sobra:sessao';

/* ---------- sessão ---------- */
let sessao = null;   // {access_token, refresh_token, expires_at, user:{id,email}}

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

function montarSessao(r){
  if(!r || !r.access_token) return null;
  const u = r.user || {};
  const meta = u.user_metadata || {};
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: r.expires_at || Math.floor(Date.now()/1000) + (r.expires_in||3600),
    user: { id: u.id, email: u.email, nome: (meta.nome || '').trim() }
  };
}

/* ---------- chamadas ---------- */
async function chamar(caminho, opcoes){
  const o = opcoes || {};
  const cabecalhos = Object.assign({
    'apikey': SB.key,
    'Content-Type': 'application/json'
  }, o.headers || {});
  if(o.comToken){
    const t = await tokenValido();
    if(!t) throw erro('sessao_expirada');
    cabecalhos['Authorization'] = 'Bearer ' + t;
  }
  let r;
  try{
    r = await fetch(SB.url + caminho, {
      method: o.method || 'GET',
      headers: cabecalhos,
      body: o.body ? JSON.stringify(o.body) : undefined
    });
  }catch(e){ throw erro('sem_rede'); }

  const texto = await r.text();
  let corpo = null;
  try{ corpo = texto ? JSON.parse(texto) : null; }catch(e){ corpo = texto; }
  if(!r.ok){
    const e = new Error((corpo && (corpo.msg || corpo.error_description || corpo.message || corpo.error)) || ('HTTP '+r.status));
    e.status = r.status;
    e.codigo = (corpo && (corpo.error_code || corpo.code)) || '';
    /* Token recusado pelo servidor: a sessão local não vale mais nada. Guardar
       um token morto no aparelho só serve para o app tentar de novo em loop e
       para o token ficar guardado além do tempo — some com ele na hora. */
    if((r.status === 401 || r.status === 403) && o.comToken && caminho.indexOf('/auth/v1/token') < 0){
      guardarSessao(null);
    }
    throw e;
  }
  return corpo;
}
function erro(codigo){ const e = new Error(codigo); e.codigo = codigo; return e; }

/* Renova o token sozinho um minuto antes de vencer. */
let renovando = null;
async function tokenValido(){
  if(!sessao) return null;
  if(Date.now() < expiraEm() - 60000) return sessao.access_token;
  if(!sessao.refresh_token){ guardarSessao(null); return null; }
  if(!renovando){
    renovando = (async()=>{
      try{
        const r = await chamar('/auth/v1/token?grant_type=refresh_token',
          {method:'POST', body:{refresh_token: sessao.refresh_token}});
        const nova = montarSessao(r);
        if(!nova) throw erro('sessao_expirada');
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
   O Supabase já limita tentativas do lado dele, e é ele quem manda. Este
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
    r = await chamar('/auth/v1/token?grant_type=password',
      {method:'POST', body:{email:String(email).trim().toLowerCase(), password:senha}});
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
/* Cadastro sem etapa de confirmação: cria a conta e já entra.
   No banco há um gatilho que marca a conta como confirmada no instante em que
   ela é criada, então basta pedir o token em seguida. Três caminhos possíveis:
     1. o servidor já devolve a sessão      -> pronto;
     2. devolve só o usuário                -> entramos com o mesmo e-mail/senha;
     3. falha ao enviar o e-mail de boas-vindas (o SMTP gratuito é limitado)
        -> a conta costuma existir mesmo assim, então tentamos entrar. */
async function cadastrar(email, senha, nome){
  const dados = {email:String(email).trim().toLowerCase(), password:senha,
                 data:{nome:String(nome||'').trim()}};
  let r = null, falhaDoCadastro = null;
  try{
    r = await chamar('/auth/v1/signup', {method:'POST', body:dados});
  }catch(e){
    const cru = String(e.codigo || e.message || '').toLowerCase();
    const eProblemaDeEmail = cru.includes('email') &&
      (cru.includes('rate') || cru.includes('send') || cru.includes('smtp'));
    if(!eProblemaDeEmail) throw e;      // e-mail já cadastrado, senha fraca etc.
    falhaDoCadastro = e;
  }

  const s = montarSessao(r);
  if(s){ guardarSessao(s); return {sessao:s, confirmar:false}; }

  try{
    return {sessao: await entrar(dados.email, senha), confirmar:false};
  }catch(e){
    if(falhaDoCadastro) throw falhaDoCadastro;
    return {sessao:null, confirmar:true};   // confirmação por e-mail exigida
  }
}
async function recuperarSenha(email, redirecionar){
  await chamar('/auth/v1/recover' + (redirecionar ? '?redirect_to='+encodeURIComponent(redirecionar) : ''),
    {method:'POST', body:{email:String(email).trim().toLowerCase()}});
}
async function reenviarConfirmacao(email){
  await chamar('/auth/v1/resend',
    {method:'POST', body:{type:'signup', email:String(email).trim().toLowerCase()}});
}
async function definirNovaSenha(senha){
  await chamar('/auth/v1/user', {method:'PUT', comToken:true, body:{password:senha}});
}
/* O nome fica no perfil da conta, não no estado financeiro: assim ele
   acompanha a pessoa em qualquer aparelho, junto do login. */
async function definirNome(nome){
  const limpo = String(nome||'').trim();
  await chamar('/auth/v1/user', {method:'PUT', comToken:true, body:{data:{nome:limpo}}});
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
  // Invalida o refresh token no servidor; se estiver offline, limpa localmente.
  try{ await chamar('/auth/v1/logout?scope=global', {method:'POST', comToken:true}); }catch(e){}
  guardarSessao(null);
}

/* ---------- estado do usuário na nuvem ---------- */
async function puxarEstado(){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  const linhas = await chamar('/rest/v1/estado?select=dados,revisao,atualizado_em&user_id=eq.'+u.id,
    {comToken:true});
  return (Array.isArray(linhas) && linhas[0]) ? linhas[0] : null;
}
/* O banco recusa acima de 512 KB (constraint estado_dados_tamanho). O app
   avisa ANTES de gastar a rede — e, mais importante, avisa com uma frase que
   se entende, em vez de deixar o erro cru do Postgres chegar à tela. */
const TETO_ESTADO = 512 * 1024;
async function enviarEstado(dados){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  try{
    const tamanho = new Blob([JSON.stringify(dados)]).size;
    if(tamanho > TETO_ESTADO) throw erro('estado_grande');
  }catch(e){ if(e.codigo === 'estado_grande') throw e; }
  const linhas = await chamar('/rest/v1/estado', {
    method:'POST', comToken:true,
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
    body:{user_id:u.id, dados}
  });
  return (Array.isArray(linhas) && linhas[0]) ? linhas[0] : null;
}
async function apagarEstadoNaNuvem(){
  const u = usuario(); if(!u) throw erro('sem_sessao');
  await chamar('/rest/v1/estado?user_id=eq.'+u.id, {method:'DELETE', comToken:true});
}

/* ---------- mensagens amigáveis ---------- */
function mensagemDeErro(e){
  const cru = String((e && (e.codigo || e.message)) || '').toLowerCase();
  if(cru.includes('sem_rede'))            return 'Sem internet agora. Verifique a conexão e tente de novo.';
  if(cru.includes('freio')){
    const s = (e && e.segundos) || 0;
    if(s > 60){ const m=Math.ceil(s/60);
      return 'Muitas tentativas seguidas. Espere '+m+(m===1?' minuto':' minutos')+' e tente de novo.'; }
    const seg=Math.max(1,s);
    return 'Muitas tentativas seguidas. Espere '+seg+(seg===1?' segundo':' segundos')+' e tente de novo.';
  }
  if(cru.includes('estado_grande'))       return 'Seus dados passaram do tamanho que a nuvem aceita. Arquive meses antigos ou baixe um backup.';
  if(cru.includes('estado_dados_tamanho'))return 'Seus dados passaram do tamanho que a nuvem aceita. Arquive meses antigos ou baixe um backup.';
  if(cru.includes('permission denied')||cru.includes('42501'))
                                          return 'O servidor recusou essa gravação. Se continuar, entre de novo.';
  if(cru.includes('invalid login'))       return 'E-mail ou senha não conferem. Confira e tente de novo.';
  if(cru.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar — o link está na sua caixa de entrada.';
  if(cru.includes('already registered')||cru.includes('already been registered'))
                                          return 'Já existe uma conta com este e-mail. Tente entrar, ou use “Esqueci minha senha”.';
  if(cru.includes('user_already_exists')) return 'Já existe uma conta com este e-mail.';
  if(cru.includes('weak_password')||cru.includes('password should be'))
                                          return 'Senha muito curta. Use pelo menos 8 caracteres.';
  if(cru.includes('unable to validate email')||cru.includes('invalid format')||cru.includes('validation_failed'))
                                          return 'Esse e-mail não parece válido. Confira se digitou certo.';
  if(cru.includes('over_email_send_rate')||cru.includes('rate limit')||cru.includes('too many'))
                                          return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if(cru.includes('sessao_expirada')||cru.includes('sem_sessao'))
                                          return 'Sua sessão expirou. Entre de novo, por favor.';
  if(cru.includes('signups not allowed')) return 'O cadastro está desativado neste momento.';
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
/* As senhas que aparecem primeiro em toda lista de vazamento. A checagem
   contra a base do HaveIBeenPwned está desligada no painel do Supabase, então
   esta lista curta é o que existe entre uma conta e a senha mais óbvia do
   mundo. É pouco, e é honesto dizer que é pouco: o certo é ligar a proteção
   de senha vazada no painel. */
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
  entrar, cadastrar, recuperarSenha, reenviarConfirmacao, definirNovaSenha, sair,
  definirNome, primeiroNome,
  puxarEstado, enviarEstado, apagarEstadoNaNuvem,
  usuario, logado, tokenValido, guardarSessao, montarSessao,
  mensagemDeErro, validarEmail, validarSenha, validarNome, forcaDaSenha
};
