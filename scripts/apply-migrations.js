/* eslint-disable */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { connectionString } = require("./_db");

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Conectado ao Postgres");

  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs.readdirSync(dir).sort();
  for (const f of files) {
    console.log(`\n📦 Aplicando ${f}...`);
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await client.query(sql);
    console.log(`✅ ${f} aplicado`);
  }
  console.log("\n🎉 Migrations aplicadas!");
  await client.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
