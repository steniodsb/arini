-- =====================================================================
-- 0014 — LINK DE MÍDIAS EXTERNAS (Drive) NA CAPTAÇÃO
-- Idempotente. Aplique após 0013.
--
-- Permite que a captação informe um link de drive (Google Drive, etc.)
-- com as mídias, como alternativa/complemento ao upload de arquivos.
-- =====================================================================

alter table public.property_capture_info
  add column if not exists link_midias text;
