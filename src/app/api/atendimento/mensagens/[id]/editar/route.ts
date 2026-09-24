import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import { editarTexto, type EvolutionConfig } from "@/lib/evolution";
import { podeEditar, textoComMarca, textoSemMarca } from "@/lib/atendimento/editar-mensagem";

// =====================================================================
// POST /api/atendimento/mensagens/<id>/editar   { texto }
//
// Edita uma mensagem já enviada — no WhatsApp do cliente E no histórico.
// Pedido do Carlos em 24/09/2026.
//
// A ORDEM IMPORTA: primeiro o WhatsApp, depois o banco. Se o WhatsApp
// recusar (passou dos 15 minutos, número caiu), o histórico não pode
// mostrar um texto que o cliente nunca leu — seria a tela mentindo sobre
// o que foi dito, que é pior do que não editar.
//
// A leitura passa pela sessão (a RLS decide se a pessoa enxerga a
// conversa); a escrita, pela service role, depois das regras de
// `podeEditar` — as mesmas que a tela usa para mostrar o lápis.
// =====================================================================

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  let body: { texto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const textoNovo = body.texto?.trim();
  if (!textoNovo) return NextResponse.json({ error: "a mensagem não pode ficar vazia" }, { status: 400 });
  if (textoNovo.length > 4096) {
    return NextResponse.json({ error: "texto longo demais para o WhatsApp (máx. 4.096)" }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  const { data: m } = await supabase
    .from("messages")
    .select("id, conversation_id, direcao, remetente, autor_id, tipo, interna, created_at, apagada_em, external_id, conteudo, conteudo_original")
    .eq("id", params.id)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "mensagem não encontrada" }, { status: 404 });

  const ehAdmin = papelDoPerfil(sessao.profile) === "administrador";
  const permissao = podeEditar(
    {
      direcao: m.direcao as "in" | "out",
      remetente: m.remetente as string,
      autor_id: (m.autor_id as string | null) ?? null,
      tipo: m.tipo as string,
      interna: Boolean(m.interna),
      created_at: m.created_at as string,
      apagada_em: (m.apagada_em as string | null) ?? null,
      external_id: (m.external_id as string | null) ?? null,
      conteudo: (m.conteudo as string | null) ?? null,
    },
    sessao.user.id,
    ehAdmin,
  );
  if (!permissao.ok) return NextResponse.json({ error: permissao.motivo }, { status: 400 });

  const admin = createSupabaseAdmin();

  // A marca "*Allan:*" é do AUTOR da mensagem, não de quem edita: o
  // administrador corrigindo o texto do Allan não pode trocar a
  // assinatura dele.
  let nomeAutor: string | null = null;
  if (m.autor_id) {
    const { data: autor } = await admin.from("profiles").select("nome").eq("id", m.autor_id).maybeSingle();
    nomeAutor = (autor?.nome as string | null) ?? null;
  }
  const { tinhaMarca } = textoSemMarca((m.conteudo as string) ?? "", nomeAutor);
  const conteudoFinal = textoComMarca(textoNovo, nomeAutor, tinhaMarca);
  if (conteudoFinal === m.conteudo) {
    return NextResponse.json({ ok: true, message: m, semMudanca: true });
  }

  // ---- WhatsApp primeiro (nota interna não sai do sistema) -------------
  if (!m.interna) {
    const { data: conv } = await admin
      .from("conversations")
      .select("canal, channel_id, contato_telefone, external_id")
      .eq("id", m.conversation_id)
      .maybeSingle();
    if (!conv || conv.canal !== "whatsapp" || !conv.channel_id) {
      return NextResponse.json({ error: "só dá para editar mensagens de WhatsApp" }, { status: 400 });
    }
    const { data: canal } = await admin
      .from("atendimento_channels")
      .select("provedor, config")
      .eq("id", conv.channel_id)
      .maybeSingle();
    const cfgBruta = (canal?.config ?? {}) as Record<string, string | undefined>;
    if (canal?.provedor !== "evolution" || !cfgBruta.base_url || !cfgBruta.api_key || !cfgBruta.instance_name) {
      return NextResponse.json(
        { error: "este número não permite edição (só a conexão por QR Code/Evolution)" },
        { status: 400 },
      );
    }
    const cfg: EvolutionConfig = {
      base_url: cfgBruta.base_url, api_key: cfgBruta.api_key, instance_name: cfgBruta.instance_name,
    };
    const numero = ((conv.contato_telefone as string | null) ?? (conv.external_id as string)).replace(/\D/g, "");
    const r = await editarTexto(cfg, numero, m.external_id as string, conteudoFinal);
    if (!r.ok) {
      return NextResponse.json({ error: `o WhatsApp recusou a edição: ${r.motivo}` }, { status: 502 });
    }
  }

  // ---- Depois o histórico ---------------------------------------------
  const { data: atualizada, error } = await admin
    .from("messages")
    .update({
      conteudo: conteudoFinal,
      editada_em: new Date().toISOString(),
      // O original é o da PRIMEIRA vez — editar de novo não o troca.
      conteudo_original: (m.conteudo_original as string | null) ?? m.conteudo,
    })
    .eq("id", m.id)
    .select("id, conversation_id, direcao, remetente, autor_id, tipo, conteudo, media_url, external_id, status, interna, created_at, media_nome, media_mime, media_tamanho, reply_to_id, mentions, apagada_em, apagada_por, editada_em, conteudo_original")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A prévia da lista mostra a última mensagem. Se foi ela a editada, a
  // prévia precisa mudar junto — senão a lista mostra o texto antigo.
  if (!m.interna) {
    const { data: ultima } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", m.conversation_id)
      .eq("interna", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima?.id === m.id) {
      await admin
        .from("conversations")
        .update({ last_message_preview: conteudoFinal.slice(0, 140) })
        .eq("id", m.conversation_id);
    }
  }

  return NextResponse.json({ ok: true, message: atualizada });
}
