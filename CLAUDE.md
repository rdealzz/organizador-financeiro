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

1. **`S.tema` continua nascendo `'auto'`, e não `'claro'`.** Parece a mudança
   óbvia e é justamente a errada: `temaAtual()` devolve `S.tema` na hora quando
   ele já vale `'claro'` ou `'escuro'`, então nunca chegaria a consultar
   `sobra:tema` — e `aplicarTema()` ainda gravaria `'claro'` POR CIMA da escolha
   guardada. Quem tivesse escolhido escuro veria o app voltar ao claro a cada
   recarga, e a escolha sumia do aparelho. `'auto'` é o valor que significa
   "ainda não escolheram"; o padrão claro é o **último** degrau de
   `temaGuardado() || TEMA_PADRAO`, nunca o primeiro. Este defeito foi
   introduzido e pego na verificação — se voltar, é aqui.
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
dia do mês que vem" — 30 dias de folga que nenhum cartão dá.

Quem já tem conta mantém o que configurou, e para esses a nota em *Renda e meta*
avisa quando os dois dias estão iguais — **com um botão que corrige**. Avisar
sozinho não bastava: dizer "ajuste" e deixar a pessoa calcular qual dia pôr é
empurrar o problema de volta. O botão aplica a forma mais comum (fecha sete dias
antes de vencer), já com o dia no rótulo, e o campo continua ali para quem sabe
o dia exato do seu cartão. Ele também refaz `S.ultimoFech` — mudar o dia do
fechamento move a régua do ciclo, e sem isso o app viraria a fatura na hora
errada.

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

## O que cobrar de quem dividiu a fatura (v9.6)

`fatiasPessoa()` responde "quanto é de cada um" — um número por pessoa. Para
COBRAR isso não basta: ninguém transfere R$ 730 sem saber de quê. **`cobrancas(itens, congeladas)`**
devolve a mesma divisão ITEMIZADA — a pessoa, os gastos dela e quanto de cada
um é dela — e serve tanto para a fatura arquivada quanto para o ciclo aberto,
mudando só a lista de itens que entra.

`congeladas` são as fatias gravadas na fatura (`hist[].pessoas`). **Quando
existem, o nome e a cor vêm delas, nunca do cadastro de hoje** — é a mesma
regra do resto do histórico, e há teste para ela: apagar a pessoa não muda a
cobrança de setembro.

Onde isso aparece:

* **Fatura arquivada** (`blocoCobrancas`): um cartão por pessoa com os itens, o
  total, *Enviar/Copiar cobrança* e *Já recebi*. O cabeçalho soma só quem
  **ainda não** pagou.
* **Ciclo aberto** (`Dividido com`): a mesma lista, recolhida num `<details>`,
  rotulada como prévia — o texto compartilhado diz "até agora (fecha em
  05/10)", senão a pessoa do outro lado recebe uma cobrança que ainda vai mudar.

**`x.recebido`** é um objeto na própria fatura arquivada, `{idPessoa: data}`.
Mora ali, e não no cadastro da pessoa, porque "a Mãe já me pagou" é verdade
sobre UMA fatura: no mês seguinte a cobrança é nova. Cobrar de novo o que já
foi pago é o erro que estraga a relação com quem divide a conta.

`enviarCobranca` usa `navigator.share` quando existe (no celular é o caminho do
WhatsApp) e cai para a área de transferência quando não — e o `copiar()` tem o
plano B do textarea escondido, porque `navigator.clipboard` não existe em todo
contexto. `AbortError` do share é a pessoa fechando a folha: não é erro, não
mostra aviso.

## Os atalhos de gasto seguem o SEU dinheiro (v9.6)

Antes: seis atalhos por frequência, e o resto preenchido com `CHIP_PADRAO` na
ordem em que a lista está escrita — mercado primeiro, sempre. Quem gasta em
transporte e quase nada em mercado via "Mercado" em destaque e não tinha atalho
nenhum para estacionamento.

Agora `categoriasPorGasto()` ordena as categorias pelo dinheiro real da pessoa
(ciclo aberto com peso 3, quatro últimas faturas com peso 1) e a folha é montada
nesta ordem:

1. os seis nomes que ela mais lança;
2. os extras (`CHIP_EXTRA`) das **duas** categorias onde mais gasta — é isto que
   faz estacionamento, Uber e pedágio aparecerem para quem vive no carro;
3. um nome por categoria ainda não coberta, também na ordem do gasto — **toda
   categoria continua a um toque**, que era o ponto da correção anterior;
4. o que sobrar, com os extras das categorias seguintes.

`CHIPS_MAX` subiu de 10 para 12.

**A regra dos nomes vale para as duas listas: cada um tem que cair na categoria
que promete.** Há uma conferência automática para isso — 35 nomes, todos
passando pelo `classificar()` de verdade. Se mexer em `CHIP_PADRAO` ou
`CHIP_EXTRA`, rode-a de novo; um atalho que cai na categoria errada é pior do
que não existir.

O exemplo embaixo do campo (`exemploRapido`) também deixou de ser fixo: ele usa
o primeiro atalho da pessoa com o valor que ela mesma lançou naquela linha.
"Ex.: mercado 820" para quem não faz mercado ensina o formato com um gasto que
ela não tem.

## A folha de lançamento encolheu (v9.7)

Eram onze campos numa grade, todos ao mesmo tempo, um deles desabilitado
(`$('#lParc').disabled=true`) esperando alguém escolher "parcelado". Campo
desabilitado ocupa espaço sem servir para nada, e onze campos de uma vez fazem
parecer difícil o que é fácil.

Agora são **quatro à vista** — o que foi, valor, repetição, quem paga — e o
resto aparece por consequência:

