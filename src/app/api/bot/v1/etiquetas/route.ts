import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { autenticarBot, conversaDoBot } from "@/lib/atendimento/bots";

// =====================================================================
// POST /api/bot/v1/etiquetas
//   Authorization: Bearer <token do bot>
//   { conversationId, adicionar?: string[], remover?: string[] }
//
// O bot classifica a conversa. É o que transforma um bot de triagem em
// algo útil para o time: "financeiro", "segunda_via", "urgente" chegam
// junto com a conversa em vez de o atendente ter que ler tudo para
// descobrir do que se trata.
//
// `conversations.tags` é um text[] simples; o catálogo
// (`atendimento_labels`) é o que dá cor e faz a etiqueta aparecer nos
// filtros. Criamos a entrada no catálogo quando ela não existe — senão o
// bot conseguiria marcar conversas com uma etiqueta que ninguém vê na
// lista de filtros, e o dado ficaria invisível na prática.
//
// Remover vem DEPOIS de adicionar: mandar a mesma etiqueta nos dois
// campos é erro do integrador, e a leitura menos surpreendente é "o
// remover ganha".
// =====================================================================

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Teto por chamada — evita um bot em laço encher a conversa de lixo. */
const MAX_ETIQUETAS = 20;

/** Cor neutra: quem manda em cor é a tela de Etiquetas, não o bot. */
const COR_PADRAO = "#94a3b8";

function normalizar(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const limpas = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0 && x.length <= 40);
  // Set: etiqueta repetida no mesmo array é ruído, não intenção.
  return Array.from(new Set(limpas)).slice(0, MAX_ETIQUETAS);
}

export async function POST(req: Request) {
  const admin = createSupabaseAdmin();

  const bot = await autenticarBot(admin, req);
  if (!bot) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  let body: { conversationId?: string; adicionar?: unknown; remover?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim() ?? "";
  if (!conversationId) {
    return NextResponse.json({ erro: "conversationId é obrigatório" }, { status: 400 });
  }

  const adicionar = normalizar(body.adicionar);
  const remover = normalizar(body.remover);
  if (adicionar.length === 0 && remover.length === 0) {
    return NextResponse.json({ erro: "informe adicionar e/ou remover" }, { status: 400 });
  }

  const conversa = await conversaDoBot(admin, bot.id, conversationId);
  if (!conversa) {
    return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  }

  const atuais = (conversa.tags ?? []).map((t) => t.trim().toLowerCase());
  const finais = Array.from(new Set([...atuais, ...adicionar])).filter(
    (t) => !remover.includes(t),
  );

  // Catálogo: `nome` é UNIQUE (0030), então uma corrida entre duas chamadas
  // resolve sozinha — o segundo insert falha e engolimos.
  for (const nome of adicionar) {
    const { data } = await admin
      .from("atendimento_labels")
      .select("id")
      .eq("nome", nome)
      .maybeSingle();
    if (!data) {
      await admin
        .from("atendimento_labels")
        .insert({ nome, cor: COR_PADRAO })
        .then(undefined, () => undefined);
    }
  }

  const { error } = await admin
    .from("conversations")
    .update({ tags: finais })
    .eq("id", conversationId);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, etiquetas: finais });
}
