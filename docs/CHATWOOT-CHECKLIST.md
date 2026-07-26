# Atendimento — Paridade com o Chatwoot (lista-mestre priorizada)

Pesquisado no Chatwoot (docs oficiais + DeepWiki da arquitetura de settings). É um
produto com anos de desenvolvimento e **50+ telas/modais**. Este é o mapa completo,
por prioridade. Executamos de cima pra baixo, em ondas (loop).

Legenda: ✅ pronto · 🟡 parcial · 🧩 scaffold (tela existe, lógica mínima) · 🔲 falta

Fontes: chatwoot.com/features, chatwoot.com/hc/user-guide, deepwiki.com/chatwoot/chatwoot.

---

## P0 — Núcleo do inbox (usável no dia a dia)
- ✅ Sistema separado (subdomínio, login/sessão próprios, acesso por flag)
- ✅ Shell com sidebar (Conversas, Contatos, Empresas, Relatórios, Campanhas, Canais, Config)
- ✅ Inbox 2 colunas + thread + resposta em tempo real (Realtime)
- ✅ Abas Minhas / Não atribuídas / Todos (contadores) + status + busca
- ✅ Atribuição de agente · status aberta/pendente/resolvida · notas internas
- ✅ Etiquetas na conversa · respostas rápidas · painel de contato (contexto CRM)
- 🔲 Anexos/mídia (enviar+receber imagem, áudio, documento, vídeo)
- 🔲 Snooze (adiar) + status "adiada"
- 🔲 Prioridade da conversa (baixa/média/alta/urgente) + ordenação
- 🔲 Ações em massa (selecionar várias: resolver/atribuir/etiquetar)
- 🔲 Menções @ + aba "Menções" + "Não atendidas"
- 🔲 Emoji picker · assinatura do agente · citar mensagem
- 🔲 Command bar (Cmd+K) + atalhos de teclado

## P1 — Operação de equipe (config essencial)
- 🟡 Contatos: lista (de leads) — falta detalhe, criar/editar/mesclar, importar CSV, notas
- 🧩 Empresas
- ✅ Config › Agentes (liberar acesso `atendimento_access`)
- ✅ Config › Equipes (times) — CRUD + membros
- ✅ Config › Etiquetas (catálogo com cor) — CRUD
- ✅ Config › Respostas rápidas — CRUD
- 🟡 Canais (WhatsApp: Evolution/Cloud/Coexistence) — falta config por caixa
- 🔲 Config › Caixas de entrada (agentes, horário, saudação, auto-atribuição, CSAT, pré-chat)
- 🟡 Relatórios: visão geral — faltam Agentes, Etiquetas, Times, Conversas no tempo, CSAV/CSAT, export CSV
- 🔲 Atribuir conversa a Equipe (coluna existe, falta UI)
- 🔲 Perfil do agente (avatar, assinatura, notificações, idioma, senha, sessões, token)

## P2 — Automação e escala
- 🔲 Macros (sequência de ações em 1 clique) + modal builder
- 🔲 Regras de automação (condições → ações, gatilhos)
- 🔲 Atributos personalizados (conversa e contato)
- 🔲 Horário comercial (business hours) + mensagem fora do horário
- 🔲 SLA (tempos: 1ª resposta, próxima, resolução) + alertas
- 🔲 CSAT (pesquisa de satisfação) + relatório
- 🔲 Segmentos/filtros salvos de conversas e contatos

## P3 — Multichannel completo
- 🔲 Widget de site (live-chat) + pré-chat + aparência
- 🔲 Instagram · Facebook Messenger · Telegram · E-mail (IMAP/SMTP) · SMS · API channel
- 🔲 Continuidade de conversa (e-mail) · respostas por e-mail

## P4 — Avançado / plataforma
- 🔲 Campanhas: ao vivo (widget) e disparo em massa (WhatsApp)
- 🔲 Central de Ajuda (Help Center): portais, categorias, artigos, publicação
- 🔲 Integrações (Slack, Dialogflow, etc.) + Aplicativos do painel
- 🔲 Webhooks · Tokens de API · Logs de auditoria
- 🔲 Papéis personalizados (permissões granulares) + billing
- 🔲 Pipeline/CRM kanban embutido (já existe no CRM Arini)

## P5 — IA (Capitão / Agentes IA)
- 🔲 Copiloto (sugestões ao atendente) · respostas sugeridas
- 🔲 Bot de triagem por intenção (Claude) · auto-resolução
- 🔲 Base de conhecimento p/ IA (FAQ) · handoff humano

---

### Ordem de execução (ondas do loop)
1. **Onda A (feito)**: shell + Config (Agentes/Equipes/Etiquetas/Respostas) + Contatos v1
2. **Onda B**: anexos/mídia, prioridade, snooze, ações em massa, atribuir a equipe
3. **Onda C**: caixas de entrada (config), relatórios completos, perfil do agente, contato detalhe
4. **Onda D**: automação (macros, regras), atributos personalizados, horário, SLA, CSAT
5. **Onda E**: multichannel (widget, IG, e-mail…), campanhas, help center
6. **Onda F**: IA (copiloto + bot)
