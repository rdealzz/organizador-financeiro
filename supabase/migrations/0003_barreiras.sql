-- ============================================================================
-- Barreiras no banco
--
-- O RLS da 0001 já responde a pergunta principal: uma conta não enxerga a
-- linha de outra. Esta migração fecha o resto — o que sobra quando quem ataca
-- JÁ tem uma conta válida e chama a API na mão, sem passar pelo app:
--
--   1. mandar um `dados` gigante e usar a conta como disco de graça;
--   2. mandar um `dados` que não é objeto (uma string de 10 MB, por exemplo);
--   3. forjar `revisao`, `criado_em` ou `atualizado_em` para atrapalhar a
--      sincronização entre aparelhos;
--   4. inserir uma linha carimbada com o id de outra conta.
--
-- Nada disso é resolvido no navegador: o navegador é do atacante. Tem de ser
-- resolvido aqui, e é o que este arquivo faz.
-- ============================================================================

-- ---------------------------------------------------------------- 1 e 2 ----
-- Formato e tamanho do payload. 512 KB comportam anos de lançamentos com
-- folga (o estado de um ano típico não passa de 80 KB comprimido em jsonb).
alter table public.estado
  drop constraint if exists estado_dados_e_objeto;
alter table public.estado
  add constraint estado_dados_e_objeto
  check (jsonb_typeof(dados) = 'object');

alter table public.estado
  drop constraint if exists estado_dados_tamanho;
alter table public.estado
  add constraint estado_dados_tamanho
  check (pg_column_size(dados) <= 524288);

comment on constraint estado_dados_tamanho on public.estado is
  'Teto de 512 KB por conta. Impede usar a tabela como armazenamento genérico.';

-- ------------------------------------------------------------------- 3 ----
-- Colunas de controle não são escritas pelo cliente: são carimbadas aqui.
-- O gatilho de UPDATE já existia (0001); faltava o de INSERT, que era por
-- onde dava para nascer uma linha com revisão e datas inventadas.
create or replace function public.marcar_criacao()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- A linha é sempre de quem está chamando. O coalesce cobre a manutenção
  -- feita pelo service_role (sem auth.uid()), que não passa pelo RLS de todo
  -- jeito; para quem vem pela API com uma conta, auth.uid() sempre existe.
  new.user_id       := coalesce(auth.uid(), new.user_id);
  new.revisao       := 1;
  new.criado_em     := now();
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists estado_marcar_criacao on public.estado;
create trigger estado_marcar_criacao
  before insert on public.estado
  for each row execute function public.marcar_criacao();

-- ------------------------------------------------------------------- 4 ----
-- Permissão por COLUNA. Mesmo que um gatilho seja removido por engano no
-- futuro, o papel `authenticated` simplesmente não tem direito de escrever em
-- user_id, revisao, criado_em nem atualizado_em. Defesa em duas camadas, que
-- é o ponto: uma sozinha é um bilhete de confiança.
-- O papel anônimo não tem nada nesta tabela. Vem primeiro de propósito: é a
-- linha que desfaz um `grant all ... to public` dado por engano.
revoke all on public.estado from anon, public;

-- Estava sobrando: `authenticated` tinha também TRUNCATE, TRIGGER e
-- REFERENCES na tabela. Nenhum deles é usado pelo app, e TRUNCATE em
-- particular ignora RLS — bastava uma chamada para esvaziar a tabela inteira,
-- de todas as contas.
revoke truncate, trigger, references on public.estado from authenticated;
revoke update on public.estado from authenticated;
-- `user_id` entra na lista porque o app grava por upsert, e o upsert repete a
-- chave no UPDATE — sem ela a sincronização quebraria com "permission denied".
-- Reatribuir a linha continua impossível: o gatilho de UPDATE devolve
-- old.user_id, e o RLS ainda exige auth.uid() = user_id nos dois lados.
grant  update (dados, user_id) on public.estado to authenticated;
grant  select, insert, delete on public.estado to authenticated;

-- --------------------------------------------------------- superfície ------
-- Funções novas em `public` não nascem executáveis por qualquer um. Sem isto,
-- o padrão do Postgres é `execute` para `public`, e cada função criada no
-- futuro vira mais uma porta aberta por esquecimento.
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.marcar_atualizacao() from public, anon;
revoke execute on function public.marcar_criacao()     from public, anon;

-- Ninguém cria objetos no schema público além do dono.
revoke create on schema public from public, anon, authenticated;

comment on table public.estado is
  'Estado do app por usuário. RLS por auth.uid(), colunas de controle só por gatilho, payload limitado a 512 KB.';
