import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { autenticarBot, conversaDoBot } from "@/lib/atendimento/bots";

// =====================================================================
// GET /api/bot/v1/conversas/<id>
//   Authorization: Bearer <token do bot>
//
// O bot lê o contexto. Devolve a conversa e as últimas 30 mensagens
// NÃO INTERNAS, em ordem cronológica.
//
// POR QUE "não internas" É REGRA E NÃO DETALHE: nota interna é conversa
// da equipe sobre o cliente ("esse já deu calote", "cobra à vista").
// Entregar isso a um sistema de terceiro — que pode ser um LLM que
// devolve o texto ao cliente na resposta seguinte — é um vazamento com
// cara de recurso. O filtro `interna = false` é a mesma trava que o
// widget do site usa.
//
// O corpo devolvido é uma LISTA BRANCA. Nada de `raw_payload` (traz o
// corpo cru do provedor, às vezes com credencial), nada de token da caixa
// nem de segredo de canal.
//
// 30 mensagens é o suficiente para um bot montar o histórico de um
// atendimento e curto o bastante para não virar exportador de base.
// =====================================================================

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMITE_MENSAGENS = 30;

type LinhaMensagem = {
  id: string;
  direcao: string;
  remetente: string;
  tipo: string;
  conteudo: string | null;
  media_url: string | null;
  media_nome: string | null;
  media_mime: string | null;
  status: string;
  created_at: string;
  apagada_em: string | null;
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const admin = createSupabaseAdmin();

  const bot = await autenticarBot(admin, req);
  if (!bot) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  // A trava de isolamento: conversa de caixa que não é deste bot devolve
  // 404, igual a um id inexistente. Um bot não enxerga a operação inteira.
  const conversa = await conversaDoBot(admin, bot.id, params.id);
  if (!conversa) {
    return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  }

  const { data } = await admin
    .from("messages")
    .select(
      "id, direcao, remetente, tipo, conteudo, media_url, media_nome, media_mime, status, created_at, apagada_em",
    )
    .eq("conversation_id", conversa.id)
    // REGRA DE OURO: nota interna nunca sai daqui.
    .eq("interna", false)
    // Ordena decrescente para pegar as ÚLTIMAS 30 e inverte depois —
    // `limit` com ordem crescente devolveria as 30 mais ANTIGAS.
    .order("created_at", { ascending: false })
    .limit(LIMITE_MENSAGENS);

  const mensagens = ((data ?? []) as LinhaMensagem[])
    .slice()
    .reverse()
    .map((m) => ({
      id: m.id,
      direcao: m.direcao,
      remetente: m.remetente,
      tipo: m.tipo,
      // Apagar é soft delete (0035): o rastro fica, o conteúdo some. O bot
      // recebe o mesmo que o inbox mostra — a mensagem existiu e sumiu.
      texto: m.apagada_em ? null : m.conteudo,
      media_url: m.apagada_em ? null : m.media_url,
      media_nome: m.apagada_em ? null : m.media_nome,
      media_mime: m.apagada_em ? null : m.media_mime,
      status: m.status,
      apagada: m.apagada_em != null,
      criada_em: m.created_at,
    }));

  // Contato: nome/telefone/e-mail e mais nada. A ficha do lead tem valor de
  // negociação e anotações internas que não são da conta do bot.
  let contato = {
    id: conversa.lead_id,
    nome: conversa.contato_nome,
    telefone: conversa.contato_telefone,
    email: null as string | null,
  };
  if (conversa.lead_id) {
    const { data: lead } = await admin
      .from("leads")
      .select("id, nome, telefone, whatsapp, email")
      .eq("id", conversa.lead_id)
      .maybeSingle();
    const l = lead as {
      id: string;
      nome: string | null;
      telefone: string | null;
      whatsapp: string | null;
      email: string | null;
    } | null;
    if (l) {
      contato = {
        id: l.id,
        nome: l.nome ?? contato.nome,
        telefone: l.whatsapp ?? l.telefone ?? contato.telefone,
        email: l.email,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    conversa: {
      id: conversa.id,
      canal: conversa.canal,
      status: conversa.status,
      prioridade: conversa.prioridade,
      etiquetas: conversa.tags ?? [],
      inbox_id: conversa.inbox_id,
      bot_status: conversa.bot_status,
      criada_em: conversa.created_at,
      atributos: conversa.custom_attributes ?? {},
    },
    contato,
    mensagens,
  });
}
