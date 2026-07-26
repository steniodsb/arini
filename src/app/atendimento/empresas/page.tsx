import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoCompany } from "@/lib/types";
import { EmpresasList, type ContatoVinculado } from "./EmpresasList";

export const dynamic = "force-dynamic";

// Empresas agrupam contatos (leads.company_id). Trazemos os contatos já
// vinculados junto: serve tanto para contar por empresa na tabela quanto para
// listar no drawer, sem uma segunda ida ao banco por empresa aberta.
export default async function EmpresasPage() {
  const { user } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const [empresasRes, contatosRes] = await Promise.all([
    supabase.from("atendimento_companies").select("*").order("nome"),
    supabase
      .from("leads")
      .select("id, nome, telefone, email, company_id")
      .not("company_id", "is", null)
      .order("nome")
      .limit(2000),
  ]);

  const erro = empresasRes.error?.message ?? contatosRes.error?.message ?? null;

  return (
    <EmpresasList
      initial={(empresasRes.data ?? []) as AtendimentoCompany[]}
      contatos={(contatosRes.data ?? []) as ContatoVinculado[]}
      usuarioId={user.id}
      erroInicial={erro}
    />
  );
}