* `ajustarCamposForm()` mostra **parcelas** só quando a repetição é parcelado, e
  **quanto a outra pessoa cobre** só quando alguém divide. É chamada da troca de
  repetição, da troca de pagador, na partida e depois de cada lançamento.
* Categoria, peso, onde caiu, vence dia e "entra na fatura" foram para uma
  gaveta interna (`#mais2`) — são ajuste fino, não decisão.

Cuidado ao testar `<details>` com Playwright: no Chromium atual o conteúdo de um
`details` fechado é escondido com `content-visibility`, então **`offsetParent`
continua não-nulo** e um teste ingênuo diz que o campo está visível. Use
`checkVisibility({checkVisibilityCSS:true, contentVisibilityAuto:true})`.

## O palpite pelo nome vale nos DOIS caminhos (v9.7)

`classificar()` já existia e acertava, mas morava dentro de `lerRapido()` — do
campo rápido. O formulário completo não adivinhava nada: quem escrevia
"Estacionamento" ali tinha que achar "Carro e transporte" numa lista de dez, com
a resposta certa a uma chamada de distância.

**`palpiteDoNome(nome)`** é agora o lugar único: categoria, peso, repetição e
conta. `lerRapido()` a usa, e `palpitarNoForm()` também — enquanto a pessoa não
mexer na categoria à mão (`catNaMao`), ela vai sendo preenchida a cada tecla, e
a linha `#lPalpite` diz o que o app entendeu com um "trocar" que abre a gaveta.
Se ela mexer, o app **para de adivinhar**: a escolha dela vale mais que a regra.

Dentro de `palpiteDoNome` o histórico manda por cima das regras — um nome já
usado herda tudo do lançamento anterior, inclusive uma categoria corrigida na
mão. E ali é `S.lanc` inteiro, não `doCiclo()`: aprender o nome não tem nada a
ver com em qual fatura o gasto caiu.

### As regras de categoria cresceram

Uma medição antes de mexer: de 81 nomes comuns, **21 caíam em "outros"**. Depois
das adições (manutenção, borracharia, troca de óleo, detran, multa, lava rápido,
zona azul e seguro do carro em transporte; lanchonete, quentinha, self service,
salgado, pastel e `eats` em comida; faxineira, encanador, pedreiro, veterinário
em casa; remédio, óculos, fisioterapia, nutricionista, clínica em saúde; show,
viagem, hotel, airbnb, teatro, barbeiro, manicure em lazer; matrícula, inglês,
autoescola em estudo; sicredi, sicoob, picpay, C6 e afins em dívida) sobraram
**3**: bebida, refrigerante e correios — genuinamente ambíguos, e para esses
"outros" é a resposta honesta.

`eats` entrou em COMIDA de propósito, e funciona porque comida é testada antes
de transporte: "uber eats" ia para transporte por causa do `\buber\b`.

**A ordem do array `REGRAS` é significativa** — a primeira que casa ganha. Lazer
vem primeiro, então não dá para pôr ali termos genéricos como "parque", que
roubaria "estacionamento do parque" de transporte.

Há dois testes automáticos guardando isto: 126 nomes contra a tabela de
promessas por categoria, e os 35 nomes de atalho contra o `classificar()` de
verdade. Quem mexer nas regras roda os dois — uma regra nova que rouba um nome
de outra categoria é silenciosa.

## Nem todo gasto passa pelo cartão (v9.8)

A parcela da moto paga no Pix é gasto do mês, conta no teto e derruba a sobra —
mas **não está na fatura**, e somá-la ali inflava o valor que vence no dia 12.
No vencimento se paga a fatura do cartão, não as contas já quitadas por fora.

**`l.meio`** separa as duas coisas:

* `'cartao'` — o padrão, e o que todo lançamento gravado antes desta versão é
  (o campo não existe neles, e `naFatura()` lê a ausência como cartão).
* `'avista'` — Pix, débito, dinheiro. Já saiu da conta.

**A distinção é só sobre COBRANÇA.** Peso, categoria, teto, sobra do mês e a
divisão com outra pessoa continuam valendo igual para os dois: o dinheiro saiu
do bolso do mesmo jeito. O que muda é uma linha em `calc()` e uma em
`fecharCiclo()` — `bruto` passa a somar só `naFatura(l)`, e o resto vai para
`avista`. Daí em diante tudo que já lia `bruto` ficou certo de graça: o cartão
*Fatura fechada a pagar*, o alerta de vencimento, o lembrete da agenda e
`faturaAPagar()`.

`hist[].avista` guarda o mesmo corte na fatura arquivada. As faturas gravadas
antes disto não têm o campo, e zero é a verdade para elas: naquela época tudo
era cartão.

Três detalhes que custaram teste:

1. **O rodapé da tabela precisou de três linhas.** Com gasto à vista no meio,
   uma linha de total só mentiria — a coluna "Na fatura" e a coluna "Meu" passam
   a somar coisas diferentes. Agora são "Na fatura do cartão", "Fora dela" e
   "Total do ciclo"; sem gasto à vista, continua uma linha só.
2. **`meioDoTexto()` roda ANTES de procurar o valor** em `lerRapido()`. O leitor
   procura o número no fim da frase, e em "moto 890 pix" o número não é o último
   pedaço — respondia "falta o valor". Tirando o "pix" primeiro sobra
   "moto 890", que ele entende. A palavra também sai do nome, senão o gasto se
   chamaria "Moto pix".
3. **`avista` zera `prox`.** "Entra na próxima fatura" não existe para quem já
   pagou — o campo some do formulário e o link some da tabela.

