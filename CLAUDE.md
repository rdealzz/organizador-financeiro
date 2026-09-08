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

## O app se chama Sobra+ (v9.3)

Era "Sobra do Mês". O nome novo está no `<title>`, no splash, na capa, no
`apple-mobile-web-app-title`, no `manifest.webmanifest` e no título de reserva
das notificações do `sw.js`.

**As chaves de armazenamento continuam `sobra-do-mes:`** — `KEY_ANTIGA` e
`sobra-do-mes:u:<uid>`. Renomear a chave apagaria os dados de todo mundo que já
usa o app, sem trocar um pixel na tela. O `sobra do mês` que aparece na tela
inicial e na legenda do gráfico também fica: ali é o DADO (o dinheiro que
sobrou), não a marca.

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

## Quem divide o gasto é uma PESSOA (v9.2)

Antes existia um campo só, `l.pai`, com o quanto "outra pessoa" cobria — anônima
e sempre a mesma. Agora há uma lista de pessoas (`S.pessoas`, cada uma com
`id`, `nome` e `cor`) e cada lançamento aponta para uma delas em **`l.com`**.

**`l.pai` continua com esse nome de propósito.** Ele guarda o VALOR que a outra
pessoa cobre, e está gravado nas faturas arquivadas, nos backups em arquivo e no
CSV que as pessoas já baixaram. Renomear o campo quebraria os três sem mudar uma
linha do que aparece na tela. `meuValor()` não mudou.

Três coisas para não repetir:

1. **A fatura arquivada congela nome e cor** (`hist[].pessoas`), não guarda só o
   id. Quem apagar "Mãe" em dezembro continua vendo de quem era a metade do
   mercado de setembro. Quem lê o histórico usa `fatiasDoHist(x)`, que também
   sabe responder pelas faturas antigas, que só têm o total em `x.pai`.
2. **A migração roda uma vez por conta**, marcada por `S.pessoasOk` — que viaja
   no estado, então o segundo aparelho não repete. Ela transforma a divisão
   anônima antiga numa pessoa chamada "Outra pessoa" e a costura no histórico.
   `migrarPessoas()` é chamada nos QUATRO pontos em que estado entra no app:
   `carregar()`, restauração de backup, adoção do estado remoto e importação do
   estado que já estava no aparelho.
3. **As cores de pessoa (`--pes1`…`--pes8`) são cor de DADO**, como as de
   categoria: existem para separar pai de mãe numa lista, então continuam
   multicoloridas mesmo com a identidade azul. Diferente das cores de gráfico
   (`--s1`…`--s8`, que só existem dentro de `.viz` e fora dali são *sombra*),
   elas estão no `:root` e no bloco do tema escuro — podem ser usadas em
   qualquer tela, e foram escolhidas para servir como TEXTO sobre o cartão.

O select de "quem paga" é montado por `opcoesPagador(l, curto)` e vale para a
tabela e para o formulário. O `curto` existe porque "Dividido com Mãe" espremia
a coluna da tabela até virar "Divi" numa tela de 430 px; na tabela o rótulo é
"Com Mãe" e o nome por extenso aparece embaixo da descrição, que é a coluna que
nunca sai da tela.

## A fatura fecha ANTES de ser cobrada (v9.3)

O app tratava `diaVenc` como "o próximo dia 12 no calendário". Com fechamento e
vencimento no mesmo dia — a configuração de quem só sabe a data do pagamento —
isso apontava para a fatura ANTERIOR, já fechada e arquivada: o alerta dizia "a
fatura vence em 4 dias" e o lembrete mostrava o total do ciclo ABERTO junto
dessa data. Duas faturas diferentes no mesmo cartão.

**`vencDaFatura(fech)` é o único lugar que casa as duas datas.** Recebe o dia em
que a fatura fecha, devolve o primeiro `diaVenc` DEPOIS dela — `<=` e não `<`,
por isso fechar e vencer no dia 12 cai naturalmente em 12 do mês seguinte, que é
o que o cartão faz. Quem precisar da data de cobrança usa isso, nunca
`proximoVenc(S.diaVenc)`. `proximoVenc` continua existindo e continua certo para
o que é dele: conta com dia de vencimento próprio (boleto, mensalidade).

Daí saem duas faturas distintas, e confundi-las é o defeito original:

* **`faturaAberta()`** — a que está em formação. Fecha no próximo fechamento e
  só vira cobrança depois. É nela que cai tudo que se lança hoje.
* **`faturaAPagar()`** — a última ARQUIVADA, enquanto o vencimento não passou e
  ninguém marcou como paga. É ela que aparece em *Fatura fechada a pagar*, é o
  valor dela que vai no alerta de vencimento e no lembrete da agenda.

A fatura arquivada agora grava **`venc`** junto de `data`. Sem isso, daqui a seis
meses o app teria que adivinhar qual era o dia de vencimento configurado na
época. As faturas antigas, sem o campo, caem no `vencDaFatura` de hoje.

### Gasto que só entra na próxima fatura

**`l.prox`** conta quantos fechamentos o lançamento ainda espera. Enquanto for
maior que zero ele não soma em `calc()`, não estoura teto, não conta em *contas
a vencer* e **não é arquivado no fechamento** — só anda uma casa na fila
(`fecharCiclo` separa `daProxima()` antes de tudo e não passa esses itens pelas
regras de variável/parcela/1x, senão um parcelado perderia parcela sem ter sido
cobrado).

Quem lê o ciclo usa **`doCiclo()`**, não `S.lanc`. Se aparecer um cálculo novo
sobre `S.lanc` cru, ele vai contar duas vezes o que está guardado.

`futuro` (parcelas por vir) só conta o que é `tipo==='parc'`. Um gasto de uma
vez só guardado na fila já aparece inteiro em `proxBruto`; somá-lo nos dois
lugares dobrava o número na tela — foi o que aconteceu na primeira versão.

## "Paguei" é por ocorrência, e pagar no cartão não é pagar do bolso

`l.pagoAte` guarda **a data do vencimento que foi quitado**, não `true`. A conta
é considerada paga só enquanto `l.pagoAte === iso(proximoVenc(l.venc))`; quando
o mês vira, a data deixa de bater e a conta volta sozinha para a lista. Um
booleano precisaria ser desmarcado à mão todo mês, e ninguém faria isso.

O botão pergunta **como** foi paga, porque no cartão as duas coisas não são a
mesma:

* `pagoCom:'bolso'` (pix, débito, dinheiro) — o dinheiro saiu agora, acabou.
* `pagoCom:'cartao'` — a conta está quitada (não vence mais, não avisa mais),
  mas o dinheiro só sai quando a fatura vencer. `pagoVence` guarda esse dia,
  **congelado no momento da marcação** (`iso(faturaAberta().vence)`): o ciclo
  vira, a fatura fecha, e a linha continua sabendo quando o dinheiro sai.

**Marcar "no cartão" não mexe em valor nenhum.** O lançamento já está em
`S.lanc`, já entra em `calc()` e já está dentro da fatura aberta; somar de novo
seria contar o mesmo gasto duas vezes. A marca só resolve a obrigação — e o
bloco diz isso em uma linha, senão a pergunta "então eu paguei duas vezes?"
aparece sozinha.

A fatura fechada usa a mesma ideia num campo próprio: `S.hist[0].pago` com a
data em que foi paga. `faturaAPagar()` devolve `null` quando ele existe, e com
isso o cartão some e o alerta de vencimento cala junto.

## O app abre CLARO (v9.4)

O tema deixou de seguir o sistema. Vale o que a pessoa escolheu **neste
aparelho** (`localStorage['sobra:tema']`); quem nunca escolheu vê o tema claro.
`TEMA_PADRAO` é a única fonte disso no `app.js`.

Duas armadilhas moram aqui:

1. **`TEMA_PADRAO` está declarado no TOPO do arquivo**, junto de `cena` e
   `retroPendente`, porque o `let S = {…}` logo abaixo o usa como valor inicial.
   Um `const` junto do resto do código de tema estaria na zona morta temporal
   nesse instante — o mesmo erro que já derrubou a partida do app uma vez.
2. **`tema.js` existe por causa do CSP.** O tema precisa ser aplicado antes da
   splash aparecer, e o `app.js` só carrega no fim do `<body>` — decidir lá
   fazia a abertura piscar. A solução natural seria um `<script>` inline no
   `<head>`, mas o `vercel.json` usa `script-src 'self'`, que recusa código
   dentro do HTML. Daí o arquivo separado, carregado no `<head>` antes do
   `<style>` da splash. Ele também reescreve o `theme-color`, senão a barra do
   navegador pisca na cor do outro tema.

