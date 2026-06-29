-- =====================================================================
-- 0016 — LEITURA PÚBLICA DAS FOTOS EDITADAS (marketing_media)
-- Idempotente. Aplique após 0015.
--
-- Regra de negócio (decisão do cliente):
--   No site, quando o marketing já subiu a foto EDITADA, ela entra no
--   lugar das brutas. Enquanto não há editada, o site usa a bruta da
--   captação (property_media — que já tem política pública).
--
-- Para que o site (visitante anônimo) consiga exibir as editadas, é
-- preciso liberar SELECT público apenas para:
--   - fase = 'editada'  (nunca as brutas/recebidas)
--   - imóveis publicados no site
-- A política autenticada existente (mktmedia_read) continua valendo
-- para o CRM; as duas convivem (OR).
-- =====================================================================

drop policy if exists "mktmedia_read_public" on public.marketing_media;
create policy "mktmedia_read_public" on public.marketing_media for select using (
  fase = 'editada'
  and exists (
    select 1 from public.properties p
    where p.id = property_id and p.publicado_no_site = true
  )
);
