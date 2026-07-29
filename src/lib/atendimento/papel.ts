import type { AtendimentoPapel, Profile } from "@/lib/types";

// =====================================================================
// Papel do usuário no ATENDIMENTO (migration 0040).
//
// POR QUE ESTA FUNÇÃO EXISTE
// --------------------------
// No banco a regra é `fn_atendimento_papel`: quem é `is_admin_central`
// conta como administrador do atendimento, MESMO que a coluna
// `atendimento_papel` diga outra coisa. Se a UI lesse a coluna crua, a
// diretoria veria uma tela de atendente enquanto a RLS a trataria como
// administradora — botão escondido para quem podia clicar. Esta função é
// a cópia fiel daquela regra do lado do servidor/cliente.
//
// NÃO use isto como controle de acesso: a autoridade é a RLS. Serve para
// a tela REFLETIR o modelo (esconder o que o papel não pode fazer e
// explicar listas vazias).
// =====================================================================

export function papelDoPerfil(
  perfil: Pick<Profile, "atendimento_papel" | "is_admin_central"> | null | undefined,
): AtendimentoPapel {
  if (!perfil) return "atendente";
  if (perfil.is_admin_central) return "administrador";
  return perfil.atendimento_papel ?? "atendente";
}

/** Atalhos legíveis — evitam `papel === "..."` espalhado pelas telas. */
export function ehAdministrador(papel: AtendimentoPapel): boolean {
  return papel === "administrador";
}

/** Quem faz triagem: a recepção e o administrador (que cobre a recepção). */
export function podeTriar(papel: AtendimentoPapel): boolean {
  return papel === "recepcao" || papel === "administrador";
}
