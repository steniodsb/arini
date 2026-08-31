// Testa, num navegador de verdade, cada ponto que o Carlos pediu na call de
// 21/08 — arrastando com o ponteiro, rolando e clicando de fato.
//
// Uso: node scripts/testa-call-2108.mjs [--base http://localhost:3200]
//
// ATENÇÃO: roda contra o banco configurado no .env.local, que é o do cliente.
// O teste move um lead de verdade e o DEVOLVE para a etapa de origem ao final
// (item "kanban: limpeza"). Se esse item falhar, devolva o lead à mão — a
// mensagem diz qual e para onde. Ficam duas linhas "Movido para…" no histórico
// do lead; são inofensivas, mas dá para apagá-las se incomodar.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3200";
const EMAIL = process.env.TESTE_EMAIL ?? "admin@arininegociosimobiliarios.com.br";
const SENHA = process.env.SEED_USER_PASSWORD;

const resultados = [];
const ok = (nome, detalhe = "") => resultados.push({ nome, estado: "OK", detalhe });
const falha = (nome, detalhe) => resultados.push({ nome, estado: "FALHA", detalhe });
const nd = (nome, detalhe) => resultados.push({ nome, estado: "N/D", detalhe });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--window-size=1440,900"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 160)));

  // ---------- login ----------
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.evaluate(() => document.querySelector("form")?.requestSubmit()),
  ]);
  await new Promise((r) => setTimeout(r, 2500));
  if (page.url().includes("/login")) { falha("login", `continuou em ${page.url()}`); throw new Error("login falhou"); }
  ok("login", page.url());

  // ---------- LEADS / KANBAN ----------
  await page.goto(`${BASE}/admin/leads`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  // as colunas do quadro são as .w-72; os outros h3 da página são dos gráficos
  const panorama = await page.evaluate(() =>
    [...document.querySelectorAll(".w-72")].map((col) => ({
      titulo: col.querySelector("h3")?.textContent.trim() ?? "?",
      total: Number(col.querySelector("span.text-xs")?.textContent ?? 0),
      cartoes: col.querySelectorAll(".cursor-grab").length,
      temVerMais: [...col.querySelectorAll("button")].some((b) => b.textContent.includes("Ver mais")),
    })));
  console.log("colunas:", JSON.stringify(panorama));

  const totalLeads = panorama.reduce((s, c) => s + c.total, 0);
  if (!panorama.length) falha("leads: quadro existe", "nenhuma coluna .w-72 encontrada");
  else if (!totalLeads) falha("leads: há dados", "nenhum lead no banco — não dá para testar");
  else ok("leads: há dados", `${totalLeads} leads em ${panorama.length} colunas`);

  // 4a — paginação: não pode desenhar tudo de uma vez
  const colCheia = panorama.find((c) => c.total > 10);
  if (!colCheia) nd("leads: paginação", "nenhuma coluna com mais de 10");
  else if (colCheia.cartoes <= 10 && colCheia.temVerMais) {
    ok("leads: paginação", `${colCheia.titulo}: ${colCheia.cartoes} de ${colCheia.total} + "ver mais"`);
  } else falha("leads: paginação", `${colCheia.titulo} desenhou ${colCheia.cartoes} de ${colCheia.total}`);

  // 4b — o cabeçalho da coluna continua visível ao percorrer os cartões.
  // Rola a LISTA DE CARTÕES, que é o que ele faz procurando um lead: foi
  // nessa rolagem que o título sumia.
  const stick = await page.evaluate(async () => {
    const h = document.querySelector(".w-72 h3");
    if (!h) return { erro: "sem colunas" };
    const lista = h.closest(".w-72")?.querySelector(".overflow-y-auto");
    if (!lista) return { erro: "a coluna não tem lista rolável" };
    if (lista.scrollHeight <= lista.clientHeight + 4) return { semRolagem: true };
    const antes = h.getBoundingClientRect().top;
    lista.scrollTop = lista.scrollHeight;
    await new Promise((r) => setTimeout(r, 400));
    const depois = h.getBoundingClientRect().top;
    const rolou = lista.scrollTop;
    lista.scrollTop = 0;
    return { antes, depois, rolou, parado: Math.abs(depois - antes) < 2, visivel: depois >= 0 };
  });
  if (stick.erro) falha("leads: cabeçalho da coluna", stick.erro);
  else if (stick.semRolagem) nd("leads: cabeçalho da coluna", "coluna cabe inteira, nada a rolar");
  else if (stick.parado && stick.visivel) {
    ok("leads: cabeçalho da coluna", `rolou ${Math.round(stick.rolou)}px na lista e o título não saiu do lugar`);
  } else {
    falha("leads: cabeçalho da coluna",
      `rolou ${Math.round(stick.rolou)}px e o título foi de y=${Math.round(stick.antes)} para y=${Math.round(stick.depois)}`);
  }

  // 4d — arrastar entre colunas, de verdade, e conferir se PERSISTE
  await page.evaluate(() => document.querySelector(".cursor-grab")?.scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 600));
  const alvo = await page.evaluate(() => {
    const cartao = document.querySelector(".cursor-grab");
    if (!cartao) return null;
    const colOrigem = cartao.closest(".w-72");
    const destino = [...document.querySelectorAll(".w-72")].find((c) => c !== colOrigem);
    if (!destino) return null;
    const a = cartao.getBoundingClientRect(), b = destino.getBoundingClientRect();
    return {
      id: cartao.querySelector("a[href^='/admin/leads/']")?.getAttribute("href")?.split("/").pop(),
      nome: cartao.textContent.trim().slice(0, 40),
      origem: colOrigem?.querySelector("h3")?.textContent.trim(),
      destino: destino.querySelector("h3")?.textContent.trim(),
      de: { x: a.x + a.width / 2, y: a.y + 24 },
      // mesma altura do cartão de origem: garante ponto dentro da janela
      para: { x: b.x + b.width / 2, y: Math.min(a.y + 60, b.y + b.height - 20) },
    };
  });

  // Identidade pelo id do lead (href do cartão), não pelo texto: há leads
  // homônimos, e comparar por nome truncado achava o cartão errado.
  const ondeEsta = (id) => page.evaluate((leadId) => {
    const link = document.querySelector(`a[href="/admin/leads/${leadId}"]`);
    return link ? link.closest(".w-72")?.querySelector("h3")?.textContent.trim() ?? null : null;
  }, id);

  if (!alvo) falha("kanban: arrastar", "não achei cartão e coluna de destino");
  else if (!alvo.id) falha("kanban: arrastar", "o cartão não expõe o id do lead");
  else {
    console.log(`arrastando "${alvo.nome}" de ${alvo.origem} -> ${alvo.destino}`);
    await page.mouse.move(alvo.de.x, alvo.de.y);
    await page.mouse.down();
    // passos pequenos: o sensor só inicia o arraste após 6px
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(
        alvo.de.x + ((alvo.para.x - alvo.de.x) * i) / 25,
        alvo.de.y + ((alvo.para.y - alvo.de.y) * i) / 25,
      );
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((r) => setTimeout(r, 300));
    const arrastando = await page.evaluate(() => !!document.querySelector(".rotate-2"));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 2500));

    const depois = await ondeEsta(alvo.id);
    if (!arrastando) falha("kanban: arrastar", "o overlay nunca apareceu — o arraste não inicia");
    else if (depois !== alvo.destino) falha("kanban: arrastar", `soltou em ${alvo.destino} mas está em ${depois ?? "lugar nenhum"}`);
    else {
      // recarrega: mudança que só existe no estado do React não serve de nada
      await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 2500));
      const persistido = await ondeEsta(alvo.id);
      if (persistido === alvo.destino) ok("kanban: arrastar", `${alvo.origem} -> ${alvo.destino}, mantido após recarregar`);
      else falha("kanban: arrastar", `moveu na tela mas após recarregar voltou para ${persistido ?? "lugar nenhum"}`);

      // Devolve o lead para a etapa de origem.
      //
      // Este teste roda contra o banco real do cliente: sem isto, cada
      // execução empurra mais um lead de verdade para outra etapa do funil
      // e some com ele da fila de quem atende.
      const voltou = await page.evaluate(async (leadId) => {
        const link = document.querySelector(`a[href="/admin/leads/${leadId}"]`);
        const cartao = link?.closest(".cursor-grab")?.parentElement;
        if (!cartao) return "cartão não encontrado para devolver";
        cartao.scrollIntoView({ block: "center" });
        return null;
      }, alvo.id);
      if (voltou) falha("kanban: limpeza", voltou);
      else {
        await new Promise((r) => setTimeout(r, 600));
        const volta = await page.evaluate(({ leadId, origem }) => {
          const link = document.querySelector(`a[href="/admin/leads/${leadId}"]`);
          const cartao = link?.closest(".cursor-grab");
          const colOrigem = [...document.querySelectorAll(".w-72")]
            .find((c) => c.querySelector("h3")?.textContent.trim() === origem);
          if (!cartao || !colOrigem) return null;
          const a = cartao.getBoundingClientRect(), b = colOrigem.getBoundingClientRect();
          return {
            de: { x: a.x + a.width / 2, y: a.y + 24 },
            para: { x: b.x + b.width / 2, y: Math.min(a.y + 60, b.y + b.height - 20) },
          };
        }, { leadId: alvo.id, origem: alvo.origem }).catch(() => null);
        if (volta) {
          await page.mouse.move(volta.de.x, volta.de.y);
          await page.mouse.down();
          for (let i = 1; i <= 25; i++) {
            await page.mouse.move(
              volta.de.x + ((volta.para.x - volta.de.x) * i) / 25,
              volta.de.y + ((volta.para.y - volta.de.y) * i) / 25,
            );
            await new Promise((r) => setTimeout(r, 16));
          }
          await page.mouse.up();
          await new Promise((r) => setTimeout(r, 2000));
          const final = await ondeEsta(alvo.id);
          if (final === alvo.origem) ok("kanban: limpeza", `lead devolvido para ${alvo.origem}`);
          else falha("kanban: limpeza", `o lead ficou em ${final ?? "lugar nenhum"} — devolva à mão para ${alvo.origem}`);
        } else falha("kanban: limpeza", `não consegui devolver o lead para ${alvo.origem}`);
      }
    }
  }

  // 4c — botão "não é lead"
  const temDescartar = await page.evaluate(() => !!document.querySelector('button[aria-label^="Marcar"]'));
  if (temDescartar) ok('leads: botão "não é lead"', "presente para a diretoria");
  else falha('leads: botão "não é lead"', "não encontrado mesmo logado como diretoria");

  // ---------- PONTO ----------
  for (const [nome, caminho, esperado] of [
    ["ponto: principal", "/admin/ponto", /^Ponto$/i],
    ["ponto: colaboradores", "/admin/ponto/colaboradores", /colaborador/i],
    ["ponto: terminal", "/admin/ponto/terminal", /terminal|ponto/i],
    ["ponto: relatório", "/admin/ponto/relatorio", /relat|horas/i],
  ]) {
    const r = await page.goto(`${BASE}${caminho}`, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((x) => setTimeout(x, 1800));
    // confere pelo <h1> da tela: o texto do corpo traz o menu lateral e até um
    // usuário chamado "Jurídico", que confundia qualquer corte por palavra
    const tela = await page.evaluate(() => ({
      titulo: document.querySelector("h1")?.textContent.trim() ?? "",
      corpo: document.body.innerText,
    }));
    const quebrou = /Application error|Unhandled Runtime|something went wrong/i.test(tela.corpo);
    if (r.status() >= 400) falha(nome, `HTTP ${r.status()}`);
    else if (quebrou) falha(nome, "a tela quebrou em runtime");
    else if (!esperado.test(tela.titulo)) falha(nome, `abriu, mas o título é "${tela.titulo}"`);
    else ok(nome, `título: ${tela.titulo}`);
  }

  // ---------- ATENDIMENTO (blocos 1 e 2 da call) ----------
  const at = await page.goto(`${BASE}/atendimento`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  if (at.status() >= 400) falha("atendimento: abre", `HTTP ${at.status()}`);
  else {
    const tela = await page.evaluate(() => {
      const txt = document.body.innerText;
      return {
        canais: ["WhatsApp", "Instagram", "Messenger", "E-mail", "Todos"].filter((c) => new RegExp(c, "i").test(txt)),
        amostra: txt.replace(/\s+/g, " ").slice(0, 100),
      };
    });
    if (tela.canais.length >= 2) ok("atendimento: abas por canal", tela.canais.join(", "));
    else falha("atendimento: abas por canal", `só achei "${tela.canais.join(", ") || "nada"}" em: ${tela.amostra}`);
  }

  if (erros.length) console.log("\nerros de página:", [...new Set(erros)].slice(0, 5).join(" | "));
} catch (e) {
  falha("execução", String(e.message).slice(0, 200));
} finally {
  await browser.close();
}

console.log("\n=== resultado ===");
for (const r of resultados) console.log(`${r.estado.padEnd(5)} ${r.nome.padEnd(30)} ${r.detalhe}`);
const falhas = resultados.filter((r) => r.estado === "FALHA").length;
console.log(`\n${resultados.length - falhas}/${resultados.length} passaram.`);
process.exit(falhas ? 1 : 0);
