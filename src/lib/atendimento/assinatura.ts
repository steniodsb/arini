// =====================================================================
// ASSINATURA DO ATENDENTE NA MENSAGEM QUE VAI AO CLIENTE
//
// Pedido do Carlos no áudio de 18/09/2026 07:21: o setor de marketing tem
// Michelle e Vítor, e ele quer saber "qual dos dois está respondendo, pra
// ficar mais fácil de chamar a atenção se precisar".
//
// POR QUE ISTO NÃO É A ASSINATURA QUE JÁ EXISTIA. O sistema já tinha
// `profiles.assinatura`: um bloco de texto livre, colado no FIM da
// mensagem, que o atendente marca a cada envio. Três coisas a tornam
// inútil para o que foi pedido:
//
//   · é opcional por mensagem — depende de alguém lembrar;
//   · exige que cada pessoa escreva a própria assinatura, e em 21/09/2026
//     nenhum dos 10 perfis tinha preenchido;
//   · vai no fim, enquanto o pedido é "Michelle: bom dia", na frente.
//
// As duas convivem: esta é automática e identifica QUEM fala; aquela
// continua sendo o bloco de despedida que o agente escolhe mandar.
// =====================================================================

/**
 * Primeiro nome, que é como o cliente chama a pessoa. Nome completo numa
 * conversa de WhatsApp fica formal e comprido ("Michelle Aparecida da
 * Silva:" antes de cada frase).
 */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0];
}

/** Como a assinatura aparece: `*Michelle:*` (o asterisco é negrito no WhatsApp). */
export function marcaDoAgente(nome: string | null | undefined): string {
  const p = primeiroNome(nome);
  return p ? `*${p}:*` : "";
}

/**
 * Prefixa o texto com o nome de quem está respondendo.
 *
 * Devolve o texto intacto quando não há nome (não inventa "Atendente:") e
 * quando o texto JÁ começa com a marca — reenvio ou macro que já trouxe a
 * assinatura não pode virar "*Michelle:* *Michelle:* bom dia".
 */
export function assinarComNome(texto: string, nome: string | null | undefined): string {
  const marca = marcaDoAgente(nome);
  if (!marca) return texto;
  const t = texto.trimStart();
  if (!t) return texto;
  if (t.startsWith(marca)) return texto;
  return `${marca} ${t}`;
}
