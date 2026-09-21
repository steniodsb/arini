// Testa a interpretação da resposta do menu de ramais.
//
//   node scripts/testes/menu-ramais.mjs
//
// É o ponto onde um erro custa caro: interpretar um número solto dentro de
// uma frase manda o cliente para o setor errado, e ele só descobre depois
// de contar o caso inteiro para quem não é do assunto.
import { register } from "node:module";
register("./_alias.mjs", import.meta.url);

const { interpretarResposta, montarTextoMenu } = await import("../../src/lib/atendimento/menu-resposta.ts");

// Os 6 ramais do fluxograma de 18/09/2026.
const OPCOES = [
  { id: "a", chave: "1", rotulo: "Compra e Venda" },
  { id: "b", chave: "2", rotulo: "Imóveis Rurais e Fazendas" },
  { id: "c", chave: "3", rotulo: "Locação e Administração" },
  { id: "d", chave: "4", rotulo: "Financiamento Imobiliário" },
  { id: "e", chave: "5", rotulo: "Escritura e Documentação" },
  { id: "f", chave: "6", rotulo: "Atendimento Consultivo" },
];

let passou = 0;
const falhas = [];

function escolhe(entrada, esperado) {
  const r = interpretarResposta(entrada, OPCOES);
  const obtido = r ? r.chave : null;
  if (obtido === esperado) passou++;
  else falhas.push(`${JSON.stringify(entrada)}\n    esperado: ${esperado}\n    obtido:   ${obtido}`);
}

// --- O caso normal ---------------------------------------------------
escolhe("1", "1");
escolhe("3", "3");
escolhe(" 6 ", "6");
escolhe("2.", "2");
escolhe("4)", "4");

// --- Emoji de tecla, que o WhatsApp manda sozinho ---------------------
escolhe("1️⃣", "1");

// --- Frase curta em volta do número ----------------------------------
escolhe("opção 3", "3");
escolhe("quero a 2", "2");
escolhe("a 5 por favor", "5");

// --- OS FALSOS POSITIVOS (o motivo desta função existir) --------------
// Cada um destes tem um dígito válido dentro e NÃO pode rotear.
escolhe("meu CPF é 123.456.789-00", null);
escolhe("vou chegar às 11h", null);
escolhe("bom dia, tudo bem? gostaria de saber sobre um apartamento de 2 quartos no centro", null);
escolhe("moro na rua 3 de outubro, número 250", null);
escolhe("tenho interesse em um imóvel de 3 dormitórios, pode me mandar fotos?", null);

// As frases CURTAS com um dígito solto, que a regra antiga ("mensagem de
// até 20 caracteres com um dígito dentro") roteava errado. São exatamente
// o que cliente de imobiliária escreve.
escolhe("2 quartos", null);
escolhe("chego as 3h", null);
escolhe("tem 4 vagas?", null);
escolhe("R$ 3 mil", null);

// --- Citou o setor pelo nome -----------------------------------------
escolhe("locação e administração", "3");
escolhe("quero falar sobre Compra e Venda", "1");

// --- Nada ------------------------------------------------------------
escolhe("", null);
escolhe(null, null);
escolhe("9", null);
escolhe("oi", null);

// --- Montagem do texto ------------------------------------------------
const texto = montarTextoMenu(
  { saudacao: "Olá! Seja bem-vindo à Arini.", cabecalho: "Escolha uma das opções abaixo:" },
  null,
  OPCOES.slice(0, 2),
);
const esperado =
  "Olá! Seja bem-vindo à Arini.\n\nEscolha uma das opções abaixo:\n\n1 — Compra e Venda\n2 — Imóveis Rurais e Fazendas";
if (texto === esperado) passou++;
else falhas.push(`montarTextoMenu\n    esperado: ${JSON.stringify(esperado)}\n    obtido:   ${JSON.stringify(texto)}`);

// Saudação vazia no menu = usa a da caixa (ver migration 0052).
const comCaixa = montarTextoMenu({ saudacao: "", cabecalho: "Escolha:" }, "Bem-vindo à Arini.", OPCOES.slice(0, 1));
if (comCaixa === "Bem-vindo à Arini.\n\nEscolha:\n\n1 — Compra e Venda") passou++;
else falhas.push(`saudação da caixa\n    obtido: ${JSON.stringify(comCaixa)}`);

// ----------------------------------------------------------------------
console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("✓ tudo certo");
