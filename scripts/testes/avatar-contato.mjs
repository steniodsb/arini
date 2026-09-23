// Testa a FOTO DO CONTATO de ponta a ponta: Evolution -> download -> R2 -> banco.
//
//   node scripts/testes/avatar-contato.mjs
//
// Usa um numero REAL da carteira (so leitura na Evolution, so escrita no
// nosso R2 e numa conversa DESCARTAVEL criada aqui). Nada e enviado.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..", "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { atualizarAvatarDoContato, precisaBuscarAvatar } = await import("../../src/lib/atendimento/avatar-contato.ts");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };
let convId = null;

try {
  // --- regra de renovacao (pura) ---
  ok("sem carimbo: busca", precisaBuscarAvatar({ avatar_em: null }));
  ok("carimbo de ontem: NAO busca", !precisaBuscarAvatar({ avatar_em: new Date(Date.now() - 86400e3).toISOString() }));
  ok("carimbo de 40 dias: busca de novo", precisaBuscarAvatar({ avatar_em: new Date(Date.now() - 40 * 86400e3).toISOString() }));

  // --- ponta a ponta ---
  const { data: ch } = await db.from("atendimento_channels").select("config").eq("provedor", "evolution").limit(1).maybeSingle();
  const cfg = { base_url: ch.config.base_url, api_key: ch.config.api_key, instance_name: ch.config.instance_name };
  // ESCOLHE UM NUMERO QUE TENHA FOTO PUBLICA. A primeira versao pegava
  // "quem escreveu por ultimo" e caiu de 9/9 para 5/9 sem ninguem mexer
  // no codigo: o ultimo a escrever era alguem sem foto (ou com
  // privacidade), a Evolution devolveu null — corretamente — e o teste
  // acusou defeito onde nao havia. Um teste que depende do humor do
  // ultimo cliente nao e teste.
  const { getProfilePictureUrl } = await import("../../src/lib/evolution.ts");
  const { data: recentes } = await db.from("conversations").select("contato_telefone")
    .eq("canal", "whatsapp").not("contato_telefone", "is", null)
    .order("last_message_at", { ascending: false }).limit(15);
  let real = null;
  for (const c of recentes ?? []) {
    if (await getProfilePictureUrl(cfg, c.contato_telefone)) { real = c; break; }
  }
  if (!real) {
    console.log("  (nenhum dos 15 contatos recentes tem foto publica — ponta a ponta pulada, nao falhada)");
    throw Object.assign(new Error("SEM_FOTO_DISPONIVEL"), { pular: true });
  }

  const { data: c } = await db.from("conversations").insert({
    canal: "whatsapp", external_id: `zz-avatar-${Date.now()}`, contato_nome: "ZZ Avatar",
    contato_telefone: real.contato_telefone, status: "aberta",
  }).select("id").single();
  convId = c.id;

  const url = await atualizarAvatarDoContato(db, cfg, { id: convId, contato_telefone: real.contato_telefone, lead_id: null, avatar_em: null });
  ok("foto buscada, baixada e gravada no R2", typeof url === "string" && url.startsWith("http"), `voltou: ${url}`);
  ok("a URL e NOSSA, nao a do WhatsApp", url && !url.includes("whatsapp.net"), url);

  const { data: lida } = await db.from("conversations").select("avatar_url, avatar_em").eq("id", convId).maybeSingle();
  ok("gravou na conversa", lida?.avatar_url === url);
  ok("carimbou o horario", Boolean(lida?.avatar_em));

  // A imagem realmente existe no bucket?
  const r = url ? await fetch(url) : { ok: false, status: 0, headers: new Headers() };
  ok("a foto abre no nosso storage", r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"), `HTTP ${r.status} ${r.headers.get("content-type")}`);

  // Segunda chamada em seguida NAO busca de novo (carimbo recente).
  const denovo = await atualizarAvatarDoContato(db, cfg, { id: convId, contato_telefone: real.contato_telefone, lead_id: null, avatar_em: lida.avatar_em });
  ok("mensagem seguinte nao repete a busca", denovo === null);
} catch (e) { if (!e.pular) falhas.push(`ERRO: ${e.message}`); }
finally { if (convId) await db.from("conversations").delete().eq("id", convId); }

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ tudo certo — conversa de teste apagada (a foto fica no bucket, chave por telefone)");
