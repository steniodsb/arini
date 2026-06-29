import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { NovaCaptacaoForm } from "./NovaCaptacaoForm";
import type { ClientOption } from "@/components/crm/PropertyClientsPanel";
import type { ClientType } from "@/lib/types";

export default async function NovaCaptacaoPage() {
  const { profile } = await requireSector(["captacao", "administrativo", "admin_central"]);

  // Vínculo de cliente é controle interno (administrativo/jurídico/diretoria).
  const canControl =
    !!profile?.is_admin_central || profile?.sector === "administrativo" || profile?.sector === "juridico";
  let clients: ClientOption[] = [];
  if (canControl) {
    const supabase = createSupabaseServer();
    const { data } = await supabase.from("clients").select("id, nome, tipo").eq("ativo", true).order("nome");
    clients = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, tipo: c.tipo as ClientType }));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-arini">Nova captação</h1>
        <p className="text-muted-foreground mt-1">
          Preencha os dados do imóvel. Ao final, o registro será enviado para aprovação administrativa.
        </p>
      </div>
      <NovaCaptacaoForm canControl={canControl} clients={clients} />
    </div>
  );
}
