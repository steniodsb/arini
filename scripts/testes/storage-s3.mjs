// Testa que o storage funciona SÓ com as variáveis S3_* que o painel da
// WaveHost injeta — sem nenhuma R2_*. É o ambiente da produção.
//
//   node scripts/testes/storage-s3.mjs
//
// Grava um arquivo minúsculo no bucket, confere pelo link público e apaga.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..", "..");
const env = {};
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
// Monta o ambiente "de produção": S3_* a partir das R2_* do .env.local.
for (const k of Object.keys(process.env)) if (k.startsWith("R2_")) delete process.env[k];
process.env.S3_ENDPOINT = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
process.env.S3_BUCKET = env.R2_BUCKET;
process.env.S3_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
process.env.S3_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
process.env.S3_PUBLIC_URL = env.R2_PUBLIC_URL;

const { isR2Configured, uploadBufferR2, deleteR2Object } = await import("../../src/lib/storage.ts");
let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };

ok("1. reconhece o bucket só com S3_*", isR2Configured());
const key = `_teste/storage-s3-${Date.now()}.txt`;
try {
  const url = await uploadBufferR2(key, Buffer.from("ok"), "text/plain");
  ok("2. link público usa S3_PUBLIC_URL", url.startsWith(env.R2_PUBLIC_URL));
  const r = await fetch(url);
  ok("3. arquivo abre pelo link público", r.ok && (await r.text()) === "ok", `HTTP ${r.status}`);
} finally {
  await deleteR2Object(key).catch(() => {});
}
delete process.env.S3_PUBLIC_URL;
ok("4. sem link público, NÃO se diz configurado (não grava arquivo que ninguém abre)", !isR2Configured());

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ o storage da WaveHost funciona com as variáveis que o painel injeta");
