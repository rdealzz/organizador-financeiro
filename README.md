# Sobra do Mês — controle financeiro

App web (PWA) para responder uma pergunta só: **quanto sobra no fim do mês.**
Você diz quanto ganha e quanto quer guardar; o app divide o resto em tetos por
categoria, fecha a fatura sozinho na data do cartão, guarda o histórico e avisa
no celular quando o gasto foge do plano.

Cada pessoa tem sua conta. Os dados ficam numa linha só dela no banco,
protegida por Row Level Security — e uma cópia local mantém o app funcionando
sem internet.

## As quatro áreas

Barra fixa embaixo, no padrão de app de banco. Botão flutuante (+) sempre visível
abre a folha de lançamento, de qualquer tela.

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

## Conta e segurança

Autenticação com **Supabase Auth** (e-mail e senha) e isolamento no **Postgres**,
não no navegador. A tabela `estado` tem a chave primária igual ao `id` do
usuário e quatro políticas de RLS amarradas a `auth.uid()` — uma por operação.
A tabela usa `force row level security`, então nem o dono escapa das políticas.

Isso foi **testado, não suposto**. Com um segundo usuário autenticado mandando
SQL direto no banco contra a linha de outro:

| Ataque | Resultado |
|---|---|
| Listar a tabela inteira | 0 linhas |
| `SELECT` na linha alheia | nada retornado |
| `UPDATE` na linha alheia | 0 linhas afetadas |
| `DELETE` na linha alheia | 0 linhas afetadas |
| `INSERT` forjando o `user_id` | bloqueado pela política |
| Gravar o próprio estado | funciona |

A chave publicável (`anon`) vai no HTML de propósito: ela é feita para ficar
exposta. Quem protege os dados é o RLS, não o sigilo dessa chave.

**No aparelho:** a cópia local é guardada numa chave por usuário
(`sobra-do-mes:u:<id>`), então trocar de conta no mesmo celular não mistura
nada. Ao sair, o app apaga a cópia local em todas as camadas — localStorage,
IndexedDB, cookie e as cópias de segurança diárias — e encerra a sessão em
todos os aparelhos.

### Cliente sem dependências

Falamos com a API do Supabase por `fetch` puro (`auth.js`): sem SDK, sem CDN,
sem nada para dar errado offline. Token renovado sozinho um minuto antes de
vencer; sem rede, a sessão continua valendo localmente e o app segue
funcionando.

### Configuração do projeto

Ao publicar seu próprio clone, troque `SB.url` e `SB.key` em `auth.js` e rode a
migração de `supabase/` no seu projeto.

> **Confirmação de e-mail:** projetos novos do Supabase vêm com "Confirm email"
> ligado, e o SMTP compartilhado do plano gratuito é bem limitado (poucos
> e-mails por hora). O app trata os dois casos — se o cadastro não devolver
> sessão, ele mostra a tela de "confirme seu e-mail" com botão de reenvio. Para
> um fluxo sem fricção, desligue a confirmação em *Authentication → Providers →
> Email*; para produção de verdade, configure um SMTP próprio.

## Sincronização

Local primeiro, nuvem em seguida. Toda gravação salva no aparelho na hora e
sobe para a conta 1,2 s depois (com fila quando offline). Ao abrir, o app puxa
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
com o botão **Atualizar**. O service worker novo fica em espera — nada troca
sem a pessoa pedir. Ao tocar em Atualizar, o app salva e sincroniza o que
estiver pendente, manda o service worker assumir e recarrega já na versão nova.

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
supabase/             a migração que cria a tabela e as políticas de RLS
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
