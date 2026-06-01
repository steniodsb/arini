import type { SupabaseClient } from "@supabase/supabase-js";

export interface UploadResult {
  ok: number;
  failed: { name: string; error: string }[];
}

function safeExt(name: string): string {
  const ext = name.split(".").pop();
  return ext && ext.length <= 6 ? ext.toLowerCase() : "bin";
}

/**
 * Faz upload de uma lista de arquivos para o bucket property-media e
 * registra cada um em property_media. Robusto: tenta cada arquivo, faz
 * 1 retry, e nunca aborta o lote por causa de um arquivo que falhou.
 *
 * `onProgress(done, total, currentName)` é chamado a cada arquivo.
 */
export async function uploadPropertyMedia(
  supabase: SupabaseClient,
  propertyId: string,
  files: File[],
  opts: {
    startOrder?: number;
    markFirstAsCover?: boolean;
    onProgress?: (done: number, total: number, currentName: string) => void;
  } = {},
): Promise<UploadResult> {
  const { startOrder = 0, markFirstAsCover = true, onProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    const path = `${propertyId}/${Date.now()}-${i}.${safeExt(file.name)}`;

    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from("property-media")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        });
      if (!upErr) {
        lastErr = null;
        break;
      }
      lastErr = upErr.message;
    }
    if (lastErr) {
      failed.push({ name: file.name, error: lastErr });
      continue;
    }

    const { data: urlData } = supabase.storage.from("property-media").getPublicUrl(path);
    const tipo = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "imagem"
        : "imagem";

    const { error: insErr } = await supabase.from("property_media").insert({
      property_id: propertyId,
      tipo,
      url: urlData.publicUrl,
      storage_path: path,
      ordem: startOrder + i,
      capa: markFirstAsCover && startOrder + i === 0,
      tamanho: file.size,
    });
    if (insErr) {
      failed.push({ name: file.name, error: insErr.message });
      continue;
    }
    ok++;
  }

  onProgress?.(files.length, files.length, "");
  return { ok, failed };
}

/**
 * Upload de mídias de marketing (brutas ou editadas) para o bucket
 * marketing-media, registrando em marketing_media.
 */
export async function uploadMarketingMedia(
  supabase: SupabaseClient,
  propertyId: string,
  files: File[],
  opts: {
    campaignId?: string | null;
    fase?: "bruta" | "editada";
    onProgress?: (done: number, total: number, currentName: string) => void;
  } = {},
): Promise<UploadResult> {
  const { campaignId = null, fase = "editada", onProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    const path = `${propertyId}/${fase}/${Date.now()}-${i}.${safeExt(file.name)}`;

    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from("marketing-media")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600" });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
    }
    if (lastErr) { failed.push({ name: file.name, error: lastErr }); continue; }

    const { data: urlData } = supabase.storage.from("marketing-media").getPublicUrl(path);
    const tipo = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "imagem" : "arquivo";

    const { error: insErr } = await supabase.from("marketing_media").insert({
      property_id: propertyId,
      campaign_id: campaignId,
      fase,
      tipo,
      url: urlData.publicUrl,
      storage_path: path,
      ordem: i,
    });
    if (insErr) { failed.push({ name: file.name, error: insErr.message }); continue; }
    ok++;
  }

  onProgress?.(files.length, files.length, "");
  return { ok, failed };
}

/**
 * Upload de documentos de um cliente para o bucket client-documents,
 * registrando em client_documents.
 */
export async function uploadClientDocuments(
  supabase: SupabaseClient,
  clientId: string,
  files: File[],
  opts: { tipo?: string; onProgress?: (done: number, total: number, currentName: string) => void } = {},
): Promise<UploadResult> {
  const { tipo = "outro", onProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    const path = `${clientId}/${Date.now()}-${i}.${safeExt(file.name)}`;

    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600" });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
    }
    if (lastErr) { failed.push({ name: file.name, error: lastErr }); continue; }

    const { data: urlData } = supabase.storage.from("client-documents").getPublicUrl(path);
    const { error: insErr } = await supabase.from("client_documents").insert({
      client_id: clientId,
      tipo,
      nome: file.name,
      url: urlData.publicUrl,
      storage_path: path,
    });
    if (insErr) { failed.push({ name: file.name, error: insErr.message }); continue; }
    ok++;
  }

  onProgress?.(files.length, files.length, "");
  return { ok, failed };
}
