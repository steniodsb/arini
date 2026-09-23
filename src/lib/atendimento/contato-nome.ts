// =====================================================================
// QUE NOME GRAVAR PARA O CONTATO A PARTIR DO `pushName` DO WHATSAPP
//
// O BUG QUE ISTO CONSERTA (encontrado no banco em 23/09/2026): 178
// conversas e 126 leads chamados "Arini Negócios Imobiliários" — o nome
// da PRÓPRIA imobiliária. O webhook gravava `data.pushName` em toda
// mensagem, sem olhar `key.fromMe`. No eco da resposta dada pelo celular
// o pushName é o perfil do número conectado; então cada cliente que
// recebia resposta pelo aparelho era renomeado para o nome da empresa.
// Na tela, dezenas de conversas viravam "Arini Negócios Imobiliários" e
// ninguém sabia mais quem era quem. Foi relatado como "problema na
// identificação das mensagens".
//
// A regra, em duas partes:
//   1. pushName SÓ conta quando a mensagem é DO CLIENTE (`!fromMe`).
//   2. pushName só PREENCHE — nunca sobrescreve um nome que já existe.
//      O atendente pode ter renomeado o contato à mão ("Sr. João, dono
//      do sítio"), e o WhatsApp mandando "joao123" por cima jogaria esse
//      trabalho fora. As exceções são os placeholders que o próprio
//      sistema gerou ("Contato 5534…") e o nome envenenado da empresa.
// =====================================================================

/** O que o sistema gera quando não sabe o nome. Pode ser substituído. */
function ehPlaceholder(nome: string | null | undefined): boolean {
  if (!nome) return true;
  const n = nome.trim();
  if (!n) return true;
  if (/^contato\s+\d{8,15}$/i.test(n)) return true;
  if (/^\d{8,15}$/.test(n)) return true;
  return false;
}

/**
 * Decide o nome a gravar.
 *
 * @param atual        o que já está na conversa/lead (null = nada)
 * @param pushName     o que veio no payload
 * @param fromMe       a mensagem saiu do NOSSO número
 * @param nomeDaConta  o perfil do número conectado (para nunca aceitá-lo
 *                     como nome de cliente, mesmo vindo em mensagem `in`)
 * @returns o nome a gravar, ou `undefined` para NÃO mexer no campo
 */
export function nomeDoContato(args: {
  atual: string | null | undefined;
  pushName: string | null | undefined;
  fromMe: boolean;
  nomeDaConta?: string | null;
}): string | undefined {
  const { atual, fromMe, nomeDaConta } = args;
  const push = args.pushName?.trim() || null;

  // Eco da nossa própria mensagem: o pushName é o nosso perfil. Ignora.
  if (fromMe) return undefined;
  if (!push) return undefined;
  // Defesa extra: o nome da conta nunca é nome de cliente.
  if (nomeDaConta && push.toLowerCase() === nomeDaConta.trim().toLowerCase()) return undefined;

  // Já tem nome de verdade: não sobrescreve.
  if (!ehPlaceholder(atual) && !(nomeDaConta && atual?.trim().toLowerCase() === nomeDaConta.trim().toLowerCase())) {
    return undefined;
  }
  return push.slice(0, 80);
}
