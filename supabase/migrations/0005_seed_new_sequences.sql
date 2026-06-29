-- =====================================================================
-- Sequências de código para as novas combinações de tipo × categoria
-- (precisa estar em migration separada do 0004 porque Postgres não deixa
-- usar valor de enum recém-adicionado na mesma transação)
-- =====================================================================

insert into public.property_code_sequences(type, category, prefix, next_seq) values
  ('loteamento'::property_type, 'venda'::property_category,        'LTM', 1),
  ('loteamento'::property_type, 'locacao'::property_category,      'LTL', 1),
  ('loteamento'::property_type, 'arrendamento'::property_category, 'LMA', 1),
  ('casa'::property_type,        'arrendamento'::property_category, 'CSA', 1),
  ('apartamento'::property_type, 'arrendamento'::property_category, 'APA', 1),
  ('fazenda'::property_type,     'arrendamento'::property_category, 'FZA', 1),
  ('sitio'::property_type,       'arrendamento'::property_category, 'STA', 1),
  ('chacara'::property_type,     'arrendamento'::property_category, 'CHA', 1),
  ('comercial'::property_type,   'arrendamento'::property_category, 'CMA', 1),
  ('rural'::property_type,       'arrendamento'::property_category, 'RUA', 1),
  ('terreno'::property_type,     'arrendamento'::property_category, 'TRA', 1),
  ('lote'::property_type,        'arrendamento'::property_category, 'LTA', 1),
  ('galpao'::property_type,      'arrendamento'::property_category, 'GPA', 1)
on conflict (type, category) do nothing;
