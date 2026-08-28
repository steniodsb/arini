import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import type { ColaboradorTerminal, TimeEntry, TimeEntryType } from "@/lib/types";
import { Terminal } from "./Terminal";

export const dynamic = "force-dynamic";

export default async function TerminalPontoPage() {
  // Recepção entra porque é ela quem opera o terminal na entrada; o
  // administrativo e a diretoria, porque administram o ponto.
  const { user } = await requireSector(["recepcao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  // A VIEW, não a tabela: ela não tem a coluna `cpf`, então o CPF não sai
  // do banco para uma tela que fica aberta num monitor da recepção.
  const { data: colabs } = await supabase
    .from("colaboradores_terminal")
    .select("*")
    .order("nome");

  // Último registro de cada um, para sugerir "entrada" ou "saída" em vez de
  // obrigar a pessoa a lembrar o que fez de manhã.
  const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
  const { data: recentes } = await supabase
    .from("time_entries")
    .select("colaborador_id, tipo, registrado_em")
    .not("colaborador_id", "is", null)
    .gte("registrado_em", desde)
    .order("registrado_em", { ascending: false });

  const ultimoPorColaborador: Record<string, TimeEntryType> = {};
  for (const e of (recentes ?? []) as Pick<TimeEntry, "colaborador_id" | "tipo">[]) {
    // A lista vem em ordem decrescente: o primeiro de cada pessoa é o último
    // que ela bateu.
    if (e.colaborador_id && !ultimoPorColaborador[e.colaborador_id]) {
      ultimoPorColaborador[e.colaborador_id] = e.tipo;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-arini">Terminal de ponto</h1>
          <p className="text-muted-foreground mt-1 max-w-xl">
            Máquina compartilhada do setor central. Cada pessoa se identifica e bate o
            próprio ponto — o registro é dela, não da conta aberta aqui.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto/colaboradores"><Users size={14} /> Colaboradores</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto"><ArrowLeft size={14} /> Voltar</Link>
          </Button>
        </div>
      </div>

      <Terminal
        colaboradores={(colabs ?? []) as ColaboradorTerminal[]}
        operadorId={user.id}
        ultimoPorColaborador={ultimoPorColaborador}
      />
    </div>
  );
}
