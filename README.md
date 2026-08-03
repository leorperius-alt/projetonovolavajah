# LavaJá — versão multi-empresa (SaaS)

Cada dono de lava-rápido cria a própria conta e só enxerga os dados da própria empresa. Os dados ficam num banco de verdade (Supabase / Postgres), não mais no navegador.

## 1. Criar o banco de dados (Supabase)

1. Crie uma conta grátis em https://supabase.com e clique em **New project**.
2. Escolha um nome e uma senha para o banco (guarde a senha, mas não vai precisar dela no código).
3. Espere o projeto terminar de criar (1–2 minutos).
4. No menu lateral, abra **SQL Editor** → **New query**.
5. Cole todo o conteúdo do arquivo `schema.sql` (está na raiz deste projeto) e clique em **Run**.
   - Isso cria as tabelas (`companies`, `profiles`, `customers`, `vehicles`, `services`, `orders`) e as regras de segurança que isolam os dados de cada empresa.
6. No menu lateral, abra **Project Settings → API**. Copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o projeto

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou mais recente) se ainda não tiver.
2. Nesta pasta, rode no terminal:
   ```
   npm install
   ```
3. Copie o arquivo `.env.example` para `.env`:
   ```
   cp .env.example .env
   ```
4. Abra o `.env` e cole a URL e a chave que você copiou do Supabase:
   ```
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
   ```
5. Para testar localmente:
   ```
   npm run dev
   ```
   Abra o endereço que aparecer no terminal (algo como `http://localhost:5173`).

## 3. Testar o cadastro

- Clique em **Criar empresa**, preencha o nome do lava-rápido, seu nome, e-mail e senha.
- Você já entra direto no painel, com os dados isolados dessa empresa.
- Se criar uma segunda empresa com outro e-mail, ela não vai enxergar nada da primeira — isso é garantido pelo banco (Row Level Security), não só pelo código.

## 4. Convidar funcionários

Já é automático — sem precisar mexer no banco:

1. No painel, abra a aba **Equipe**.
2. Digite o e-mail do funcionário (opcional) e clique em **Gerar link de convite**.
3. Clique em **Copiar link** e envie por WhatsApp, e-mail, etc.
4. O funcionário abre o link, preenche nome, e-mail e senha, e já entra direto vinculado à sua empresa — sem precisar criar uma empresa nova nem editar nada manualmente.
5. Cada link de convite só funciona uma vez. Se precisar convidar outra pessoa, gere um novo link.

Se você **ainda não criou** o banco: rode o `schema.sql` completo (já inclui a parte de convites).

Se você **já tinha rodado** a versão anterior do `schema.sql` (antes de ter a aba Equipe): não rode o `schema.sql` de novo, pois as tabelas já existem e vai dar erro. Em vez disso, rode só o arquivo `schema_convites.sql` no SQL Editor — ele adiciona apenas o que faltava.

## 5. Publicar de graça (Vercel)

1. Crie uma conta em https://vercel.com (pode entrar com GitHub).
2. Suba este projeto para um repositório no GitHub (ou use `vercel` pela linha de comando, se preferir).
3. Na Vercel, clique em **Add New → Project**, escolha o repositório.
4. Em **Environment Variables**, adicione as mesmas duas variáveis do seu `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Clique em **Deploy**. Em menos de um minuto você tem uma URL pública (`algo.vercel.app`) que já funciona em Android, iOS e Windows pelo navegador — e pode ser "instalada" na tela inicial do celular.

## Estrutura do projeto

```
schema.sql              → cole no SQL Editor do Supabase (banco novo)
schema_convites.sql      → só a parte de convites, pra quem já tinha o banco antigo
src/supabaseClient.js   → conexão com o banco
src/lib/db.js           → todas as funções que leem/gravam dados
src/Auth.jsx            → tela de login e criação de empresa
src/InviteAccept.jsx    → tela que o funcionário vê ao abrir o link de convite
src/App.jsx             → decide entre login, aceite de convite ou painel
src/LavaJaApp.jsx        → o painel (fila, agenda, clientes, serviços, financeiro, equipe)
```

## Como cada tela funciona agora

- **Fila / Agenda / Clientes / Serviços / Financeiro**: idênticas à versão anterior, mas cada ação (adicionar cliente, mudar status, marcar como pago) já grava direto no Supabase.
- **Tempo real**: se dois funcionários estiverem com o painel aberto em aparelhos diferentes, a tela de um atualiza sozinha quando o outro faz uma mudança (sem precisar recarregar a página).
