-- =====================================================================
-- ON BETS — Fase 2: autenticação e perfis
-- ---------------------------------------------------------------------
-- Rode DEPOIS da migration da Fase 1, no SQL Editor do Supabase.
--
-- * Cria o perfil automaticamente quando alguém se cadastra no Auth.
-- * O papel é SEMPRE 'participant' no cadastro: qualquer "role" enviado
--   em user_metadata é ignorado. Admin só via SQL (ver README).
-- * A carteira é criada na Fase 3 (o trigger será estendido lá).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normaliza um username candidato para o formato aceito
-- (3–20 caracteres: letras, números, _ e .)
-- ---------------------------------------------------------------------
create or replace function public.sanitize_username(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(regexp_replace(coalesce(p_raw, ''), '[^A-Za-z0-9_.]', '', 'g'), 20);
$$;

-- ---------------------------------------------------------------------
-- Disponibilidade de username (usada pelo formulário de cadastro)
-- ---------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9_.]{3,20}$'
     and not exists (
       select 1 from public.profiles where lower(username) = lower(p_username)
     );
$$;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger: auth.users → public.profiles
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted   text := new.raw_user_meta_data ->> 'username';
  v_username text;
  v_base     text;
  v_try      int := 0;
begin
  -- 1. o username pedido, se for válido
  v_username := public.sanitize_username(v_wanted);

  -- 2. senão, deriva do e-mail (parte antes do @)
  if char_length(v_username) < 3 then
    v_username := public.sanitize_username(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if char_length(v_username) < 3 then
    v_username := 'jogador';
  end if;

  v_base := v_username;

  -- 3. se já existir (corrida entre dois cadastros), acrescenta sufixo
  while not public.is_username_available(v_username) loop
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'Não foi possível gerar um nome de usuário único';
    end if;
    v_username := left(v_base, 15) || floor(random() * 90000 + 10000)::int::text;
  end loop;

  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    v_username,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 80), ''),
    'participant'
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sanitize_username(text) from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Perfis criados antes deste trigger (ex.: usuário adicionado pelo
-- painel durante a Fase 1) ganham perfil agora.
-- ---------------------------------------------------------------------
insert into public.profiles (id, username)
select u.id,
       left(coalesce(
         nullif(public.sanitize_username(u.raw_user_meta_data ->> 'username'), ''),
         public.sanitize_username(split_part(u.email, '@', 1))
       ), 16) || substr(replace(u.id::text, '-', ''), 1, 4)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
