-- ============================================================
-- LavaJá — schema multi-empresa (multi-tenant) para Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase
-- e clique em "Run".
-- ============================================================

-- 1) Empresas (cada dono de lava-rápido é uma empresa)
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 2) Perfis de usuário (liga cada login do Supabase Auth a uma empresa)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  full_name text,
  role text default 'owner', -- 'owner' ou 'funcionario'
  created_at timestamptz default now()
);

-- 3) Clientes
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  phone text,
  created_at timestamptz default now()
);

-- 4) Veículos
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  customer_id uuid references customers(id) on delete cascade not null,
  plate text not null,
  model text,
  color text,
  created_at timestamptz default now()
);

-- 5) Serviços (catálogo de preços da empresa)
create table services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  price numeric not null default 0,
  created_at timestamptz default now()
);

-- 6) Pedidos (fila, agenda e financeiro vivem aqui)
create table orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  service_ids jsonb default '[]',      -- lista de ids de services
  extra_services jsonb default '[]',   -- serviços avulsos: [{name, price}]
  total numeric not null default 0,
  paid boolean default false,
  status text not null default 'aguardando', -- agendado | aguardando | lavando | pronto | entregue
  scheduled_time timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- Função auxiliar: pega a empresa do usuário logado
-- ============================================================
create or replace function my_company_id()
returns uuid
language sql stable
as $$
  select company_id from profiles where id = auth.uid();
$$;

-- ============================================================
-- Row Level Security: cada empresa só enxerga seus próprios dados
-- ============================================================
alter table companies enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table services enable row level security;
alter table orders enable row level security;

create policy "ver a própria empresa" on companies
  for select using (id = my_company_id());
create policy "criar empresa no cadastro" on companies
  for insert to authenticated with check (true);

create policy "ver o próprio perfil e colegas da empresa" on profiles
  for select using (company_id = my_company_id());
create policy "criar o próprio perfil" on profiles
  for insert with check (id = auth.uid());

create policy "clientes da própria empresa - select" on customers
  for select using (company_id = my_company_id());
create policy "clientes da própria empresa - insert" on customers
  for insert with check (company_id = my_company_id());
create policy "clientes da própria empresa - update" on customers
  for update using (company_id = my_company_id());
create policy "clientes da própria empresa - delete" on customers
  for delete using (company_id = my_company_id());

create policy "veiculos da própria empresa - select" on vehicles
  for select using (company_id = my_company_id());
create policy "veiculos da própria empresa - insert" on vehicles
  for insert with check (company_id = my_company_id());
create policy "veiculos da própria empresa - update" on vehicles
  for update using (company_id = my_company_id());
create policy "veiculos da própria empresa - delete" on vehicles
  for delete using (company_id = my_company_id());

create policy "servicos da própria empresa - select" on services
  for select using (company_id = my_company_id());
create policy "servicos da própria empresa - insert" on services
  for insert with check (company_id = my_company_id());
create policy "servicos da própria empresa - update" on services
  for update using (company_id = my_company_id());
create policy "servicos da própria empresa - delete" on services
  for delete using (company_id = my_company_id());

create policy "pedidos da própria empresa - select" on orders
  for select using (company_id = my_company_id());
create policy "pedidos da própria empresa - insert" on orders
  for insert with check (company_id = my_company_id());
create policy "pedidos da própria empresa - update" on orders
  for update using (company_id = my_company_id());
create policy "pedidos da própria empresa - delete" on orders
  for delete using (company_id = my_company_id());

-- ============================================================
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
-- Realtime: permite que a tela atualize sozinha entre dispositivos
-- ============================================================
alter publication supabase_realtime add table customers, vehicles, services, orders;
