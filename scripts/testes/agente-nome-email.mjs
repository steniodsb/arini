// Testa a troca de NOME e E-MAIL do agente contra o banco real.
//
//   node scripts/testes/agente-nome-email.mjs
//
// O que está em jogo: o e-mail é a credencial de login e mora em DOIS
// lugares — `auth.users` (onde a autenticação acontece) e `profiles.email`
// (o espelho que as telas leem). Gravar só um dos dois deixa a pessoa
// vendo um e-mail na tela e entrando com outro, ou sem entrar.
//
// Roda numa conta descartável, criada e apagada aqui. Nenhuma conta da
// Arini é tocada.
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
register("./_alias.mjs", import.meta.url);

const raiz = path.join(import.meta.dirname, "..", "..");
for (const linha of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#")) process.env[linha.slice(0, i).trim()] ||= linha.slice(i + 1).trim();
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let passou = 0;
const falhas = [];
function ok(titulo, cond, detalhe = "") {
  if (cond) passou++;
  else falhas.push(`${titulo}${detalhe ? `\n    ${detalhe}` : ""}`);
}

const carimbo = Date.now();
const EMAIL_1 = `zz.teste.${carimbo}@exemplo-invalido.test`;
const EMAIL_2 = `zz.trocado.${carimbo}@exemplo-invalido.test`;
let userId = null;

/** Lê o par (auth, profiles) para conferir que os dois andam juntos. */
async function lerPar(id) {
  const { data: u } = await db.auth.admin.getUserById(id);
  const { data: p } = await db.from("profiles").select("nome, email").eq("id", id).maybeSingle();
  return { auth: u?.user?.email ?? null, perfil: p?.email ?? null, nome: p?.nome ?? null };
}

async function limpar() {
  if (userId) {
    await db.from("profiles").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId).catch(() => {});
  }
}

async function main() {
  const { data: criado, error: e1 } = await db.auth.admin.createUser({
    email: EMAIL_1,
    password: `zzTeste!${carimbo}`,
    email_confirm: true,
  });
  if (e1) throw new Error(`criar usuário: ${e1.message}`);
  userId = criado.user.id;

  // O perfil pode nascer por trigger; se não, criamos.
  const { data: jaTem } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!jaTem) {
    const { error } = await db.from("profiles").insert({
      id: userId, nome: "ZZ Nome Antigo", email: EMAIL_1, sector: "recepcao", ativo: true,
    });
    if (error) throw new Error(`criar perfil: ${error.message}`);
  } else {
    await db.from("profiles").update({ nome: "ZZ Nome Antigo" }).eq("id", userId);
  }

  const inicial = await lerPar(userId);
  ok("cenário: auth e perfil começam iguais", inicial.auth === inicial.perfil,
    `auth=${inicial.auth} perfil=${inicial.perfil}`);

  // --- 1) NOME ---------------------------------------------------------
  // Replica o que a rota faz: patch em profiles.nome.
  await db.from("profiles").update({ nome: "ZZ Michelle Santos" }).eq("id", userId);
  const dep1 = await lerPar(userId);
  ok("1. nome muda no perfil", dep1.nome === "ZZ Michelle Santos", `nome=${dep1.nome}`);

  // O primeiro nome é o que assina a resposta no WhatsApp.
  const { assinarComNome } = await import("../../src/lib/atendimento/assinatura.ts");
  ok("1. e é ele que assina a mensagem",
    assinarComNome("bom dia", dep1.nome) === "*ZZ:* bom dia",
    assinarComNome("bom dia", dep1.nome));

  // --- 2) E-MAIL: auth PRIMEIRO, depois o espelho ----------------------
  const { error: eAuth } = await db.auth.admin.updateUserById(userId, { email: EMAIL_2 });
  ok("2. auth aceita o e-mail novo", !eAuth, eAuth?.message);
  await db.from("profiles").update({ email: EMAIL_2 }).eq("id", userId);

  const dep2 = await lerPar(userId);
  ok("2. auth.users foi atualizado", dep2.auth === EMAIL_2, `auth=${dep2.auth}`);
  ok("2. profiles.email foi atualizado", dep2.perfil === EMAIL_2, `perfil=${dep2.perfil}`);
  ok("2. OS DOIS ANDAM JUNTOS", dep2.auth === dep2.perfil,
    `auth=${dep2.auth} perfil=${dep2.perfil}`);

  // --- 3) E-mail duplicado tem de falhar -------------------------------
  // É a razão de o Auth vir primeiro na rota: se ele recusa, nada mais é
  // escrito e a linha fica intacta.
  const { data: outros } = await db.from("profiles").select("email").neq("id", userId).limit(1);
  const emailDeOutro = outros?.[0]?.email;
  if (emailDeOutro) {
    const { error: eDup } = await db.auth.admin.updateUserById(userId, { email: emailDeOutro });
    ok("3. e-mail já usado é recusado pelo Auth", Boolean(eDup), "o Auth aceitou um duplicado");

    const dep3 = await lerPar(userId);
    ok("3. e a linha continua intacta", dep3.auth === EMAIL_2 && dep3.perfil === EMAIL_2,
      `auth=${dep3.auth} perfil=${dep3.perfil}`);
  }
}

try {
  await main();
} catch (e) {
  falhas.push(`ERRO: ${e.message}`);
} finally {
  await limpar();
}

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("✓ tudo certo — conta de teste apagada");
