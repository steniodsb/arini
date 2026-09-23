import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { markMessagesAsRead, type ChaveMensagem, type EvolutionConfig } from "@/lib/evolution";

// =====================================================================
// POST /api/atendimento/conversas/<id>/lida
//
// "Abri a conversa, li." Marca as mensagens recebidas como lidas NO
// WHATSAPP — o visto azul para o cliente e o "não lida" saindo do
// celular da imobiliária.
//
// POR QUE EXISTE: a opção `readMessages` da instância só marca como lida
// quando alguém RESPONDE pela plataforma. Quem lia no CRM e ainda ia
// responder deixava o cliente com dois tiques cinza — e o aparelho da
// Arini acumulando dezenas de "não lidas" já lidas. Foi relatado em
// 23/09 como "a leitura das mensagens não está funcionando".
//
// A chave de cada mensagem sai do `raw_payload` (remoteJid + id): é
// exatamente o que o WhatsApp precisa para saber QUAL mensagem foi lida.
// Só WhatsApp via Evolution — os outros provedores não têm o gesto.
//
// A sessão do usuário lê a conversa (a RLS decide se ele pode); a
// service role só entra para ler o `raw_payload` e a credencial do canal,
// que a RLS esconde do navegador de propósito.
// =====================================================================

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  const supabase = createSupabaseServer();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, canal, channel_id, contato_telefone, external_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });
  if (conv.canal !== "whatsapp") return NextResponse.json({ ok: true, marcadas: 0, motivo: "canal sem recibo de leitura" });

  const admin = createSupabaseAdmin();

  // As recebidas que ainda não estão lidas. Teto de 50: uma conversa que
  // acumulou meses sem ninguém abrir não precisa de 500 recibos — o
  // WhatsApp marca o chat inteiro a partir da mais recente.
  const { data: pendentes } = await admin
    .from("messages")
    .select("id, external_id, raw_payload")
    .eq("conversation_id", conv.id)
    .eq("direcao", "in")
    .neq("status", "lida")
    .not("external_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!pendentes?.length) return NextResponse.json({ ok: true, marcadas: 0 });

  const jidPadrao = `${(conv.contato_telefone ?? conv.external_id ?? "").replace(/\D/g, "")}@s.whatsapp.net`;
  const chaves: ChaveMensagem[] = [];
  for (const m of pendentes) {
    const raw = m.raw_payload as { data?: { key?: { remoteJid?: string } } } | null;
    const remoteJid = raw?.data?.key?.remoteJid || jidPadrao;
    if (!remoteJid || !m.external_id) continue;
    chaves.push({ remoteJid, fromMe: false, id: m.external_id as string });
  }
  if (chaves.length === 0) return NextResponse.json({ ok: true, marcadas: 0 });

  type CanalRow = { provedor: string; status: string; config: Record<string, string | undefined> };
  let canalRow: CanalRow | null = null;
  if (conv.channel_id) {
    const { data } = await admin
      .from("atendimento_channels")
      .select("provedor, status, config")
      .eq("id", conv.channel_id)
      .maybeSingle();
    canalRow = (data as CanalRow | null) ?? null;
  }
  if (!canalRow || canalRow.provedor !== "evolution") {
    return NextResponse.json({ ok: true, marcadas: 0, motivo: "sem canal Evolution" });
  }
  const { base_url, api_key, instance_name } = canalRow.config;
  if (!base_url || !api_key || !instance_name) {
    return NextResponse.json({ ok: true, marcadas: 0, motivo: "canal sem credencial" });
  }
  const cfg: EvolutionConfig = { base_url, api_key, instance_name };

  const entregue = await markMessagesAsRead(cfg, chaves);
  if (!entregue) {
    // Não é erro para a tela: o atendente continua lendo. Só não houve
    // visto azul desta vez — a próxima abertura tenta de novo.
    return NextResponse.json({ ok: false, marcadas: 0, motivo: "a Evolution não aceitou o recibo" });
  }

  // Reflete no nosso status: "lida" aqui passa a significar "alguém da
  // equipe leu", que é o que a tela quer mostrar.
  await admin
    .from("messages")
    .update({ status: "lida" })
    .in("id", pendentes.map((m) => m.id as string));

  return NextResponse.json({ ok: true, marcadas: chaves.length });
}
