# Como rodar a validação

São testes de navegador de verdade: sobem o app num servidor local e o
exercitam com Playwright — o mesmo Chromium, os mesmos cliques.

```sh
python3 -m http.server 8765 &        # da raiz do projeto
cd testes && npm i playwright        # só na primeira vez
node valida-motor.js                 # as contas
node valida-ui.js                    # cada botão, select e camada
node valida-borda.js                 # backup, estado estranho, auth
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
* **`valida-borda.js`** — o que entra vindo de fora: ida e volta do backup,
  estado com categoria desconhecida ou campos faltando (o defeito da v10.10),
  as frases de erro do `auth.js` e o teto de 512 KB recusando de verdade.

Nenhum deles fala com o Firebase real nem cria conta.
