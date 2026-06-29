/* eslint-disable */
require("dotenv").config({ path: ".env.local" });

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!PASSWORD || !REF) {
  console.error(
    "Faltam variáveis no .env.local:\n  SUPABASE_DB_PASSWORD=<senha do banco>\n  SUPABASE_PROJECT_REF=<ref>",
  );
  process.exit(1);
}

module.exports = {
  PASSWORD,
  REF,
  connectionString: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${REF}.supabase.co:5432/postgres`,
};
