import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  carregarCaixaPorToken,
  dentroDoHorarioDaCaixa,
  jsonCors,
  naoEncontrado,
  resolverCors,
  respostaPreflight,
  saudacaoEfetiva,
  tituloEfetivo,
  corsAberto,
} from "@/lib/atendimento/widget";
import type { PreChatField } from "@/lib/types";

// Rota PÚBLICA: o visitante do site do cliente não tem sessão do Supabase,
// então tudo passa pela service role — e só o que está aqui é devolvido.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RespostaConfig {
  titulo: string;
  saudacao: string;
  cor: string;
  posicao: "direita" | "esquerda";
  preChatAtivo: boolean;
  preChatCampos: PreChatField[];
  dentroHorario: boolean;
  mensagemAusencia: string | null;
}

/**
 * Preflight. Precisa responder ANTES de saber se o token é válido? Não:
 * consultamos a caixa para devolver o Allow-Origin certo. Token inválido
 * cai no CORS aberto — o preflight em si não revela nada.
 */
export async function OPTIONS(req: Request, { params }: { params: { token: string } }) {
  const caixa = await carregarCaixaPorToken(createSupabaseAdmin(), params.token);
  const { headers } = resolverCors(req, caixa?.widget_dominios);
  return respostaPreflight(caixa ? headers : corsAberto());
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdmin();
  const caixa = await carregarCaixaPorToken(admin, params.token);
  if (!caixa) return naoEncontrado();

  const { headers, permitido } = resolverCors(req, caixa.widget_dominios);
  if (!permitido) {
    return jsonCors({ erro: "origem não autorizada" }, 403, headers);
  }

  const corpo: RespostaConfig = {
    titulo: tituloEfetivo(caixa),
    saudacao: saudacaoEfetiva(caixa),
    cor: caixa.widget_cor?.trim() || "#092316",
    posicao: caixa.widget_posicao === "esquerda" ? "esquerda" : "direita",
    preChatAtivo: caixa.pre_chat_ativo,
    // Blindagem: o jsonb pode ter sido salvo como objeto por engano.
    preChatCampos: Array.isArray(caixa.pre_chat_campos) ? caixa.pre_chat_campos : [],
    dentroHorario: await dentroDoHorarioDaCaixa(admin, caixa),
    mensagemAusencia: caixa.mensagem_ausencia,
  };

  return jsonCors(corpo, 200, headers);
}
