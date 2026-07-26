import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { emitirContatoCriado } from "@/lib/atendimento/webhook-eventos";
import { LEAD_ORIGINS, LEAD_STAGES } from "@/lib/types";
import type { ContatoInput } from "@/app/atendimento/contatos/tipos";

// =====================================================================
// Escrita de CONTATOS (tabela `leads`) para o sistema de Atendimento.
//
// Por que uma rota de API e não o cliente do browser: a policy
// `leads_write` (migration 0001) só libera os setores recepcao/
// administrativo/admin_central do CRM. Um agente de atendimento tem apenas
// leitura (`leads_read_atendimento`, 0026). Então validamos aqui o acesso
// ao atendimento e gravamos com a service role.
// =====================================================================

const ORIGENS = new Set<string>(LEAD_ORIGINS);
const ETAPAS = new Set<string>(LEAD_STAGES.map((s) => s.key));

type Payload =
  | { acao: "criar"; dados: ContatoInput }
  | { acao: "atualizar"; id: string; dados: ContatoInput }
  | { acao: "excluir"; ids: string[] }
  | { acao: "massa"; ids: string[]; dados: ContatoInput }
  | { acao: "importar"; linhas: ContatoInput[] }
  | { acao: "mesclar"; destinoId: string; origemId: string; dados: ContatoInput };

/** Mantém só as colunas conhecidas e normaliza enums NOT NULL do banco. */
function sanear(dados: ContatoInput, exigirNome: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const texto = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };

  if (dados.nome !== undefined) {
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
    if (!nome && exigirNome) throw new Error("O nome do contato é obrigatório.");
    if (nome) out.nome = nome;
  } else if (exigirNome) {
    throw new Error("O nome do contato é obrigatório.");
  }

  if (dados.telefone !== undefined) out.telefone = texto(dados.telefone);
  if (dados.whatsapp !== undefined) out.whatsapp = texto(dados.whatsapp);
  if (dados.email !== undefined) out.email = texto(dados.email);
  if (dados.observacoes !== undefined) out.observacoes = texto(dados.observacoes);
  if (dados.company_id !== undefined) out.company_id = texto(dados.company_id);
  // origem/stage são enums NOT NULL — nunca mandamos null, caímos no padrão.
  if (dados.origem !== undefined) out.origem = ORIGENS.has(String(dados.origem)) ? dados.origem : "outros";
  if (dados.stage !== undefined) out.stage = ETAPAS.has(String(dados.stage)) ? dados.stage : "novo";
  if (dados.bloqueado !== undefined) out.bloqueado = Boolean(dados.bloqueado);
  if (dados.custom_attributes !== undefined && dados.custom_attributes !== null) {
    out.custom_attributes = dados.custom_attributes;
  }
  return out;
}