O alerta de fechamento parou de dizer "estão na fatura X (Y seus)": com gasto à
vista, Y pode ser MAIOR que X, e a frase entre parênteses lida como parte do
todo. Agora são duas frases separadas.

`.rot` já existia em CAIXA ALTA para outra coisa no `styles.css` — o rótulo do
segmented control usa `.rot-seg`, que imita os `<label>` vizinhos. Cuidado ao
criar classe nova com nome curto e genérico.

## O padrão é COMPRA ÚNICA (v9.9)

Duas coisas erradas se somavam numa garrafa de água de R$ 7,50: ela caía em
"Casa e contas", e o app a tratava como gasto que volta todo mês.

**O app NUNCA decide sozinho que um gasto se repete.** Antes
`palpiteDoNome()` só sabia duas respostas — `casa`/`assinatura`/`RECORRENTE`
viravam `fixo`, e **todo o resto** virava `var`. Só que `var` não quer dizer
"gasto qualquer": `fixo` e `var` são linhas que SOBREVIVEM ao fechamento. Um
gasto marcado assim por engano volta na fatura do mês seguinte, e do outro, e do
outro — sozinho, sem ninguém ter pedido, engordando o mês com dinheiro que não
saiu. Uma compra única marcada como única não corre risco nenhum: no pior caso a
pessoa lança de novo no mês que vem, que é o que ela faria de qualquer jeito.
**O erro custa coisas muito diferentes dos dois lados, e por isso o lado barato é
o padrão.**

Uma primeira versão tentou adivinhar melhor (`tipoDoNome()`, com
`CONTA_MENSAL` e `MENSAL_VARIAVEL`: luz e internet viravam `fixo`, mercado e
combustível viravam `var`). Foi retirada de propósito — adivinhar melhor ainda é
adivinhar, e o palpite errado aqui cria uma conta que a pessoa não pediu. Hoje
`palpiteDoNome()` devolve **sempre** `tipo:'unico'`; repetir é escolha, feita no
campo *Repetição*.

Duas portas dos fundos ficaram fechadas junto:

1. **O histórico não herda mais a repetição.** Herdava, e um `var` adivinhado
   por uma versão antiga voltaria a se propagar pelo nome.
2. **`addLanc` devolve `#lTipo` a "compra única" depois de cada lançamento** —
   senão o "todo mês" escolhido para o aluguel pegaria carona no cinema lançado
   logo em seguida, e ninguém confere um campo que já estava certo da última vez.

Isso não tira nada de quem tem conta fixa de verdade: ela é lançada UMA vez e o
app a carrega ciclo a ciclo sozinha. Adivinhar só serviria para o primeiro
lançamento — e é exatamente ali que o engano nasce.

**Os rótulos passaram a dizer o que a coisa é.** "Só neste mês" lia-se como
filtro de exibição, não como a natureza do gasto; e "1x" na lista não dizia nada
a ninguém. Agora o select é *Compra única — não repete* / *Todo mês, valor muda*
/ *Todo mês, valor igual* / *Parcelado*, **nessa ordem** — a compra única vem
primeiro porque é o caso comum e porque a primeira `<option>` é o padrão da
folha. O selo da tabela virou "única", e o de *Últimos lançamentos*, "compra
única" e "todo mês".

### O app aprende com as CORREÇÕES, não com os próprios palpites

`palpiteDoNome()` deixava qualquer lançamento de mesmo nome mandar por cima das
regras. O efeito: um palpite errado se perpetuava. "agua" tinha caído em Casa e
contas uma vez, então continuava caindo lá **mesmo depois de a regra ser
corrigida** — o app estava aprendendo com o próprio erro.

Agora só a escolha da pessoa vale mais que a regra de hoje, marcada em
**`l.catManual`**: `true` quando ela mexeu na categoria à mão, no formulário
(`catNaMao`) ou no select da tabela. Sem essa marca, a regra atual decide. O
`fonte` continua vindo do lançamento anterior de mesmo nome, com marca ou sem.

### "Água" sozinha é bebida; a conta pede contexto

`\bagua\b` estava só em `casa`, então qualquer água era conta de consumo. Mas
quem escreve "agua 7,50" comprou uma garrafa. Agora o termo solto está em
**comida**, e a conta é reconhecida pelo contexto: `conta de água`, `água e
esgoto`, `sanepar`, `sabesp`, `copasa`, `cedae` e afins.

Essa regra de conta de consumo é a **primeira** do array `REGRAS`, e isso não é
arrumação: `comida` é testada antes de `casa`, então sem ela "conta de água"
cairia em comida pelo próprio `\bagua\b`. Pelo mesmo motivo o atalho de casa
deixou de se chamar "Água" e virou **"Conta de água"** — um atalho tem que cair
na categoria que promete, e há conferência automática para isso.

### Categoria errada se arruma na própria linha

A coluna *Categoria* da tabela era texto. Quem tivesse um gasto no lugar errado
— a água em "Casa e contas", por exemplo — só tinha um caminho: apagar e lançar
de novo. E o erro se repetia, porque `palpiteDoNome()` aprende com o histórico.

Agora ela é um `<select>` (`data-cat`), irmão do de "quem paga" que já morava na
linha; as `<option>`s vêm de **`opcoesCat(sel)`**, que o `#lCat` do formulário
também usa. Trocar ali corrige o gasto **e** ensina o app.

**Não há migração automática de categoria**, e isso é decisão, não esquecimento:
dentro de "casa" cabem tanto a garrafa de água quanto a conta da Sanepar, e
adivinhar qual é qual no estado de quem já usa o app trocaria um erro por outro.
O que a versão nova conserta sozinha é o FUTURO: como o palpite deixou de herdar
de si mesmo, o próximo "agua" já nasce em Comida — a linha antiga é que precisa
do toque no select.

