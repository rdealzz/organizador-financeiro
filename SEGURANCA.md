# Segurança — o que protege o quê

Este arquivo existe para uma pergunta continuar tendo resposta daqui a um ano:
**onde está a barreira?** Cada item abaixo diz o que ele impede, onde mora, e o
que acontece se alguém tirar o app do caminho e falar direto com o servidor.

## O ponto de partida honesto

O código do frontend é público. Não tem como não ser: o navegador precisa
baixá-lo para executá-lo, e qualquer pessoa abre o inspetor e lê tudo —
ofuscar só troca ler por ler com mais paciência. A chave `anon` do Supabase
está no HTML **de propósito**: ela é publicável, e é assim que a API funciona.

Por isso nenhuma barreira deste app depende de esconder código. Todas moram em
lugares que o visitante não controla: o banco de dados e os cabeçalhos que o
servidor manda. O navegador do atacante é do atacante — o Postgres não.

---

## 1. Banco: cada conta enxerga só a própria linha

`supabase/migrations/0001_estado_com_rls.sql`

A tabela `public.estado` tem uma linha por conta, com a **chave primária igual
ao id do usuário**, e Row Level Security ligado *e forçado* (`force row level
security`: nem o dono da tabela escapa das políticas). As quatro políticas —
select, insert, update, delete — exigem `auth.uid() = user_id`.

Testado com um token válido de uma conta, chamando a API na mão:

| tentativa                          | resultado                            |
|------------------------------------|--------------------------------------|
| ler a linha de outra conta         | 0 linhas                             |
| apagar a linha de outra conta      | 0 linhas afetadas                    |
| inserir linha com o id de outro    | bloqueado (`23505`)                  |

## 2. Banco: barreiras contra quem já tem conta

`supabase/migrations/0003_barreiras.sql`

RLS responde "de quem é a linha". Falta responder "o que cabe nela". Uma conta
legítima ainda podia mandar um payload de 10 MB, forjar carimbos ou esvaziar a
tabela. Agora não:

| tentativa                              | barreira                                   | resultado           |
|----------------------------------------|--------------------------------------------|---------------------|
| `dados` de 600 KB                      | `check pg_column_size(dados) <= 524288`     | bloqueado (`23514`) |
| `dados` que não é objeto JSON          | `check jsonb_typeof(dados) = 'object'`      | bloqueado           |
| forjar `revisao` / `criado_em`          | sem privilégio de coluna + gatilho          | bloqueado (`42501`) |
| `truncate` na tabela inteira            | privilégio revogado                         | bloqueado (`42501`) |
| reatribuir a linha para outra conta     | gatilho devolve `old.user_id` + RLS         | bloqueado           |

Duas camadas de propósito em cada linha: gatilho **e** privilégio por coluna.
Uma sozinha é um bilhete de confiança — se alguém remover o gatilho num
`create or replace` distraído, a permissão continua negando.

`authenticated` tinha também `TRUNCATE`, `TRIGGER` e `REFERENCES` na tabela,
sobras de um `grant all`. Foram revogados. `TRUNCATE` em particular **ignora
RLS**: era uma chamada para apagar os dados de todas as contas.

Funções novas em `public` não nascem executáveis por qualquer papel
(`alter default privileges ... revoke execute`), e ninguém além do dono cria
objetos no schema.

## 3. Transporte: o navegador só faz o que está na lista

`vercel.json`

- **Content-Security-Policy** — `script-src 'self'`: nenhum script de fora
  roda, nem inline. `connect-src` só aceita a própria origem e o endereço do
  Supabase: um script injetado não teria para onde mandar os dados.
  `frame-ancestors 'none'` e `X-Frame-Options: DENY` matam clickjacking;
  `base-uri 'none'` impede reescrever a base das URLs relativas;
  `object-src`/`frame-src`/`media-src 'none'` fecham o que o app não usa.
- **HSTS** com `preload` — o navegador se recusa a falar HTTP com o domínio.
- **Permissions-Policy** — câmera, microfone, localização, USB, pagamento e
  companhia negados de saída. O app não usa nenhum deles.
- **COOP / CORP `same-origin`**, `nosniff`, `Referrer-Policy: no-referrer`.

A CSP foi verificada com o app rodando: abertura, login, esfera, troca de
tema, service worker e download de backup — nenhuma violação.

## 4. Conta: o que o app faz do lado de cá

`auth.js`

- **Freio de tentativas** por e-mail e por aparelho: três erros de graça,
  depois espera dobrando (1s, 2s, 4s… até 5 min), zerada no acerto. Não
  substitui o limite do servidor — soma a ele, e segura a força bruta feita
  pelo próprio app antes de a rede ser usada.
- **Senha**: mínimo de 8, máximo de 72, recusa as senhas mais vazadas do mundo
  e um caractere repetido. Isto é um remendo enquanto a proteção contra senha
  vazada estiver desligada — veja "o que falta".
- **Token recusado (401/403) apaga a sessão local** na hora. Token morto
  guardado no aparelho só serve para o app tentar em loop.
- **Teto de 512 KB** conferido antes do envio, espelhando o do banco, para o
  erro chegar como frase e não como mensagem crua do Postgres.

`app.js`

- Todo texto de usuário passa por `esc()` antes de virar HTML, e o `esc()`
  cobre `< > & " ' \` =` — inclusive o que quebraria um atributo escrito com
  aspas simples.
- O balão dos gráficos faz o caminho atributo → `dataset` → `innerHTML`, e o
  navegador desfaz o escape uma vez nesse caminho. Ali passa uma lista branca
  (`<b>`, `<br>`), e nada mais.

---

## O que falta, e não depende de código

**Proteção contra senha vazada** (HaveIBeenPwned) está **desligada** no painel
do Supabase. Ligar é um clique e vale mais que qualquer lista embutida no app:
Painel → Authentication → Policies → *Leaked password protection*.
https://supabase.com/docs/guides/auth/password-security

O cadastro dispensa confirmação de e-mail (decisão registrada na migração
0002): a conta nasce confirmada e a pessoa entra direto. O preço é que o
e-mail não é comprovado. Trocar isso é uma decisão de produto, não um bug.
