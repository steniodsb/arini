import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { type Property } from "@/lib/types";
import { TabelaImoveis } from "./TabelaImoveis";

export default async function AdministrativoPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("properties").select("*").order("created_at", { ascending: false }).limit(200);
  const list = (data ?? []) as Property[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Administrativo</h1>
        <p className="text-muted-foreground mt-1">
          Visão completa de todos os imóveis. Clique na linha para ver o resumo; de lá dá para abrir e editar.
        </p>
      </div>
      <TabelaImoveis linhas={list} />
    </div>
  );
}
