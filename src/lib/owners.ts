import type { SupabaseClient } from "@supabase/supabase-js";

/** Dados mínimos de um proprietário (owners) para virar/achar um cliente. */
export interface OwnerLite {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
}

// Escapa curingas do LIKE/ILIKE (% e _) para casar o nome literalmente.
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Garante que exista um registro em `clients` correspondente a um proprietário
 * (tabela `owners`), para que ele possa ser vinculado a imóveis via
 * `property_clients`. Reaproveita um cliente já existente (mesmo CPF/CNPJ ou,
 * na falta dele, mesmo nome) em vez de duplicar o cadastro.
 *
 * Resolve a dor relatada pelo cliente: o proprietário cadastrado em
 * "Proprietários" passa a ficar selecionável na vinculação do imóvel sem
 * precisar ser recadastrado manualmente em "Clientes".
 *
 * @returns o id do cliente (existente ou recém-criado).
 */
export async function ensureClientForOwner(
  supabase: SupabaseClient,
  owner: OwnerLite,
  userId?: string | null,
): Promise<string> {
  const doc = owner.cpf_cnpj?.trim();
  const nome = owner.nome.trim();

  // 1) Reaproveita por CPF/CNPJ (identificador forte).
  if (doc) {
    const { data } = await supabase.from("clients").select("id").eq("cpf_cnpj", doc).limit(1);
    if (data && data.length) return data[0].id as string;
  }

  // 2) Reaproveita por nome (case-insensitive), quando não há documento.
  if (nome) {
    const { data } = await supabase.from("clients").select("id").ilike("nome", escapeLike(nome)).limit(1);
    if (data && data.length) return data[0].id as string;
  }

  // 3) Cria o cliente a partir do proprietário (tipo = proprietário).
  const { data: novo, error } = await supabase
    .from("clients")
    .insert({
      nome,
      tipo: "proprietario",
      cpf_cnpj: doc || null,
      telefone: owner.telefone || null,
      email: owner.email || null,
      created_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error || !novo) {
    throw error ?? new Error("Falha ao criar cliente a partir do proprietário.");
  }
  return novo.id as string;
}
