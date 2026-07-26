# Atendimento — Paridade com o Chatwoot (lista-mestre priorizada)

Pesquisado no Chatwoot (docs oficiais + DeepWiki da arquitetura de settings). É um
produto com anos de desenvolvimento e **50+ telas/modais**. Este é o mapa completo,
por prioridade. Executamos de cima pra baixo, em ondas (loop).

Legenda: ✅ pronto · 🟡 parcial · 🧩 scaffold (tela existe, lógica mínima) · 🔲 falta
· 🔑 **depende do Stenio** (ver `ATENDIMENTO-PENDENCIAS.md`)

Fontes: chatwoot.com/features, chatwoot.com/hc/user-guide, deepwiki.com/chatwoot/chatwoot.

> **Estado geral (Ondas A–H entregues):** **117 rotas** compilando, `npm run build`
> verde, migrações **0031–0036 aplicadas** em produção. O que falta é quase todo
> **infra/credencial** (🔑): conectar um canal, ligar o cron dos jobs e liberar o
> acesso dos atendentes. Ver `ATENDIMENTO-PENDENCIAS.md`.

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
- ✅ **Segmentos/filtros salvos** — construtor de condições + contagem real

## P3 — Multichannel completo
- ✅ **Webhook da Evolution** (`/api/webhooks/evolution`) — recebe mensagem, mídia,
      status de entrega, QR e conexão, com validação de segredo
- ✅ **Envio unificado** (`src/lib/atendimento/outbound.ts`) — texto e mídia por
      Evolution **ou** Cloud API, escolhendo o canal da conversa
- ✅ Webhook da Meta (WhatsApp/Instagram/Facebook/Messenger) — já existia
- ✅ **Widget de site** (live-chat) — script embutível com Shadow DOM, API
      pública com CORS, pré-chat, aviso fora do horário
- ✅ **Telegram** (Bot API) — envio e recebimento, mídia copiada para o storage
- ✅ **E-mail** (Resend, com threading por `Message-ID`) · **SMS** (adaptador
      genérico) · **canal via API** — 🔑 todos sem credencial cadastrada

## P4 — Avançado / plataforma
- ✅ **Campanhas**: cadastro, seletor de público com cálculo real e **worker de
      envio** em `/api/atendimento/jobs` — 🔑 falta ligar o cron
- ✅ **Central de Ajuda**: portais, categorias, artigos, editor markdown com
      pré-visualização, publicar/despublicar/arquivar
- ✅ **Webhooks de saída** (HMAC, auto-desativação após 10 falhas) — **disparando**
      em conversa criada/atualizada/resolvida, mensagem e contato
- ✅ **Tokens de API** (só hash no banco) — 🟡 sem API pública que os valide
- ✅ **Registro de auditoria** — canais, acesso de agente, contatos, conversas
      e login; 🟡 falta caixas, macros, SLA e integrações
- ✅ **Templates de WhatsApp** — cadastro, sincronizar e enviar à Meta
- ✅ **Integrações** (Slack, Dialogflow, Tradutor) + **apps do painel** — 🟡
      credenciais guardadas, nada é chamado em evento ainda
- ✅ **Papéis personalizados** com catálogo de permissões — 🟡 quem controla
      acesso de fato ainda é a RLS, não o papel
- ✅ **Conta**: nome, idioma, fuso, auto-resolver, ocultar nome do agente

## P5 — IA (Capitão / Agentes IA)
- ✅ **Copiloto** dentro da conversa: sugerir resposta, resumir, classificar
      intenção — com cache e regras antialucinação — 🔑 exige `ANTHROPIC_API_KEY`
- ✅ Tela de IA com config por caixa, playground e histórico de uso
- ✅ **Base de conhecimento** alimentada pelos artigos publicados
- ✅ **Triagem automática**: classifica a intenção, etiqueta e roteia para a
      equipe. Roda só na criação da conversa (é o que triagem significa, e
      evita estourar o timeout do webhook)
- ✅ **Auto-resposta** fora do horário ou sem agente online, com trava
      anti-loop (1/hora e nunca duas seguidas sem o cliente falar)

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
6. **Onda F (feito)**: gancho das automações, jobs de fundo (snooze/SLA/campanha),
   webhooks de saída, tokens de API, auditoria, widget de site, IA
7. **Onda G (feito)**: participantes, marcar não lida, busca na thread, apagar
   mensagem, som e notificação, Telegram, e-mail/SMS/API, templates de WhatsApp,
   segmentos salvos, avatar, portal público da Central de Ajuda, papéis,
   integrações e configurações da conta
8. **Onda H (feito)**: webhooks de saída disparando nos eventos, auditoria
   instrumentada, triagem e auto-resposta por IA, relatório de SLA, bloqueio
   de contato valendo em todos os canais, categorias de resposta rápida
9. **Onda I (próxima)**: fazer os papéis mandarem de verdade (reescrever a
   RLS — 🔑 decisão do Stenio), auditoria nas telas de config, anexo MIME no
   e-mail, domínio próprio do portal, excluir canal
