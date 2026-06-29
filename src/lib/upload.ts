import type { SupabaseClient } from "@supabase/supabase-js";
import { compressImageFile } from "./imageCompress";

export interface UploadResult {
  ok: number;
  failed: { name: string; error: string }[];
}

/** Limite de tamanho por arquivo (1 GB). */
export const MAX_UPLOAD_MB = 1024;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function tooBigMsg(): string {
  return `arquivo acima do limite de ${MAX_UPLOAD_MB} MB (1 GB) por arquivo`;
}

function safeExt(name: string): string {
  const ext = name.split(".").pop();
  return ext && ext.length <= 6 ? ext.toLowerCase() : "bin";
}

/** Traduz erros de upload para mensagens claras (ex.: arquivo acima do limite). */
export function uploadErrorMsg(raw: string): string {
  if (/exceed|too large|413|maximum allowed|payload too large|file size/i.test(raw)) {
    return "arquivo acima do limite de upload do servidor — reduza o arquivo ou aumente o limite de storage";
  }
  if (/mime|content type|not allowed/i.test(raw)) {
    return "tipo de arquivo não permitido pelo bucket";
  }
  if (/cors|failed to fetch|networkerror/i.test(raw)) {
    return "falha de rede/CORS no upload — verifique o CORS do bucket R2";
  }
  return raw;
}

/** Mídia vai para o Cloudflare R2? (definido por env público no deploy) */
export function isR2Active(): boolean {
  return process.env.NEXT_PUBLIC_STORAGE_DRIVER === "r2";
}

/** Progresso por bytes de um arquivo em upload. */
type FileProgress = (loaded: number, total: number) => void;

/**
 * Sobe UM arquivo direto no R2 via URL pré-assinada (presigned PUT).
 * Usa XHR para reportar progresso real (bytes). Retorna { url, key }.
 */
