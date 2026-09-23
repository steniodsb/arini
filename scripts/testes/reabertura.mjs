// Testa a VOLTA À CAIXA CENTRAL quando o cliente escreve depois de
// encerrado — contra o banco real, com conversa descartável.
//
//   node scripts/testes/reabertura.mjs
//
// A regra do Carlos (23/09): "toda conversa nova, mesmo de cliente
// antigo, volta para a caixa inicial até o cliente decidir o ramal".
// Antes, a conversa reabria dentro do ramal antigo (caso "Sirene").
//
// Tudo o que o teste cria é apagado no fim, inclusive se falhar. Nada é
// enviado ao WhatsApp: este módulo não envia nada por construção.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..", "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { devolverParaCaixaCentral } = await import("../../src/lib/atendimento/reabertura.ts");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };
const criadas = [];

async function conversa(sufixo, extra) {
  const { data, error } = await db.from("conversations").insert({
    canal: "whatsapp", external_id: `zz-reab-${sufixo}-${Date.now()}`,
    contato_nome: `ZZ ${sufixo}`, contato_telefone: "550000000000",
    status: "resolvida", resolvida_em: new Date().toISOString(), ...extra,
  }).select("id").single();
  if (error) throw new Error(error.message);
  criadas.push(data.id);
  return data.id;
}

async function main() {
  const { data: fila } = await db.from("atendimento_teams").select("id").limit(1).maybeSingle();
  const { data: pessoa } = await db.from("profiles").select("id").eq("atendimento_access", true).limit(1).maybeSingle();
  if (!fila || !pessoa) throw new Error("precisa de ao menos uma fila e um atendente no banco");

  // 1. Encerrada num ramal, com responsável → volta para a caixa central.
  const a = await conversa("ramal", {
    team_id: fila.id, responsavel_id: pessoa.id, triada_em: new Date().toISOString(), triada_por: pessoa.id,
  });
  await devolverParaCaixaCentral(db, { id: a, team_id: fila.id, responsavel_id: pessoa.id });
  const { data: depois } = await db.from("conversations").select("team_id, responsavel_id, triada_em, triada_por").eq("id", a).single();
  ok("1. fila limpa", depois.team_id === null);
  ok("1. responsável limpo", depois.responsavel_id === null);
  ok("1. carimbo de triagem limpo (é o que a põe na caixa central)", depois.triada_em === null && depois.triada_por === null);

  const { data: log } = await db.from("atendimento_transferencias").select("acao, de_equipe, de_agente, para_equipe, feito_por").eq("conversation_id", a);
  ok("1. registrou 'devolver' de onde saiu", log?.length === 1 && log[0].acao === "devolver" && log[0].de_equipe === fila.id && log[0].de_agente === pessoa.id && log[0].para_equipe === null);
  ok("1. sem autor humano (foi o cliente voltando)", log?.[0]?.feito_por === null);
  const { data: notas } = await db.from("messages").select("interna, remetente").eq("conversation_id", a);
  ok("1. deixou nota interna explicando", notas?.length === 1 && notas[0].interna === true && notas[0].remetente === "sistema");

  // 2. Já estava na caixa central: nada a registrar.
  const b = await conversa("central", {});
  await devolverParaCaixaCentral(db, { id: b, team_id: null, responsavel_id: null });
  const { data: logB } = await db.from("atendimento_transferencias").select("id").eq("conversation_id", b);
  ok("2. sem fila nem responsável: não registra transferência", (logB?.length ?? 0) === 0);

  // 3. Sem fila/responsável informados: relê do banco.
  const c = await conversa("rele", { team_id: fila.id, triada_em: new Date().toISOString() });
  await devolverParaCaixaCentral(db, { id: c });
  const { data: logC } = await db.from("atendimento_transferencias").select("de_equipe").eq("conversation_id", c);
  ok("3. relê a fila do banco quando não vem informada", logC?.length === 1 && logC[0].de_equipe === fila.id);
}

try { await main(); } catch (e) { falhas.push(`ERRO: ${e.message}`); }
finally {
  for (const id of criadas) {
    await db.from("atendimento_transferencias").delete().eq("conversation_id", id);
    await db.from("messages").delete().eq("conversation_id", id);
    await db.from("conversations").delete().eq("id", id);
  }
}
console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ o cliente que volta cai na caixa central — conversas de teste apagadas");
