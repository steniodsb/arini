/* eslint-disable */
// Empurra as opções gravadas em `atendimento_channels.opcoes` para a
// instância na Evolution (`/settings/set`).
//
//   node scripts/sincroniza-opcoes-evolution.js
//
// POR QUE EXISTE: a tela salva no banco E na Evolution ao mesmo tempo.
// Uma migração (como a 0057, que trocou a mensagem de ligação recusada)
// só alcança o banco — a instância continua com o texto antigo até
// alguém salvar pela tela. Este script fecha essa lacuna sem precisar
// abrir a tela nem ler QR de novo.
//
// Só leitura no banco; a única escrita é na Evolution, e é a mesma que
// o botão "Salvar" da tela faz.
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const PADRAO = {
  // Obrigatório na Evolution 2.3.7 (sem ele: 400 "requires property readStatus").
  readStatus: false,
  rejectCall: true,
  msgCall: "",
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: true,
  syncFullHistory: false,
};

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: canais, error } = await db
    .from("atendimento_channels")
    .select("id, nome, config, opcoes")
    .eq("provedor", "evolution");
  if (error) throw new Error(error.message);

  for (const c of canais ?? []) {
    const { base_url, api_key, instance_name } = c.config ?? {};
    if (!base_url || !api_key || !instance_name) {
      console.log(`- ${c.nome}: sem credencial, pulando`);
      continue;
    }
    const opcoes = { ...PADRAO, ...(c.opcoes ?? {}) };
    const res = await fetch(`${base_url}/settings/set/${encodeURIComponent(instance_name)}`, {
      method: "POST",
      headers: { apikey: api_key, "Content-Type": "application/json" },
      body: JSON.stringify(opcoes),
      signal: AbortSignal.timeout(20000),
    });
    const corpo = await res.text();
    console.log(`- ${c.nome} (${instance_name}): HTTP ${res.status}`);
    if (!res.ok) console.log("  ", corpo.slice(0, 300));
    else console.log(`   msgCall = "${opcoes.msgCall}"`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
