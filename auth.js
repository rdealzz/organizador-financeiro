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
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: r.expires_at || Math.floor(Date.now()/1000) + (r.expires_in||3600),
    user: { id: r.user && r.user.id, email: r.user && r.user.email }
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

/* ---------- entrar, cadastrar, recuperar, sair ---------- */
async function entrar(email, senha){
  const r = await chamar('/auth/v1/token?grant_type=password',
    {method:'POST', body:{email:String(email).trim().toLowerCase(), password:senha}});
  const s = montarSessao(r);
  if(!s) throw erro('sem_sessao');
  guardarSessao(s);
  return s;
}
async function cadastrar(email, senha){
  const r = await chamar('/auth/v1/signup',
    {method:'POST', body:{email:String(email).trim().toLowerCase(), password:senha}});
  const s = montarSessao(r);
  if(s){ guardarSessao(s); return {sessao:s, confirmar:false}; }
  // Projeto com confirmação de e-mail ligada: a conta existe, falta confirmar.
  return {sessao:null, confirmar:true};
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
async function enviarEstado(dados){
  const u = usuario(); if(!u) throw erro('sem_sessao');
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
function validarSenha(v){
  const s = String(v||'');
  if(!s) return 'Digite uma senha.';
  if(s.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
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
  puxarEstado, enviarEstado, apagarEstadoNaNuvem,
  usuario, logado, tokenValido, guardarSessao, montarSessao,
  mensagemDeErro, validarEmail, validarSenha, forcaDaSenha
};
