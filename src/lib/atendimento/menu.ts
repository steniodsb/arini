import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensagem } from "@/lib/atendimento/outbound";
import { aplicarVariaveis } from "@/lib/atendimento/variaveis";
import { dentroDoHorarioDaCaixa } from "@/lib/atendimento/widget";
import { interpretarResposta, montarTextoMenu, type OpcaoMenu } from "@/lib/atendimento/menu-resposta";
import { resolverCaixa } from "@/lib/atendimento/caixa";
import type { ConversationChannel } from "@/lib/types";

// =====================================================================
// MENU DE RAMAIS — "digite 1 para Compra e Venda"
//
// O que o motor de automações não podia fazer: LEMBRAR que o menu foi
// enviado. Ver o cabeçalho de `supabase/migrations/0052_menu_ramais.sql`
// para o porquê de uma tabela de estado em vez de mais uma regra.
//
// ONDE ISTO RODA: em `inbound.ts`, ANTES das automações e ANTES da
// entrega ao bot externo. A ordem importa e foi escolhida:
//
//   · antes das AUTOMAÇÕES, para que uma regra de `mensagem_criada` já
//     enxergue a conversa com a fila que o cliente escolheu;
//   · antes do BOT, porque enquanto o menu espera resposta o bot precisa
//     ficar calado — dois robôs conversando com o mesmo cliente ao mesmo
//     tempo é o pior resultado possível. É o que `aguardandoResposta`
//     comunica de volta.
// =====================================================================

export interface ResultadoMenu {
  acao: "nada" | "enviou" | "roteou" | "repetiu" | "escapou" | "expirou" | "cedeu";
  detalhe?: string;
  /** Enquanto true, quem chamou NÃO deve entregar a mensagem ao bot externo. */
  aguardandoResposta: boolean;
  erros: string[];
}

const NADA: ResultadoMenu = { acao: "nada", aguardandoResposta: false, erros: [] };

/**
 * Como o menu fala com o cliente.
 *
 * É parâmetro, e não import fixo, por uma razão prática: o teste de ponta
 * a ponta roda contra o BANCO DE PRODUÇÃO (é onde estão as filas, as
 * caixas e o expediente de verdade) e não pode, em hipótese nenhuma,
 * disparar mensagem no WhatsApp da Arini. Com o envio injetável isso é
 * garantido por construção, não por stub bem colocado.
 */
export type Enviar = typeof enviarMensagem;

// ---------------------------------------------------------------------

interface ConversaMenu {
  id: string;
  canal: ConversationChannel;
  channel_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  external_id: string | null;
  inbox_id: string | null;
  team_id: string | null;
  triada_em: string | null;
}

/**
 * Despacha um texto para o cliente e grava a linha em `messages` com o
 * status REAL da entrega.
 *
 * O status honesto não é detalhe: antes da correção de 15/09 as ações de
 * automação gravavam tudo como "enviada" e a tela afirmava o contrário do
 * que tinha acontecido. Ninguém vai atrás do que parece ter dado certo.
 */
async function responder(
  admin: SupabaseClient,
  enviar: Enviar,
  conversa: ConversaMenu,
  texto: string,
  erros: string[],
): Promise<void> {
  const destino = conversa.contato_telefone || conversa.external_id;
  let status: "enviada" | "falha" = "enviada";
  let externalId: string | null = null;

  if (!destino) {
    status = "falha";
    erros.push("Menu: conversa sem destino — a mensagem não foi entregue.");
  } else {
    const r = await enviar(admin, {
      canal: conversa.canal,
      channelId: conversa.channel_id,
      destino,
      texto,
      conversationId: conversa.id,
    });
    if (r.ok) externalId = r.externalId ?? null;
    else {
      status = "falha";
      erros.push(`Menu não entregue: ${r.reason}`);
    }
  }

  await admin.from("messages").insert({
    conversation_id: conversa.id,
    direcao: "out",
    remetente: "sistema",
    autor_id: null,
    tipo: "texto",
    conteudo: texto,
    interna: false,
    status,
    external_id: externalId,
  });
}

/** Contexto de variáveis desta conversa. `fila` entra só quando há destino. */
function ctxVariaveis(conversa: ConversaMenu, fila?: string | null) {
  return {
    contatoNome: conversa.contato_nome,
    contatoTelefone: conversa.contato_telefone,
    canal: conversa.canal,
    fila: fila ?? null,
  };
}

