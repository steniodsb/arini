// Tenta de novo baixar a mídia RECEBIDA que ficou sem arquivo ("[video]").
//
//   node scripts/recupera-midia.mjs [horas=48]
//
// Existe por causa do vídeo de 40 MB de 24/09: acima do teto antigo de
// 25 MB e do prazo de 20 s, a mensagem era gravada sem o arquivo. A
// Evolution ainda guarda a chave da mídia por algum tempo; este script
// pede de novo e grava no storage (R2 quando configurado).
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./testes/_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { getMediaBase64 } = await import("../src/lib/evolution.ts");
const { guardarBufferRecebido } = await import("../src/lib/atendimento/media-inbound.ts");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const horas = Number(process.argv[2] ?? 48);
const { data: canais } = await db.from("atendimento_channels").select("id, config").eq("provedor", "evolution");
const cfgs = new Map((canais ?? []).map((c) => [c.id, { base_url: c.config.base_url, api_key: c.config.api_key, instance_name: c.config.instance_name }]));

const { data: faltando } = await db.from("messages")
  .select("id, conversation_id, tipo, media_mime, media_nome, raw_payload, conversations(channel_id)")
  .in("tipo", ["video", "imagem", "audio", "documento"]).is("media_url", null).is("apagada_em", null)
  .gt("created_at", new Date(Date.now() - horas * 3600e3).toISOString());

let ok = 0;
for (const m of faltando ?? []) {
  const key = m.raw_payload?.data?.key;
  const cfg = cfgs.get(m.conversations?.channel_id);
  if (!key || !cfg) { console.log(`  - ${m.id}: sem chave/canal`); continue; }
  const b = await getMediaBase64(cfg, key);
  if (!b) { console.log(`  ✗ ${m.id} (${m.tipo}): a Evolution não devolveu o arquivo`); continue; }
  const s = await guardarBufferRecebido(db, { buffer: b.buffer, mime: m.media_mime || b.mime, conversationId: m.conversation_id, nomeOriginal: m.media_nome });
  if (!s) { console.log(`  ✗ ${m.id}: não gravou`); continue; }
  await db.from("messages").update({ media_url: s.url, media_mime: s.mime, media_tamanho: s.tamanho }).eq("id", m.id);
  ok++; console.log(`  ✓ ${m.tipo} ${(s.tamanho / 1048576).toFixed(1)} MB → ${new URL(s.url).host}`);
}
console.log(`${ok} de ${faltando?.length ?? 0} recuperadas`);
