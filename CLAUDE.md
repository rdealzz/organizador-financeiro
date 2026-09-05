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

## A identidade é azul (v9)

A marca era roxo/magenta com ouro. Agora é azul, em dois lados:

- **Escuro: preto e azul claro.** `--bg` é `#000000` de verdade (em OLED não
  acende pixel), os cartões sobem dele com um fio de azul, e o acento é
  `--azul:#5CBDFF`.
- **Claro: branco e azul escuro.** Fundo branco com um fio de azul, cartões
  brancos puros, acento `--azul:#0C4FA8`.

O que isso exigiu de estrutura: no escuro o azul de preencher ficou CLARO, e
texto branco em cima dele dá 2:1 — ilegível. Por isso existe **`--sobre-azul`**,
a cor que vai em cima de `--azul`: branco no claro, quase-preto (`#04121F`) no
escuro. Todo `background:var(--azul)` usa ela, nunca `#fff` fixo. Se aparecer
um botão azul novo, é essa a regra.

A paleta atravessa quatro lugares — não adianta mexer só num:
`styles.css` (variáveis, cena, cartas), `intro.js` (a esfera de partículas tem
paleta própria por tema, mais o degradê de fundo), `index.html` (splash e
`theme-color`) e `manifest.webmanifest`.

**Exceção consciente:** as cores de DADO (`--roxo`, `--rosa`, `--s5`, `--s7`…)
continuam multicoloridas. Elas separam categoria em gráfico; se virarem todas
azuis, o gráfico deixa de ser legível. Só o cromo do app é azul.

Contrastes conferidos: nada abaixo de 4,5:1, e o corpo passa de 16:1 nos dois
temas.

## Chamada de rede sem prazo — a "lentidão" (corrigido na v9)

`fetch` não tem timeout. A `chamar()` do `auth.js` não punha nenhum, e numa
rede que aceita a conexão e nunca responde (metrô, portal de hotel, 3G que
caiu no meio) o resultado medido aqui foi:

- o botão de entrar girava **90 s sem erro nenhum**, sem saída a não ser
  recarregar a página;
- pior, o `enviando` de `enviarParaNuvem()` nunca voltava a `false`, e daí em
  diante **toda gravação era engolida** por `if(enviando){pendente=true;return;}`
  — o app parecia lento e parecia não salvar.

Agora `chamar()` tem `AbortController` com 20 s (45 s no `:commit`, que sobe o
estado inteiro). Estourado o prazo o erro vira `sem_rede`, que já tem frase
pronta. Verificado: com a rede muda o botão volta em 20 s; no caminho normal o
login fecha em ~120 ms.

Se for medir de novo: a renderização **não** é o gargalo. Medido com Playwright,
o app fica em 55–60 fps na capa, na esfera de fundo, na rolagem e na troca de
tema, sem tarefa longa relevante.

## A armadilha do `--bg: transparent`

Com a esfera ligada, `body.fundo-vivo` define **`--bg: transparent`** — é o que
deixa a esfera aparecer atrás dos painéis. A consequência é que **qualquer
elemento com `background:var(--bg)` fica invisível nesse modo**, inclusive
telas inteiras.

Foi exatamente isso que aconteceu com a `.retro` (a retrospectiva do mês): ela
é uma tela cheia com `background:var(--bg)`, e com a esfera ligada era
desenhada sobre o app sem fundo nenhum — "Setembro terminou" ficava por cima
dos painéis, e o portal translúcido por cima dos dois. Três camadas de texto
somadas.

Existe uma lista em `styles.css` chamada **"Superfícies FLUTUANTES são opacas,
sempre"** (`.menu-perfil`, `.sheet`, `.snack`, `.toast`, `.atualiza`, `.retro`).
**Toda camada nova que cobre conteúdo precisa entrar nela**, nos dois temas —
senão repete o mesmo defeito. Só a `.confete` fica de fora de propósito: ela é
partícula caindo, e tem que ser transparente mesmo.

Junto disso: a `.retro` nasce em `z-index: 70` e o portal vive em `120`, então
abrir as duas ao mesmo tempo escondia a retrospectiva ATRÁS das cartas — sem
como ler nem fechar. Agora `abrirApp()` põe a retrospectiva na fila
(`retroPendente`) quando o portal está na tela, e `fecharPortal()` a mostra
assim que a pessoa escolhe uma área. `retroPendente` é declarada **no topo do
`app.js`**, junto de `cena` e `capaSaindo`, pelo mesmo motivo que elas: ao
reabrir com sessão salva, `abrirApp()` roda antes do fim do arquivo, e um `let`
lá embaixo estaria na zona morta temporal.

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