Quem mexer no padrão precisa mexer nos **dois** lugares: `TEMA_PADRAO` no
`app.js` e a linha do `tema.js`. E a splash não olha mais
`prefers-color-scheme` — só `data-tema` —, senão um celular no escuro abria com
splash preta e app claro.

O padrão de datas do cartão também mudou: **fecha dia 5, vence dia 12**. O
antigo era 5 e 5, que na leitura correta significa "fecha hoje e paga no mesmo
dia do mês que vem" — 30 dias de folga que nenhum cartão dá. Quem já tem conta
mantém o que configurou; a nota em *Renda e meta* avisa quando os dois dias
estão iguais.

## "Falha ao sincronizar" — três causas, três correções (v9.5)

O aviso aparecia "às vezes" e ficava. Investigando, eram três defeitos
diferentes empilhados, e os dois primeiros chegavam a **deslogar a pessoa**:

1. **Um 403 do Firestore apagava a sessão.** `pedir()` tinha
   `r.status === 401 || r.status === 403` na regra de `encerraSessaoSeInvalido`.
   Só que o Firestore responde **403 com "Missing or insufficient permissions"**
   quando as REGRAS recusam a gravação — não quando o token acabou. Um tropeço
   ali derrubava uma sessão perfeitamente válida, e a gravação seguinte falhava
   com "sessão expirada". Agora só 401 e as mensagens que falam do token
   (`INVALID_ID_TOKEN`, `TOKEN_EXPIRED`, `USER_NOT_FOUND`, `USER_DISABLED`)
   encerram a sessão.
2. **Qualquer falha no refresh apagava a sessão.** O `catch` do `tokenValido()`
   tratava tudo que não fosse `sem_rede` como credencial morta — um 500 do
   Google ou um 429 deslogava. Agora existe `sessaoMorta(e)`: só 400/401 e as
   mensagens definitivas (`INVALID_REFRESH_TOKEN`, `INVALID_GRANT`…) apagam a
   sessão; o passageiro vira `sem_rede`, que o app já sabe tratar. **403 fica de
   fora de propósito** também aqui: no securetoken ele significa "esta API está
   bloqueada para esta chave", problema de configuração do projeto — deslogar
   todo mundo por isso seria pior que o problema.
3. **Não havia nova tentativa.** Uma gravação que falhava marcava `'erro'` e
   parava. O app só tentava de novo quando a pessoa editasse algo (o que
   reagenda o envio) ou tocasse no chip. Numa oscilação de dois segundos, o
   aviso ficava na tela até alguém mexer — com a internet já de volta.

`agendarRetentativa()` repete sozinho em **4s, 12s, 40s, 2min e daí de 5 em 5
minutos**, e `visibilitychange` tenta de novo (com a espera zerada) quando o app
volta ao primeiro plano — que é o momento mais provável de a rede estar boa E o
momento em que a pessoa olha para o aviso. `agendarEnvio()` zera `sincProxima`
porque uma edição nova JÁ é a próxima tentativa.

Duas distinções que a interface passou a fazer:

* **`sincMotivo`** guarda a frase real do erro (`Auth.mensagemDeErro`). "Falha"
  sem motivo não diz a ninguém o que fazer — e havia um motivo que a pessoa
  PRECISA saber: o estado passou de 512 KB.
* **`ERRO_SEM_VOLTA`** separa o que tentar de novo resolve do que não resolve
  (estado grande, sessão expirada). Só o segundo grupo mostra "Falha ao
  sincronizar" com o ponto vermelho; o resto mostra "Tentando de novo…" com o
  ponto laranja pulsando. Numa tela de até 430px o texto do chip some e **o
  ponto é a mensagem inteira** — vermelho ali tem que significar "preciso de
  você", nunca "aguarde".

E `#btnSincAgora` não diz mais "Sincronizado" quando falhou: ele lê
`sincEstado` depois de tentar.

O projeto Firebase foi reverificado em 08/09/2026 pelas APIs REST (cadastro,
`:commit` com increment, leitura de volta, refresh, 403 esperado em doc alheio,
conta de teste apagada) — está saudável. A falha era toda do lado do cliente.

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
