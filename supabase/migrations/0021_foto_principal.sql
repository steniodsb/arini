-- =====================================================================
-- 0021 — FOTO PRINCIPAL (CAPA FIXA) DO IMÓVEL
-- Idempotente. Aplique após 0020.
--
-- Decisão do cliente: além das mídias (cruas/editadas), o imóvel passa a ter
-- uma FOTO PRINCIPAL própria, enviada no registro do imóvel. Essa foto fica
-- como CAPA no site (cards da home/listagem), independentemente de existir
-- foto editada do marketing — "a capa permanece esta, sendo editada ou não".
--
-- Guardamos a URL pública e o caminho no storage (para troca/remoção).
--   - Leitura pública: nenhuma policy nova é necessária. A política de leitura
--     de `properties` já libera os imóveis publicados (publicado_no_site=true)
--     e o SELECT acompanha as novas colunas.
--   - Escrita: o UPDATE de `properties` já é permitido a captação(dono),
--     administrativo, diretoria, jurídico e marketing (policy "props_update",
--     migration 0020). O arquivo vai para o bucket property-media, que já tem
--     política de escrita para esses setores (policy "media_write", 0001).
-- =====================================================================

alter table public.properties
  add column if not exists foto_principal_url  text,
  add column if not exists foto_principal_path text;