// ---------------------------------------------------------------------
// ENTRADA ÚNICA
// ---------------------------------------------------------------------

export async function processarMenu(
  admin: SupabaseClient,
  conversationId: string,
  gatilho: {
    conversaNova: boolean;
    conteudo: string | null;
    direcao: "in" | "out";
    interna: boolean;
    /**
     * A conversa estava RESOLVIDA quando esta mensagem chegou.
     *
     * Precisa vir de fora porque quem recebe a mensagem já reabre a
     * conversa (`status = 'aberta'`) antes de chamar o menu — lido aqui,
     * o status diria sempre "aberta" e o sinal se perderia.
     */
    reabriuResolvida?: boolean;
  },
  opts: { enviar?: Enviar } = {},
): Promise<ResultadoMenu> {
  const enviar = opts.enviar ?? enviarMensagem;
  // Só mensagem do CLIENTE mexe com o menu. Nota interna e resposta do
  // atendente não contam como escolha de ramal.
  if (gatilho.direcao !== "in" || gatilho.interna) return NADA;

  const erros: string[] = [];

  const { data: conv } = await admin
    .from("conversations")
    .select("id, canal, channel_id, contato_nome, contato_telefone, external_id, inbox_id, team_id, triada_em")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return NADA;
  const conversa = conv as unknown as ConversaMenu;

  const { data: estadoRow } = await admin
    .from("atendimento_menu_estado")
    .select("conversation_id, menu_id, enviado_em, tentativas, respondido_em")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  // ATENDIMENTO CONCLUÍDO, CLIENTE VOLTOU: o ramal recomeça.
  //
  // Numa imobiliária com quinze anos de carteira, o mesmo número volta
  // muitas vezes — ora para vendas, ora para o despachante. Amarrar o
  // menu a "contato novo" deixava de fora justamente quem mais escreve.
  //
  // O gatilho é a RESOLUÇÃO, não o tempo: enquanto o assunto anterior
  // está aberto, perguntar "com qual setor você quer falar?" interrompe
  // alguém que já está falando com um. Por isso `reabriuResolvida`, e
  // por isso o comportamento é opcional (0055).
  if (gatilho.reabriuResolvida && !gatilho.conversaNova) {
    const menuDaCaixa = await menuAtivoDaCaixa(admin, conversa);
    if (menuDaCaixa?.reenviar_apos_resolver) {
      // O estado antigo é o registro do menu ANTERIOR. Apagá-lo é o que
      // permite recomeçar do zero — inclusive as tentativas.
      await admin.from("atendimento_menu_estado").delete().eq("conversation_id", conversa.id);
      return enviarMenu(admin, enviar, conversa, erros);
    }
  }

  // Já respondido: o menu terminou o trabalho dele nesta conversa.
  if (estadoRow?.respondido_em) return NADA;

  if (estadoRow) {
    // HUMANO JÁ RESPONDEU DEPOIS DO MENU? Então o menu perdeu a vez.
    //
    // O caso que definiu isto (Wilson Moreira, 23/09): menu às 12:23, o
    // Carlos respondeu pelo celular às 13:14 e 13:16, e às 14:03 os áudios
    // do cliente receberam "não consegui identificar" ×2 e "Perfeito,
    // identificamos… Atendimento Geral" — POR CIMA da conversa que o
    // Carlos estava tendo. Robô falando por cima de gente é o pior
    // resultado possível deste módulo.
    //
    // `remetente = 'atendente'` cobre também o eco `fromMe` do celular: é
    // assim que o webhook grava a resposta dada pelo aparelho, e é o caso
    // real — 83% das respostas saem pelo celular.
    const { count: humanas } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("direcao", "out")
      .eq("remetente", "atendente")
      .eq("interna", false)
      .gt("created_at", (estadoRow as EstadoRow).enviado_em);
    if ((humanas ?? 0) > 0) {
      await fecharEstado(admin, conversationId, null);
      return { acao: "cedeu", detalhe: "humano já respondeu", aguardandoResposta: false, erros };
    }

    return responderAoMenu(admin, enviar, conversa, estadoRow as EstadoRow, gatilho.conteudo, erros);
  }

  // Sem estado: só oferece o menu na PRIMEIRA mensagem. Mandar o menu no
  // meio de uma conversa que já tem gente atendendo seria pior que não ter
  // menu nenhum.
  if (!gatilho.conversaNova) return NADA;
  if (conversa.triada_em) return NADA;

  return enviarMenu(admin, enviar, conversa, erros);
}

