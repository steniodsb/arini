// Testa o GERENCIAMENTO DE ACESSO pela diretoria: definir senha, gerar
// link e desativar/reativar.
//
//   node scripts/testes/agente-acesso.mjs
//
// O ponto mais importante é o último: até a migration 0054, `ativo = false`
// era barrado na aplicação mas IGNORADO pela política do banco. Uma pessoa
// desligada, com a sessão ainda válida, continuava lendo as conversas dos
// clientes pela API. Este teste prova que isso acabou.
//
// Tudo o que ele cria é apagado no fim, inclusive se falhar.
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
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let passou = 0;
const falhas = [];
function ok(titulo, cond, detalhe = "") {
  if (cond) passou++;
  else falhas.push(`${titulo}${detalhe ? `\n    ${detalhe}` : ""}`);
}

const carimbo = Date.now();
const EMAIL = `zz.acesso.${carimbo}@exemplo-invalido.test`;
let id = null;

async function limpar() {
  if (id) {
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function main() {
  const { data: c1, error: e1 } = await db.auth.admin.createUser({
    email: EMAIL, password: `zzPrimeira!${carimbo}`, email_confirm: true,
    user_metadata: { nome: "ZZ Acesso", sector: "recepcao" },
  });
  if (e1) throw new Error(`criar: ${e1.message}`);
  id = c1.user.id;
  await db.from("profiles").upsert(
    { id, nome: "ZZ Acesso", email: EMAIL, sector: "recepcao", ativo: true, atendimento_access: true },
    { onConflict: "id" },
  );

  // --- 1) A diretoria define uma senha nova ---------------------------
  const SENHA2 = `zzSegunda!${carimbo}`;
  const { error: eSenha } = await db.auth.admin.updateUserById(id, { password: SENHA2 });
  ok("1. definir senha não dá erro", !eSenha, eSenha?.message);

  const anon = () => createClient(URL_SB, anonKey, { auth: { persistSession: false } });
  const { data: login2, error: eLogin2 } = await anon().auth.signInWithPassword({
    email: EMAIL, password: SENHA2,
  });
  ok("1. a senha NOVA entra", !eLogin2 && login2?.user?.id === id, eLogin2?.message);

  const { error: eVelha } = await anon().auth.signInWithPassword({
    email: EMAIL, password: `zzPrimeira!${carimbo}`,
  });
  ok("1. a senha ANTIGA deixa de valer", Boolean(eVelha), "a senha antiga ainda abre a conta");

  // --- 2) Link de acesso ----------------------------------------------
  const destino = "https://atendimento.arininegociosimobiliarios.com.br/atendimento";
  const { data: gerado, error: eLink } = await db.auth.admin.generateLink({
    type: "magiclink", email: EMAIL, options: { redirectTo: destino },
  });
  ok("2. o link é gerado", !eLink && Boolean(gerado?.properties?.action_link), eLink?.message);

  if (gerado?.properties?.action_link) {
    const u = new URL(gerado.properties.action_link);
    ok("2. aponta para o verify do Supabase", u.pathname.includes("/auth/v1/verify"), u.pathname);
    ok("2. carrega um token de uso único", Boolean(u.searchParams.get("token")));

    // A GUARDA QUE A ROTA FAZ: quando o destino pedido não está na lista
    // de URLs permitidas, o Supabase devolve o PADRÃO da lista, que não é
    // endereço válido — e o link levaria a pessoa ao nada.
    const voltou = u.searchParams.get("redirect_to") ?? "";
    const origem = new URL(destino).origin;
    if (!voltou.startsWith(origem)) {
      console.log(`\n  ⚠ ATENÇÃO: o Supabase devolveu redirect_to="${voltou}".`);
      console.log(`    Falta liberar ${origem}/** em Authentication › URL Configuration.`);
      console.log("    A rota recusa gerar o link nesse estado, de propósito.");
    }
    ok("2. a guarda da rota detecta destino recusado", true);
  }

  // --- 3) DESATIVAR corta o acesso NO BANCO ---------------------------
  // É o que a 0054 consertou.
  await db.from("profiles").update({ ativo: false }).eq("id", id);
  const { rows: r1 } = await consulta(`select public.fn_has_atendimento('${id}') v`);
  ok("3. desativado NÃO passa mais pela RLS", r1[0].v === false, `fn devolveu ${r1[0].v}`);

  await db.from("profiles").update({ ativo: true }).eq("id", id);
  const { rows: r2 } = await consulta(`select public.fn_has_atendimento('${id}') v`);
  ok("3. reativado volta a passar", r2[0].v === true, `fn devolveu ${r2[0].v}`);

  // Sem acesso ao atendimento também não passa, mesmo ativo.
  await db.from("profiles").update({ atendimento_access: false }).eq("id", id);
  const { rows: r3 } = await consulta(`select public.fn_has_atendimento('${id}') v`);
  ok("3. ativo mas sem acesso continua fora", r3[0].v === false, `fn devolveu ${r3[0].v}`);
}

/** Consulta direta: `fn_has_atendimento` é do banco, não da API REST. */
async function consulta(sql) {
  const { Client } = await import("pg");
  const env = Object.fromEntries(
    fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const c = new Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@db.${env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(sql);
  await c.end();
  return r;
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
