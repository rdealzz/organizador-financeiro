# Como rodar a validação

São testes de navegador de verdade: sobem o app num servidor local e o
exercitam com Playwright — o mesmo Chromium, os mesmos cliques.

```sh
python3 -m http.server 8765 &        # da raiz do projeto
cd testes && npm i                   # só na primeira vez
npm run tudo                         # as cinco suítes
npm run auditoria                    # a análise estática do código
```

Cada um imprime quantas verificações passaram e sai com código 1 se alguma
falhar.

* **`valida-motor.js`** — as identidades que não podem quebrar:
  `bruto + avista = total lançado`, `total = minha parte + terceiros`,
  `gasto = soma dos pesos = soma das categorias`; as duas faturas (a aberta e a
  a pagar), `vencDaFatura` com fechamento e vencimento no mesmo dia, a divisão
  entre várias pessoas, as parcelas espalhadas pelo calendário até a última, o
  fechamento de ciclo (o que sobrevive, o que anda uma casa) e o CSV.
* **`valida-ui.js`** — as quatro áreas e todas as sub-abas, cada botão e select
  da linha da tabela, a folha de edição inteira, a lista de quem divide, o
  calendário pelas três portas com navegação e editor de fatura, menu de
  perfil, tema, gráfico 3D, e as camadas de tela cheia **com a esfera ligada
  nos dois temas** — que é o defeito que já voltou duas vezes.
* **`valida-nan.js`** — dez estados que a vida produz (conta nova, renda zero,
  meta maior que a renda, terceiros cobrindo mais que o gasto, 999 parcelas,
  histórico velho) contra sete telas, procurando `NaN`, `undefined` e
  `Invalid Date` no texto visível.
* **`valida-fuso.js`** — o app em quatro fusos horários. `iso()` já saiu um dia
  atrás a leste de Greenwich (v10.11); esta suíte existe para isso não voltar.
* **`auditar.js`** — análise estática do AST: declarações duplicadas, igualdade
  frouxa, `catch` vazio, `case` sem `break`, `async` sem quem espere e
  identificadores nunca declarados. Ela levanta suspeitas; confirmar é com
  navegador.
* **`valida-borda.js`** — o que entra vindo de fora: ida e volta do backup,
  estado com categoria desconhecida ou campos faltando (o defeito da v10.10),
  as frases de erro do `auth.js` e o teto de 512 KB recusando de verdade.

Nenhum deles fala com o Firebase real nem cria conta.