interface EstadoRow {
  conversation_id: string;
  menu_id: string;
  enviado_em: string;
  tentativas: number;
  respondido_em: string | null;
}

// ---------------------------------------------------------------------

/** O menu ativo da caixa desta conversa, ou null. */
async function menuAtivoDaCaixa(admin: SupabaseClient, conversa: ConversaMenu) {
  const caixaId = await resolverCaixa(admin, conversa);
  if (!caixaId) return null;
  const { data } = await admin
    .from("atendimento_menus")
    .select("id, reenviar_apos_resolver")
    .eq("inbox_id", caixaId)
    .eq("ativo", true)
    .maybeSingle();
  return data as { id: string; reenviar_apos_resolver: boolean } | null;
}

async function carregarMenu(admin: SupabaseClient, menuId: string) {
  const { data: menu } = await admin
    .from("atendimento_menus")
    .select("id, inbox_id, saudacao, cabecalho, confirmacao, nao_entendi, max_tentativas, fila_escape, expira_minutos, ativo")
    .eq("id", menuId)
    .maybeSingle();
  if (!menu) return null;

  const { data: opcoes } = await admin
    .from("atendimento_menu_opcoes")
    .select("id, chave, rotulo, team_id, responsavel_id, etiqueta, confirmacao")
    .eq("menu_id", menuId)
    .eq("ativo", true)
    .order("ordem");

  return { menu, opcoes: (opcoes ?? []) as unknown as OpcaoMenu[] };
}

async function enviarMenu(
  admin: SupabaseClient,
  enviar: Enviar,
  conversa: ConversaMenu,
  erros: string[],
): Promise<ResultadoMenu> {
  // Não basta ler `conversa.inbox_id`: até 20/09/2026 esse campo nunca foi
  // gravado, e a dedução pela conexão é o que faz o menu funcionar nas
  // conversas antigas. Ver `caixa.ts`.
  const caixaId = await resolverCaixa(admin, conversa);
  if (!caixaId) return NADA;

  const { data: menuRow } = await admin
    .from("atendimento_menus")
    .select("id")
    .eq("inbox_id", caixaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!menuRow) return NADA;

  const carregado = await carregarMenu(admin, menuRow.id as string);
  if (!carregado || carregado.opcoes.length === 0) return NADA;
  const { menu, opcoes } = carregado;

  const { data: caixa } = await admin
    .from("atendimento_inboxes")
    .select("id, saudacao_texto, mensagem_ausencia, horario_comercial_ativo")
    .eq("id", caixaId)
    .maybeSingle();

  const ctx = ctxVariaveis(conversa);

  // FORA DO EXPEDIENTE: avisa ANTES de oferecer o menu, e oferece o menu
  // mesmo assim. As mensagens 5 e 6 do fluxograma ("sábado e domingo" /
  // "fora do horário") são o mesmo caso — expediente fechado — e o próprio
  // fluxograma pede "preservar a fila para o próximo período". Rotear no
  // domingo significa que na segunda a conversa já está no setor certo em
  // vez de empilhada na caixa central.
  if (caixa) {
    const aberto = await dentroDoHorarioDaCaixa(admin, {
      id: caixa.id as string,
      horario_comercial_ativo: Boolean(caixa.horario_comercial_ativo),
    });
    const ausencia = (caixa.mensagem_ausencia as string | null)?.trim();
    if (!aberto && ausencia) {
      await responder(admin, enviar, conversa, aplicarVariaveis(ausencia, ctx), erros);
    }
  }

  const texto = aplicarVariaveis(
    montarTextoMenu(
      { saudacao: menu.saudacao as string, cabecalho: menu.cabecalho as string },
      (caixa?.saudacao_texto as string | null) ?? null,
      opcoes,
    ),
    ctx,
  );
  if (!texto.trim()) return NADA;

  await responder(admin, enviar, conversa, texto, erros);

  await admin.from("atendimento_menu_estado").upsert(
    {
      conversation_id: conversa.id,
      menu_id: menu.id as string,
      enviado_em: new Date().toISOString(),
      tentativas: 0,
      respondido_em: null,
      opcao_id: null,
    },
    { onConflict: "conversation_id" },
  );

  return { acao: "enviou", aguardandoResposta: true, erros };
}