## O teto deixou de ser regra genérica (v10)

Até aqui o app dividia o disponível pelos pesos fixos de `CATS` — os mesmos
para todo mundo. Quem quase não faz mercado mas vive dentro do carro recebia
R$ 700 de teto de mercado e um teto de transporte que estourava todo mês. A
distribuição estava certa na média e errada em cada pessoa.

**`orcamentoAdaptativo(c)`** aprende do histórico de faturas fechadas e propõe
uma distribuição que reflete o gasto real. Três regras governam o motor:

1. **Nunca aplica sozinho.** Toda sugestão aparece com o motivo escrito
   (`motivoDoTeto`) e um botão. Mexer no teto de alguém sem explicar é o mesmo
   que errar.
2. **Aprende de faturas FECHADAS**, nunca do ciclo aberto. O ciclo em formação
   está pela metade; entrar na média puxaria todo teto para baixo no dia 6 e
   para cima no dia 28. O ciclo aberto tem outro papel — a previsão.
3. **Muda devagar.** `mediaPonderada()` cruza quatro janelas — 1, 3, 6 e 12
   ciclos, com pesos .40/.30/.20/.10. Uma janela que o histórico ainda não cobre
   inteira vale proporcionalmente menos (`cobertura`), então com três faturas a
   janela de 12 meses opina pouco em vez de opinar com dados que não existem.

Nada disso fala com serviço nenhum: é estatística do próprio histórico rodando
no aparelho, como manda a decisão de projeto do `auth.js`.

### As decisões que custaram teste

* **O teto cobre o mês apertado, não a média.** Um teto na média estoura em
  metade dos meses por definição. `picoTipico()` devolve o **segundo** maior dos
  últimos seis — o maior é o acidente (a revisão dos 40 mil km), o segundo é o
  mês apertado que se repete. O teto é `max(média × folga, pico típico)`, e a
  folga vem da `volatilidade()`: 1,12 para categoria estável, 1,4 para a que
  oscila.
* **Arredondar é pra cima, somar não pode ser.** `arredondaTeto()` sobe para o
  próximo múltiplo (R$ 250, não R$ 247,80) — mas somados, os arredondamentos
  passavam do disponível, e um painel que distribui mais do que existe não vale
  nada. O excesso volta tirado **sempre do maior teto**: R$ 25 a menos em
  R$ 1.050 não muda a vida de ninguém; os mesmos R$ 25 tirados de R$ 80 zeram a
  categoria.
* **Categoria sem uso recebe piso, não zero.** Um teto zero faria o primeiro
  gasto avulso nascer estourado.
* **Quando o padrão não cabe na renda**, o corte sai primeiro de lazer, comida
  fora e assinatura — o que a própria pessoa classifica como cortável — e só
  depois, se ainda faltar, de todo mundo. Cortar proporcionalmente logo de cara
  tiraria do mercado tanto quanto do rolê.
* **A sobra tem dono.** O que sobra de categorias ociosas vira um botão que
  aumenta a meta de guardar (`S.metaVal`), com o número que está na tela.
  Dinheiro sem dono vira gasto sem querer.

### Perfil, previsão e o estado novo

`perfilFinanceiro()` lê a proporção real dos últimos seis ciclos e a taxa do que
sobra. A ordem de `PERFIS` importa — a primeira regra que casa ganha, e as
específicas (viajante, automotivo) vêm antes das genéricas; `equilibrado` é o
fim de linha que sempre casa. Viajante sai dos NOMES dos itens arquivados
(`TERMOS_VIAGEM`), não da categoria: viagem mora dentro de lazer.

`previsoes(c)` olha o ritmo do ciclo aberto e diz em quantos dias a categoria
bate no teto — enquanto ainda dá para decidir. Exige 5 dias corridos de ciclo
(ritmo de três dias é ruído) e aparece em dois lugares: no painel de tetos, com
botão de ajuste, e como insight na tela **Hoje**. O aviso de "passou do teto",
que já existia, é sobre dinheiro que saiu; este é sobre dinheiro que dá para
segurar, e por isso vem antes na lista.

Dois campos novos no estado, ambos viajando na conta: **`S.orcaOculto`** guarda
o NÚMERO DE CICLOS em que a pessoa dispensou as sugestões — assim elas voltam
sozinhas quando a próxima fatura fechar, sem precisar de data; e **`S.orcaEm`**,
a data da última aplicação. Aplicar grava em `S.tetos`, que é o mesmo campo do
teto travado à mão: não existe um segundo lugar de verdade sobre teto, e
*Voltar aos tetos sugeridos* continua limpando tudo.

## O botão do perfil abria e fechava no mesmo clique (v10.1)

Clicar no rosto do cabeçalho não abria nada. Não era CSS, não era `z-index`, e o
botão recebia o clique normalmente — a prova que separou as hipóteses:
**clicar na borda do botão funcionava, clicar no ícone não.**

A cadeia: `abrirMenu()` chama `pintarMenuPerfil()`, que chama
`pintarAvatares()`, que fazia `pb.innerHTML = botao`. Trocar o `innerHTML`
**destrói o `<svg>` de dentro do botão** — e o `<path>` destruído era justamente
o alvo do clique em curso. Quando o evento subia até o ouvinte de "clicou fora,
fecha o menu", `e.target.closest('#perfilBtn')` já devolvia `null`: o alvo não
estava mais no documento. O menu abria e fechava na mesma propagação, e o botão
parecia morto. Na borda o alvo é o próprio `<button>`, que não é substituído —
por isso ali funcionava.

Corrigido nos dois níveis, porque cada um resolve uma coisa:

1. **`pintarAvatares()` só escreve quando o desenho muda** (`pintarSeMudou`).
   Isso mata a causa e ainda evita repintar o cabeçalho a cada render.
2. **O ouvinte de "clicou fora" pergunta ao CAMINHO do evento**, não ao alvo:
   `cliqueVeioDe(e, sel)` usa `composedPath()`, que é calculado no disparo e não
   muda depois — responde certo mesmo que outro ouvinte tire o alvo do documento
   no meio do caminho. `closest` fica como reserva.

**A lição que vale para o resto do arquivo:** nenhum ouvinte de clique pode
reescrever o `innerHTML` do elemento que foi clicado enquanto o evento ainda
está subindo. Se precisar repintar, ou compare antes de escrever, ou deixe para
o próximo quadro.

Verificado com sessão real (conta de teste criada pelas APIs REST e **apagada
depois**, como manda a nota acima): clique no ícone abre, segundo clique fecha,
clique fora fecha, *Editar perfil* leva para a aba da conta, e o mesmo rosto na
tela de cartas (`#portalPerfil`, que tinha o mesmo defeito) também abre.

## Barras 3D de onde cortar (v10.2)

`viz3d.js` desenha, na aba *Análises → O que fazer, em ordem*, uma cena 3D dos
gastos do ciclo. **Duas dimensões de dado é o que justifica a terceira dimensão
de tela** — sem isso 3D é enfeite:

* **altura** — quanto você gasta ali;
* **profundidade** — o peso. *Pode cortar* na fileira da FRENTE, *essencial* na
  de trás.

Daí sai a leitura que a barra 2D não dá num olhar: barra alta na frente é
dinheiro grande que a própria pessoa classificou como cortável. Alta e no fundo
é caro e necessário — não é corte, é negociação. **A cor continua sendo a
CATEGORIA** (regra das cores de dado do projeto): a fileira da frente ganha
contorno e opacidade cheia, não uma cor própria. Pintar tudo de vermelho apagaria
justamente a informação de ONDE cortar.

Canvas 2D com projeção em perspectiva escrita à mão, como o `intro.js` — e pelos
mesmos motivos, que vale repetir porque a tentação volta: `script-src 'self'` na
CSP recusa CDN, o app é offline-first, e vendorizar meio megabyte para desenhar
trinta caixas custaria mais que o app inteiro. São ~150 polígonos por quadro,
ordenados do fundo para a frente (algoritmo do pintor) — com faces convexas e
opacas isso dispensa buffer de profundidade.

### O que custou teste

* **A cena se enquadra sozinha** (`enquadrar()`). Girando, a silhueta muda de
  largura o tempo todo: com escala fixa, ora metade do gráfico saía da caixa,
  ora sobrava um deserto. Agora cada quadro projeta primeiro *sem* escala,
  calcula o retângulo que contém tudo — cantos das barras, quinas do chão e
  âncoras dos rótulos — e só então escala e centraliza.
* **A calha dos rótulos é MEDIDA** (`medirCalha`), não chutada: com 70px fixos
  "Pode cortar" saía cortado pela borda, porque a largura da fonte do sistema
  muda entre aparelhos.
* **O toque acerta pelo TAMPO da barra**, com teste de ponto-em-polígono e as
  mais próximas testadas primeiro. Pela distância até o centro, barra baixa e
  barra alta vizinhas disputavam o dedo e a errada ganhava.
* **`touch-action:pan-y`** no canvas: arrasto horizontal gira, vertical continua
  rolando a página. Um gráfico de 300px que engole a rolagem é pior que um
  gráfico sem giro.
* **Fora da tela não se desenha.** A aba pode ficar escondida por horas com o
  gráfico montado; girar uma cena que ninguém vê é bateria queimada.
* **A cena não é remontada a cada `render()`** — uma CHAVE (categoria, peso,
  valor e tema) diz se mudou alguma coisa. Sem isso o giro voltava ao zero a
  cada tecla digitada em outra tela.
* **Menos de duas barras não é gráfico**, é uma caixa girando: aí a caixa fica
  escondida e a lista embaixo diz tudo.

As cores saem do CSS (`rgbDe` resolve `var(--c10)` mesmo quando ela aponta para
outra var, pedindo a cor computada de um elemento fora da tela), então o gráfico
acompanha a troca de tema — `aplicarTema()` chama `repintar()`. Por isso
`viz3d`/`viz3dChave` são declaradas **no topo do `app.js`**, junto de `cena`:
`aplicarTema()` roda na partida, antes do fim do arquivo, e um `let` lá embaixo
estaria na zona morta temporal.

## Calendário de contas, e o gasto que se edita (v10.3)

Três buracos que andavam juntos: não dava para **editar** um lançamento (só
apagar e refazer), não dava para ver **quando** cada conta cai, e "quantas
parcelas faltam" era um número sem resposta — a pergunta real é *quando isso
acaba*.

### `contasDoMes(ano, mes)` — o futuro projetado do que já está lançado

Cada tipo de gasto se projeta de um jeito, e é isso que o calendário mostra:

* **parcelado** — sabe onde termina: `pRest` diz quantas faltam, `venc` diz o
  dia, e a última ganha o rótulo de **última parcela** (a informação que a
  pessoa quer: "quando é que essa moto acaba?").
* **todo mês (fixo ou variável)** — não termina. Segue mês a mês, marcado como
  **sem data de fim** — que é literalmente o "até eu dizer que não quero mais"
  de quem não sabe quantas mensalidades de faculdade ainda vêm.
* **compra única** — aparece uma vez, no vencimento dela.
* **a fatura do cartão** — todo mês no `diaVenc`, porque é a maior conta do mês.
  **Só a próxima leva valor**: as outras ainda vão ser formadas, e escrever um
  número ali seria chute com cara de dado.

