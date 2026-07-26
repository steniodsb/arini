-- =====================================================================
-- 0036 — Acrescenta 'telegram' e 'email' ao enum lead_origin.
--
-- Sem isto, todo contato que chega pelo Telegram ou por e-mail é gravado
-- como origem 'outros' — e o relatório de origem de lead mente.
--
-- ALTER TYPE ... ADD VALUE não roda dentro de um bloco de transação em
-- conjunto com o uso do valor novo, por isso esta migração fica sozinha,
-- sem nenhum insert que use os rótulos adicionados.
-- Idempotente (IF NOT EXISTS existe no Postgres 12+).
-- =====================================================================

alter type lead_origin add value if not exists 'telegram';
alter type lead_origin add value if not exists 'email';
