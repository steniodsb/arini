// Testa a substituição de variáveis da mensagem automática.
//
//   node scripts/testes/variaveis.mjs
//
// Lógica pura: não toca no banco, não sobe servidor. O que está sendo
// exercitado aqui é justamente o que quebra na cara do cliente — nome
// vazio, nome que é telefone, pontuação órfã e saudação no fuso errado.
import { register } from "node:module";
register("./_alias.mjs", import.meta.url);

const { aplicarVariaveis, saudacaoBR, variaveisDesconhecidas, precisaDaFila } = await import(
  "../../src/lib/atendimento/variaveis.ts"
);

let passou = 0;
const falhas = [];

function eq(titulo, obtido, esperado) {
  if (obtido === esperado) {
    passou++;
  } else {
    falhas.push(`${titulo}\n    esperado: ${JSON.stringify(esperado)}\n    obtido:   ${JSON.stringify(obtido)}`);
  }
}

// --- Saudação, sempre no relógio de São Paulo ------------------------
// 14:00 UTC = 11:00 em SP (manhã). O teste falharia se o código usasse o
// fuso da máquina: em UTC, 14h seria "Boa tarde".
eq("saudação 11h SP", saudacaoBR(new Date("2026-09-20T14:00:00Z")), "Bom dia");
eq("saudação 15h SP", saudacaoBR(new Date("2026-09-20T18:00:00Z")), "Boa tarde");
eq("saudação 21h SP", saudacaoBR(new Date("2026-09-21T00:00:00Z")), "Boa noite");
eq("saudação 2h SP", saudacaoBR(new Date("2026-09-20T05:00:00Z")), "Boa noite");

const tarde = new Date("2026-09-20T18:00:00Z"); // 15h em SP

// --- O caso feliz ----------------------------------------------------
eq(
  "nome completo e primeiro nome",
  aplicarVariaveis("{{saudacao}}, {{primeiro_nome}}! Falo com {{nome}}?", {
    contatoNome: "Gabriel Castro",
    agora: tarde,
  }),
  "Boa tarde, Gabriel! Falo com Gabriel Castro?",
);

eq(
  "saudacao_nome traz a vírgula dentro",
  aplicarVariaveis("{{saudacao_nome}}! Escolha uma opção:", { contatoNome: "Gabriel", agora: tarde }),
  "Boa tarde, Gabriel! Escolha uma opção:",
);

// --- Armadilha 1: contato sem nome -----------------------------------
eq(
  "sem nome não deixa 'Olá, !'",
  aplicarVariaveis("Olá, {{primeiro_nome}}! Tudo bem?", { contatoNome: null, agora: tarde }),
  "Olá! Tudo bem?",
);

eq(
  "saudacao_nome some inteira sem nome",
  aplicarVariaveis("{{saudacao_nome}}! Escolha uma opção:", { contatoNome: null, agora: tarde }),
  "Boa tarde! Escolha uma opção:",
);

eq(
  "vírgula órfã no fim da linha",
  aplicarVariaveis("Olá, {{nome}},\nseja bem-vindo.", { contatoNome: "", agora: tarde }),
  "Olá\nseja bem-vindo.",
);

// --- Armadilha 2: o nome é o telefone --------------------------------
eq(
  "número no lugar do nome não vira saudação",
  aplicarVariaveis("{{saudacao_nome}}!", { contatoNome: "554891275655", agora: tarde }),
  "Boa tarde!",
);

eq(
  "número formatado também é telefone",
  aplicarVariaveis("{{saudacao_nome}}!", { contatoNome: "+55 34 99745-1400", agora: tarde }),
  "Boa tarde!",
);

eq(
  "nome curto com dígito continua nome",
  aplicarVariaveis("{{primeiro_nome}}", { contatoNome: "Ana2", agora: tarde }),
  "Ana2",
);

// --- Push name de grupo ----------------------------------------------
eq("til do push name sai", aplicarVariaveis("{{primeiro_nome}}", { contatoNome: "~ Gabriel", agora: tarde }), "Gabriel");

// --- Fila, canal, telefone -------------------------------------------
eq(
  "fila e canal",
  aplicarVariaveis("Encaminhado para {{fila}} (veio pelo {{canal}}).", {
    fila: "Locação",
    canal: "WhatsApp",
    agora: tarde,
  }),
  "Encaminhado para Locação (veio pelo WhatsApp).",
);

eq(
  "telefone em nota interna",
  aplicarVariaveis("Cliente {{telefone}}", { contatoTelefone: "554897451400", agora: tarde }),
  "Cliente 554897451400",
);

// --- Desconhecida fica literal ---------------------------------------
eq(
  "erro de digitação não some",
  aplicarVariaveis("Olá {{nomee}}", { contatoNome: "Gabriel", agora: tarde }),
  "Olá {{nomee}}",
);
eq("a tela consegue avisar", variaveisDesconhecidas("Olá {{nomee}} e {{nome}}").join(","), "nomee");

// --- Texto sem variável não é tocado ---------------------------------
eq(
  "texto comum passa intacto",
  aplicarVariaveis("Bom dia, tudo bem?  Aguarde, por favor.", { agora: tarde }),
  "Bom dia, tudo bem?  Aguarde, por favor.",
);

// O alinhamento de um menu escrito à mão não pode ser destruído só porque
// existe uma variável no texto. A limpeza só roda quando alguma variável
// saiu VAZIA — aqui todas têm valor, então os espaços continuam de pé.
eq(
  "menu alinhado sobrevive quando as variáveis têm valor",
  aplicarVariaveis("{{saudacao_nome}}!\n1  —  Vendas\n2  —  Locação", {
    contatoNome: "Gabriel",
    agora: tarde,
  }),
  "Boa tarde, Gabriel!\n1  —  Vendas\n2  —  Locação",
);

// --- Espaço opcional dentro do marcador -------------------------------
eq(
  "{{ nome }} com espaço também vale",
  aplicarVariaveis("Olá {{ primeiro_nome }}", { contatoNome: "Gabriel", agora: tarde }),
  "Olá Gabriel",
);

// --- Busca da fila só quando o texto pede ------------------------------
eq("não busca fila à toa", precisaDaFila("Olá {{nome}}"), false);
eq("busca fila quando precisa", precisaDaFila("Vai para {{fila}}"), true);

// ----------------------------------------------------------------------
console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("✓ tudo certo");
