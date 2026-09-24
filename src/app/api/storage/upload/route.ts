import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { avisarSemR2, isR2Configured, uploadBufferR2 } from "@/lib/storage";

// =====================================================================
// POST /api/storage/upload  (multipart: folder, file)
//
// Upload PELO SERVIDOR, no lugar do PUT direto do navegador no R2.
//
// POR QUE EXISTE: em 23/09 o Carlos relatou "não conseguimos anexar
// documentos nas mensagens". A causa está fora do código: o CORS do
// bucket R2 libera só `crm.<domínio>` — o preflight a partir de
// `atendimento.<domínio>` responde 403 e TODO anexo mandado pelo
// atendimento morre antes de subir ("erro de rede/CORS no upload").
//
// Esta rota não depende do CORS: o navegador fala com o nosso próprio
// domínio e quem grava no R2 é o servidor. `uploadAtendimentoMedia`
// tenta o caminho direto primeiro (sem custo de banda para nós) e cai
// aqui quando ele falha. Ajustar o CORS no painel da Cloudflare continua
// valendo — mas o atendimento não pode ficar parado esperando isso.
//
// Teto de 50 MB: anexo de conversa (PDF, foto, áudio) fica bem abaixo;
// vídeo pesado continua pelo caminho direto quando o CORS permitir.
// =====================================================================

const MAX_BYTES = 50 * 1024 * 1024;

function safeExt(name: string): string {
  const ext = name.split(".").pop();
  return ext && ext.length <= 6 && /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : "bin";
}

function sanitizeFolder(folder: string): string {
  return folder.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\.\.+/g, "").replace(/^\/+|\/+$/g, "");
}

export async function POST(req: Request) {
  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "envie multipart/form-data com `folder` e `file`" }, { status: 400 });
  }
  const file = form.get("file");
  const folder = sanitizeFolder(String(form.get("folder") ?? ""));
  if (!(file instanceof File) || !folder) {
    return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "arquivo vazio" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `arquivo acima de ${MAX_BYTES / 1024 / 1024} MB — reduza ou envie por outro meio` },
      { status: 413 },
    );
  }

  const contentType = file.type || "application/octet-stream";
  const key = `${folder}/${Date.now()}-0.${safeExt(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (isR2Configured()) {
      const url = await uploadBufferR2(key, buffer, contentType);
      return NextResponse.json({ url, key });
    }
    // Sem R2: Supabase Storage, no mesmo bucket que o resto do app usa.
    avisarSemR2("anexo enviado");
    const admin = createSupabaseAdmin();
    const { error } = await admin.storage
      .from("property-media")
      .upload(key, buffer, { contentType, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data } = admin.storage.from("property-media").getPublicUrl(key);
    return NextResponse.json({ url: data.publicUrl, key });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao gravar o arquivo" },
      { status: 500 },
    );
  }
}
