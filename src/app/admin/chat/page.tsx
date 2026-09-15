import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listarPessoas, montarLista } from "@/lib/chat";
import type { SectorObservation } from "@/lib/types";
import { ChatApp } from "./ChatApp";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();

  const pessoas = await listarPessoas(supabase, user.id);
  const itens = await montarLista(supabase, user.id, pessoas);

  // As delegações de imóvel aparecem DENTRO da conversa do setor de
  // destino, em vez de numa tela separada. É o que mantém "um lugar só
  // para olhar" — a queixa que originou este chat — sem forçar a
  // delegação (que é presa a um imóvel e tem estado de resolvida) para
  // dentro do modelo de mensagem, onde ela não cabe.
  const { data: obsRaw } = await supabase
    .from("sector_observations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const observacoes = (obsRaw ?? []) as SectorObservation[];

  // Resolve o imóvel de cada delegação, para o cartão levar o código.
  const propertyIds = Array.from(
    new Set(
      observacoes
        .filter((o) => o.entity_table === "properties" || o.entity_table === "marketing_campaigns")
        .map((o) => o.entity_id),
    ),
  );
  const imoveis: Record<string, { codigo: string; titulo: string | null }> = {};
  if (propertyIds.length > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, codigo, titulo")
      .in("id", propertyIds);
    for (const p of (props ?? []) as { id: string; codigo: string; titulo: string | null }[]) {
      imoveis[p.id] = { codigo: p.codigo, titulo: p.titulo };
    }
  }

  return (
    <ChatApp
      meuId={user.id}
      meuNome={profile?.nome ?? "Eu"}
      meuSetor={profile?.sector ?? "recepcao"}
      pessoas={pessoas}
      itensIniciais={itens}
      observacoes={observacoes}
      imoveis={imoveis}
    />
  );
}