**O passado não é reconstituído**, e isso é decisão. O app guarda faturas
fechadas, não um diário de pagamentos por dia; desenhar ocorrências passadas a
partir das regras de HOJE inventaria um histórico que ninguém viveu. Mês
anterior mostra uma linha dizendo isso, com o caminho para *Análises → Faturas*.

`diaNoMes()` resolve os meses curtos: quem vence dia 31 vence dia 28 em
fevereiro, não some do mês.

### A tela

Ocupa a tela quase inteira de propósito — num quadradinho não se vê o mês, e ver
o mês é o motivo de existir. **Passar o mouse por cima do dia já mostra as
contas** (`mouseenter` e `focus`); no toque não existe "passar por cima", então
o clique faz o mesmo, e o `focus` faz o teclado andar. `‹ ›` andam mês a mês,
`« »` ano a ano, as setas do teclado também, e `Esc` fecha com
`stopImmediatePropagation` — pelo mesmo motivo do menu de perfil, os dois
ouvintes de Esc estão no mesmo `document`.

Duas armadilhas de camada, as duas já conhecidas do projeto:

1. **`.cal` entrou na lista das superfícies opacas** de `styles.css`. É uma tela
   cheia sobre o conteúdo do app; sem isso, com a esfera ligada, repetiria o
   defeito da `.retro`.
2. **`body.cal-aberto` esconde a `.tema-flutua`**, que vive em `z-index:180` e
   caía exatamente sobre as setas de navegação.

O painel do lado nunca fica vazio: sem dia escolhido mostra o resumo do mês e a
lista de dias; painel vazio parece defeito. Abaixo de 760px ele vira rodapé —
38% de 390px não é coluna, é uma tira onde nada cabe.

### Editar um lançamento

A tabela já deixava mudar valor, categoria, quem paga e a forma de pagamento
direto na linha, que é o certo para esses. O resto — nome errado, virou
parcelado, faltam 8 e não 10, o dia de vencimento — só apagando e lançando de
novo, o que ainda destruía o histórico que `palpiteDoNome()` usa para aprender.

`abrirEdicao(id)` abre uma folha irmã da de novo gasto, com os mesmos rótulos de
propósito: quem aprendeu a lançar não precisa aprender a editar. Ela se abre da
tabela, da lista de *Últimos lançamentos* e de dentro do calendário. Dois
cuidados que o código guarda:

* **Mexer na categoria à mão grava `catManual`** — é a mesma marca do select da
  tabela, e é ela que ensina o app.
* **Trocar o dia de vencimento apaga a marca de "já paguei"**: ela era sobre a
  data ANTIGA, e mantê-la esconderia a conta pelo mês inteiro.

### "Faltam 8 parcelas" virou "termina em abril de 2027"

`fraseDoPrazo(tipo, faltam, dia)` é a mesma frase nos dois formulários, e ela
muda de assunto conforme o tipo: no parcelado diz o mês da última; no *todo mês*
diz o contrário — que **não** termina. **`#lVenc` saiu da gaveta** e passou a
ficar ao lado das parcelas, aparecendo para tudo que se repete: é o par
`pRest` + `venc` que o calendário usa para espalhar a conta pelos meses, e com o
dia escondido a parcela não tinha onde cair.

## O calendário ficou vivo (v10.4)

Três acréscimos, e os três respondem à mesma crítica: um calendário que só marca
dias diz *quando*, e "e daí?" é a pergunta seguinte.

**Editar a fatura pelo próprio calendário.** A fatura é a única linha do
calendário que não é um lançamento: ela nasce de `S.diaFech` e `S.diaVenc`. Por
isso o *editar* dela abre um bloco de datas do cartão em vez da folha de edição —
o que está em jogo é a régua do mês inteiro, não uma linha. Os mesmos dois campos
seguem existindo em *Renda e meta*, e ter os dois lugares é de propósito: quem
percebe a data errada olhando o calendário conserta ali. **Mudar o dia do
fechamento refaz `S.ultimoFech`**, como manda a nota da v9.4 — sem isso o app
viraria o ciclo na hora errada. O bloco também traz o *Já paguei* da fatura
fechada e o aviso de fechar-e-vencer no mesmo dia, com o botão que corrige.

**`observacoesDoMes()` — o lado que fala.** Frases tiradas do MESMO `porDia` que
desenhou o mês (não de uma segunda fonte, senão texto e desenho podem
discordar): o dia mais pesado, quanto do mês é parcela, a parcela que termina
neste mês e o que sobra depois dela, o peso das contas na renda, quando cai a
próxima, e quais contas não têm fim. **Cada uma só aparece quando tem o que
dizer** — observação genérica em toda tela vira ruído e a pessoa para de ler o
painel inteiro.

**A tira dos 12 meses.** Uma barra por mês, clicável, mostrando o total que
vence. É o que nenhum mês sozinho mostra: as parcelas acabando em degraus. Ela
**começa no mês de hoje, não no mês que está sendo olhado** — o passado não é
reconstituído (barras vazias pareceriam meses sem conta), e uma régua que anda
junto com a navegação deixa de ser régua.

Detalhes que custaram medição:

* **A tira é grade, não flex-column.** Em flex o rótulo comia a altura e a barra
  de 100% chegava a 47px de 64 — a mais alta do mês nunca encostava no teto.
  Com `grid-template-rows:1fr auto` a barra fica com a linha de cima inteira.
* **As setas do teclado fazem duas coisas**, decididas pelo lugar: com um dia em
  foco andam pelo mês (±1, e ±7 na vertical, que é a semana); fora da grade andam
  pelos meses. Ao sair do mês, param na borda do vizinho — tentar acertar "o dia
  correspondente" entre meses de tamanhos diferentes gera mais surpresa que ajuda.
