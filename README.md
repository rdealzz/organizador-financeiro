# Sobra do Mês — controle financeiro

App web (PWA) para responder uma pergunta só: **quanto sobra no fim do mês.**
Você diz quanto ganha e quanto quer guardar; o app divide o resto em tetos por
categoria, fecha a fatura sozinho na data do cartão, guarda o histórico e avisa
no celular quando o gasto foge do plano.

Cada pessoa tem sua conta. Os dados ficam numa linha só dela no banco,
protegida por Row Level Security — e uma cópia local mantém o app funcionando
sem internet.

## Abertura animada

Ao abrir o app aparece uma capa: uma nuvem de ~50 000 pontos em blending
aditivo — núcleo carmim, meio magenta, borda dourada — sobre fundo ameixa com
labaredas nos cantos e poeira à deriva. Um toque em qualquer lugar mergulha na
esfera e revela o app.

Adaptações conscientes (a cena de referência era uma página de rolagem):

* **Sem rolagem.** O mergulho acontece no clique de entrar, que é a própria
  transição para o app, usando os mesmos uniformes de dive/grow/spin.
* **Contagem por aparelho.** 50 000 pontos com dois passes de bloom derrubam o
  quadro num celular; lá usamos 14 000 e pulamos os dois composers extras — que
  nesta cena rendem preto de qualquer forma, porque a câmera não enxerga os
  pontos naquelas camadas.
* **Nunca bloqueia.** A biblioteca vem de CDN e carrega sob demanda. Sem WebGL,
  sem internet ou com "menos movimento" ligado no sistema, fica o degradê — que
  já é a versão final para esses casos — e o app abre igual.
* **Desligável** em *Ajustes → Conta*, por aparelho: quem usa todo dia não
  precisa de abertura toda vez.

## Perfil e assinatura

No canto superior esquerdo fica o **botão de perfil**: um ícone de pessoa num
botão redondo de 44 px, com um ponto verde quando há conta ativa. Clicando,
abre um menu com nome, e-mail, plano atual e os atalhos para
*Editar perfil*, *Assinatura*, *Alertas*, *Dados* e **Sair da conta**. Fecha com
Escape, com clique fora, e as setas do teclado percorrem os itens.

A aba **Assinatura** é esqueleto para um futuro SaaS, marcada como *Em breve*:
mostra o plano atual (Gratuito), o que já existe hoje e as ideias para uma versão
paga. **Não há forma de pagamento, cadastro de cartão nem cobrança** — e a tela
diz isso com todas as letras.

> **Aviso para quando isto virar SaaS de verdade:** o campo `S.plano` existe só
> para a interface saber o que desenhar. Ele é gravado pelo próprio usuário na
> coluna `dados`, então qualquer pessoa poderia se dar um plano pago editando o
> navegador. A fonte da verdade da assinatura tem que ser **uma tabela separada,
> escrita só pelo servidor** (ou pelo webhook do meio de pagamento) e apenas
> legível pelo dono — nunca o jsonb que o cliente controla.

## As quatro áreas

No celular e no tablet, barra fixa embaixo, no padrão de app de banco. **No
desktop (≥900 px) ela sobe para o topo**, em linha, com ícone e rótulo lado a
lado — barra de rodapé numa janela larga é desperdício de espaço e fica longe
do olhar. Os dois formatos usam o mesmo HTML.

Nenhum controle do app pode ser selecionado como texto (`user-select:none`): era
isso que pintava os rótulos de azul ao arrastar o mouse e fazia a barra parecer
quebrada.

Botão **Adicionar gasto** sempre visível abre a folha de lançamento, de qualquer
tela.

| Área | O que tem |
|---|---|
| **Hoje** | *quanto você pode gastar hoje*, insights do momento, para onde o dinheiro foi, contas a vencer e os últimos lançamentos |
| **Plano** | renda e meta de poupança · tetos por categoria · reserva, objetivos e dívidas |
| **Análises** | gráficos (rosca, evolução, tetos, parcelas futuras) · o que cortar, em ordem · faturas arquivadas |
| **Ajustes** | alertas e lembretes com hora marcada · importar OFX/CSV · backup, CSV e diagnóstico |

## Lançar um gasto em segundos

Um campo só. Você escreve `ifood 45` e o app entende descrição, valor,
categoria, peso e recorrência provável — reaproveitando o mesmo classificador
que lê extratos do banco. Aceita `mercado 1.234,56`, `r$ 89 netflix`,
`farmácia 97,50`. Se já existe um gasto com aquele nome, ele herda tudo do
anterior. O resto dos campos (parcelado, quem paga, vencimento, conta) fica em
*Mais opções*, para quando realmente precisar.

