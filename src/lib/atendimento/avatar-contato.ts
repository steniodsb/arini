import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfilePictureUrl, type EvolutionConfig } from "@/lib/evolution";
import { isR2Configured, uploadBufferR2 } from "@/lib/storage";

// =====================================================================
// FOTO DO CONTATO — buscada quando ele escreve, guardada no nosso R2.
//
// Três decisões que definem este módulo:
//
//  1. SÓ QUANDO O CONTATO ESCREVE. Não há varredura dos 2.962 contatos:
//     quem está ativo ganha foto na primeira mensagem, quem sumiu não
//     gasta chamada. (Decisão do Stenio, 23/09/2026.)
//
//  2. BAIXA E GUARDA, não linka. A URL que a Evolution devolve é da CDN
//     do WhatsApp e expira em ~10 dias. Guardar o link daria uma lista
//     de imagens quebradas em duas semanas.
//
//  3. NUNCA ATRAPALHA O WEBHOOK. Tudo aqui é best-effort com prazo curto:
//     foto que falhou é foto que fica para a próxima mensagem. Derrubar o
//     recebimento da mensagem por causa da foto seria trocar o essencial
//     pelo cosmético.
// =====================================================================

/** Depois disso, vale buscar de novo — a pessoa pode ter trocado a foto. */
const RENOVAR_APOS_DIAS = 30;

/** Teto do arquivo. Foto de perfil do WhatsApp fica bem abaixo disso. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Prazo para baixar. O webhook precisa responder; a foto espera. */
const TIMEOUT_MS = 6000;

export interface ConversaParaAvatar {
  id: string;
  contato_telefone: string | null;
  lead_id: string | null;
  avatar_em: string | null;
}

/** Já tem foto recente? Então não gasta chamada. */
export function precisaBuscarAvatar(c: Pick<ConversaParaAvatar, "avatar_em">): boolean {
  if (!c.avatar_em) return true;
  const idade = Date.now() - new Date(c.avatar_em).getTime();
  return idade > RENOVAR_APOS_DIAS * 24 * 3600_000;
}

/**
 * Busca, baixa e grava a foto do contato. Devolve a URL final ou null.
 * Nunca lança.
 */
export async function atualizarAvatarDoContato(
  admin: SupabaseClient,
  cfg: EvolutionConfig,
  conversa: ConversaParaAvatar,
): Promise<string | null> {
  if (!conversa.contato_telefone) return null;
  if (!precisaBuscarAvatar(conversa)) return null;
  // Antes havia aqui `if (!isR2Configured()) return null`. O servidor de
  // produção NÃO tem as chaves do R2 (as mídias recebidas vão para o
  // Supabase Storage) — então a função saía nesta linha para TODO
  // contato, sem nem carimbar a tentativa: 0 fotos em 363 conversas em
  // 24/09 ("as fotos ainda não aparecem"). Agora usa o mesmo destino das
  // mídias recebidas quando o R2 não está configurado. Ver `guardar`.

  // Carimba ANTES de tentar. Se a busca falhar (contato sem foto, ou
  // privacidade), o carimbo evita bater na Evolution a cada mensagem
  // dessa pessoa — a próxima tentativa fica para daqui a 30 dias.
  const agora = new Date().toISOString();
  await admin.from("conversations").update({ avatar_em: agora }).eq("id", conversa.id);

  try {
    const url = await getProfilePictureUrl(cfg, conversa.contato_telefone);
    if (!url) return null;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) return null;

    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!mime.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    // Chave estável por telefone: trocar a foto SOBRESCREVE a anterior em
    // vez de acumular uma cópia por mês no bucket.
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const chave = `atendimento/avatars/${conversa.contato_telefone}.${ext}`;
    const publica = await guardar(admin, chave, buffer, mime);
    if (!publica) return null;

    // `?v=` na URL: a chave é a mesma, então sem isso o navegador
    // continuaria mostrando a foto antiga do cache depois da troca.
    const final = `${publica}?v=${Date.now()}`;

    await admin.from("conversations").update({ avatar_url: final }).eq("id", conversa.id);
    if (conversa.lead_id) {
      await admin.from("leads").update({ avatar_url: final }).eq("id", conversa.lead_id);
    }
    return final;
  } catch {
    return null;
  }
}

/**
 * Grava a foto no R2 quando ele está configurado no servidor; senão no
 * Supabase Storage, no mesmo bucket das mídias recebidas. `upsert`: a
 * chave é estável por telefone e trocar a foto sobrescreve.
 */
async function guardar(
  admin: SupabaseClient,
  chave: string,
  buffer: Buffer,
  mime: string,
): Promise<string | null> {
  if (isR2Configured()) return uploadBufferR2(chave, buffer, mime);
  const { error } = await admin.storage
    .from("property-media")
    .upload(chave, buffer, { contentType: mime, upsert: true });
  if (error) return null;
  return admin.storage.from("property-media").getPublicUrl(chave).data.publicUrl;
}
