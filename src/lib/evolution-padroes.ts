// Constantes da Evolution que a TELA também precisa ler. Ficam num arquivo
// sem `fetch` nem credencial para o componente de cliente poder importar
// sem arrastar o cliente HTTP inteiro para o bundle do navegador.

/**
 * O texto que o cliente lê quando a ligação é recusada. Trocado em 23/09
 * a pedido do Carlos: o anterior ("Não atendemos ligações por aqui…")
 * soava seco para quem acabou de ter a chamada cortada. Editável em
 * Configurações › Ligações recebidas, sem novo QR.
 */
export const MSG_LIGACAO_PADRAO =
  "Olá! 😊 Por aqui não atendemos ligações. É só escrever que a gente responde rapidinho. Obrigado!";

/**
 * Teto REAL da mensagem: a coluna `msgCall` da Evolution (2.3.7) é
 * varchar(100). Acima disso o `/settings/set` responde 500 ("value too
 * long for the column's type") e NADA é salvo — a tela dizia 200 e o
 * botão Salvar falhava sem explicar. Descoberto em 23/09.
 */
export const MSG_LIGACAO_MAX = 100;
