# Estoque

App simples de controle de estoque: cadastro de produtos, registro de entradas/saídas e histórico de movimentações. Funciona 100% no navegador (HTML/CSS/JS puro) e usa o [Supabase](https://supabase.com) como banco de dados gratuito na nuvem.

## 1. Criar o banco de dados (gratuito, ~3 minutos)

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New Project**.
2. Escolha um nome e uma senha para o banco (guarde a senha, mas ela não é usada pelo app).
3. Espere o projeto terminar de ser criado (cerca de 1-2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query** e cole o script abaixo. Clique em **Run**.

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  stock integer not null default 0,
  min_stock integer not null default 0,
  created_at timestamptz not null default now()
);

create table movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  type text not null check (type in ('entrada', 'saida')),
  quantity integer not null,
  note text,
  created_at timestamptz not null default now()
);

alter table products enable row level security;
alter table movements enable row level security;

create policy "Acesso público products" on products for all using (true) with check (true);
create policy "Acesso público movements" on movements for all using (true) with check (true);
```

> ⚠️ As políticas acima liberam leitura e escrita para qualquer pessoa que tenha a URL do seu projeto. Isso é aceitável para um app pessoal/uso interno simples. Se quiser exigir login, veja a seção "Adicionar autenticação" abaixo.

5. No menu lateral, vá em **Project Settings** → **API**. Copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o app

Ao abrir o app pela primeira vez, ele vai pedir essas duas informações (URL e anon key). Cole e clique em **Conectar**. Elas ficam salvas só no navegador de quem acessa (em `localStorage`), nunca no código.

## 3. Publicar no GitHub Pages

1. Crie um repositório novo no GitHub e suba estes arquivos (`index.html`, `style.css`, `app.js`).
2. No repositório, vá em **Settings** → **Pages**.
3. Em **Source**, selecione a branch `main` e a pasta `/ (root)`. Salve.
4. Em 1-2 minutos o GitHub vai gerar um link tipo `https://seu-usuario.github.io/seu-repositorio/`.

Pronto — o app está no ar, de graça, e qualquer pessoa que acessar o link vai precisar configurar (ou já vir com) a conexão ao mesmo Supabase pra ver os mesmos dados.

## Estrutura

```
estoque-app/
├── index.html   → estrutura das 4 telas (dashboard, produtos, movimentar, histórico)
├── style.css    → visual
├── app.js       → lógica e conexão com o Supabase
└── README.md
```

## Adicionar autenticação (opcional)

Se quiser que só você acesse os dados, dá para ativar **Email Auth** no Supabase (Authentication → Providers) e trocar as políticas de RLS para `using (auth.uid() is not null)`. Avise se quiser ajuda para configurar isso.
