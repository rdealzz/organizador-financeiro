-- Estado financeiro de cada usuário.
-- Uma linha por conta; a chave primária É o id do usuário, então não existe
-- forma de uma conta ter linha de outra.
create table public.estado (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  dados        jsonb       not null default '{}'::jsonb,
  revisao      bigint      not null default 1,
  atualizado_em timestamptz not null default now(),
  criado_em    timestamptz not null default now()
);

comment on table public.estado is
  'Estado do app por usuário. Protegido por RLS: cada conta só enxerga a própria linha.';

alter table public.estado enable row level security;
-- Nem o dono da tabela escapa das políticas (defesa contra engano futuro).
alter table public.estado force row level security;

create policy "ler o proprio estado"
  on public.estado for select to authenticated
  using (auth.uid() = user_id);

create policy "criar o proprio estado"
  on public.estado for insert to authenticated
  with check (auth.uid() = user_id);

create policy "atualizar o proprio estado"
  on public.estado for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "apagar o proprio estado"
  on public.estado for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.estado from anon;
grant select, insert, update, delete on public.estado to authenticated;

-- Carimbo de atualização e revisão sempre crescente.
create or replace function public.marcar_atualizacao()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.atualizado_em := now();
  new.revisao := coalesce(old.revisao, 0) + 1;
  new.user_id := old.user_id;   -- ninguém reatribui a linha para outra conta
  return new;
end;
$$;

create trigger estado_marcar_atualizacao
  before update on public.estado
  for each row execute function public.marcar_atualizacao();
