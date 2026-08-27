# Sobra do Mês — controle financeiro

App web (PWA) para responder uma pergunta só: **quanto sobra no fim do mês.**
Você diz quanto ganha e quanto quer guardar; o app divide o resto em tetos por
categoria, fecha a fatura sozinho na data do cartão, guarda o histórico e avisa
no celular quando o gasto foge do plano.

Site estático, sem backend. **Nenhum dado sai do seu aparelho.**

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
index.html            marcação e as abas
styles.css            estilo (claro/escuro, segue o sistema na primeira vez)
app.js                cálculo, persistência, gráficos, alertas, importação
sw.js                 service worker: offline + entrega das notificações
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
