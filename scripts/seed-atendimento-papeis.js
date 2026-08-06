/* eslint-disable */
// =====================================================================
// Uma conta por PAPEL do Atendimento — para ver com os próprios olhos o
// que cada perfil enxerga.
//
// POR QUE ISSO EXISTE
// -------------------
// Os três papéis da migração 0040 mudam o sistema inteiro: o menu, a
// caixa que abre, o que a RLS deixa ler. Descrever isso em documento não
// substitui entrar com cada um. Este script cria (ou atualiza) as três
// contas, já com CARGO preenchido (0043) e — o detalhe que mais trava
// gente — o atendente DENTRO de uma fila. Atendente sem fila não enxerga
// conversa nenhuma; uma conta de teste assim só provaria que a tela abre.
//
// Idempotente: rodar de novo não duplica nada. Se a conta já existe, ele
// atualiza o perfil e NÃO mexe na senha.
//
// Uso:
//   node scripts/seed-atendimento-papeis.js
//   node scripts/seed-atendimento-papeis.js --senha "MinhaSenhaForte1!"
//   node scripts/seed-atendimento-papeis.js --resetar-senha
//
// A senha padrão é a `SEED_USER_PASSWORD` do .env.local — a mesma dos
// demais usuários demo (scripts/seed-users.js). Unificar evita a situação
// em que metade da equipe entra com uma senha e metade com outra, que é
// como se acaba anotando senha em papel.
//
// `--resetar-senha` também troca a senha de quem JÁ existe. Sem a flag, o
// script cria o que falta e não encosta na senha de ninguém — trocar
// senha alheia sem pedir é o tipo de coisa que tem que ser explícita.
// =====================================================================

const crypto = require("crypto");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { connectionString } = require("./_db");

const D = "arininegociosimobiliarios.com.br";

/** A fila do atendente. Sem ela a conta abriria vazia — ver cabeçalho. */
const FILA_DO_ATENDENTE = "Venda Urbana";

const CONTAS = [
  {
    email: `atendimento.administrador@${D}`,
    nome: "Administrador (teste)",
    cargo: "Gerente de Atendimento",
    // Setor do CRM ≠ papel do atendimento. Aqui o setor é só o lugar da
    // pessoa no CRM de imóveis; quem manda na caixa é `atendimento_papel`.
    sector: "administrativo",
    papel: "administrador",
    filas: [],
    resumo: "vê tudo, transfere entre filas e devolve conversa à caixa central",
  },
  {
    email: `atendimento.recepcao@${D}`,
    nome: "Recepcionista (teste)",
    cargo: "Recepcionista",
    sector: "recepcao",
    papel: "recepcao",
    filas: [],
    resumo: "vê a caixa central e tria: escolhe a fila e encaminha",
  },
  {
    email: `atendimento.atendente@${D}`,
    nome: "Atendente (teste)",
    cargo: "Corretor",
    sector: "recepcao",
    papel: "atendente",
    filas: [FILA_DO_ATENDENTE],
    resumo: `vê só a fila "${FILA_DO_ATENDENTE}" e o que está atribuído a ele`,
  },
];

/** Senha forte o bastante para conta real, curta o bastante para digitar. */
function senhaAleatoria() {
  const corpo = crypto.randomBytes(9).toString("base64url");
  return `Arini-${corpo}!`;
}

/**
 * Ordem: `--senha` explícito > SEED_USER_PASSWORD do .env.local >
 * aleatória. A aleatória é o último recurso, para o script nunca criar
 * conta com senha previsível num ambiente que esqueceu de configurar.
 */
function senhaEscolhida() {
  const i = process.argv.indexOf("--senha");
  if (i >= 0 && process.argv[i + 1]) return { senha: process.argv[i + 1], origem: "--senha" };
  if (process.env.SEED_USER_PASSWORD) {
    return { senha: process.env.SEED_USER_PASSWORD, origem: "SEED_USER_PASSWORD do .env.local" };
  }
  return { senha: null, origem: "aleatória por conta" };
}