* **O painel volta ao topo ao virar o mês**: rolado no meio, a troca mostra um
  pedaço de texto sem cabeça e parece que nada mudou.

### O calendário tem ícone no cabeçalho (v10.5)

O calendário abria só pela tela **Hoje**, e ele não é uma tela de Hoje — é uma
camada que serve a qualquer momento. Agora existe um ícone no cabeçalho, ao lado
do tema, que abre de onde a pessoa estiver.

Ele **não virou uma quinta aba** de propósito: a barra de baixo lista ÁREAS
(`AREAS`, com `aria-selected` e sub-abas), e o calendário é uma camada sobre o
app, como o menu de perfil. Uma aba que abre uma camada e não muda a área mente
sobre o que a barra significa.

O botão grande em *Hoje* continua onde estava — ele é a descoberta para quem
ainda não sabe que existe calendário; o ícone é o atalho de quem já sabe. E a
`.eyebrow` teve o `padding-right` aumentado nos dois tamanhos: ela reserva o
espaço do canto direito do cabeçalho, e um botão novo sem esse ajuste faria
"Controle financeiro pessoal" passar por baixo dos ícones.

## O calendário quebrado com a esfera ligada (v10.6)

Com a esfera de fundo ligada e o app no tema **claro**, o calendário abria
ilegível: título azul-escuro sobre quase-preto, setas invisíveis, células
brancas soltas no meio do escuro.

A causa foi a correção anterior mal aplicada. A nota da `--bg: transparent` manda
toda camada nova entrar na lista das **superfícies opacas**, e eu pus a `.cal`
lá dentro — só que aquela lista não diz "seja opaca": ela pinta **`#08131F`
fixo**. Isso funciona para as superfícies pequenas que flutuam sobre a esfera
(menu, folha, snack), mas o calendário é uma TELA INTEIRA cujo conteúdo usa as
variáveis do tema. No claro o resultado foi texto escuro sobre fundo escuro, com
`--fill` e `--card-2` ainda claros nas células.

A regra da lista continua valendo — **opaco, sempre** —, mas para tela cheia a
cor tem que vir do tema:

```css
[data-tema="claro"]  body.fundo-vivo .cal{background:#FFFFFF}
[data-tema="escuro"] body.fundo-vivo .cal{background:#08131F}
```

**A lição, que vale para a próxima camada:** entrar na lista não é o objetivo; o
objetivo é ser opaca *no tema em que se está*. Camada pequena aceita o escuro
fixo porque o conteúdo dela é curto e escrito para esse fundo; tela cheia, não.
Ao criar uma, teste com a esfera LIGADA **nos dois temas** — foi só assim que
isto apareceu.

Junto: na lista de dias do mês, valor zero deixou de virar "pago". A fatura dos
meses à frente entra sem valor porque ainda vai ser formada, e o dia aparecia
como quitado. Agora só diz "pago" quando TODOS os itens do dia estão marcados;
os outros mostram um traço.

### O ícone também na tela de cartas

O calendário passou a abrir de três lugares: o botão grande em *Hoje*, o ícone do
cabeçalho e agora o ícone da **tela de cartas** (`#portalCal`), que é a primeira
coisa que aparece na abertura. Nenhum deles é "a" porta — cada um cobre um lugar
onde a pessoa está quando lembra do calendário.

Ele entrou na `.portal-barra`, junto do perfil e do tema, e **não como uma quinta
carta**: as cartas são áreas do app, e o calendário é uma camada que abre por
cima de qualquer uma delas. A barra é `space-between`, então a tecla nova ganhou
`margin-left:auto` — sem isso ela boiava sozinha no centro da tela, sem formar
grupo com o tema.

## "O orçamento está contando o dinheiro dos outros" (v10.7)

A queixa era essa, e a medição diz o contrário: **o motor sempre contou só a
parte de quem usa o app**. `meuValor(l)` é `valor - pai`, e é ele que soma em
`calc()`, nos tetos, na sobra do mês e no *quanto posso gastar*. Medido com
fatura de R$ 2.400 e R$ 1.100 de terceiros: gasto R$ 1.300, e cada categoria
entra só com a fatia própria (estudo 500 de 1000, assinatura 100 de 200).

O defeito era de LEITURA, e ele é real: o resumo dizia "Gastou R$ 1.698" sem
contar que aquilo já era só a parte dela, a fatura cheia aparecia em outra tela,
e quem lia as duas concluía — com razão — que o app estava comendo o orçamento
com dinheiro dos outros. Número certo que a pessoa não consegue conferir vale
tão pouco quanto número errado.

**`resumoDivisao(c)`** põe os três lado a lado em Hoje, e eles fecham em conta:
*total lançado = minha parte + terceiros*. Nenhum é novidade no motor — o bloco
só os mostra juntos, com a lista de quem paga o quê. Ele **só aparece quando há
gasto dividido**: sem divisão os três seriam o mesmo valor repetido, e um bloco
que não informa nada ensina a pular o que vem depois dele. A frase do resumo de
Análises ganhou a mesma distinção, também só quando `c.pai > 0`.

### Dividir deixou de exigir conta de cabeça

O campo perguntava "quanto a outra pessoa cobre", e quem pensa "eu pago metade"
tinha que calcular o complemento. Agora há três atalhos — **Metade**, **Ela paga
tudo**, **Só meu** — e, embaixo, a frase em reais: *"Pai cobre R$ 500 · sua
parte: R$ 300 — e é só ela que entra no seu orçamento"*. O campo continua para a
divisão torta (R$ 300 eu, R$ 500 ela), que é justamente o caso que atalho nenhum
cobre. Os mesmos três atalhos estão na folha de lançar e na de editar,
`pintarDivisao(pre)` serve as duas pelo prefixo do id.

