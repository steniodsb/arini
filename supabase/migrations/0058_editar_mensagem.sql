-- =====================================================================
-- 0058 — EDITAR MENSAGEM ENVIADA
--
-- Pedido do Carlos em 24/09/2026: "não é possível editar as mensagens
-- enviadas". O WhatsApp permite editar TEXTO até 15 minutos depois do
-- envio; a Evolution expõe isso em /chat/updateMessage. Foto, áudio e
-- vídeo não se editam.
--
-- `conteudo_original` guarda o texto como saiu na PRIMEIRA vez, e só é
-- preenchido na primeira edição: é o que responde "o que o cliente leu
-- antes?" numa discussão sobre o que foi combinado. Editar de novo não
-- sobrescreve — o original é um só.
--
-- Vale também para mensagem que o CLIENTE editou no celular dele: o
-- webhook aplica a edição e guarda o original do mesmo jeito.
--
-- Idempotente. Aplique após 0057.
-- =====================================================================

alter table public.messages
  add column if not exists editada_em timestamptz,
  add column if not exists conteudo_original text;

comment on column public.messages.editada_em is
  'Quando o texto foi editado pela última vez (pela equipe ou pelo cliente no WhatsApp).';
comment on column public.messages.conteudo_original is
  'O texto como saiu na primeira vez. Preenchido só na primeira edição.';
