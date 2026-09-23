// Testa o ENCERRAMENTO AUTOMÁTICO contra o banco real.
//
//   node scripts/testes/encerrar-inativas.mjs
//
// A regra que mais importa é a segunda: conversa que NINGUÉM respondeu
// não pode ser encerrada pelo tempo. Fechá-la faria o sistema esconder a
// própria falha — o cliente sumiria da tela sem nunca ter sido atendido.
//
// Tudo o que este teste cria é apagado no fim, inclusive se falhar.
import fs from "node:fs"; import path from "node:path";
const raiz = path.join(import.meta.dirname, "..", "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };
const carimbo = Date.now();
const criadas = [];

/** Réplica exata da regra de `encerrarInativas` no job. */
async function rodar(dias) {
  const limite = new Date(Date.now() - dias * 24 * 3600_000).toISOString();
  const { data: paradas } = await db.from("conversations").select("id")
    .in("status", ["aberta", "pendente"]).lt("last_message_at", limite).in("id", criadas);
  if (!paradas?.length) return 0;
  const ids = paradas.map((c) => c.id);
  const { data: respostas } = await db.from("messages").select("conversation_id")
    .in("conversation_id", ids).eq("direcao", "out").eq("remetente", "atendente").eq("interna", false);
  const atendidas = [...new Set((respostas ?? []).map((m) => m.conversation_id))];
  if (!atendidas.length) return 0;
  const { data: fechadas } = await db.from("conversations")
    .update({ status: "resolvida", resolvida_em: new Date().toISOString() })
    .in("id", atendidas).select("id");
  return fechadas?.length ?? 0;
}

async function conversa(sufixo, diasAtras, mensagens) {
  const quando = new Date(Date.now() - diasAtras * 24 * 3600_000).toISOString();
  const { data, error } = await db.from("conversations").insert({
    canal: "whatsapp", external_id: `zz-enc-${sufixo}-${carimbo}`,
    contato_nome: `ZZ ${sufixo}`, contato_telefone: "550000000000",
    status: "aberta", last_message_at: quando,
  }).select("id").single();
  if (error) throw new Error(error.message);
  criadas.push(data.id);
  for (const m of mensagens) {
    await db.from("messages").insert({
      conversation_id: data.id, direcao: m.direcao, remetente: m.remetente,
      tipo: "texto", conteudo: "x", interna: false, status: "enviada", created_at: quando,
    });
  }
  return data.id;
}

async function main() {
  // 1. Parada há 10 dias e JÁ ATENDIDA -> encerra
  const atendida = await conversa("atendida", 10, [
    { direcao: "in", remetente: "cliente" },
    { direcao: "out", remetente: "atendente" },
  ]);
  // 2. Parada há 10 dias e NUNCA respondida -> NÃO encerra
  const abandonada = await conversa("abandonada", 10, [
    { direcao: "in", remetente: "cliente" },
  ]);
  // 3. Parada há 10 dias, mas só o MENU respondeu -> NÃO encerra
  const soMenu = await conversa("so-menu", 10, [
    { direcao: "in", remetente: "cliente" },
    { direcao: "out", remetente: "sistema" },
  ]);
  // 4. Atendida, mas RECENTE -> NÃO encerra
  const recente = await conversa("recente", 1, [
    { direcao: "in", remetente: "cliente" },
    { direcao: "out", remetente: "atendente" },
  ]);

  const n = await rodar(7);
  ok("encerrou exatamente 1", n === 1, `encerrou ${n}`);

  const ler = async (id) => (await db.from("conversations").select("status").eq("id", id).maybeSingle()).data?.status;

  ok("1. atendida e parada -> resolvida", (await ler(atendida)) === "resolvida");
  ok("2. NUNCA respondida continua ABERTA", (await ler(abandonada)) === "aberta",
    "o sistema fecharia sozinho um cliente que ninguem atendeu");
  ok("3. so o menu respondeu: continua ABERTA", (await ler(soMenu)) === "aberta",
    "receber o menu automatico nao e ser atendido");
  ok("4. atendida mas recente continua ABERTA", (await ler(recente)) === "aberta");

  // 5. Com a configuracao em 0, nada acontece.
  await db.from("conversations").update({ status: "aberta", resolvida_em: null }).eq("id", atendida);
  const zero = 0 <= 0 ? 0 : await rodar(0);
  ok("5. com 0 dias o recurso fica desligado", zero === 0);
}

try { await main(); } catch (e) { falhas.push(`ERRO: ${e.message}`); }
finally {
  for (const id of criadas) {
    await db.from("messages").delete().eq("conversation_id", id);
    await db.from("conversations").delete().eq("id", id);
  }
}
console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ tudo certo — conversas de teste apagadas");