Abaixo do campo ficam **chips** dos seus gastos mais frequentes, tirados do
histórico: um toque preenche a descrição e só falta o valor.

## O número principal

O painel não abre com "sobra prevista" — abre com **quanto você pode gastar
hoje**: o que ainda cabe no ciclo dividido pelos dias que faltam até a fatura
fechar, já descontada a meta de poupança. É o número que decide se você pede o
delivery ou não.

## Sistema de design

Um bloco de tokens no topo do `styles.css` decide **cor, espaço, raio, sombra e
tipografia**; nenhum componente inventa valor próprio. É o que faz as telas
parecerem uma coisa só.

* **Espaço** numa escala de 4 em 4 (`--e1` a `--e10`) — sem número solto.
* **Raio** em quatro degraus: 8 px (miúdos), 12 px (botões, inputs, chips),
  16 px (cards), 20 px (destaque, folhas) e pílula.
* **Sombra** difusa e discreta; no tema escuro a profundidade vem da borda.
* **Tipografia** em oito degraus, com pesos 400/500/600/700.
* **Cor com propósito**: superfícies e texto são neutros puros; cor forte só em
  ação, sucesso, erro e alerta. As cores de categoria existem só nos gráficos.
  Cada cor tem a forma de *preencher* e a de *escrever* — a segunda mais escura,
  porque texto pequeno precisa de mais contraste. Todas conferidas: texto branco
  no botão 4,9:1, link 6,6:1, verde de texto 6,1:1, erro 4,8:1.
* **Ícones** de um conjunto próprio (`TRACOS` no `app.js`): traço 1.75, cantos
  arredondados, 24×24. Nenhum emoji na interface — eles ficam só nas
  notificações do sistema, onde se saem bem.

## Conta e segurança

No cadastro pedimos **nome, e-mail e senha**. O nome é o que o app usa para
falar com a pessoa em todo lugar ("Bom dia, Erick") e pode ser trocado em
*Ajustes → Conta*. O pedaço do e-mail nunca vira identidade — sem nome, o app
cumprimenta sem nome.

Contas criadas antes de o campo existir ficam sem nome. Nesse caso o app pede
uma vez, com um cartão discreto no topo de Hoje, que some assim que for
respondido (ou dispensado).

Autenticação com **Firebase Authentication** (e-mail e senha) e isolamento no
**Firestore**, não no navegador. Cada usuário tem no máximo um documento na
coleção `estado`, com o próprio `uid` como id do documento, e as regras em
`firestore.rules` só liberam leitura/escrita quando `request.auth.uid` bate
com o id do documento — uma verificação por operação, igual às políticas de
RLS que existiam antes, só que do lado do Firestore.

