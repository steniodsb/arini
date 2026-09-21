-- =====================================================================
-- 0053 — ASSINAR A MENSAGEM COM O NOME DE QUEM RESPONDE
--
-- Pedido do Carlos no áudio de 18/09/2026 07:21: "o setor de marketing,
-- um exemplo, Michelle e Vítor. Qual dos dois estaria respondendo, pra
-- mim saber quem tá dando continuidade na conversa, fica mais fácil de
-- eu chamar a atenção se precisar."
--
-- Fica na CAIXA e não no perfil de cada agente porque é decisão de
-- operação, não preferência pessoal: ou o WhatsApp da empresa identifica
-- quem fala, ou não identifica. Deixar cada atendente escolher produziria
-- metade das conversas assinadas — exatamente a dúvida que ele quer
-- eliminar.
--
-- Nasce DESLIGADO: ligar muda o texto que chega ao cliente.
--
-- Não confundir com `profiles.assinatura`, que já existia e continua: lá
-- é bloco de despedida, livre, no fim, opcional por mensagem. Ver
-- `src/lib/atendimento/assinatura.ts`.
-- =====================================================================

alter table public.atendimento_inboxes
  add column if not exists assinar_com_nome boolean not null default false;

comment on column public.atendimento_inboxes.assinar_com_nome is
  'Prefixa a resposta do atendente com "*PrimeiroNome:*" antes de enviar ao cliente.';
