-- =====================================================================
-- 0055 — O RAMAL TAMBÉM PARA QUEM JÁ É CLIENTE
--
-- Pedido do Carlos nos áudios de 22/09/2026 14h02–14h04. O texto dele
-- explica melhor que qualquer resumo:
--
--   "A minha carteira é desde 2011. Tem vários clientes que já são da
--    imobiliária e vivem entrando em contato. Às vezes, quando não é
--    comigo, é com o setor do despachante. (…) Quando a gente concluir
--    no CRM como resolvido, ele volta pra base principal. Se ele entrar
--    em contato de novo, ele seleciona o setor que ele quer novamente."
--
-- Até aqui o menu só valia para contato NOVO — o que, numa imobiliária
-- com quinze anos de carteira, deixava de fora justamente quem mais
-- escreve.
--
-- A REGRA QUE ELE DESENHOU, e que é a parte importante: o ramal volta
-- SOMENTE depois de o atendimento anterior ser marcado como RESOLVIDO.
-- Enquanto a conversa está em andamento, mandar o menu de novo seria
-- interromper quem está no meio de um assunto para perguntar com qual
-- setor ele quer falar — sendo que ele já está falando com um.
--
-- Fica como escolha, e não como comportamento fixo, porque as duas
-- operações são legítimas: quem atende sempre pela mesma pessoa não quer
-- o menu voltando, e quem opera por setores quer.
-- =====================================================================

alter table public.atendimento_menus
  add column if not exists reenviar_apos_resolver boolean not null default false;

comment on column public.atendimento_menus.reenviar_apos_resolver is
  'Quando true, o menu volta a ser enviado se o cliente escrever depois de a conversa ter sido marcada como resolvida. Falso = só em contato novo.';
