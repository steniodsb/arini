// Testa a regra do NOME DO CONTATO a partir do pushName do WhatsApp.
//
//   node scripts/testes/nome-contato.mjs
//
// O bug de 23/09: 178 conversas e 126 leads chamados "Arini Negócios
// Imobiliários" — o pushName do eco das respostas dadas pelo celular
// (fromMe) era gravado como nome do cliente. Lógica pura, sem banco.
import { register } from "node:module";
register("./_alias.mjs", import.meta.url);

const { nomeDoContato } = await import("../../src/lib/atendimento/contato-nome.ts");

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };

const EMPRESA = "Arini Negócios Imobiliários";

// 1. O caso do bug: eco fromMe com o perfil da empresa NÃO vira nome.
ok("fromMe com pushName da empresa: ignora",
  nomeDoContato({ atual: "Érica Ribeiro", pushName: EMPRESA, fromMe: true }) === undefined);
ok("fromMe em conversa sem nome: continua sem nome (não inventa)",
  nomeDoContato({ atual: null, pushName: EMPRESA, fromMe: true }) === undefined);

// 2. Mensagem do cliente preenche o que está vazio.
ok("cliente escreve, conversa sem nome: grava o pushName",
  nomeDoContato({ atual: null, pushName: "Érica Ribeiro", fromMe: false }) === "Érica Ribeiro");
ok("placeholder 'Contato 5534…' é substituído",
  nomeDoContato({ atual: "Contato 553499929260", pushName: "Érica", fromMe: false }) === "Érica");
ok("telefone puro como nome é substituído",
  nomeDoContato({ atual: "553499929260", pushName: "Érica", fromMe: false }) === "Érica");

// 3. Nome que o atendente deu à mão NÃO é sobrescrito.
ok("nome já existente fica",
  nomeDoContato({ atual: "Sr. João do sítio", pushName: "joao123", fromMe: false }) === undefined);

// 4. Nome envenenado é tratado como vazio quando se sabe o nome da conta.
ok("nome = empresa (envenenado) é substituído pelo pushName do cliente",
  nomeDoContato({ atual: EMPRESA, pushName: "Érica", fromMe: false, nomeDaConta: EMPRESA }) === "Érica");
ok("pushName igual ao nome da conta nunca vira nome de cliente",
  nomeDoContato({ atual: null, pushName: EMPRESA, fromMe: false, nomeDaConta: EMPRESA }) === undefined);

// 5. Higiene.
ok("pushName vazio/espaços: ignora",
  nomeDoContato({ atual: null, pushName: "   ", fromMe: false }) === undefined);
ok("corta em 80 caracteres",
  (nomeDoContato({ atual: null, pushName: "x".repeat(200), fromMe: false }) ?? "").length === 80);

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ o nome da empresa nunca mais vira nome de cliente");
