# Integração com n8n — Arini CRM

Este documento explica como integrar o Arini CRM com o **n8n** (ou qualquer
automação externa). Há três caminhos, do mais simples ao mais flexível.

> ⚠️ **Segredos**: as chaves (anon, service_role, senha do banco) NÃO ficam
> neste arquivo. Pegue-as no `.env` do app / no painel do Supabase. Nunca
> comite chaves no Git.

---

## 1. Supabase REST API (recomendado) — a "API própria" do backend

O backend é o **Supabase**, que gera automaticamente uma **API REST** para
todas as tabelas (PostgREST) e tem **node nativo no n8n**.

- **Base URL REST**: `https://<PROJECT_REF>.supabase.co/rest/v1`
  - Projeto atual: `https://vdqbwlxmaagjnfpcajwt.supabase.co/rest/v1`
- **Autenticação** (headers em toda requisição):
  ```
  apikey: <SUPABASE_KEY>
  Authorization: Bearer <SUPABASE_KEY>
  ```
  - Use a **service_role key** para automações de servidor (ignora RLS, acesso
    total — trate como senha de admin).
  - Use a **anon key** se quiser respeitar as regras de acesso (RLS).

### No n8n
- Adicione o **node "Supabase"** → credencial: Host = `https://vdqbwlxmaagjnfpcajwt.supabase.co`, Service Role Secret = a service_role key.
- Operações: **Create / Get / Get Many / Update / Delete** row, escolhendo a tabela.
- Ou use o node **HTTP Request** apontando para a REST URL acima.

### Tabelas principais
| Tabela | Conteúdo |
|---|---|
| `leads` | Leads (origem, estágio, contato, mensagem) |
| `properties` | Imóveis (código, status, valor, endereço, `publicado_no_site`) |
| `property_media` | Mídias do imóvel (url, tipo) |
| `clients` | Clientes (tipo, contato) |
| `commissions` / `expenses` / `incomes` | Financeiro |
| `bank_accounts` / `bank_account_balances` (view) | Contas e saldos |
| `marketing_campaigns` / `marketing_contents` / `marketing_media` | Marketing |
| `notifications` | Notificações por setor |
| `time_entries` | Ponto |
| `profiles` | Usuários/funcionários |

### Exemplos (HTTP)
Criar um lead:
```
POST https://vdqbwlxmaagjnfpcajwt.supabase.co/rest/v1/leads
Headers: apikey: <key> | Authorization: Bearer <key> | Content-Type: application/json | Prefer: return=representation
Body:
{
  "nome": "João",
  "whatsapp": "+5534999999999",
  "origem": "whatsapp",
  "stage": "novo",
  "observacoes": "veio do n8n"
}
```

Listar imóveis publicados:
```
GET https://vdqbwlxmaagjnfpcajwt.supabase.co/rest/v1/properties?publicado_no_site=eq.true&select=codigo,titulo,valor,bairro,cidade
Headers: apikey: <key> | Authorization: Bearer <key>
```

Filtros PostgREST: `?coluna=eq.valor`, `?coluna=ilike.*texto*`, `&order=created_at.desc`, `&limit=20`.

### Tempo real / triggers
- O Supabase suporta **Realtime** (websocket) e **Database Webhooks**
  (Supabase → Project → Database → Webhooks): dispara um POST para o n8n
  quando uma linha é inserida/atualizada (ex.: novo lead → aciona fluxo no n8n).

---

## 2. Endpoints próprios do app (entrada de dados)

Base: `https://crm.arininegociosimobiliarios.com.br`

### `POST /api/leads` — criar lead (aberto)
Cria um lead e notifica a recepção. Não exige autenticação.
```
POST /api/leads
Content-Type: application/json
{
  "nome": "Maria",
  "whatsapp": "+5534988887777",   // obrigatório
  "telefone": "...",               // opcional
  "email": "...",                  // opcional
  "mensagem": "Tenho interesse no terreno X",
  "interesse_tipo": "compra",      // compra | locacao | rural | investimento
  "imovel_interesse_id": "<uuid>", // opcional
  "referencia": "TRV-00003"        // opcional (texto livre)
}
→ 200 { "ok": true, "id": "<uuid do lead>" }
```

### `POST /api/webhooks/{plataforma}` — leads de redes sociais
`{plataforma}` = `instagram` | `facebook` | `whatsapp` | `tiktok` | `messenger`.
Recebe eventos das plataformas e cria leads automaticamente (precisa a
integração estar **ativa** em Admin → Integrações). Também responde ao
handshake `GET` de verificação do Meta (`hub.challenge`).

---

## 3. Acesso direto ao Postgres (avançado)

O n8n também tem node **Postgres**. Conexão:
```
Host: db.vdqbwlxmaagjnfpcajwt.supabase.co
Port: 5432
Database: postgres
User: postgres
Password: <SUPABASE_DB_PASSWORD>
SSL: require
```
Útil para consultas/relatórios complexos. Trate a senha como secreta.

---

## Recomendação de segurança

- Para automações server-to-server (n8n self-hosted), o caminho mais rápido é
  o **node Supabase com a service_role key**.
- Se for expor para terceiros ou quiser limitar o escopo, peça para criarmos um
  **endpoint dedicado `/api/n8n/*` protegido por API key** (header `X-API-Key`),
  liberando só as ações necessárias (ex.: criar lead, listar imóveis). Isso
  evita entregar a service_role (acesso total) ao n8n.
