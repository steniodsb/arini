/* eslint-disable */
// Aplica UMA migration, pelo nome do arquivo:
//   node scripts/apply-one.js 0050_evolution_opcoes.sql
//
// Existe porque `db:migrate` reprocessa as 50 migrations a cada vez. Todas
// são idempotentes e isso funciona, mas quando só uma mudou, reexecutar o
// resto é risco sem ganho — e o log fica ilegível para conferir o que de
// fato rodou.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { connectionString } = require("./_db");

const alvo = process.argv[2];
if (!alvo) {
  console.error("Uso: node scripts/apply-one.js <arquivo.sql>");
  process.exit(1);
}

async function main() {
  const file = path.join(__dirname, "..", "supabase", "migrations", alvo);
  if (!fs.existsSync(file)) {
    console.error(`Migration não encontrada: ${alvo}`);
    process.exit(1);
  }
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Conectado ao Postgres");
  console.log(`\n📦 Aplicando ${alvo}...`);
  await client.query(fs.readFileSync(file, "utf8"));
  console.log(`✅ ${alvo} aplicado`);
  await client.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
