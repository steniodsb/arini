-- =====================================================================
-- 0043 — Cargo do colaborador
--
-- POR QUE UMA COLUNA NOVA, E NÃO `sector` OU `atendimento_papel`
-- --------------------------------------------------------------
-- As três respondem perguntas diferentes e nenhuma cobre a outra:
--   · `sector`            — em que setor do CRM de imóveis a pessoa está;
--   · `atendimento_papel` — o que ela PODE fazer na caixa (triar, atender,
--                           administrar). É o eixo da RLS da 0040;
--   · `cargo`             — quem ela É para quem olha a conversa:
--                           "Corretora", "Gerente de Locação", "Estagiário".
--
-- O cargo é IDENTIFICAÇÃO, não permissão. Ele existe para que, quando um
-- atendente assume um lead, o resto do time (e o administrador olhando o
-- histórico) veja "Ana Paula · Corretora" em vez de só um primeiro nome
-- que se repete em três pessoas.
--
-- Mora em `profiles`, e não numa tabela do atendimento, porque a mesma
-- pessoa é a mesma pessoa nos dois sistemas — o cargo aparece no CRM de
-- imóveis e no de atendimento sem sincronização nenhuma.
--
-- QUEM GRAVA
-- ----------
-- As rotas `/api/usuarios/create` e `/api/atendimento/agentes`, ambas com
-- service role e checagem de `is_admin_central`. A tela de perfil do
-- próprio agente mostra o cargo em modo leitura.
--
-- ⚠️ A policy de auto-update de `profiles` (que existe desde a 0001 para o
-- agente editar nome/telefone/avatar/assinatura) não distingue coluna, e
-- portanto tecnicamente permite que alguém grave o PRÓPRIO cargo via API.
-- É cosmético — o cargo não decide acesso a nada. Fechar isso exigiria
-- trocar a policy por GRANT por coluna, o que mexe em todos os outros
-- campos que a tela de perfil grava; não vale o risco por um rótulo.
--
-- Idempotente. Aplique após 0042.
-- =====================================================================

alter table public.profiles add column if not exists cargo text;

comment on column public.profiles.cargo is
  'Cargo/função exibido ao lado do nome (ex.: "Corretora", "Gerente de Locação"). Identificação, não permissão — quem manda no acesso é sector/atendimento_papel.';
