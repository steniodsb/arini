// Leva para o Cloudflare R2 os arquivos que estão no Supabase Storage e
// troca os links no banco.
//
//   node scripts/migra-storage-r2.mjs            (só conta — não muda nada)
//   node scripts/migra-storage-r2.mjs --aplicar  (copia e troca os links)
//
// POR QUE EXISTE: em 24/09/2026 o Supabase Storage tinha 882 MB e NENHUMA
// mídia do atendimento estava no R2 — o servidor de produção não tinha as
// chaves do R2, e todo upload caía no Supabase (fallback). O Supabase não
// é lugar de mídia: o plano tem teto de armazenamento e de tráfego.
//
// COMO É SEGURO:
//   · copia, CONFERE que o arquivo abre pelo link público do R2, e só
//     então troca o link no banco — nunca deixa um registro apontando para
//     um arquivo que não existe;
//   · grava o mapa "link antigo → link novo" em
//     `media-url-backup-<data>.json` antes de alterar qualquer linha: com
//     ele dá para desfazer;
//   · NÃO apaga nada do Supabase. Apagar é outro passo, depois de conferir
//     a tela com os links novos.
//   · idempotente: só olha link que ainda aponta para o Supabase.
//
// Tabelas de REGISTRO histórico (audit_log, atendimento_bot_deliveries)
// ficam como estão: são o retrato do que aconteceu.
import { register } from "node:module";
import fs from "node:fs"; import path from "node:path";
register("./testes/_alias.mjs", import.meta.url);
const raiz = path.join(import.meta.dirname, "..");
for (const l of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { uploadBufferR2, isR2Configured } = await import("../src/lib/storage.ts");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

if (!isR2Configured()) { console.error("R2 não configurado no .env.local"); process.exit(1); }
const aplicar = process.argv.includes("--aplicar");

/** Onde há link para o Supabase Storage em conteúdo vivo. */
const ALVOS = [
  { tabela: "messages", coluna: "media_url" },
  { tabela: "marketing_media", coluna: "url" },
  { tabela: "property_media", coluna: "url" },
  { tabela: "properties", coluna: "foto_principal_url" },
  { tabela: "property_documents", coluna: "url" },
  { tabela: "conversations", coluna: "avatar_url" },
  { tabela: "leads", coluna: "avatar_url" },
  { tabela: "profiles", coluna: "avatar_url" },
];
const HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;

/** ".../storage/v1/object/public/<bucket>/<caminho>?x" → { bucket, caminho } */
function parse(url) {
  try {
    const u = new URL(url);
    if (u.host !== HOST) return null;
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), caminho: decodeURIComponent(m[2]) };
  } catch { return null; }
}

// 1. Coleta os links distintos.
const porUrl = new Map(); // url -> [{tabela, coluna}]
for (const { tabela, coluna } of ALVOS) {
  let de = 0;
  for (;;) {
    const { data, error } = await db.from(tabela).select(coluna).like(coluna, `%${HOST}/storage/%`).range(de, de + 999);
    if (error) { console.error(`${tabela}.${coluna}: ${error.message}`); break; }
    for (const r of data ?? []) {
      const url = r[coluna];
      if (!porUrl.has(url)) porUrl.set(url, []);
      const lista = porUrl.get(url);
      if (!lista.some((x) => x.tabela === tabela && x.coluna === coluna)) lista.push({ tabela, coluna });
    }
    if (!data || data.length < 1000) break;
    de += 1000;
  }
}
const urls = [...porUrl.keys()];
const porTabela = {};
for (const [, alvos] of porUrl) for (const a of alvos) porTabela[`${a.tabela}.${a.coluna}`] = (porTabela[`${a.tabela}.${a.coluna}`] ?? 0) + 1;
console.log(`${urls.length} arquivos distintos com link no Supabase`);
console.table(porTabela);
if (!aplicar) { console.log("\n(só contagem — rode com --aplicar para migrar)"); process.exit(0); }

// 2. Copia, confere, troca.
const backup = path.join(raiz, `media-url-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const mapa = {};
let ok = 0, falhas = 0, bytes = 0;

async function migrar(url) {
  const alvo = parse(url);
  if (!alvo) { falhas++; console.log(`  ✗ link não reconhecido: ${url}`); return; }
  const { data: blob, error } = await db.storage.from(alvo.bucket).download(alvo.caminho);
  if (error || !blob) { falhas++; console.log(`  ✗ não baixou ${alvo.bucket}/${alvo.caminho}: ${error?.message}`); return; }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "application/octet-stream";
  const novo = await uploadBufferR2(`${alvo.bucket}/${alvo.caminho}`, buffer, mime);
  // Confere pelo link PÚBLICO — é por ele que a tela vai abrir.
  const conf = await fetch(novo, { method: "HEAD" });
  const tam = Number(conf.headers.get("content-length") ?? -1);
  if (!conf.ok || (tam >= 0 && tam !== buffer.byteLength)) {
    falhas++; console.log(`  ✗ conferência falhou (${conf.status}, ${tam}/${buffer.byteLength}): ${novo}`); return;
  }
  mapa[url] = novo;
  fs.writeFileSync(backup, JSON.stringify(mapa, null, 1));
  for (const { tabela, coluna } of porUrl.get(url)) {
    const { error: e2 } = await db.from(tabela).update({ [coluna]: novo }).eq(coluna, url);
    if (e2) { falhas++; console.log(`  ✗ ${tabela}.${coluna}: ${e2.message}`); return; }
  }
  ok++; bytes += buffer.byteLength;
  if (ok % 25 === 0) console.log(`  … ${ok}/${urls.length} (${(bytes / 1048576).toFixed(0)} MB)`);
}

// 4 de cada vez: rápido o bastante sem martelar nenhum dos dois lados.
const fila = urls.slice();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (fila.length) {
    const u = fila.shift();
    try { await migrar(u); } catch (e) { falhas++; console.log(`  ✗ ${u}: ${e.message}`); }
  }
}));
console.log(`\n${ok} migrados (${(bytes / 1048576).toFixed(0)} MB), ${falhas} falhas. Backup: ${path.basename(backup)}`);
