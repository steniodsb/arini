-- =====================================================================
-- 0056 — FOTO DO CONTATO NA CONVERSA
--
-- Pedido em 23/09/2026: "deixar o layout mais parecido com o WhatsApp,
-- letras maiores e aparecer a foto das pessoas".
--
-- A foto NÃO vem no webhook — o WhatsApp manda só o `pushName`. Ela é
-- buscada na Evolution (`/chat/fetchProfilePictureUrl`) e a URL que volta
-- é da CDN do WhatsApp, com validade de ~10 dias (`oe=` no fim). Guardar
-- só o link daria uma lista cheia de imagens quebradas em duas semanas.
-- Por isso a foto é baixada e gravada no nosso R2, e `avatar_url` aponta
-- para lá — permanente.
--
-- A busca acontece quando o CONTATO ESCREVE (decisão do Stenio em
-- 23/09), não numa varredura dos 2.962 contatos: quem está ativo ganha
-- foto na primeira mensagem, quem nunca mais escreveu não gasta chamada.
-- `avatar_em` é o que impede repetir a busca a cada mensagem.
--
-- Fica na CONVERSA, e não só no lead, pelo mesmo motivo de
-- `contato_nome`/`contato_telefone` estarem aqui: a lista do inbox lê
-- `conversations` e nada mais. Um join por linha para pegar a foto seria
-- o custo errado no lugar mais quente da tela.
-- =====================================================================

alter table public.conversations
  add column if not exists avatar_url text,
  add column if not exists avatar_em timestamptz;

comment on column public.conversations.avatar_url is
  'Foto do contato, já copiada para o nosso storage (a URL do WhatsApp expira).';
comment on column public.conversations.avatar_em is
  'Quando a foto foi buscada por último — evita nova chamada a cada mensagem.';
