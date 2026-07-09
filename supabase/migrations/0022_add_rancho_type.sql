-- =====================================================================
-- Adiciona o tipo de imóvel 'rancho' ao enum property_type.
-- Rancho passa a ser uma categoria PRÓPRIA, separada de "áreas rurais"
-- (fazenda/sítio/chácara/rural), no site e no CRM.
-- NÃO usar o valor novo nesta mesma migration (Postgres não permite usar
-- um valor de enum recém-criado na mesma transação) — o seed das
-- sequências de código fica no 0023.
-- Idempotente.
-- =====================================================================

alter type property_type add value if not exists 'rancho';