export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "Sem acesso ao Atendimento." }, { status: 403 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  /**
   * Atalho de auditoria desta rota: o ator e o IP são sempre os mesmos,
   * e a entidade é sempre `leads`. Repetir isso em seis `case` só
   * convidaria a divergir.
   */
  const auditar = (
    acao: string,
    entidadeId: string | null,
    detalhes: Record<string, unknown>,
  ) =>
    registrarAuditoria(admin, {
      atorId: sessao.user.id,
      atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
      acao,
      entidade: "leads",
      entidadeId,
      detalhes,
      ip: ipDaRequisicao(req),
    });

  try {
    switch (body.acao) {
      case "criar": {
        const dados = sanear(body.dados, true);
        const { data, error } = await admin.from("leads").insert(dados).select("*").single();
        if (error) throw new Error(error.message);

        await auditar("criou", data.id as string, {
          nome: data.nome ?? null,
          telefone: data.telefone ?? null,
          email: data.email ?? null,
        });
        // Webhook `contato_criado`: contato cadastrado à mão pelo agente
        // conta tanto quanto o que nasce de uma mensagem recebida.
        emitirContatoCriado(admin, {
          id: data.id as string,
          nome: (data.nome as string | null) ?? null,
          telefone: (data.telefone as string | null) ?? null,
          email: (data.email as string | null) ?? null,
          origem: (data.origem as string | null) ?? null,
        });

        return NextResponse.json({ contato: data });
      }

      case "atualizar": {
        if (!body.id) return NextResponse.json({ error: "id ausente." }, { status: 400 });
        const dados = sanear(body.dados, true);
        // Toda edição conta como interação — mantém a ordenação da lista útil.
        dados.ultima_interacao_em = new Date().toISOString();
        const { data, error } = await admin
          .from("leads")
          .update(dados)
          .eq("id", body.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);

        // Só os NOMES dos campos tocados: guardar os valores duplicaria
        // dado pessoal do cliente dentro do log, sem ganho de rastro.
        await auditar("atualizou", body.id, {
          nome: data.nome ?? null,
          campos: Object.keys(dados).filter((k) => k !== "ultima_interacao_em"),
        });

        return NextResponse.json({ contato: data });
      }

      case "excluir": {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return NextResponse.json({ error: "Nenhum contato informado." }, { status: 400 });

        // Lê antes de apagar: depois não sobra de onde tirar o nome, e um
        // log só com uuid não responde "quem apagou o contato do fulano?".
        const { data: alvos } = await admin
          .from("leads").select("id, nome, telefone, email").in("id", ids);

        const { error } = await admin.from("leads").delete().in("id", ids);
        if (error) throw new Error(error.message);

        await auditar("excluiu", ids.length === 1 ? ids[0] : null, {
          quantidade: ids.length,
          contatos: (alvos ?? []).map((c) => ({
            id: c.id,
            nome: c.nome ?? c.telefone ?? c.email ?? null,
          })),
        });

        return NextResponse.json({ ok: true, excluidos: ids.length });
      }

      case "massa": {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return NextResponse.json({ error: "Nenhum contato informado." }, { status: 400 });
        const dados = sanear(body.dados, false);
        if (Object.keys(dados).length === 0) {
          return NextResponse.json({ error: "Nada a alterar." }, { status: 400 });
        }
        const { data, error } = await admin.from("leads").update(dados).in("id", ids).select("*");
        if (error) throw new Error(error.message);

        // Edição em massa é justamente onde um clique errado estraga muita
        // ficha de uma vez — merece uma linha só, com a lista dentro.
        await auditar("atualizou", null, {
          em_massa: true,
          quantidade: ids.length,
          ids,
          campos: Object.keys(dados),
        });

        return NextResponse.json({ contatos: data ?? [] });
      }

      case "importar": {
        const linhas = Array.isArray(body.linhas) ? body.linhas : [];
        if (linhas.length === 0) return NextResponse.json({ error: "Nada para importar." }, { status: 400 });

        // `linha` sempre carrega o índice ORIGINAL recebido, para o cliente
        // conseguir apontar a linha certa do arquivo ao usuário.
        const prontos: { indice: number; dados: Record<string, unknown> }[] = [];
        const falhas: { linha: number; erro: string }[] = [];
        linhas.forEach((l, i) => {
          try {
            prontos.push({ indice: i, dados: sanear(l, true) });
          } catch (e) {
            falhas.push({ linha: i, erro: e instanceof Error ? e.message : "Linha inválida." });
          }
        });

        let importados = 0;
        if (prontos.length > 0) {
          const { error } = await admin.from("leads").insert(prontos.map((p) => p.dados));
          if (!error) {
            importados = prontos.length;
          } else {
            // O insert em lote é tudo-ou-nada. Se falhou, refazemos linha a
            // linha só para apontar QUAL registro está ruim para o usuário.
            for (const p of prontos) {
              const { error: e1 } = await admin.from("leads").insert(p.dados);
              if (e1) falhas.push({ linha: p.indice, erro: e1.message });
              else importados++;
            }
          }
        }
        if (importados > 0) {
          await auditar("importou", null, {
            importados,
            recebidas: linhas.length,
            falhas: falhas.length,
          });
        }
        // Importação NÃO dispara `contato_criado`: uma planilha com 2 mil
        // linhas viraria 2 mil POSTs no endpoint do cliente e derrubaria
        // o webhook pelo limite de falhas seguidas. Quem quiser reagir a
        // importação usa o relatório, não o webhook.

        return NextResponse.json({ importados, falhas });
      }

      case "mesclar": {
        const { destinoId, origemId } = body;
        if (!destinoId || !origemId || destinoId === origemId) {
          return NextResponse.json({ error: "Escolha dois contatos diferentes." }, { status: 400 });
        }
        const dados = sanear(body.dados, true);
        dados.ultima_interacao_em = new Date().toISOString();

        const { data: destino, error: e1 } = await admin
          .from("leads")
          .update(dados)
          .eq("id", destinoId)
          .select("*")
          .single();
        if (e1) throw new Error(`Falha ao atualizar o contato mantido: ${e1.message}`);

        // Reaponta o histórico ANTES de apagar a origem — as notas têm
        // cascade e sumiriam junto com o contato.
        const { error: e2 } = await admin
          .from("conversations")
          .update({ lead_id: destinoId })
          .eq("lead_id", origemId);
        if (e2) throw new Error(`Falha ao mover as conversas: ${e2.message}`);

        const { error: e3 } = await admin
          .from("atendimento_contact_notes")
          .update({ lead_id: destinoId })
          .eq("lead_id", origemId);
        if (e3) throw new Error(`Falha ao mover as notas: ${e3.message}`);

        const { error: e4 } = await admin.from("leads").delete().eq("id", origemId);
        if (e4) throw new Error(`Falha ao excluir o contato duplicado: ${e4.message}`);

        // Mesclar apaga uma ficha de verdade e move histórico entre elas.
        // Se depois alguém disser "sumiu um contato", é este log que conta
        // para onde ele foi.
        await auditar("mesclou", destinoId, {
          destino_id: destinoId,
          origem_id: origemId,
          destino_nome: destino.nome ?? null,
        });

        return NextResponse.json({ contato: destino });
      }

      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 400 },
    );
  }
}
