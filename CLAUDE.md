# Notas para o Claude Code

## Onde o projeto está

App de finanças pessoais (PWA, JS puro, sem build). Migrou de **Supabase** para
**Firebase** (Authentication + Firestore) na branch
`claude/database-recommendation-irjo15`. O código da migração já está escrito e
commitado; falta **configurar e validar contra o projeto Firebase real**.

## Credencial do Firebase

A variável de ambiente **`FIREBASE_SA_JSON`** contém o JSON de uma conta de
serviço com acesso ao projeto Firebase do dono do repositório. Ela é
configurada no ambiente de nuvem (claude.ai/code → ícone de nuvem acima da
caixa de mensagem → engrenagem do ambiente → Environment variables), então
toda sessão nova já nasce com ela.

Para usar:

```bash
echo "$FIREBASE_SA_JSON" > /tmp/sa.json      # nunca dentro do repositório
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json
```

**Nunca commite esse JSON**, nem o caminho dele para dentro do repositório.

### Limitação da sandbox

`firebase login` **não funciona** aqui: a política de rede bloqueia
`auth.firebase.tools`. Mas todos os `*.googleapis.com` passam, então o caminho
é a conta de serviço (via `GOOGLE_APPLICATION_CREDENTIALS` no CLI, ou trocando
o JWT por um access token direto em `oauth2.googleapis.com` e chamando as APIs
REST: `firebase.googleapis.com`, `identitytoolkit.googleapis.com`,
`firebaserules.googleapis.com`).

O Firebase CLI se instala normalmente com `npm install -g firebase-tools`.

## O que falta fazer

1. **Pegar `apiKey` e `projectId`** — registrar um app da Web no projeto
   (`firebase apps:create web` ou a API REST) e ler a config
   (`firebase apps:sdkconfig web`).
2. **Preencher `FB.apiKey` e `FB.projectId`** no topo de `auth.js` — hoje estão
   com os valores placeholder `SUBSTITUA_PELA_SUA_WEB_API_KEY` e
   `substitua-pelo-id-do-seu-projeto`. O app não funciona até isso ser feito.
3. **Confirmar o provedor E-mail/senha** ativo em Authentication.
4. **Conferir as regras publicadas** contra `firestore.rules` (o dono já colou
   e publicou pelo console, mas vale confirmar que o que está no servidor bate
   com o arquivo do repositório).
5. **URL de ação de redefinição de senha** apontando para a origem do app —
   sem isso o link de "esqueci minha senha" cai numa página do Firebase em vez
   de voltar para o app (o fluxo do `app.js` espera `?mode=resetPassword&oobCode=...`
   na própria origem).
6. **Testar o isolamento entre contas** — criar duas contas e confirmar que uma
   não lê/grava `estado/<uid da outra>`. O `SEGURANCA.md` registra esse teste
   como pendente; quando passar, atualizar aquele arquivo.

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
