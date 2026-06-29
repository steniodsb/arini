import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyMedia } from "./types";

export interface GalleryImage {
  id: string;
  url: string;
}

type EditedRow = { property_id: string; url: string; ordem: number };
type RawCoverRow = Pick<PropertyMedia, "property_id" | "url" | "capa">;

/**
 * Capa pública por imóvel (home/listagem).
 *
 * Regra (decisão do cliente): se o marketing já subiu foto EDITADA, ela entra
 * no lugar das brutas; enquanto não há editada, usa a foto bruta da captação.
 * As editadas só são visíveis ao público via a política RLS `mktmedia_read_public`
 * (ver migration 0016) — fase 'editada' e imóvel publicado.
 */
export async function getPublicCovers(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Record<string, string>> {
  const covers: Record<string, string> = {};
  if (!ids.length) return covers;

  // 1) Preferência: foto editada (menor ordem = capa).
  const { data: edited } = await supabase
    .from("marketing_media")
    .select("property_id, url, ordem")
    .in("property_id", ids)
    .eq("fase", "editada")
    .eq("tipo", "imagem")
    .order("ordem", { ascending: true });
  for (const m of (edited ?? []) as EditedRow[]) {
    if (!covers[m.property_id]) covers[m.property_id] = m.url;
  }

  // 2) Fallback: bruta da captação, só para quem ainda não tem editada.
  const missing = ids.filter((id) => !covers[id]);
  if (missing.length) {
    const { data: raw } = await supabase
      .from("property_media")
      .select("property_id, url, capa")
      .in("property_id", missing)
      .eq("tipo", "imagem");
    for (const m of (raw ?? []) as RawCoverRow[]) {
      if (!covers[m.property_id] || m.capa) covers[m.property_id] = m.url;
    }
  }
  return covers;
}

/**
 * Galerias públicas de VÁRIOS imóveis de uma vez (para o carrossel dos cards
 * na home e na listagem). Mesma regra das capas: editadas substituem as brutas.
 * `perProperty` limita quantas imagens trazer por imóvel (default 8).
 */
export async function getPublicGalleries(
  supabase: SupabaseClient,
  ids: string[],
  perProperty = 8,
): Promise<Record<string, GalleryImage[]>> {
  const galleries: Record<string, GalleryImage[]> = {};
  if (!ids.length) return galleries;

  // 1) Editadas do marketing (preferência).
  const { data: edited } = await supabase
    .from("marketing_media")
    .select("id, property_id, url, ordem")
    .in("property_id", ids)
    .eq("fase", "editada")
    .eq("tipo", "imagem")
    .order("ordem", { ascending: true });
  for (const m of (edited ?? []) as (GalleryImage & { property_id: string })[]) {
    (galleries[m.property_id] ??= []).push({ id: m.id, url: m.url });
  }

  // 2) Fallback: brutas da captação, só para quem ainda não tem editada.
  const missing = ids.filter((id) => !galleries[id]?.length);
  if (missing.length) {
    const { data: raw } = await supabase
      .from("property_media")
      .select("id, property_id, url, capa, ordem")
      .in("property_id", missing)
      .eq("tipo", "imagem")
      .order("capa", { ascending: false })
      .order("ordem", { ascending: true });
    for (const m of (raw ?? []) as (GalleryImage & { property_id: string })[]) {
      (galleries[m.property_id] ??= []).push({ id: m.id, url: m.url });
    }
  }

  // Aplica o limite por imóvel.
  for (const id of Object.keys(galleries)) {
    galleries[id] = galleries[id].slice(0, perProperty);
  }
  return galleries;
}

/**
 * Galeria pública de um imóvel (página de detalhe).
 * Mesma regra: editadas substituem as brutas; sem editada, mostra as brutas.
 */
export async function getPublicGallery(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<GalleryImage[]> {
  const { data: edited } = await supabase
    .from("marketing_media")
    .select("id, url, ordem")
    .eq("property_id", propertyId)
    .eq("fase", "editada")
    .eq("tipo", "imagem")
    .order("ordem", { ascending: true });
  const editedImgs = (edited ?? []) as GalleryImage[];
  if (editedImgs.length) return editedImgs.map((m) => ({ id: m.id, url: m.url }));

  const { data: raw } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", propertyId)
    .eq("tipo", "imagem")
    .order("capa", { ascending: false })
    .order("ordem", { ascending: true });
  return ((raw ?? []) as PropertyMedia[]).map((m) => ({ id: m.id, url: m.url }));
}
