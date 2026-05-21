/* eslint-disable */
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { connectionString } = require("./_db");

const DEFAULT_PASSWORD = process.env.SEED_USER_PASSWORD || "TrocarSenha123!";

const USERS = [
  { email: "arini@steniowebdesigner.com", nome: "Admin Arini",      sector: "admin_central",  is_admin_central: true  },
  { email: "captador@arini.com.br",       nome: "Captador Demo",    sector: "captacao",       is_admin_central: false },
  { email: "marketing@arini.com.br",      nome: "Marketing Demo",   sector: "marketing",      is_admin_central: false },
  { email: "admin@arini.com.br",          nome: "Admin Demo",       sector: "administrativo", is_admin_central: false },
  { email: "juridico@arini.com.br",       nome: "Jurídico Demo",    sector: "juridico",       is_admin_central: false },
  { email: "recepcao@arini.com.br",       nome: "Recepção Demo",    sector: "recepcao",       is_admin_central: false },
  { email: "financeiro@arini.com.br",     nome: "Financeiro Demo",  sector: "financeiro",     is_admin_central: false },
];

async function main() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  for (const u of USERS) {
    const existing = await c.query(`select id from auth.users where email=$1`, [u.email]);
    if (existing.rows.length > 0) {
      await c.query(
        `update public.profiles set sector=$1::sector, is_admin_central=$2, nome=$3 where email=$4`,
        [u.sector, u.is_admin_central, u.nome, u.email],
      );
      console.log(`ℹ️  ${u.email} já existia — profile atualizado`);
      continue;
    }

    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    const id = require("crypto").randomUUID();

    await c.query(
      `insert into auth.users (
         id, instance_id, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         aud, role, created_at, updated_at
       ) values (
         $1, '00000000-0000-0000-0000-000000000000', $2, $3,
         now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
         'authenticated', 'authenticated', now(), now()
       )`,
      [id, u.email, hash, JSON.stringify({ nome: u.nome, sector: u.sector })],
    );

    await c.query(
      `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1, $2::jsonb, 'email', $3, now(), now(), now())
       on conflict do nothing`,
      [id, JSON.stringify({ sub: id, email: u.email, email_verified: true }), u.email],
    );

    await c.query(
      `update public.profiles set sector=$1::sector, is_admin_central=$2, nome=$3 where id=$4`,
      [u.sector, u.is_admin_central, u.nome, id],
    );

    console.log(`✅ Criado ${u.email} (${u.sector})`);
  }

  await c.end();
  console.log(`\n🔑 Senha padrão dos usuários demo: ${DEFAULT_PASSWORD}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
