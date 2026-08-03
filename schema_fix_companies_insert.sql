-- Correção: faltava a política que permite CRIAR uma empresa durante o cadastro
-- (só existia a política de leitura). Rode este bloco no SQL Editor do Supabase.

create policy "criar empresa no cadastro" on companies
  for insert to authenticated with check (true);