async function responderAoMenu(
  admin: SupabaseClient,
  enviar: Enviar,
  conversa: ConversaMenu,
  estado: EstadoRow,
  conteudo: string | null,
  erros: string[],
): Promise<ResultadoMenu> {
  const carregado = await carregarMenu(admin, estado.menu_id);
  // Menu apagado ou desativado no meio do caminho: encerra o estado em vez
  // de deixar a conversa presa esperando resposta para sempre.
  if (!carregado || !carregado.menu.ativo || carregado.opcoes.length === 0) {
    await fecharEstado(admin, conversa.id, null);
    return { acao: "expirou", aguardandoResposta: false, erros };
  }
  const { menu, opcoes } = carregado;

  // Expirou: o "1" que chega três semanas depois não é resposta de menu.
  const limite = new Date(estado.enviado_em).getTime() + Number(menu.expira_minutos) * 60_000;
  if (Date.now() > limite) {
    await fecharEstado(admin, conversa.id, null);
    return { acao: "expirou", aguardandoResposta: false, erros };
  }

  // MÍDIA SEM TEXTO (áudio, foto, documento) NÃO É TENTATIVA. Responder
  // "não consegui identificar a opção" a um áudio é o robô confessando
  // que não ouviu — e contar isso como erro do cliente é injusto. Fica em
  // silêncio, e o menu continua aberto para o texto que vier.
  if (!conteudo?.trim()) {
    return { acao: "nada", detalhe: "mídia sem texto", aguardandoResposta: true, erros };
  }

  const escolha = interpretarResposta(conteudo, opcoes);

  if (escolha) {
    return rotear(admin, enviar, conversa, menu, escolha, erros);
  }

  // RAJADA: o cliente ainda está digitando. Se o menu (ou a repetição)
  // saiu há menos de 90 s, não responde nem conta — a próxima mensagem
  // pode ser o número. Só vale para resposta que NÃO casou: um "3" dez
  // segundos depois do menu é resposta válida e já roteou acima.
  const { data: ultimoSistema } = await admin
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversa.id)
    .eq("direcao", "out")
    .eq("remetente", "sistema")
    .eq("interna", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimoSistema && Date.now() - new Date(ultimoSistema.created_at as string).getTime() < 90_000) {
    return { acao: "nada", detalhe: "rajada", aguardandoResposta: true, erros };
  }

  // Não entendeu. Repete até o teto; depois desiste para não deixar o
  // cliente em laço com o robô.
  const tentativas = Number(estado.tentativas) + 1;
  const ctx = ctxVariaveis(conversa);

  if (tentativas >= Number(menu.max_tentativas)) {
    const filaEscape = (menu.fila_escape as string | null) ?? null;
    let nomeFila: string | null = null;

    if (filaEscape) {
      const { data: t } = await admin
        .from("atendimento_teams")
        .select("nome")
        .eq("id", filaEscape)
        .maybeSingle();
      nomeFila = (t?.nome as string | null) ?? null;

      const patch: Record<string, unknown> = { team_id: filaEscape };
      if (!conversa.triada_em) patch.triada_em = new Date().toISOString();
      await admin.from("conversations").update(patch).eq("id", conversa.id);
      await registrarTransferencia(admin, conversa, filaEscape, null, "Menu: sem resposta válida");
    }

    await fecharEstado(admin, conversa.id, null);

    // SEM MENSAGEM NO ESCAPE, de propósito. A confirmação do menu diz
    // "identificamos sua necessidade como {{fila}}" — e aqui ninguém
    // identificou nada: o cliente escreveu uma frase e o robô desistiu.
    // Mandar isso é mentir. A frase do cliente já está na conversa, na
    // fila de escape, e a resposta certa a ela é a de uma pessoa.
    void nomeFila;
    return { acao: "escapou", aguardandoResposta: false, erros };
  }

  await admin
    .from("atendimento_menu_estado")
    .update({ tentativas })
    .eq("conversation_id", conversa.id);

  // Repete SÓ O EMPURRÃO ("responda com o número"), sem a lista de
  // opções. Reenviar o menu inteiro a cada frase era o "disparo
  // incontrolável" que o Carlos relatou: metade dos contatos novos
  // escreve uma frase na primeira resposta, e cada frase trazia o bloco
  // completo de volta. O cliente já viu as opções; o que falta é um
  // lembrete de uma linha — e o texto é do Carlos, na tela.
  const texto = aplicarVariaveis((menu.nao_entendi as string).trim(), ctx);
  if (texto.trim()) await responder(admin, enviar, conversa, texto, erros);

  return { acao: "repetiu", detalhe: `tentativa ${tentativas}`, aguardandoResposta: true, erros };
}

