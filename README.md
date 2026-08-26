# Sobra do Mês — controle financeiro

App web (PWA) para responder uma pergunta só: **quanto sobra no fim do mês.**
Você diz quanto ganha e quanto quer guardar; o app divide o resto em tetos por
categoria, fecha a fatura sozinho na data do cartão, guarda o histórico e avisa
no celular quando o gasto foge do plano.

Site estático, sem backend. **Nenhum dado sai do seu aparelho.**

## O que tem

| Aba | Para quê |
|---|---|
| **Renda** | salário, renda variável, dias de fechamento e vencimento da fatura, meta de poupança |
| **Tetos** | teto por categoria, calculado a partir do que sobra depois de guardar; dá pra travar qualquer um na mão |
| **Gastos** | lançamentos do ciclo (fixo, variável, parcelado, 1x), quem paga (você, dividido, outra pessoa) e contas a vencer |
| **Cortar** | o que está fora do teto, em ordem, com o quanto cada corte rende no ano |
| **Metas** | reserva de emergência, objetivos com prazo e dívidas com juros |
| **Gráficos** | para onde foi o dinheiro, evolução mês a mês, quanto de cada teto já foi e parcelas já compromissadas |
| **Meses** | faturas arquivadas, item a item, com a variação contra o mês anterior |
| **Alertas** | quais avisos quer receber e o que está pendente agora |
| **Importar** | extrato/fatura em OFX, CSV ou colado na mão, com categorização automática |

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

Avisos disponíveis: teto de categoria estourando, gastando mais do que dá, meta
de guardar em risco, fatura vai fechar, fatura vai vencer, conta fixa a vencer,
lançamento variável zerado e última parcela. Cada um dispara **uma vez por
ciclo** (nada de repetir o mesmo aviso todo dia), no máximo 3 por checagem.

A checagem acontece ao abrir o app, ao voltar pra ele e a cada 30 minutos com
ele aberto. Em Android instalado, o `periodicSync` também acorda a checagem em
segundo plano quando o navegador permite.

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
