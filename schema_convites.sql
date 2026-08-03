-- Convites de funcionário
-- ============================================================
create table invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  email text,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  role text default 'funcionario',
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table invites enable row level security;

create policy "convites da própria empresa - select" on invites
  for select using (company_id = my_company_id());
create policy "convites da própria empresa - insert" on invites
  for insert with check (company_id = my_company_id());

-- Consulta pública do convite (só valida o token, não lista nada) --
create or replace function get_invite_info(p_token text)
returns table(company_name text, email text, valid boolean)
language plpgsql security definer
as $$
begin
  return query
  select c.name, i.email, (i.used_by is null)
  from invites i
  join companies c on c.id = i.company_id
  where i.token = p_token;
end;
$$;
grant execute on function get_invite_info(text) to anon, authenticated;

-- Efetiva o convite: vincula o novo usuário à empresa do convite --
create or replace function redeem_invite(p_token text, p_user_id uuid, p_full_name text default null)
returns uuid
language plpgsql security definer
as $$
declare
  v_company_id uuid;
  v_role text;
begin
  select company_id, role into v_company_id, v_role
  from invites where token = p_token and used_by is null
  for update;

  if v_company_id is null then
    raise exception 'Convite inválido ou já utilizado';
  end if;

  update invites set used_by = p_user_id, used_at = now() where token = p_token;

  insert into profiles (id, company_id, role, full_name)
  values (p_user_id, v_company_id, coalesce(v_role, 'funcionario'), p_full_name)
  on conflict (id) do update set company_id = excluded.company_id, role = excluded.role, full_name = excluded.full_name;

  return v_company_id;
end;
$$;
grant execute on function redeem_invite(text, uuid, text) to anon, authenticated;

-- ============================================================
