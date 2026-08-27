-- Cadastro sem etapa de confirmação por e-mail.
-- Mesmo efeito prático de desligar "Confirm email" no painel: a conta já nasce
-- confirmada, então logo depois de criar a conta o app entra direto.
-- Consequência aceita e documentada: o e-mail não é comprovado. Recuperar a
-- senha continua exigindo acesso real à caixa de entrada.
create or replace function public.confirmar_email_na_criacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.confirmar_email_na_criacao() from public, anon, authenticated;

drop trigger if exists confirmar_email_na_criacao on auth.users;
create trigger confirmar_email_na_criacao
  before insert on auth.users
  for each row execute function public.confirmar_email_na_criacao();
