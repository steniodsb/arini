-- =====================================================================
-- 0018 — NOVO SETOR 'aluguel'
-- Perfil dedicado à Gestão de Aluguéis (para o dia em que houver uma pessoa
-- só para locação). Precisa ser uma migration SEPARADA: um novo valor de enum
-- não pode ser USADO (ex.: em policies) na mesma transação em que é criado.
-- A 0019 (que referencia 'aluguel' nas policies) roda em transação separada.
-- =====================================================================
alter type sector add value if not exists 'aluguel';
