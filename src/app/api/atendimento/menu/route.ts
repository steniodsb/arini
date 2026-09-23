import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import { registrarAuditoria, ipDaRequisicao } from "@/lib/atendimento/audit";
import { variaveisDesconhecidas } from "@/lib/atendimento/variaveis";

// =====================================================================
// PUT /api/atendimento/menu — salva o menu de ramais e suas opções.
//
// Passa pelo servidor (e não por escrita direta do cliente) por dois
// motivos concretos:
//
//  1. PAPEL. A RLS das tabelas do menu libera escrita a qualquer perfil
//     com acesso ao atendimento — é o padrão herdado da 0031. Quem impede
//     um atendente de reescrever a saudação da empresa é esta checagem.
//     (A lacuna no banco está registrada na migration 0052 e nas
//     pendências; fechá-la é mudança de política para todas as tabelas.)
//
//  2. ATIVAR O MENU É UM ATO DE OPERAÇÃO, não de configuração: a partir
//     do clique, todo cliente que escrever no WhatsApp recebe o menu.
//     Isso precisa ficar na auditoria com nome e hora.
// =====================================================================

type OpcaoPayload = {
  id?: string | null;
  chave?: string;
  rotulo?: string;
  team_id?: string | null;
  responsavel_id?: string | null;
  etiqueta?: string | null;
  confirmacao?: string | null;
  ativo?: boolean;
};

type Body = {
  id?: string;
  nome?: string;
  ativo?: boolean;
  saudacao?: string;
  cabecalho?: string;
  confirmacao?: string;
  nao_entendi?: string;
  max_tentativas?: number;
  fila_escape?: string | null;
  expira_minutos?: number;
  reenviar_apos_resolver?: boolean;
  opcoes?: OpcaoPayload[];
};

export async function PUT(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }
  if (papelDoPerfil(sessao.profile) !== "administrador") {
    return NextResponse.json(
      { error: "só a administração edita o menu de ramais" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const menuId = body.id?.trim();
  if (!menuId) return NextResponse.json({ error: "id do menu é obrigatório" }, { status: 400 });

  const opcoes = (body.opcoes ?? []).filter((o) => (o.chave ?? "").trim() && (o.rotulo ?? "").trim());
  if (body.ativo && opcoes.length === 0) {
    return NextResponse.json(
      { error: "um menu sem nenhuma opção não pode ser ativado — o cliente receberia um texto sem saída" },
      { status: 400 },
    );
  }

  // Chave repetida é ambiguidade: duas opções com "1" fariam a escolha do
  // cliente depender da ordem de leitura. O banco também recusa (unique),
  // mas aqui a mensagem é compreensível.
  const chaves = opcoes.map((o) => (o.chave ?? "").trim());
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) {
    return NextResponse.json({ error: `a opção "${repetida}" aparece duas vezes` }, { status: 400 });
  }

  // Variável escrita errada vira texto literal na cara do cliente
  // ("Olá {{nomee}}"). O envio deixa passar de propósito — para o erro
  // ficar visível — e é aqui que ele deve morrer.
  const textos = [body.saudacao, body.cabecalho, body.confirmacao, body.nao_entendi]
    .concat(opcoes.map((o) => o.confirmacao ?? ""))
    .filter(Boolean) as string[];
  const desconhecidas = [...new Set(textos.flatMap((t) => variaveisDesconhecidas(t)))];
  if (desconhecidas.length) {
    return NextResponse.json(
      { error: `variável que não existe: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();

  const { data: antes } = await admin
    .from("atendimento_menus")
    .select("ativo")
    .eq("id", menuId)
    .maybeSingle();
  if (!antes) return NextResponse.json({ error: "menu não encontrado" }, { status: 404 });

  const { error: erroMenu } = await admin
    .from("atendimento_menus")
    .update({
      nome: body.nome?.trim() || "Menu de ramais",
      ativo: Boolean(body.ativo),
      saudacao: body.saudacao ?? "",
      cabecalho: body.cabecalho ?? "",
      confirmacao: body.confirmacao ?? "",
      nao_entendi: body.nao_entendi ?? "",
      max_tentativas: Math.min(5, Math.max(1, Number(body.max_tentativas) || 3)),
      fila_escape: body.fila_escape || null,
      expira_minutos: Math.max(1, Number(body.expira_minutos) || 1440),
      // Só contato novo (false) ou também cliente que volta depois de
      // resolvido (true). Ver migration 0055.
      reenviar_apos_resolver: body.reenviar_apos_resolver === true,
    })
    .eq("id", menuId);
  if (erroMenu) return NextResponse.json({ error: erroMenu.message }, { status: 400 });

  // As opções vão por substituição: apaga as que sumiram, grava o resto.
  // `atendimento_menu_estado.opcao_id` é `on delete set null`, então uma
  // conversa antiga não é perdida junto com a opção removida.
  const mantidos = opcoes.map((o) => o.id).filter(Boolean) as string[];
  let del = admin.from("atendimento_menu_opcoes").delete().eq("menu_id", menuId);
  if (mantidos.length) del = del.not("id", "in", `(${mantidos.join(",")})`);
  await del;

  for (let i = 0; i < opcoes.length; i++) {
    const o = opcoes[i];
    const linha = {
      menu_id: menuId,
      ordem: i,
      chave: (o.chave ?? "").trim(),
      rotulo: (o.rotulo ?? "").trim(),
      team_id: o.team_id || null,
      responsavel_id: o.responsavel_id || null,
      etiqueta: o.etiqueta?.trim() || null,
      confirmacao: o.confirmacao?.trim() || null,
      ativo: o.ativo !== false,
    };
    const { error } = o.id
      ? await admin.from("atendimento_menu_opcoes").update(linha).eq("id", o.id)
      : await admin.from("atendimento_menu_opcoes").insert(linha);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "atualizou",
    entidade: "atendimento_menus",
    entidadeId: menuId,
    detalhes: {
      campo: "menu_ramais",
      // Ligar/desligar é o que muda o comportamento visto pelo cliente.
      ativo_de: Boolean(antes.ativo),
      ativo_para: Boolean(body.ativo),
      opcoes: opcoes.length,
    },
    ip: ipDaRequisicao(req),
  });

  const { data: salvas } = await admin
    .from("atendimento_menu_opcoes")
    .select("*")
    .eq("menu_id", menuId)
    .order("ordem");

  return NextResponse.json({ ok: true, opcoes: salvas ?? [] });
}
