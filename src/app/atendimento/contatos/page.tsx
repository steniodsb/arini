import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { CustomAttributeDef } from "@/lib/types";
import { ContatosList } from "./ContatosList";
import type { AgenteOpcao, ContatoRow, EmpresaOpcao } from "./tipos";

export const dynamic = "force-dynamic";

// Contatos = tabela `leads` (no Chatwoot, "contato" é a pessoa). Carregamos
// um lote grande de uma vez e filtramos/paginamos no cliente: é uma base de
// imobiliária, não milhões de linhas, e assim a busca fica instantânea.
export default async function ContatosPage() {
  const { user } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // `profiles` está atrás de RLS mais restrita; o admin garante os nomes dos
  // autores das notas (mesmo padrão da tela de Caixas).
  const admin = createSupabaseAdmin();

  const [contatosRes, empresasRes, atributosRes, agentesRes] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, nome, telefone, whatsapp, email, origem, stage, observacoes, company_id, custom_attributes, bloqueado, avatar_url, created_at, ultima_interacao_em",
      )
      .order("ultima_interacao_em", { ascending: false })
      .limit(500),
    supabase.from("atendimento_companies").select("id, nome").order("nome"),
    supabase
      .from("atendimento_custom_attributes")
      .select("*")
      .eq("aplica_a", "contato")
      .order("nome"),
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .order("nome"),
  ]);

  const erro =
    contatosRes.error?.message ??
    empresasRes.error?.message ??
    atributosRes.error?.message ??
    null;

  return (
    <ContatosList
      initial={(contatosRes.data ?? []) as ContatoRow[]}
      empresas={(empresasRes.data ?? []) as EmpresaOpcao[]}
      atributos={(atributosRes.data ?? []) as CustomAttributeDef[]}
      agentes={(agentesRes.data ?? []) as AgenteOpcao[]}
      usuarioId={user.id}
      erroInicial={erro}
    />
  );
}
