// Testa a EXCLUSÃO de agente contra o banco real.
//
//   node scripts/testes/agente-excluir.mjs
//
// O que precisa ficar provado: conta sem histórico some; conta COM
// histórico é recusada pelo banco. A segunda metade é a que importa —
// apagar quem já trabalhou destruiria o registro de quem fez o quê.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..", "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };
const carimbo = Date.now();
const criados = [];

async function novaConta(sufixo) {
  const email = `zz.del.${sufixo}.${carimbo}@exemplo-invalido.test`;
  const { data, error } = await db.auth.admin.createUser({
    email, password: `zzDel!${carimbo}`, email_confirm: true,
    user_metadata: { nome: `ZZ Del ${sufixo}`, sector: "recepcao" },
  });
  if (error) throw new Error(error.message);
  criados.push(data.user.id);
  await db.from("profiles").upsert({ id: data.user.id, nome: `ZZ Del ${sufixo}`, email, sector: "recepcao", ativo: true }, { onConflict: "id" });
  return data.user.id;
}

async function main() {
  // --- 1) Conta virgem: some ------------------------------------------
  const limpo = await novaConta("limpa");
  const { error: e1 } = await db.from("profiles").delete().eq("id", limpo);
  ok("1. conta sem histórico é apagada", !e1, e1?.message);
  const { data: sumiu } = await db.from("profiles").select("id").eq("id", limpo).maybeSingle();
  ok("1. e a linha realmente sumiu", !sumiu);
  const { error: eAuth } = await db.auth.admin.deleteUser(limpo);
  ok("1. o usuário de auth também", !eAuth, eAuth?.message);

  // --- 2) Conta COM histórico: o banco recusa --------------------------
  const usado = await novaConta("usada");
  // Um vínculo qualquer que aponte para o perfil com NO ACTION.
  const { data: conv } = await db.from("conversations").select("id").limit(1).maybeSingle();
  if (!conv) throw new Error("preciso de uma conversa existente para o teste");
  const { error: eIns } = await db.from("atendimento_transferencias").insert({
    conversation_id: conv.id, acao: "assumir", feito_por: usado,
  });
  ok("2. cenário: a pessoa tem um movimento registrado", !eIns, eIns?.message);

  const { error: e2 } = await db.from("profiles").delete().eq("id", usado);
  ok("2. o banco RECUSA apagar quem tem histórico", Boolean(e2), "apagou quem tinha histórico");
  ok("2. e a recusa é de chave estrangeira",
    /foreign key|still referenced/i.test(e2?.message ?? ""), e2?.message);

  const { data: continua } = await db.from("profiles").select("nome").eq("id", usado).maybeSingle();
  ok("2. a pessoa continua lá, inteira", continua?.nome === "ZZ Del usada");

  // Limpa o vínculo de teste para a conta poder ser removida no finally.
  await db.from("atendimento_transferencias").delete().eq("feito_por", usado);
}

try { await main(); } catch (e) { falhas.push(`ERRO: ${e.message}`); }
finally {
  for (const id of criados) {
    await db.from("atendimento_transferencias").delete().eq("feito_por", id);
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id).catch(() => {});
  }
}
console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ tudo certo — contas de teste apagadas");
