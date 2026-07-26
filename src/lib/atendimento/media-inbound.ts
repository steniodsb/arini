import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Configured, uploadBufferR2 } from "@/lib/storage";

// =====================================================================
// Mídia que CHEGA por webhook.
//
// Os provedores entregam a mídia como URL temporária, e cada um tem um
// problema diferente:
//   · Telegram — a URL contém o token do bot e expira em ~1 h. Guardar
//     essa URL no banco vazaria o token para qualquer um que abrisse o
//     histórico, e ainda assim o anexo sumiria depois.
//   · Evolution — sem S3 configurado, devolve a URL criptografada do
//     WhatsApp, que o navegador não abre.
//   · Cloud API — a URL exige o access_token no header.
//
// Em todos os casos a resposta é a mesma: baixar na hora e guardar no
// nosso storage. Aqui fica esse caminho, único para todos os canais.
// =====================================================================

/** Teto por arquivo. Acima disso guardamos só a referência, sem baixar. */
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function extensaoDoMime(mime: string, nomeOriginal?: string | null): string {
  const doNome = nomeOriginal?.split(".").pop();
  if (doNome && doNome.length <= 5 && /^[a-z0-9]+$/i.test(doNome)) return doNome.toLowerCase();
  const mapa: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
    "video/mp4": "mp4", "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  return mapa[mime.split(";")[0].trim()] ?? "bin";
}

export interface MidiaGuardada {
  url: string;
  path: string;
  mime: string;
  tamanho: number;
}

/**
 * Baixa a mídia da URL temporária e guarda no storage (R2 quando
 * configurado, senão Supabase Storage). Devolve `null` em qualquer falha
 * — quem chama é um webhook e precisa responder 200 de qualquer jeito;
 * perder o anexo é ruim, perder a mensagem inteira é pior.
 */
export async function guardarMidiaRecebida(
  admin: SupabaseClient,
  args: {
    urlTemporaria: string;
    conversationId: string;
    nomeOriginal?: string | null;
    /** Headers extras (ex.: Authorization da Cloud API). */
    headers?: Record<string, string>;
  },
): Promise<MidiaGuardada | null> {
  const { urlTemporaria, conversationId, nomeOriginal, headers } = args;
  try {
    const res = await fetch(urlTemporaria, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    const declarado = Number(res.headers.get("content-length") ?? 0);
    if (declarado > MAX_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return null;

    const mime = res.headers.get("content-type")?.split(";")[0].trim()
      || "application/octet-stream";
    const ext = extensaoDoMime(mime, nomeOriginal);
    // Sem Date.now() no nome não daria para receber dois arquivos iguais
    // na mesma conversa sem um sobrescrever o outro.
    const path = `atendimento/${conversationId}/recebidos/${Date.now()}.${ext}`;

    if (isR2Configured()) {
      const url = await uploadBufferR2(path, buffer, mime);
      return { url, path, mime, tamanho: buffer.byteLength };
    }

    const { error } = await admin.storage
      .from("property-media")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (error) return null;
    const { data } = admin.storage.from("property-media").getPublicUrl(path);
    return { url: data.publicUrl, path, mime, tamanho: buffer.byteLength };
  } catch {
    return null;
  }
}
