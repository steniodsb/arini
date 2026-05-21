# Arini Negócios Imobiliários — Site + CRM

Plataforma completa: **site público** + **CRM interno por setor** com fluxo de aprovação central.

Stack: Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres, Auth, Storage, RLS).

## Setup

### 1. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com as credenciais do seu projeto Supabase:

```bash
cp .env.example .env.local
```

Você precisa de:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → Dashboard Supabase → Project Settings → API
- `SUPABASE_PROJECT_REF` → ref do projeto (parte do subdomínio `*.supabase.co`)
- `SUPABASE_DB_PASSWORD` → senha do Postgres (Project Settings → Database)

### 2. Instalar dependências e aplicar schema

```bash
npm install
npm run db:migrate     # aplica supabase/migrations/* (tabelas, RLS, storage)
npm run db:seed-users  # cria 7 usuários (1 admin + 6 setoriais) com senha de SEED_USER_PASSWORD
```

> Alternativa manual (sem senha do banco): cole `supabase/migrations/0001_complete_schema.sql` e `0002_storage.sql` no SQL Editor do Supabase Dashboard.

### 3. Rodar localmente

```bash
npm run dev
```

- **Site público**: http://localhost:3000
- **CRM**: http://localhost:3000/admin/login

### 4. Deploy (Vercel)

Importe o repositório no Vercel e defina as variáveis públicas (`NEXT_PUBLIC_*`) e privadas (`SUPABASE_SERVICE_ROLE_KEY`) em Settings → Environment Variables.

---

## Estrutura

```
src/
├─ app/
│  ├─ (public)/         site (home, /imoveis, /imoveis/[codigo], /sobre, /contato)
│  ├─ admin/            CRM protegido por middleware
│  │   ├─ captacao/             setor 1
│  │   ├─ marketing/            setor 2
│  │   ├─ administrativo/       setor 3
│  │   ├─ aprovacoes/           inbox central
│  │   ├─ juridico/             setor 4
│  │   ├─ leads/                setor 5 (kanban)
│  │   ├─ financeiro-imovel/    setor 6
│  │   ├─ financeiro-empresarial/  setor 7
│  │   ├─ usuarios/             admin_central
│  │   ├─ auditoria/            logs
│  │   └─ configuracoes/
│  └─ api/              endpoints (leads público, decidir aprovação, criar usuário)
├─ components/          ui + crm + brand + public
├─ lib/                 supabase clients, auth, permissions, types
└─ middleware.ts        protege /admin
supabase/migrations/    SQL para aplicar
```

---

## Identidade

- **Verde Arini**: `#092316`
- **Gradient dourado**: `#F8BF32 → #D99212`
- **Tipografia**: Fraunces (display) + Inter (UI)

---

## Setores

| Setor | Acessa | Aprova |
|---|---|---|
| captacao | Imóveis próprios, upload mídia | — |
| marketing | Imóveis aprovados, campanhas | — |
| administrativo | Tudo | sim |
| juridico | Documentos, contratos | — |
| recepcao | Leads, funil, agendamentos | — |
| financeiro | Fechamentos, comissões, despesas | — |
| admin_central | Tudo + usuários + auditoria | sim |

---

## Fluxo principal

1. Captador cria imóvel em `/admin/captacao/novo` → status `aguardando_aprovacao_captacao`.
2. Admin aprova em `/admin/aprovacoes` → status `aprovado_captacao`.
3. Marketing configura divulgação em `/admin/marketing/[id]` → envia para aprovação.
4. Admin aprova → status `publicado`, aparece em `/imoveis`.
5. Visitante envia interesse → vira lead em `/admin/leads`.
6. Recepção move pelo kanban, registra interações e agendamentos.
7. Jurídico valida documentação em `/admin/juridico/[id]`.
8. Financeiro registra fechamento e comissão.
9. Tudo fica em `/admin/auditoria` (logs automáticos via triggers).

---

## Storage Buckets

- `property-media` (público) — imagens, vídeos, reels, tours
- `property-documents` (privado) — matrícula, IPTU, contratos
- `expense-receipts` (privado)
- `contracts` (privado)
- `avatars` (público)

---

## Integrações futuras (campos prontos)

- WhatsApp (Twilio / WhatsApp Business)
- Assinatura digital (D4Sign, Clicksign)
- Portais imobiliários (Zap, Viva Real)
- Arini Maps

---

## Observações

- Bucket de mídia é público. Para sensível, use signed URLs.
- Middleware redireciona `/admin/*` não autenticado para `/admin/login`.
- Triggers de auditoria registram automaticamente todas as mutações críticas.
- `fn_generate_property_code(type, category)` gera código de imóvel via RPC.