async function criarAuthUser(c, conta, senha) {
  const hash = bcrypt.hashSync(senha, 10);
  const id = crypto.randomUUID();

  // Insert direto em auth.users, como scripts/seed-users.js — com duas
  // diferenças que aquele script ainda não tem:
  //
  //  · `confirmed_at` NÃO entra. No Postgres do Supabase atual ela é
  //    coluna GERADA (o menor entre email_confirmed_at e
  //    phone_confirmed_at); tentar gravá-la aborta o insert com
  //    "cannot insert a non-DEFAULT value into column confirmed_at".
  //  · Os campos de token vão como '' e não null: o GoTrue lê essas
  //    colunas como texto e quebra com null em algumas versões.
  await c.query(
    `insert into auth.users (
       id, instance_id, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       aud, role, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new,
       email_change, phone_change, phone_change_token,
       email_change_token_current, reauthentication_token
     ) values (
       $1, '00000000-0000-0000-0000-000000000000', $2, $3,
       now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
       'authenticated', 'authenticated', now(), now(),
       '', '', '', '', '', '', '', ''
     )`,
    [id, conta.email, hash, JSON.stringify({ nome: conta.nome, sector: conta.sector })],
  );

  await c.query(
    `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2::jsonb, 'email', $3, now(), now(), now())
     on conflict do nothing`,
    [id, JSON.stringify({ sub: id, email: conta.email, email_verified: true }), conta.email],
  );

  return id;
}

async function main() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { senha: senhaFixa, origem } = senhaEscolhida();
  const resetar = process.argv.includes("--resetar-senha");
  const criadas = [];

  console.log(`Senha: ${origem}${resetar ? " · redefinindo também quem já existe" : ""}\n`);

  for (const conta of CONTAS) {
    const existente = await c.query(`select id from auth.users where email = $1`, [conta.email]);
    let id = existente.rows[0]?.id ?? null;
    let senha = null;

    if (id) {
      if (resetar) {
        senha = senhaFixa || senhaAleatoria();
        await c.query(
          `update auth.users set encrypted_password = $1, updated_at = now() where id = $2`,
          [bcrypt.hashSync(senha, 10), id],
        );
        console.log(`🔑 ${conta.email} já existia — senha redefinida`);
      } else {
        console.log(`ℹ️  ${conta.email} já existia — perfil atualizado, senha intacta`);
      }
    } else {
      senha = senhaFixa || senhaAleatoria();
      id = await criarAuthUser(c, conta, senha);
      console.log(`✅ ${conta.email} criado`);
    }

    // O trigger fn_handle_new_user cria o profile; aqui completamos o que
    // ele não sabe. Vale para conta nova e para a que já existia.
    await c.query(
      `update public.profiles
          set nome = $1,
              sector = $2::sector,
              cargo = $3,
              ativo = true,
              is_admin_central = false,
              atendimento_access = true,
              atendimento_papel = $4
        where id = $5`,
      [conta.nome, conta.sector, conta.cargo, conta.papel, id],
    );

    for (const nomeFila of conta.filas) {
      const fila = await c.query(`select id from public.atendimento_teams where nome = $1`, [nomeFila]);
      if (fila.rows.length === 0) {
        console.log(`   ⚠️  fila "${nomeFila}" não existe — o atendente vai abrir sem conversa`);
        continue;
      }
      await c.query(
        `insert into public.atendimento_team_members (team_id, profile_id)
         values ($1, $2) on conflict do nothing`,
        [fila.rows[0].id, id],
      );
      console.log(`   ↳ fila "${nomeFila}" vinculada`);
    }

    criadas.push({ ...conta, senha });
  }

  console.log("\n─────────────────────────────────────────────");
  console.log("CONTAS DO ATENDIMENTO");
  console.log("─────────────────────────────────────────────");
  for (const conta of criadas) {
    console.log(`\n${conta.nome} — ${conta.cargo}`);
    console.log(`  login: ${conta.email}`);
    console.log(`  senha: ${conta.senha ?? "(inalterada — a conta já existia)"}`);
    console.log(`  papel: ${conta.papel} — ${conta.resumo}`);
  }
  console.log("\nEntre em https://atendimento.<dominio>/atendimento/login");
  console.log("Troque as senhas no primeiro acesso (Meu perfil › Segurança).\n");

  await c.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
