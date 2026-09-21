// Testa o CADASTRO de agente novo contra o banco real.
//
//   node scripts/testes/agente-criar.mjs
//
// O que está em jogo: criar agente é criar CREDENCIAL. O usuário nasce em
// `auth.users` e o trigger `trg_auth_new_user` copia para `profiles` — mas
// esse trigger ENGOLE erros de propósito (para não derrubar login), então
// não dá para confiar que ele rodou. E conta que autentica sem ter perfil
// é pior que conta nenhuma: ela entra e some em toda tela que lê
// `profiles`.
//
// Tudo o que este teste cria é apagado no fim, inclusive se falhar.
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
const EMAIL = `zz.novo.${carimbo}@exemplo-invalido.test`;
const criados = [];

async function limpar() {
  for (const id of criados) {
    await db.from("atendimento_team_members").delete().eq("profile_id", id);
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function main() {
  // --- 1) O caminho da rota: auth com metadata -> perfil garantido ----
  const { data: c1, error: e1 } = await db.auth.admin.createUser({
    email: EMAIL,
    password: `zzTeste!${carimbo}`,
    email_confirm: true,
    user_metadata: { nome: "ZZ Michelle Santos", sector: "recepcao" },
  });
  if (e1) throw new Error(`criar usuário: ${e1.message}`);
  const id = c1.user.id;
  criados.push(id);

  // O trigger deve ter criado o perfil a partir do metadata.
  const { data: doTrigger } = await db
    .from("profiles").select("nome, email, sector").eq("id", id).maybeSingle();
  ok("1. o trigger criou o perfil", Boolean(doTrigger), "nenhuma linha em profiles");
  ok("1. com o nome do metadata", doTrigger?.nome === "ZZ Michelle Santos", `nome=${doTrigger?.nome}`);
  ok("1. e o setor do metadata", doTrigger?.sector === "recepcao", `setor=${doTrigger?.sector}`);

  // O upsert da rota roda por cima e completa o que o trigger não sabe.
  const { data: perfil, error: eUp } = await db
    .from("profiles")
    .upsert(
      {
        id, nome: "ZZ Michelle Santos", email: EMAIL, sector: "recepcao",
        cargo: "Corretora", ativo: true,
        atendimento_access: true, atendimento_papel: "atendente",
      },
      { onConflict: "id" },
    )
    .select("nome, cargo, atendimento_access, atendimento_papel")
    .maybeSingle();
  ok("1. upsert completa cargo/papel/acesso", !eUp && perfil?.cargo === "Corretora", eUp?.message);
  ok("1. acesso ligado", perfil?.atendimento_access === true);
  ok("1. papel gravado", perfil?.atendimento_papel === "atendente", `papel=${perfil?.atendimento_papel}`);

  // --- 2) A senha inicial entra de verdade ----------------------------
  // Se a senha não valesse, a pessoa receberia uma senha que não abre nada.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: login, error: eLogin } = await anon.auth.signInWithPassword({
    email: EMAIL, password: `zzTeste!${carimbo}`,
  });
  ok("2. a senha inicial abre a conta", !eLogin && login?.user?.id === id, eLogin?.message);
  await anon.auth.signOut().catch(() => {});

  // --- 3) Fila já no cadastro ------------------------------------------
  const { data: fila } = await db.from("atendimento_teams").select("id, nome").limit(1).maybeSingle();
  if (fila) {
    await db.from("atendimento_team_members")
      .upsert([{ team_id: fila.id, profile_id: id }], { onConflict: "team_id,profile_id" });
    const { data: vinculo } = await db
      .from("atendimento_team_members").select("team_id").eq("profile_id", id);
    ok("3. entra na fila já no cadastro", (vinculo ?? []).length === 1, JSON.stringify(vinculo));
  }

  // --- 4) E-mail repetido é recusado ------------------------------------
  const { error: eDup } = await db.auth.admin.createUser({
    email: EMAIL, password: `outra!${carimbo}`, email_confirm: true,
  });
  ok("4. e-mail repetido não cria segunda conta", Boolean(eDup), "o Auth aceitou duplicado");

  // --- 5) ROLLBACK: sem perfil, a conta não pode ficar de pé ------------
  // Simula o que a rota faz quando o upsert do perfil falha.
  const emailOrfao = `zz.orfao.${carimbo}@exemplo-invalido.test`;
  const { data: c2 } = await db.auth.admin.createUser({
    email: emailOrfao, password: `zzTeste!${carimbo}`, email_confirm: true,
  });
  const idOrfao = c2.user.id;
  await db.from("profiles").delete().eq("id", idOrfao);   // "o perfil falhou"
  await db.auth.admin.deleteUser(idOrfao);                 // a rota desfaz o acesso
  const { data: sumiu } = await db.auth.admin.getUserById(idOrfao);
  ok("5. conta sem perfil é desfeita", !sumiu?.user, "sobrou usuário órfão em auth.users");
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
console.log("✓ tudo certo — contas de teste apagadas");
