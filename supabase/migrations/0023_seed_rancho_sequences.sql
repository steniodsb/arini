-- =====================================================================
-- Sequências de código para as combinações de 'rancho' × categoria.
-- Precisa estar em migration separada do 0022 porque o Postgres não deixa
-- usar um valor de enum recém-adicionado na mesma transação.
-- Prefixos: RCV (venda), RCL (locação), RCA (arrendamento), RCR (rural).
-- Idempotente.
-- =====================================================================

insert into public.property_code_sequences(type, category, prefix, next_seq) values
  ('rancho'::property_type, 'venda'::property_category,        'RCV', 1),
  ('rancho'::property_type, 'locacao'::property_category,      'RCL', 1),
  ('rancho'::property_type, 'arrendamento'::property_category, 'RCA', 1),
  ('rancho'::property_type, 'rural'::property_category,        'RCR', 1)
on conflict (type, category) do nothing;
