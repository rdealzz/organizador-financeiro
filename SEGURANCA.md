# Segurança — o que protege o quê

Este arquivo existe para uma pergunta continuar tendo resposta daqui a um ano:
**onde está a barreira?** Cada item abaixo diz o que ele impede, onde mora, e o
que acontece se alguém tirar o app do caminho e falar direto com o servidor.

## O ponto de partida honesto

O código do frontend é público. Não tem como não ser: o navegador precisa
baixá-lo para executá-lo, e qualquer pessoa abre o inspetor e lê tudo —
ofuscar só troca ler por ler com mais paciência. A Web API Key do Firebase
está no HTML **de propósito**: ela é publicável, e é assim que a API funciona.

Por isso nenhuma barreira deste app depende de esconder código. Todas moram em
lugares que o visitante não controla: as regras do Firestore e os cabeçalhos
que o servidor manda. O navegador do atacante é do atacante — o Firestore não.

---

## 1. Banco: cada conta enxerga só o próprio documento

`firestore.rules`

A coleção `estado` tem no máximo um documento por conta, e o **id do
documento é o próprio `uid`** — não existe uma coluna "dono" que precise ser
checada à parte, o caminho já é a fronteira. A regra libera leitura, escrita
e apagamento só quando `request.auth.uid == uid` do documento pedido.

> **Isto ainda não foi testado contra um projeto Firebase real** — só escrito
> e revisado. Antes de confiar, faça o mesmo teste que o RLS do Supabase
> passou quando o app usava Postgres: autenticado como a conta A, tente ler/gravar/apagar
> `estado/<uid-da-conta-B>` (pelo [Rules Playground](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
> do console, ou pelo emulador local) e confirme `PERMISSION_DENIED` em
> todos os casos, e que a conta A ainda grava o próprio documento sem
> problema.

## 2. Banco: o que cabe no documento

`firestore.rules`

- **Tamanho**: `request.resource.data.dados.size() <= 524288` — mesmo teto de
  512 KB que existia no Postgres, agora medido em bytes de string.
- **Tipo**: `request.resource.data.dados is string` — o campo é sempre uma
  string JSON, nunca outro tipo.
- **Campos**: `keys().hasOnly(['dados', 'revisao'])` — nenhum campo extra
  entra no documento.

O que o Postgres precisava de gatilho e revogação de privilégio para garantir
— ninguém reatribuir a linha para outra conta, ninguém truncar a tabela
inteira — aqui não é uma regra, é estrutural: o documento de uma conta *é*
`estado/<uid dela>`, não existe uma operação de "trocar o dono" nem um
comando que apague a coleção inteira de uma vez pela API REST, só documento a
documento, e a regra acima já barra qualquer um fora do próprio uid.

## 3. Transporte: o navegador só faz o que está na lista

`vercel.json`

- **Content-Security-Policy** — `script-src 'self'`: nenhum script de fora
  roda, nem inline. `connect-src` só aceita a própria origem e os três
  domínios do Firebase que o app chama (`identitytoolkit.googleapis.com`,
  `securetoken.googleapis.com`, `firestore.googleapis.com`): um script
  injetado não teria para onde mandar os dados. `frame-ancestors 'none'` e
  `X-Frame-Options: DENY` matam clickjacking; `base-uri 'none'` impede
  reescrever a base das URLs relativas; `object-src`/`frame-src`/
  `media-src 'none'` fecham o que o app não usa.
- **HSTS** com `preload` — o navegador se recusa a falar HTTP com o domínio.
- **Permissions-Policy** — câmera, microfone, localização, USB, pagamento e
  companhia negados de saída. O app não usa nenhum deles.
- **COOP / CORP `same-origin`**, `nosniff`, `Referrer-Policy: no-referrer`.

> A CSP anterior (com o domínio do Supabase) foi verificada com o app
> rodando de ponta a ponta. A troca dos três domínios do Firebase ainda
> precisa da mesma passada manual — abertura, login, cadastro, recuperação de
> senha, sincronização, troca de tema, service worker e download de backup —
> porque um domínio errado na lista quebra a chamada em silêncio (a CSP
> bloqueia, o `fetch` cai no `catch` como "sem rede").

## 4. Conta: o que o app faz do lado de cá

`auth.js`

- **Freio de tentativas** por e-mail e por aparelho: três erros de graça,
  depois espera dobrando (1s, 2s, 4s… até 5 min), zerada no acerto. Não
  substitui o limite do servidor — soma a ele, e segura a força bruta feita
  pelo próprio app antes de a rede ser usada.
- **Senha**: mínimo de 8, máximo de 72, recusa as senhas mais vazadas do mundo
  e um caractere repetido. Isto é um remendo — veja "o que falta" abaixo,
  porque aqui o remendo é mais necessário do que era no Supabase.
- **Token recusado apaga a sessão local** na hora: tanto por status
  (401/403) quanto pelo código que o Firebase devolve no corpo
  (`INVALID_ID_TOKEN`, `TOKEN_EXPIRED`, `USER_NOT_FOUND`, `USER_DISABLED`).
  Token morto guardado no aparelho só serve para o app tentar em loop.
- **Teto de 512 KB** conferido antes do envio, espelhando o das regras do
  Firestore, para o erro chegar como frase e não como mensagem crua do
  servidor.

`app.js`

- Todo texto de usuário passa por `esc()` antes de virar HTML, e o `esc()`
  cobre `< > & " ' \` =` — inclusive o que quebraria um atributo escrito com
  aspas simples.
- O balão dos gráficos faz o caminho atributo → `dataset` → `innerHTML`, e o
  navegador desfaz o escape uma vez nesse caminho. Ali passa uma lista branca
  (`<b>`, `<br>`), e nada mais.

---

## O que falta, e não depende de código

**Proteção contra senha vazada** (tipo HaveIBeenPwned) **não existe** no
Firebase Authentication por e-mail/senha — o Supabase tinha um botão para
isso no painel (`Authentication → Policies → Leaked password protection`); o
Firebase, na camada gratuita, não oferece equivalente. A lista curta em
`validarSenha()` (`auth.js`) é o que existe entre uma conta e a senha mais
óbvia do mundo, e agora carrega mais peso do que carregava antes. Quem quiser
mais do que isso precisa de um serviço à parte (ex.: checar contra a API do
[Have I Been Pwned](https://haveibeenpwned.com/API/v3#PwnedPasswords) antes
de enviar o cadastro) — não implementado aqui.

O cadastro dispensa confirmação de e-mail: o Firebase deixa entrar por
e-mail/senha mesmo sem o e-mail verificado, e `cadastrar()` já devolve uma
sessão pronta. O preço é o mesmo de antes: o e-mail não é comprovado. Trocar
isso é uma decisão de produto, não um bug.
