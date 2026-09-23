// Prova a corrida do carregamento de mensagens e a guarda que a impede.
//
//   node scripts/testes/corrida-mensagens.mjs
//
// Reproduz o relato de 23/09: "estou respondendo em uma conversa e depois
// aparece que estou conversando com outra pessoa". A causa é uma resposta
// atrasada da conversa ANTERIOR sobrescrevendo a atual.
//
// Lógica pura: simula duas buscas com tempos invertidos, como o navegador
// faria. Não toca no banco.
let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };

/** Fábrica do `loadMessages`, com e sem a guarda. */
function fabricar({ comGuarda }) {
  let exibidas = null;
  const pedida = { current: null };
  async function load(convId, demoraMs, mensagens) {
    if (comGuarda) pedida.current = convId;
    await new Promise((r) => setTimeout(r, demoraMs));
    if (comGuarda && pedida.current !== convId) return;  // chegou tarde
    exibidas = mensagens;
  }
  return { load, ver: () => exibidas };
}

async function cenario(comGuarda) {
  const { load, ver } = fabricar({ comGuarda });
  // O polling pede a conversa A (lenta). Antes de chegar, o atendente
  // clica na B (rápida). A resposta de A chega por último.
  const a = load("A", 120, "mensagens da Ana");
  await new Promise((r) => setTimeout(r, 10));
  const b = load("B", 20, "mensagens do Bruno");
  await Promise.all([a, b]);
  return ver();
}

const semGuarda = await cenario(false);
ok("sem a guarda, a resposta atrasada sobrescreve",
  semGuarda === "mensagens da Ana",
  `exibiu: ${semGuarda}`);

const comGuarda = await cenario(true);
ok("COM a guarda, o fio continua na conversa certa",
  comGuarda === "mensagens do Bruno",
  `exibiu: ${comGuarda}`);

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ a corrida está provada e contida");