async function rotear(
  admin: SupabaseClient,
  enviar: Enviar,
  conversa: ConversaMenu,
  menu: Record<string, unknown>,
  escolha: OpcaoMenu,
  erros: string[],
): Promise<ResultadoMenu> {
  const patch: Record<string, unknown> = {};
  let nomeFila: string | null = null;

  if (escolha.team_id) {
    patch.team_id = escolha.team_id;
    const { data: t } = await admin
      .from("atendimento_teams")
      .select("nome")
      .eq("id", escolha.team_id)
      .maybeSingle();
    nomeFila = (t?.nome as string | null) ?? null;
  }
  if (escolha.responsavel_id) patch.responsavel_id = escolha.responsavel_id;

  // ESCOLHER O RAMAL É TRIAR. É o mesmo raciocínio da correção de 15/09 na
  // API de bots: sem o carimbo `triada_em` a conversa ganha fila mas o
  // painel de Triagem continua pedindo para atribuí-la, porque os dois
  // lugares olham campos diferentes.
  if (escolha.team_id && !conversa.triada_em) {
    patch.triada_em = new Date().toISOString();
  }

  if (escolha.etiqueta?.trim()) {
    const { data: atual } = await admin
      .from("conversations")
      .select("tags")
      .eq("id", conversa.id)
      .maybeSingle();
    const tags = ((atual?.tags as string[] | null) ?? []).slice();
    const nova = escolha.etiqueta.trim();
    if (!tags.some((t) => t.toLowerCase() === nova.toLowerCase())) tags.push(nova);
    patch.tags = tags;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("conversations").update(patch).eq("id", conversa.id);
    if (error) erros.push(`Menu: falha ao rotear — ${error.message}`);
  }

  await registrarTransferencia(
    admin,
    conversa,
    escolha.team_id ?? null,
    escolha.responsavel_id ?? null,
    `Menu: ${escolha.chave} — ${escolha.rotulo}`,
  );

  await fecharEstado(admin, conversa.id, escolha.id);

  const confirmacao = aplicarVariaveis(
    (escolha.confirmacao?.trim() || (menu.confirmacao as string) || "").trim(),
    ctxVariaveis(conversa, nomeFila),
  );
  if (confirmacao) await responder(admin, enviar, conversa, confirmacao, erros);

  return { acao: "roteou", detalhe: `${escolha.chave} — ${escolha.rotulo}`, aguardandoResposta: false, erros };
}

async function fecharEstado(admin: SupabaseClient, conversationId: string, opcaoId: string | null) {
  await admin
    .from("atendimento_menu_estado")
    .update({ respondido_em: new Date().toISOString(), opcao_id: opcaoId })
    .eq("conversation_id", conversationId);
}

/**
 * O mesmo log das transferências feitas por gente. "Quem mandou esse
 * cliente para cá?" precisa ter resposta também quando quem mandou foi o
 * próprio cliente, escolhendo no menu. `feito_por` fica nulo porque aponta
 * para `profiles` — o motivo diz de onde veio.
 */
async function registrarTransferencia(
  admin: SupabaseClient,
  conversa: ConversaMenu,
  paraEquipe: string | null,
  paraAgente: string | null,
  motivo: string,
) {
  await admin
    .from("atendimento_transferencias")
    .insert({
      conversation_id: conversa.id,
      acao: conversa.triada_em ? "transferencia" : "triagem",
      de_equipe: conversa.team_id,
      para_equipe: paraEquipe ?? conversa.team_id,
      de_agente: null,
      para_agente: paraAgente,
      motivo,
      feito_por: null,
    })
    .then(undefined, () => undefined);
}
