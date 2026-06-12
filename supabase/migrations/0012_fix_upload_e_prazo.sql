-- =====================================================================
-- 0012 — CORREÇÃO DE UPLOAD DE VÍDEO/MÍDIA + PRAZO PARA INDICAR ATRASO
-- Idempotente. Aplique após 0011.
--
-- Problema 1: vídeos não subiam. O bucket property-media tinha uma lista
-- fixa de MIME types; arquivos de vídeo/celular com MIME fora da lista
-- eram rejeitados. Liberamos qualquer tipo (a validação de tamanho/tipo
-- já é feita no cliente).
--
-- ⚠️ IMPORTANTE (fora do SQL): no painel do Supabase, em
-- Settings → Storage, aumente o "Global file upload limit" para um valor
-- >= ao tamanho dos vídeos (ex.: 1 GB). Sem isso, vídeos grandes falham
-- mesmo com o limite do bucket alto.
-- =====================================================================

update storage.buckets
set allowed_mime_types = null,        -- aceita qualquer tipo (fotos, vídeos, RAW, zip)
    file_size_limit = 1073741824      -- 1 GB por arquivo
where id = 'property-media';

-- Prazo opcional nas aprovações, para sinalizar atraso (item vermelho).
alter table public.approvals add column if not exists prazo date;
