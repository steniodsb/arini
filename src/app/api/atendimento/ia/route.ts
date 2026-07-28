import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import {
  iaConfigurada,
  sugerirResposta,
  resumirConversa,
  classificarIntencao,
  type IaResultado,
} from "@/lib/atendimento/ia";

export const dynamic = "force-dynamic";

type Acao = "sugerir" | "resumir" | "classificar";
const ACOES: Acao[] = ["sugerir", "resumir", "classificar"];

/**
 * Copiloto de IA do atendimento.
 *
 * POST { conversationId, acao: "sugerir" | "resumir" | "classificar", forcar? }
 *
 * Por que dois clientes Supabase: a leitura de checagem usa o cliente de
 * SESSÃO (RLS decide se este usuário enxerga a conversa); só depois de
 * passar nessa porta é que usamos a service role para ler mensagens,
 * artigos e gravar a sugestão.
 */
export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }
  const perfil = sessao.profile;
  const temAcesso = Boolean(perfil?.ativo && (perfil.atendimento_access || perfil.is_admin_central));
  if (!temAcesso) {
    return NextResponse.json({ ok: false, erro: "sem acesso ao atendimento" }, { status: 403 });
  }

  let body: { conversationId?: string; acao?: string; forcar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "payload inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  const acao = body.acao as Acao | undefined;
  if (!conversationId || !acao || !ACOES.includes(acao)) {
    return NextResponse.json(
      { ok: false, erro: "informe conversationId e acao ('sugerir' | 'resumir' | 'classificar')" },
      { status: 400 },
    );
  }

  // Porta de entrada: se a RLS não devolve a conversa, o usuário não pode
  // pedir IA sobre ela — nem sabemos dizer que ela existe.
  const supabase = createSupabaseServer();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversa) {
    return NextResponse.json({ ok: false, erro: "conversa não encontrada" }, { status: 404 });
  }

  // Honestidade: sem chave, não existe IA. Nada de resposta falsa de sucesso.
  if (!iaConfigurada()) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Falta a variável de ambiente ANTHROPIC_API_KEY no servidor. " +
          "Adicione a chave da API da Anthropic (sem o prefixo NEXT_PUBLIC_) e reinicie a aplicação.",
        faltaChave: true,
      },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdmin();
  const forcar = body.forcar === true;

  let resultado: IaResultado;
  if (acao === "sugerir") resultado = await sugerirResposta(admin, conversationId, { forcar });
  else if (acao === "resumir") resultado = await resumirConversa(admin, conversationId, { forcar });
  else resultado = await classificarIntencao(admin, conversationId, { forcar });

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    conteudo: resultado.conteudo,
    cacheada: resultado.cacheada,
    modelo: resultado.modelo,
  });
}
