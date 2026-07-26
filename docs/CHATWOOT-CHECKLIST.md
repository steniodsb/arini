# Atendimento — Paridade com o Chatwoot (lista-mestre priorizada)

Pesquisado no Chatwoot (docs oficiais + DeepWiki da arquitetura de settings). É um
produto com anos de desenvolvimento e **50+ telas/modais**. Este é o mapa completo,
por prioridade. Executamos de cima pra baixo, em ondas (loop).

Legenda: ✅ pronto · 🟡 parcial · 🧩 scaffold (tela existe, lógica mínima) · 🔲 falta
· 🔑 **depende do Stenio** (ver `ATENDIMENTO-PENDENCIAS.md`)

Fontes: chatwoot.com/features, chatwoot.com/hc/user-guide, deepwiki.com/chatwoot/chatwoot.

> **Estado geral (Ondas A–E entregues):** 46 rotas compilando, `npm run build` verde,
> migrações 0031–0033 já aplicadas em produção. O que falta é quase todo
> **infra/credencial** (🔑): conectar um WhatsApp, ligar o cron dos jobs e
> liberar o acesso dos atendentes. Ver `ATENDIMENTO-PENDENCIAS.md`.

---

## P0 — Núcleo do inbox (usável no dia a dia)
- ✅ Sistema separado (subdomínio, login/sessão próprios, acesso por flag)
- ✅ Shell estilo Chatwoot: sidebar nomeada, recolhível, com subitens de Conversas
- ✅ **Tema claro / escuro / automático** (por agente, salvo no perfil, sem flash)
- ✅ Inbox 3 colunas + thread + tempo real (Supabase Realtime)
- ✅ Abas Minhas / Não atribuídas / Todos (contadores) + status + busca
- ✅ Atribuição de agente · **atribuição a equipe** · status · notas internas
- ✅ Etiquetas (catálogo com cor) · respostas rápidas · painel de contato
- ✅ **Anexos/mídia**: enviar e receber imagem, áudio, vídeo e documento
      (lightbox, player inline, cartão de download)
- ✅ **Snooze (adiar)** + status "adiada" + volta sozinha no prazo
- ✅ **Prioridade** (baixa/média/alta/urgente) + ordenação por prioridade
- ✅ **Ações em massa**: resolver, adiar, atribuir, priorizar, etiquetar, excluir
- ✅ **Menções @** em nota interna + notificação + aba "Menções"
- ✅ Aba "Não atendidas" (sem primeira resposta)
- ✅ **Emoji picker** · **assinatura do agente** · **citar mensagem**
- ✅ **Command bar (Ctrl/Cmd+K)** + **atalhos de teclado** (Ctrl+/ lista todos)
- ✅ Filtros avançados (canal, prioridade, equipe, etiqueta) + 4 ordenações
- ✅ Separadores de dia, status de entrega (✓/✓✓/lida), autor na bolha

## P1 — Operação de equipe (config essencial)
- ✅ Contatos: lista, detalhe (drawer), criar/editar, **mesclar**, **importar CSV**,
      notas, atributos personalizados, ações em massa
- ✅ Empresas: lista, CRUD, drawer de detalhe com contatos vinculados
- ✅ Config › Agentes (liberar acesso `atendimento_access`)
- ✅ Config › Equipes (times) — CRUD + membros
- ✅ Config › Etiquetas (catálogo com cor) — CRUD
- ✅ Config › Respostas rápidas — CRUD
- ✅ Config › **Caixas de entrada** — 6 abas (Geral, Agentes, Mensagens
      automáticas, Atribuição, Pré-chat, CSAT)
- ✅ **Relatórios completos**: visão geral, agentes, equipes, etiquetas, caixas,
      conversas no tempo (heatmap 7×24) + **exportar CSV**
- ✅ **Perfil do agente**: dados, avatar (URL), assinatura, aparência,
      disponibilidade, notificações, trocar senha
- 🟡 Canais (WhatsApp: Evolution/Cloud/Coexistence) — 🔑 falta credencial real

## P2 — Automação e escala
- ✅ **Macros** (construtor de sequência de ações) + aplicar dentro da conversa
- ✅ **Regras de automação** (condições → ações) — cadastro + motor
      (`src/lib/atendimento/automations.ts`)
- ✅ Motor **ligado aos webhooks** (`src/lib/atendimento/triggers.ts`): dispara
      `conversa_criada` e `mensagem_criada`, com horário comercial calculado
- ✅ **Atributos personalizados** (conversa e contato) + render no painel
- ✅ **Horário comercial** por caixa + mensagem fora do horário
- ✅ **SLA** — políticas + vínculo com a caixa (migração 0033) + job que marca violação
- ✅ **CSAT** — ativação por caixa + painel de resultado (média, distribuição, taxa)
- 🔲 Segmentos/filtros salvos (tabela `atendimento_segments` pronta, falta UI)

## P3 — Multichannel completo
- ✅ **Webhook da Evolution** (`/api/webhooks/evolution`) — recebe mensagem, mídia,
      status de entrega, QR e conexão, com validação de segredo
- ✅ **Envio unificado** (`src/lib/atendimento/outbound.ts`) — texto e mídia por
      Evolution **ou** Cloud API, escolhendo o canal da conversa
- ✅ Webhook da Meta (WhatsApp/Instagram/Facebook/Messenger) — já existia
- 🔲 Widget de site (live-chat) + pré-chat renderizado no site
- 🔲 Telegram · E-mail (IMAP/SMTP) · SMS · API channel
      (a caixa de entrada já aceita esses canais no cadastro)

## P4 — Avançado / plataforma
- ✅ **Campanhas**: cadastro, seletor de público com cálculo real e **worker de
      envio** em `/api/atendimento/jobs` — 🔑 falta ligar o cron
- ✅ **Central de Ajuda**: portais, categorias, artigos, editor markdown com
      pré-visualização, publicar/despublicar/arquivar
- 🧩 Webhooks · Tokens de API · Registro de auditoria (telas honestas de "falta")
- 🔲 Integrações (Slack, Dialogflow) + Aplicativos do painel
- 🔲 Papéis personalizados (permissões granulares) + billing

## P5 — IA (Capitão / Agentes IA)
- 🧩 Tela de Agentes IA com os 3 recursos planejados e o que falta para ligar
- 🔲 Copiloto (sugestões ao atendente) — 🔑 exige `ANTHROPIC_API_KEY`
- 🔲 Bot de triagem por intenção · auto-resolução
- 🔲 Base de conhecimento p/ IA (usa os artigos da Central de Ajuda)

---

### Ordem de execução (ondas do loop)
1. **Onda A (feito)**: shell + Config (Agentes/Equipes/Etiquetas/Respostas) + Contatos v1
2. **Onda B (feito)**: anexos, prioridade, snooze, ações em massa, equipe, menções,
   emoji, citar, assinatura, command bar, atalhos, filtros
3. **Onda C (feito)**: caixas de entrada, relatórios completos, perfil do agente,
   contato detalhe/mesclar/importar, empresas
4. **Onda D (feito)**: macros, regras de automação, atributos personalizados,
   horário comercial, SLA, CSAT
5. **Onda E (feito)**: webhook + envio Evolution, campanhas, central de ajuda,
   tema claro/escuro
6. **Onda F (próxima)**: widget de site, Telegram/e-mail/SMS, IA, webhooks de
   saída e tokens de API. (Gancho das automações, job de SLA, worker de
   campanha e cron de snooze já entraram nesta onda — ver `/api/atendimento/jobs`.)
