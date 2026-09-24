// Testa as regras de EDITAR MENSAGEM ENVIADA (lógica pura, sem banco).
//
//   node scripts/testes/editar-mensagem.mjs
//
// O que importa: o lápis só aparece — e a rota só aceita — quando o
// WhatsApp também aceita (texto, até 15 min). Editar aqui e o cliente
// continuar lendo o texto antigo seria a tela mentindo sobre o que foi dito.
import { register } from "node:module";
register("./_alias.mjs", import.meta.url);
const { podeEditar, textoSemMarca, textoComMarca, lerEdicao } =
  await import("../../src/lib/atendimento/editar-mensagem.ts");

let passou = 0; const falhas = [];
const ok = (t, c, d = "") => { if (c) passou++; else falhas.push(`${t}${d ? `\n    ${d}` : ""}`); };

const EU = "u-allan", OUTRO = "u-alexandra";
const agora = Date.parse("2026-09-24T12:00:00Z");
const base = {
  direcao: "out", remetente: "atendente", autor_id: EU, tipo: "texto", interna: false,
  created_at: new Date(agora - 5 * 60_000).toISOString(), apagada_em: null,
  external_id: "ABC123", conteudo: "*Allan:* bom dia",
};
const pode = (m, quem = EU, admin = false) => podeEditar({ ...base, ...m }, quem, admin, agora);

ok("1. minha, texto, 5 min: pode", pode({}).ok);
ok("2. 16 min depois: NÃO", !pode({ created_at: new Date(agora - 16 * 60_000).toISOString() }).ok);
ok("3. 14 min e meio: NÃO (folga de 30 s para o relógio)", !pode({ created_at: new Date(agora - 14.75 * 60_000).toISOString() }).ok);
ok("4. foto: NÃO", !pode({ tipo: "imagem" }).ok);
ok("5. do cliente: NÃO", !pode({ direcao: "in", remetente: "cliente" }).ok);
ok("6. automática (menu): NÃO", !pode({ remetente: "sistema" }).ok);
ok("7. de outra pessoa: NÃO", !pode({ autor_id: OUTRO }).ok);
ok("8. de outra pessoa, sendo admin: pode", pode({ autor_id: OTHERFIX() }, EU, true).ok);
ok("9. apagada: NÃO", !pode({ apagada_em: new Date(agora).toISOString() }).ok);
ok("10. sem external_id (não chegou ao WhatsApp): NÃO", !pode({ external_id: null }).ok);
ok("11. nota interna de 3 dias: pode (não sai do sistema)",
  pode({ interna: true, external_id: null, created_at: new Date(agora - 3 * 86400e3).toISOString() }).ok);
function OTHERFIX() { return OUTRO; }

// Marca "*Allan:*"
const s = textoSemMarca("*Allan:* bom dia", "Allan Urzedo");
ok("12. tira a marca para editar", s.texto === "bom dia" && s.tinhaMarca);
ok("13. recoloca a marca ao salvar", textoComMarca("boa tarde", "Allan Urzedo", true) === "*Allan:* boa tarde");
ok("14. sem marca no original, não inventa", textoComMarca("oi", "Allan Urzedo", false) === "oi");
ok("15. marca de outra pessoa não é tirada", !textoSemMarca("*Carlos:* oi", "Allan Urzedo").tinhaMarca);

// Edição vinda do celular
const e1 = lerEdicao({ protocolMessage: { type: 14, key: { id: "X1" }, editedMessage: { conversation: "novo texto" } } });
ok("16. lê edição (formato Baileys)", e1?.idOriginal === "X1" && e1?.texto === "novo texto");
const e2 = lerEdicao({ editedMessage: { message: { protocolMessage: { type: "MESSAGE_EDIT", key: { id: "X2" }, editedMessage: { extendedTextMessage: { text: "t2" } } } } } });
ok("17. lê edição embrulhada pela Evolution", e2?.idOriginal === "X2" && e2?.texto === "t2");
ok("18. apagar-para-todos (protocolo sem edição) não é edição", lerEdicao({ protocolMessage: { type: 0, key: { id: "X3" } } }) === null);
ok("19. mensagem comum não é edição", lerEdicao({ conversation: "oi" }) === null);

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) { console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n")); process.exit(1); }
console.log("✓ edição só onde o WhatsApp aceita");
