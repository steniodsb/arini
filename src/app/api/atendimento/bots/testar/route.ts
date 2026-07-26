import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { entregarTeste, type BotAlvo } from "@/lib/atendimento/bots";
import { registrarAuditoria, ipDaRequisicao } from "@/lib/atendimento/audit";

// =====================================================================
// POST /api/atendimento/bots/testar   { id }
//
// Manda um payload de EXEMPLO — com a mesma forma do payload real — para
// a `outgoing_url` do bot, e devolve status HTTP e tempo de resposta.
//
// Roda no servidor porque:
//   1. o `secret` que assina o corpo nunca pode passar pelo navegador;
//   2. chamar a URL do integrador pelo browser bateria em CORS.
//
// Nunca devolve 500 por causa do endpoint do outro lado: se o fetch
// falhar, isso é o RESULTADO do teste (200 com ok:false), não um erro
// nosso. Só devolve erro HTTP quando o problema é nosso (não autenticado,
// sem permissão, id inexistente).
//
// E não desativa o bot por falha aqui: quem está testando está
// justamente consertando a integração — seria hostil desligar o bot por
// causa das tentativas que ele mesmo disparou para depurar.
// =====================================================================

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const result = await getAtendimentoUser();
  if (!result?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!result.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode testar bots" }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("atendimento_agent_bots")
    .select("id, nome, outgoing_url, secret, falhas_seguidas")
    .eq("id", body.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "bot não encontrado" }, { status: 404 });

  const alvo = data as BotAlvo & { nome: string };

  // Payload com a cara de um evento real, para o dev do outro lado já
  // conseguir escrever o parser em cima dele. Os ids são zerados de
  // propósito: se o bot responder na /api/bot/v1 com este conversationId,
  // ele leva 404 em vez de escrever numa conversa de verdade.
  const entrega = await entregarTeste(admin, alvo, {
    evento: "teste",
    enviado_em: new Date().toISOString(),
    conversa: {
      id: "00000000-0000-0000-0000-000000000000",
      canal: "whatsapp",
      status: "aberta",
      prioridade: null,
      etiquetas: [],
      inbox_id: null,
      bot_status: "ativo",
      criada_em: new Date().toISOString(),
      atributos: {},
    },
    contato: {
      id: null,
      nome: "Contato de exemplo",
      telefone: "+5511999999999",
      email: "contato@exemplo.com.br",
    },
    mensagem: {
      id: "00000000-0000-0000-0000-000000000000",
      direcao: "in",
      remetente: "cliente",
      tipo: "texto",
      texto: "Disparo de teste do Atendimento Arini.",
      media_url: null,
      media_nome: null,
      media_mime: null,
      criada_em: new Date().toISOString(),
    },
    disparado_por: result.profile?.nome ?? result.user.email ?? null,
  });

  await registrarAuditoria(admin, {
    atorId: result.user.id,
    atorNome: result.profile?.nome ?? result.user.email ?? null,
    acao: "testou",
    entidade: "bot",
    entidadeId: alvo.id,
    detalhes: {
      nome: alvo.nome,
      outgoing_url: alvo.outgoing_url,
      status: entrega.status,
      ok: entrega.ok,
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json(entrega);
}
