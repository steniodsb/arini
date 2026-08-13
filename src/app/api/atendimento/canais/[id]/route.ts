import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { deleteInstance, type EvolutionConfig } from "@/lib/evolution";
import { deleteWebhook } from "@/lib/telegram";

// =====================================================================
// Remover um canal.
//
// Faltava — e a falta aparece quando existe mais de um número: dava para
// conectar cinco e não dava para tirar nenhum, então o único jeito de
// corrigir um cadastro errado era mexer no banco.
//
// O que acontece com o histórico: `conversations.channel_id` tem FK com
// ON DELETE SET NULL, então nenhuma conversa é apagada — elas perdem o
// vínculo com o número. A resposta passa a sair por outro canal conectado
// do mesmo tipo (ver resolverCanal em lib/atendimento/outbound.ts), que é
// o comportamento antigo, de antes de existir cadastro de canal.
//
// `?apagarInstancia=1` (só Evolution) apaga também a instância no servidor
// da Evolution. Sem isso ela fica lá ocupando memória e sessão — mas é
// IRREVERSÍVEL, então nunca é o padrão: quem decide é a tela.
// =====================================================================

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, is_admin_central, sector, ativo")
    .eq("id", user.id)
    .maybeSingle();
  const isDiretoria =
    !!profile?.ativo && (profile.is_admin_central || profile.sector === "admin_central");
  if (!isDiretoria) {
    return NextResponse.json({ error: "somente a diretoria remove canais" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const { data: canal } = await admin
    .from("atendimento_channels")
    .select("id, nome, canal, provedor, config")
    .eq("id", params.id)
    .maybeSingle();
  if (!canal) return NextResponse.json({ error: "canal não encontrado" }, { status: 404 });

  const config = (canal.config ?? {}) as Record<string, string>;
  const url = new URL(req.url);
  const apagarInstancia = url.searchParams.get("apagarInstancia") === "1";

  // Quantas conversas perdem o vínculo — vai na resposta para a tela
  // conseguir dizer o que aconteceu depois, não só antes.
  const { count: conversasLigadas } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", params.id);

  // Limpeza no provedor ANTES de apagar a linha: sem a config guardada
  // aqui não há como alcançar a instância depois.
  const avisos: string[] = [];

  if (canal.provedor === "evolution" && apagarInstancia) {
    const cfg: EvolutionConfig = {
      base_url: config.base_url,
      api_key: config.api_key,
      instance_name: config.instance_name,
    };
    if (cfg.base_url && cfg.api_key && cfg.instance_name) {
      try {
        await deleteInstance(cfg);
      } catch (e) {
        // Não aborta: o cadastro daqui é o que o usuário pediu para tirar.
        avisos.push(
          `o canal foi removido, mas a instância "${cfg.instance_name}" continua no servidor da Evolution (${e instanceof Error ? e.message : "falha"})`,
        );
      }
    }
  }

  if (canal.provedor === "telegram_bot" && config.bot_token) {
    // Sem tirar o webhook, o Telegram segue entregando updates para uma
    // URL que não conhece mais este canal — barulho eterno no log.
    try {
      await deleteWebhook(config.bot_token);
    } catch {
      avisos.push("não foi possível remover o webhook no Telegram; refaça pelo BotFather se necessário");
    }
  }

  const { error } = await admin.from("atendimento_channels").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarAuditoria(admin, {
    atorId: user.id,
    atorNome: (profile?.nome as string | null) ?? user.email ?? null,
    acao: "excluiu",
    entidade: "atendimento_channels",
    entidadeId: params.id,
    detalhes: {
      nome: canal.nome,
      provedor: canal.provedor,
      conversas_desvinculadas: conversasLigadas ?? 0,
      instancia_apagada: canal.provedor === "evolution" ? apagarInstancia : null,
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({
    ok: true,
    conversas_desvinculadas: conversasLigadas ?? 0,
    avisos,
  });
}
