// Confere a linha clicável + modal de visualização numa tela do CRM.
// Uso: node scripts/_ver.mjs /admin/administrativo saida.png
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const caminho = process.argv[2] ?? "/admin/administrativo";
const saida = process.argv[3] ?? "modal.png";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text().slice(0, 200)); });

await p.goto("http://localhost:3200/admin/login", { waitUntil: "networkidle2" });
await p.type('input[type="email"]', "admin@arininegociosimobiliarios.com.br");
await p.type('input[type="password"]', process.env.SEED_USER_PASSWORD);
await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), p.evaluate(() => document.querySelector("form")?.requestSubmit())]);
await p.goto("http://localhost:3200" + caminho, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));

const linhas = await p.evaluate(() => document.querySelectorAll('tr[role="button"]').length);
console.log("linhas clicáveis:", linhas);
if (!linhas) { console.log("NENHUMA linha clicável nesta tela"); await b.close(); process.exit(1); }

// clica no MEIO da linha, não na borda direita: é o ponto do pedido
const alvo = await p.evaluate(() => {
  const tr = document.querySelector('tr[role="button"]');
  const r = tr.getBoundingClientRect();
  tr.scrollIntoView({ block: "center" });
  const r2 = tr.getBoundingClientRect();
  return { x: r2.x + r2.width * 0.35, y: r2.y + r2.height / 2, rotulo: tr.getAttribute("aria-label") };
});
console.log("clicando no meio da linha:", alvo.rotulo);
await p.mouse.click(alvo.x, alvo.y);
await new Promise((r) => setTimeout(r, 900));

const modal = await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return null;
  return {
    titulo: d.querySelector("h2")?.textContent.trim(),
    campos: [...d.querySelectorAll(".uppercase")].map((e) => e.textContent.trim()).slice(0, 14),
    temEditar: [...d.querySelectorAll("a")].some((a) => /editar/i.test(a.textContent)),
  };
});
console.log("modal:", JSON.stringify(modal));
await p.screenshot({ path: saida });

// ESC fecha?
await p.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 500));
const fechou = await p.evaluate(() => !document.querySelector('[role="dialog"]'));
console.log("ESC fecha:", fechou);
console.log(erros.length ? "ERROS: " + [...new Set(erros)].join(" | ") : "sem erros");
await b.close();
