-- =====================================================================
-- 0008 — CAPACIDADE E TIPOS DE UPLOAD DE MÍDIA
-- Idempotente. Aplique após 0007.
--
-- Por que: os buckets foram criados sem file_size_limit nem
-- allowed_mime_types, então caíam no default do projeto (frequentemente
-- 50MB) e rejeitavam vídeos/mídia bruta. Aqui ampliamos a capacidade e
-- liberamos os tipos de arquivo necessários (incl. RAW de câmera).
--
-- OBS: o limite GLOBAL do projeto Supabase também precisa ser >= ao
-- maior valor abaixo. Ajuste em Dashboard → Storage → Settings
-- (Project upload file size limit) se necessário.
-- =====================================================================

-- property-media: fotos, vídeos e mídia bruta (até 1 GB por arquivo)
update storage.buckets
set
  file_size_limit = 1073741824, -- 1 GB
  allowed_mime_types = array[
    -- imagens (web + bruta)
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'image/tiff','image/bmp','image/x-adobe-dng','image/x-canon-cr2','image/x-canon-cr3',
    'image/x-nikon-nef','image/x-sony-arw','image/x-panasonic-rw2','application/octet-stream',
    -- vídeos
    'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm',
    'video/mpeg','video/3gpp','video/x-m4v',
    -- pacotes/zip de material bruto
    'application/zip','application/x-zip-compressed'
  ]
where id = 'property-media';

-- marketing-media (criado em migration futura de marketing) — protege se já existir
update storage.buckets
set
  file_size_limit = 1073741824,
  allowed_mime_types = null -- aceita qualquer tipo de material editado
where id = 'marketing-media';

-- documentos / contratos / comprovantes: PDFs e imagens, até 100 MB
update storage.buckets
set file_size_limit = 104857600 -- 100 MB
where id in ('property-documents','contracts','expense-receipts');

-- avatars: imagens pequenas, até 5 MB
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'avatars';
