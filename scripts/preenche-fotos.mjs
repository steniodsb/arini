// Preenche a foto de perfil das conversas de WhatsApp EM ABERTO.
//
//   node scripts/preenche-fotos.mjs [limite]
//
// A foto normalmente chega quando o contato escreve (decisão do Stenio:
// sem varredura dos 2.962 contatos). Este script existe para o caso em
// que isso falhou para todo mundo — em 24/09 eram 0 fotos em 363
// conversas, porque o servidor sem R2 saía antes de tentar — e a lista
// não pode ficar esperando cada cliente escrever de novo.
//
// Só conversas abertas (o que a equipe está vendo), uma de cada vez, e
// respeitando o carimbo de 30 dias: rodar de novo não repete a busca.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./testes/_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { atualizarAvatarDoContato } = await import("../src/lib/atendimento/avatar-contato.ts");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const limite = Number(process.argv[2] ?? 200);
const { data: canais } = await db.from("atendimento_channels")
  .select("id, config").eq("provedor", "evolution").eq("status", "conectado");
const cfgs = new Map((canais ?? []).map((c) => [c.id, {
  base_url: c.config.base_url, api_key: c.config.api_key, instance_name: c.config.instance_name,
}]));

const { data: convs } = await db.from("conversations")
  .select("id, contato_telefone, lead_id, avatar_em, channel_id")
  .eq("canal", "whatsapp").neq("status", "resolvida").is("avatar_url", null)
  .order("last_message_at", { ascending: false }).limit(limite);

let comFoto = 0, tentadas = 0;
for (const c of convs ?? []) {
  const cfg = cfgs.get(c.channel_id);
  if (!cfg) continue;
  tentadas++;
  const url = await atualizarAvatarDoContato(db, cfg, c);
  if (url) comFoto++;
}
console.log(`${tentadas} tentadas, ${comFoto} com foto (o resto não tem foto pública no WhatsApp)`);
