import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AuditEntry } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { AuditLog, PAGINA } from "./AuditLog";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Primeira página já vem renderizada no servidor; o "carregar mais" e os
  // filtros seguem pelo cliente.
  const { data } = await supabase
    .from("atendimento_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGINA);

  // Opções dos selects de filtro. Varremos uma janela recente em vez de
  // fazer DISTINCT no banco (não dá para pedir distinct pelo PostgREST) —
  // 1000 linhas é barato e cobre bem os atores/entidades em uso.
  const { data: amostra } = await supabase
    .from("atendimento_audit_log")
    .select("ator_id, ator_nome, entidade")
    .order("created_at", { ascending: false })
    .limit(1000);

  const mapaAtores = new Map<string, string>();
  const entidades = new Set<string>();
  for (const linha of (amostra ?? []) as Pick<AuditEntry, "ator_id" | "ator_nome" | "entidade">[]) {
    if (linha.ator_id) mapaAtores.set(linha.ator_id, linha.ator_nome ?? "(sem nome)");
    if (linha.entidade) entidades.add(linha.entidade);
  }

  return (
    <PageShell>
      <AuditLog
        initial={(data ?? []) as AuditEntry[]}
        // Array.from em vez de spread: o target do projeto é ES5 e o
        // downlevelIteration está desligado.
        atores={Array.from(mapaAtores, ([id, nome]) => ({ id, nome })).sort((a, b) =>
          a.nome.localeCompare(b.nome),
        )}
        entidades={Array.from(entidades).sort()}
      />
    </PageShell>
  );
}
