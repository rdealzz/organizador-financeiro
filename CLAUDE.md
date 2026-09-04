# Notas para o Claude Code

## Onde o projeto está

App de finanças pessoais (PWA, JS puro, sem build). Migrou de **Supabase** para
**Firebase** (Authentication + Firestore) na branch
`claude/database-recommendation-irjo15`. O código da migração já está escrito e
commitado; falta **configurar e validar contra o projeto Firebase real**.

## Acesso ao Firebase a partir daqui

Não é preciso credencial de admin para o trabalho normal: a `apiKey` do
projeto é pública e está em `auth.js`, e com ela dá para exercitar todo o
caminho do app pelas APIs REST (`identitytoolkit.googleapis.com` para
cadastro/login, `firestore.googleapis.com` para os dados). Foi assim que a
verificação de segurança abaixo foi feita.

Limitação da sandbox, se algum dia o CLI for necessário: `firebase login`
**não funciona** aqui, porque a política de rede bloqueia
`auth.firebase.tools`. Todos os `*.googleapis.com` passam.

Se criar contas para verificar algo, **apague depois**
(`accounts:delete` com o `idToken` da própria conta) — o projeto é de produção.

## Estado da configuração

Projeto Firebase: **`organizador-financeiro-98e15`**.

- ✅ Firestore criado, regras de `firestore.rules` publicadas e **verificadas
  contra o projeto real** (ver a tabela em `SEGURANCA.md`).
- ✅ Authentication ativo com o provedor E-mail/senha.
- ✅ `FB.apiKey` e `FB.projectId` preenchidos em `auth.js`.
- ✅ Ciclo completo exercitado de ponta a ponta: cadastro → login → gravar
  estado → ler de volta → incremento atômico da `revisao` → refresh do token
  → pedido de redefinição de senha. Reverificado em 04/09/2026, com as três
  negativas de permissão esperadas (ler doc alheio, escrever em doc alheio,
  ler sem token — todas HTTP 403).
- ✅ Migração já está em `main` (commit `70ec8ab`), então a Vercel publica
  a versão com Firebase.

### O que ainda falta

1. **URL de ação de redefinição de senha** (Authentication → Templates →
   Redefinição de senha → personalizar URL de ação) apontando para a origem
   publicada do app. Sem isso o link do e-mail cai numa página do Firebase em
   vez de voltar para o app — o `app.js` espera
   `?mode=resetPassword&oobCode=...` na própria origem. Daqui não dá para
   conferir esse ajuste: ele mora no console do Firebase e o e-mail não é
   legível pela API — o `sendOobCode` responde 200 de qualquer jeito.
2. **Contas antigas do Supabase não migram** — é uma base de usuários nova.

## Detalhes da implementação que importam

- `auth.js` fala com as APIs REST do Firebase por `fetch` puro — **sem SDK, sem
  CDN**. É uma decisão de projeto (funciona offline, nada de terceiros no
  bundle); mantenha assim.
- O estado do usuário é **um documento por conta** em `estado/<uid>`, com o JSON
  inteiro serializado no campo `dados` (string) e um contador `revisao`
  incrementado atomicamente via field transform no `:commit`.
- O isolamento entre contas mora em `firestore.rules`, não no cliente.
- Teto de 512 KB para `dados`, conferido no cliente **e** nas regras.
- `vercel.json` tem uma CSP restritiva: se algum domínio novo do Firebase for
  chamado, precisa entrar no `connect-src` ou a chamada falha em silêncio
  (aparece como "sem rede" para o usuário).