async function putToR2(
  folder: string,
  file: File,
  index: number,
  onFileProgress?: FileProgress,
): Promise<{ url: string; key: string }> {
  const contentType = file.type || "application/octet-stream";
  const presign = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, filename: file.name, contentType, index }),
  });
  if (!presign.ok) {
    const j = await presign.json().catch(() => ({}));
    throw new Error(j.error || "falha ao preparar upload");
  }
  const { uploadUrl, publicUrl, key } = await presign.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onFileProgress?.(ev.loaded, ev.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`falha no upload para o R2 (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("erro de rede/CORS no upload"));
    xhr.send(file);
  });

  return { url: publicUrl, key };
}

/**
 * Guarda UM arquivo de mídia no driver ativo (R2 ou Supabase Storage) e
 * devolve { url pública, key/path }. Lança em caso de erro.
 *  - R2: um único bucket; o `bucket` lógico vira prefixo de pasta.
 *  - Supabase: usa o bucket nomeado.
 */
async function storeMedia(
  supabase: SupabaseClient,
  bucket: string,
  folder: string,
  file: File,
  index: number,
  onFileProgress?: FileProgress,
): Promise<{ url: string; key: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMsg());
  if (isR2Active()) {
    return putToR2(`${bucket}/${folder}`, file, index, onFileProgress);
  }
  const path = `${folder}/${Date.now()}-${index}.${safeExt(file.name)}`;
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
    });
    if (!error) { lastErr = null; break; }
    lastErr = error.message;
  }
  if (lastErr) throw new Error(lastErr);
  onFileProgress?.(file.size, file.size);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, key: path };
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
    onByteProgress?: (loaded: number, total: number, currentName: string) => void;
  } = {},
): Promise<UploadResult> {
  const { startOrder = 0, markFirstAsCover = true, onProgress, onByteProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let baseBytes = 0;

  for (let i = 0; i < files.length; i++) {
    // Compressão leve no navegador antes de subir (só imagens).
    let file = files[i];
    if (file.type.startsWith("image/")) file = await compressImageFile(file);
    onProgress?.(i, files.length, file.name);

    let url: string, key: string;
    try {
      ({ url, key } = await storeMedia(supabase, "property-media", `${propertyId}`, file, i,
        (loaded) => onByteProgress?.(baseBytes + loaded, totalBytes, file.name)));
    } catch (e) {
      failed.push({ name: file.name, error: uploadErrorMsg(e instanceof Error ? e.message : String(e)) });
      continue;
    }

    const tipo = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "imagem"
        : "imagem";

    const { error: insErr } = await supabase.from("property_media").insert({
      property_id: propertyId,
      tipo,
      url,
      storage_path: key,
      ordem: startOrder + i,
      capa: markFirstAsCover && startOrder + i === 0,
      tamanho: file.size,
    });
    if (insErr) {
      failed.push({ name: file.name, error: insErr.message });
      continue;
    }
    baseBytes += file.size;
    onByteProgress?.(baseBytes, totalBytes, file.name);
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
    onByteProgress?: (loaded: number, total: number, currentName: string) => void;
  } = {},
): Promise<UploadResult> {
  const { campaignId = null, fase = "editada", onProgress, onByteProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let baseBytes = 0;

  for (let i = 0; i < files.length; i++) {
    // Compressão leve no navegador antes de subir (só imagens).
    let file = files[i];
    if (file.type.startsWith("image/")) file = await compressImageFile(file);
    onProgress?.(i, files.length, file.name);

    let url: string, key: string;
    try {
      ({ url, key } = await storeMedia(supabase, "marketing-media", `${propertyId}/${fase}`, file, i,
        (loaded) => onByteProgress?.(baseBytes + loaded, totalBytes, file.name)));
    } catch (e) {
      failed.push({ name: file.name, error: uploadErrorMsg(e instanceof Error ? e.message : String(e)) });
      continue;
    }

    const tipo = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "imagem" : "arquivo";

    const { error: insErr } = await supabase.from("marketing_media").insert({
      property_id: propertyId,
      campaign_id: campaignId,
      fase,
      tipo,
      url,
      storage_path: key,
      ordem: i,
    });
    if (insErr) { failed.push({ name: file.name, error: insErr.message }); continue; }
    baseBytes += file.size;
    onByteProgress?.(baseBytes, totalBytes, file.name);
    ok++;
  }

  onProgress?.(files.length, files.length, "");
  return { ok, failed };
}

/**
 * Upload de documentos de um IMÓVEL para o bucket property-documents,
 * registrando em property_documents (arquivo jurídico do imóvel).
 */
export async function uploadPropertyDocuments(
  supabase: SupabaseClient,
  propertyId: string,
  files: File[],
  opts: { tipo?: string; onProgress?: (done: number, total: number, currentName: string) => void } = {},
): Promise<UploadResult> {
  const { tipo = "outro", onProgress } = opts;
  const failed: { name: string; error: string }[] = [];
  let ok = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    if (file.size > MAX_UPLOAD_BYTES) { failed.push({ name: file.name, error: tooBigMsg() }); continue; }
    const path = `${propertyId}/${Date.now()}-${i}.${safeExt(file.name)}`;

    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from("property-documents")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600" });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
    }
    if (lastErr) { failed.push({ name: file.name, error: uploadErrorMsg(lastErr) }); continue; }

    const { data: urlData } = supabase.storage.from("property-documents").getPublicUrl(path);
    const { error: insErr } = await supabase.from("property_documents").insert({
      property_id: propertyId,
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
    if (file.size > MAX_UPLOAD_BYTES) { failed.push({ name: file.name, error: tooBigMsg() }); continue; }
    const path = `${clientId}/${Date.now()}-${i}.${safeExt(file.name)}`;

    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600" });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
    }
    if (lastErr) { failed.push({ name: file.name, error: uploadErrorMsg(lastErr) }); continue; }

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