**O que continua não existindo:** dividir UM gasto entre três ou mais pessoas.
`l.com` aponta para uma pessoa e `l.pai` guarda um valor. Gastos diferentes com
pessoas diferentes já funcionam (faculdade com o pai, assinatura com o Gui);
rachar a mesma conta em três, não.

## Um gasto dividido entre VÁRIAS pessoas (v10.8)

Até aqui um gasto se dividia com uma pessoa só: `l.com` guardava o id e `l.pai`
o valor que ela cobre. Isso dá conta de "faculdade com o pai" e "assinatura com
o Gui" — gastos diferentes, pessoas diferentes —, mas não de rachar a MESMA
conta em três: o jantar, o presente coletivo, o aluguel com dois colegas.

Agora existe **`l.divs`**, uma lista `[{id, valor}]`.

**`l.pai` continua sendo a SOMA do que terceiros cobrem, e continua com esse
nome**, pela mesma razão da v9.2: ele está gravado nas faturas arquivadas, nos
backups em arquivo e no CSV que as pessoas já baixaram. `divs` é o DETALHE,
`pai` é o total, e **`sincronizarDivs(l)` mantém os dois de acordo** — chamá-la
depois de escrever em `divs` é obrigatório. `l.com` também fica, apontando para
a MAIOR fatia: quem ler o lançamento sem conhecer `divs` (uma versão antiga do
app noutro aparelho, o CSV velho) continua vendo uma pessoa e um total que
fecham.

**`meuValor()` não mudou uma linha.** É por isso que o orçamento, os tetos, a
sobra do mês e o *quanto posso gastar* continuaram certos sem saber que o campo
novo existe — eles leem `valor - pai`, e `pai` continua sendo a verdade sobre
"quanto não é meu".

**`divisoes(l)` é o único lugar que lê a divisão**: devolve a lista quando ela
existe e monta uma de um item a partir de `com`+`pai` quando não. `fatiasPessoa`,
`cobrancas`, o CSV, a linha da tabela e o painel de pessoas passaram todos por
ela. Duas proteções moram ali: as fatias nunca somam mais que o valor do gasto
(baixar o valor corta o excesso, na ordem da lista), e **uma pessoa só não
guarda `divs`** — `sincronizarDivs` desfaz a lista e deixa o par antigo, que
qualquer versão do app entende.

### A interface

A lista mora **na folha de edição**, não na de lançar: dividir em três é caso de
edição, e a folha de lançar continua com quatro campos, como manda a v9.7. Lá o
select "quem paga" foi substituído por uma LISTA — select não sabe dizer duas
pessoas — com três botões: **+ pessoa**, **Dividir igualmente** e **Só meu**.

*Dividir igualmente* reparte entre MIM e as pessoas da lista: com duas pessoas
somos três, e cada um fica com um terço. **A minha parte não é escrita em lugar
nenhum** — é o que sobra do valor, e é assim que a conta fecha mesmo com
centavos que não dividem redondo.

Na TABELA, quando são várias pessoas, o select vira um botão *"N pessoas ·
editar"* e o campo de valor vira texto: usar um select de uma pessoa ali
colapsaria a divisão em silêncio, que é o pior defeito possível num campo de
dinheiro.

Conferido: jantar de R$ 300 entre mim, Gui e Ana dá R$ 100 para cada, o
orçamento conta R$ 100, a fatura arquivada leva a lista junto e as cobranças
saem itemizadas por pessoa. Apagar uma pessoa devolve a fatia dela para mim —
alguém tem que pagar.

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

## "editarfoi no Pix" — separador de texto não sobrevive à dobra (v10.9)

A primeira coluna da tabela de lançamentos era **um parágrafo só**: nome, conta,
peso, quem divide e as ações, tudo costurado com `·` entre os pedaços. Num
celular de 430px a linha dobrava no meio, e onde a linha dobra **o separador
some junto com o espaço** — o resultado na tela era `editarfoi no Pix` grudado,
com o *editar* perdido no meio de um texto corrido. A função de editar existia e
funcionava; o que não existia era um jeito de ver que ela estava ali.

A correção não foi encurtar o texto, foi **parar de usar texto como espaçamento**.
A célula virou três faixas empilhadas, cada uma com `display:flex` e `gap` — o
espaço passa a ser layout, e layout não desaparece na dobra:

* **`.lin-nome`** — o nome do gasto e os selos (única, parcela, à vista).
* **`.lin-meta`** — conta, peso e quem divide. Quando são várias pessoas elas se
  juntam por um `<i>+</i>` visível, não por um ponto: "+" continua legível
  sozinho no começo de uma linha nova; "·" no começo da linha lê-se como sujeira.
* **`.lin-acoes`** — **um botão só: `✎ editar`**. A primeira versão desta
  correção pôs três chips ali (editar, "foi no Pix", "jogar pra próxima"), e
  três chips lado a lado em 208px viram um amontoado — resolvia a colagem e
  criava ruído. As outras duas ações não sumiram: *Como pagou* e *Entra na
  fatura* já são campos da folha de edição, que é onde se muda um gasto. A
  linha oferece **o caminho**, não o painel de controle.

`#tbLanc td:first-child` ganhou `min-width:208px`. Sem isso a coluna encolhia até
caber uma palavra por linha e os chips viravam uma escada.

**A regra que fica:** separador desenhado com pontuação só funciona enquanto a
linha não dobra — e no celular ela sempre dobra. Se dois pedaços precisam ficar
separados, o espaço entre eles é `gap`, nunca um caractere.
