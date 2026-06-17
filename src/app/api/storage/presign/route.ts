import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isR2Configured, presignUpload, r2PublicUrl } from "@/lib/storage";

function safeExt(name: string): string {
  const ext = name.split(".").pop();
  return ext && ext.length <= 6 ? ext.toLowerCase() : "bin";
}

function sanitizeFolder(folder: string): string {
  // Evita path traversal e caracteres estranhos.
  return folder.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\.\.+/g, "").replace(/^\/+|\/+$/g, "");
}

/**
 * Retorna uma URL pré-assinada para o navegador subir o arquivo direto no R2.
 * Body: { folder: string, filename: string, contentType: string, index?: number }
 */
export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 não configurado no servidor" }, { status: 501 });
  }

  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { folder, filename, contentType, index } = await req.json();
  if (!folder || !filename) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });

  const cleanFolder = sanitizeFolder(String(folder));
  const ct = typeof contentType === "string" && contentType ? contentType : "application/octet-stream";
  const key = `${cleanFolder}/${Date.now()}-${index ?? 0}.${safeExt(String(filename))}`;

  try {
    const uploadUrl = await presignUpload(key, ct);
    return NextResponse.json({ uploadUrl, publicUrl: r2PublicUrl(key), key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao gerar URL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
