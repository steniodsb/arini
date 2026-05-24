-- =====================================================================
-- Adiciona novas opções de enum (NÃO usar valores novos nesta migration)
--   property_category: 'arrendamento'
--   property_type:     'loteamento'
-- Idempotente.
-- =====================================================================

alter type property_category add value if not exists 'arrendamento';
alter type property_type     add value if not exists 'loteamento';
