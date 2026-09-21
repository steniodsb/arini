// Testa a assinatura do atendente na mensagem que vai ao cliente.
//
//   node scripts/testes/assinatura.mjs
import { register } from "node:module";
register("./_alias.mjs", import.meta.url);

const { assinarComNome, marcaDoAgente, primeiroNome } = await import(
  "../../src/lib/atendimento/assinatura.ts"
);

let passou = 0;
const falhas = [];
function eq(titulo, obtido, esperado) {
  if (obtido === esperado) passou++;
  else falhas.push(`${titulo}\n    esperado: ${JSON.stringify(esperado)}\n    obtido:   ${JSON.stringify(obtido)}`);
}

// --- O pedido, literal: "Michelle: bom dia" ---------------------------
eq("caso do áudio", assinarComNome("bom dia", "Michelle"), "*Michelle:* bom dia");
eq("nome completo vira primeiro nome", assinarComNome("bom dia", "Michelle Aparecida Silva"), "*Michelle:* bom dia");
eq("o outro do exemplo", assinarComNome("segue o contrato", "Vítor Hugo"), "*Vítor:* segue o contrato");

// --- Multilinha: o nome abre, o resto segue --------------------------
eq(
  "mensagem de várias linhas",
  assinarComNome("Segue o valor:\nR$ 320.000", "Michelle"),
  "*Michelle:* Segue o valor:\nR$ 320.000",
);

// --- Não inventa nome ------------------------------------------------
eq("sem nome, texto intacto", assinarComNome("bom dia", null), "bom dia");
eq("nome vazio, texto intacto", assinarComNome("bom dia", "   "), "bom dia");
eq("marca vazia sem nome", marcaDoAgente(null), "");

// --- NÃO duplica ------------------------------------------------------
// Reenvio, ou macro que já trouxe a assinatura, não pode virar
// "*Michelle:* *Michelle:* bom dia".
eq(
  "texto que já vem assinado",
  assinarComNome("*Michelle:* bom dia", "Michelle"),
  "*Michelle:* bom dia",
);
eq(
  "assinado por OUTRA pessoa é assinado de novo",
  assinarComNome("*Vítor:* bom dia", "Michelle"),
  "*Michelle:* *Vítor:* bom dia",
);

// --- Texto vazio ------------------------------------------------------
eq("texto vazio continua vazio", assinarComNome("", "Michelle"), "");
eq("só espaços continua igual", assinarComNome("   ", "Michelle"), "   ");

// --- primeiroNome -----------------------------------------------------
eq("primeiro nome com espaços sobrando", primeiroNome("  Ana   Maria "), "Ana");

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("✓ tudo certo");