É o mesmo tipo de garantia que o backend anterior (Supabase/Postgres) tinha
via RLS, e que ali foi testada de verdade, não só suposta — com um segundo
usuário chamando a API na mão contra a linha de outra conta. Ao trocar de
banco a regra precisa do mesmo teste, agora contra o Firestore: antes de
confiar, tente ler/gravar `estado/<uid-de-outra-conta>` autenticado como uma
conta diferente (pelo [Rules Playground](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
do console ou pelo emulador) e confirme que vem `PERMISSION_DENIED`.

A Web API Key vai no HTML de propósito: ela é feita para ficar exposta. Quem
protege os dados são as regras do Firestore, não o sigilo dessa chave.

**No aparelho:** a cópia local é guardada numa chave por usuário
(`sobra-do-mes:u:<id>`), então trocar de conta no mesmo celular não mistura
nada. Ao sair, o app apaga a cópia local em todas as camadas — localStorage,
IndexedDB, cookie e as cópias de segurança diárias.

### Cliente sem dependências

Falamos com as APIs REST do Firebase (Identity Toolkit para autenticação,
Firestore para os dados) por `fetch` puro (`auth.js`): sem SDK, sem CDN, sem
nada para dar errado offline. Token renovado sozinho um minuto antes de
vencer; sem rede, a sessão continua valendo localmente e o app segue
funcionando.

### Configuração do projeto

Ao publicar seu próprio clone:

1. Crie um projeto no [console do Firebase](https://console.firebase.google.com),
   ative o provedor **E-mail/senha** em *Authentication → Sign-in method* e
   crie um banco **Firestore** (modo nativo).
2. Em *Firestore Database → Regras*, cole o conteúdo de `firestore.rules`.
3. Em *Configurações do projeto → Geral → Seus apps*, crie um app da Web e
   copie a **Web API Key** e o **Project ID**.
4. Troque `FB.apiKey` e `FB.projectId` em `auth.js` pelos valores do seu
   projeto.
5. Em *Authentication → Templates → Redefinição de senha → Personalizar URL
   de ação*, aponte para a própria origem do app (ex.: `https://seu-dominio/`)
   — é assim que o link de "esqueci minha senha" volta para dentro do app em
   vez de cair numa página do Firebase.

> **Confirmação de e-mail: desligada.** O cadastro entra direto — sem link,
> sem caixa de entrada. O Firebase permite login por e-mail/senha mesmo sem o
> e-mail verificado, então `cadastrar()` já devolve uma sessão pronta.
>
> O que se perde: o e-mail não é comprovado. Quem digitar o endereço errado
> não conseguirá recuperar a senha depois, porque a recuperação continua
> exigindo acesso real à caixa de entrada.

## Sincronização

Local primeiro, nuvem em seguida — de verdade: a tela abre com o que está no
aparelho e a nuvem é consultada em segundo plano, sem segurar nada. Medido:
**~90 ms até os dados na tela, online ou offline.** Toda gravação salva no
aparelho na hora e sobe para a conta 1,2 s depois (com fila quando offline). Ao abrir, o app puxa
o que está na nuvem e compara pelo carimbo da **última mudança de conteúdo** —
não pela hora da gravação, senão só abrir o app já faria o aparelho parecer
mais novo que a nuvem. Duas redes de segurança: um aparelho vazio nunca
sobrescreve uma conta com dados, e um estado vazio nunca é enviado por cima de
uma linha existente.

O indicador no cabeçalho mostra o estado real: sincronizado (com a hora),
sincronizando, offline ou falha.

## Nova versão disponível

Quando um deploy novo chega na `main`, o app detecta (ao abrir, ao voltar para
ele e de hora em hora) e mostra um banner **"Uma nova versão está disponível"**
com o botão **Atualizar agora**. O service worker novo fica em espera — nada
troca sem a pessoa pedir. Ao tocar em Atualizar, o app salva e sincroniza o que
estiver pendente, manda o service worker assumir e recarrega já na versão nova.

O **X** no canto fecha o aviso só para aquela versão: o app pergunta ao service
worker em espera qual é a versão dele e guarda esse número. Saiu outra versão,
o aviso volta sozinho.

Não existe atualização silenciosa por trás disso porque um PWA não pode fazer
isso sem recarregar a página no meio do uso — o botão é a forma mais simples e
previsível que a plataforma permite.

## Como os dados ficam salvos

O estado é gravado em **camadas redundantes**, e o app verifica de verdade se
cada uma respondeu — o rodapé mostra o resultado em *Diagnóstico do salvamento*:

1. `localStorage`
2. `IndexedDB` (sobrevive onde o localStorage é isolado)
3. cookie (último recurso, só se couber)
4. memória (sessão atual, quando nada mais funciona)

Ao ler, o app compara as camadas e usa a cópia mais recente pelo carimbo de
tempo. Além disso guarda **uma cópia de segurança automática por dia** no
IndexedDB (as 7 últimas ficam), e o rodapé tem *Baixar backup* (JSON),
*Restaurar backup* e *Exportar CSV*.

> Os dados são **deste aparelho e deste navegador**. Para levar pra outro,
> use Baixar backup → Restaurar backup.

## Alertas por notificação

Rodam inteiramente no aparelho: não há servidor de push e nada é enviado pra
lugar nenhum. O service worker entrega o aviso como notificação do sistema.

**Alertas de situação** — disparam quando algo foge do plano: teto de categoria
estourando, gastando mais do que dá, meta em risco, fatura vai fechar, fatura
vai vencer, conta fixa a vencer, lançamento variável zerado, última parcela.
Cada um sai **uma vez por ciclo**, no máximo 3 por checagem.

**Lembretes com hora marcada** — você escolhe os horários e o momento de cada
um: *quanto posso gastar hoje* (manhã), *como está o ritmo* (meio do dia),
*fechar a conta do dia* (noite) e *só perto da fatura*. A mensagem é montada na
hora a partir do estado real das contas — "☀️ Bom dia — R$ 48,37 pra hoje",
"🍽️ Comida fora já está R$ 120 acima do teto", "💳 Separando R$ 96 por dia até
lá, a fatura fica paga sem susto".

### O limite honesto do horário

Sem servidor de push, o navegador **não acorda o app numa hora exata com ele
fechado**. Na prática:

* app aberto → o lembrete sai no minuto marcado;
* app fechado → sai **assim que o app for aberto de novo** (ele sabe que a hora
  passou e ainda não avisou hoje);
* Android instalado → o `periodicSync` acorda o app sozinho e o lembrete chega
  perto do horário.

Isso está escrito na própria tela de Alertas, para ninguém contar com uma
garantia que não existe. Hora exata com o app fechado exigiria Web Push com
servidor — e é justamente por não ter servidor que nenhum dado sai do aparelho.

**No iPhone**, notificações web só funcionam se o site for adicionado à Tela de
Início pelo Safari (Compartilhar → Adicionar à Tela de Início) e aberto por lá.

## Instalar no celular

O app é uma PWA: manifest, ícones (incluindo maskable) e service worker com
cache da casca, então ele abre e funciona sem internet. No Android/desktop
aparece um convite de instalação; no iPhone use Compartilhar → Adicionar à
Tela de Início.

## O que foi verificado

Cada versão passa por uma bateria que roda num navegador real, com dois
"aparelhos" e duas contas. Não é lista de intenções — é o que o teste executa:

| | |
|---|---|
| Cadastro | entra direto, sem etapa de confirmação |
| Salvar ao adicionar | 5 gastos pelo campo único, gravados no aparelho na hora |
| Recarregar | continua logado, dados intactos |
| Sair e entrar | cópia local apagada ao sair, dados de volta ao entrar |
| Outro aparelho | mesmo login, dados chegam da nuvem |
| Dois aparelhos | gasto lançado num aparece no outro |
| Isolamento | conta nova começa vazia, não vê nada da outra |
| Funções | 4 áreas, 10 seções, gráficos, desfazer, alertas, agenda, retrospectiva, tema |
| Offline | lança sem internet, avisa o estado, sobe sozinho quando volta |
| Com service worker | tudo acima, mais abrir o app sem internet |

Mais uma auditoria de acessibilidade e responsividade de 320 px a 1280 px:
zero rolagem horizontal, zero botão sem nome acessível, zero campo sem rótulo,
zero alvo de toque abaixo de 44 px, zero erro de console.

## Rodar localmente

Não tem build nem dependências — é HTML, CSS e JS puros.

```bash
python3 -m http.server 4173
# abra http://localhost:4173
```

O service worker exige `http://localhost` ou HTTPS; abrindo o arquivo direto
(`file://`) o app funciona, mas sem offline e sem notificações.

## Publicar na Vercel

```bash
npx vercel --prod
```

Ou ligue o repositório em vercel.com: **Framework Preset: Other**, sem build
command, **Output Directory: `.`** (raiz). O `vercel.json` já cuida dos headers
— `sw.js` sem cache (pra atualização chegar), ícones com cache longo,
`manifest.webmanifest` com o content-type certo.

## Estrutura

```
index.html            marcação: tela de entrar, as quatro áreas, folha, banners
styles.css            estilo (claro/escuro, segue o sistema na primeira vez)
auth.js               autenticação e acesso ao banco, por fetch puro
app.js                cálculo, persistência, sincronização, gráficos, alertas
sw.js                 service worker: offline, notificações e atualização
firestore.rules       as regras do Firestore (isolamento por usuário)
manifest.webmanifest  PWA
vercel.json           headers do deploy
icons/                ícones do app
```

Os gráficos são SVG escrito na mão — sem biblioteca externa. A paleta
categórica foi validada para daltonismo e contraste nos dois temas.

## Detalhes de uso que importam

* **Desfazer** em tudo que remove — snackbar de 5 segundos, nada some pra sempre.
* **Toast + vibração curta** a cada gasto registrado.
* **Retrospectiva do mês** quando a fatura fecha: quanto gastou, comparação com
  o mês anterior, para onde foi, variação por categoria — e confete quando você
  economizou.
* **Estados vazios que ensinam**: a primeira tela é um onboarding de dois passos,
  não uma lista vazia.
* Contadores animados, cards que entram com fade, folha com mola e arrastar-para-fechar.
* `render()` com debounce de 220 ms nos campos numéricos.
