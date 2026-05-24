import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { OwnersTable } from "./OwnersTable";
import { NewOwnerDialog } from "./NewOwnerDialog";

export default async function ProprietariosPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: owners } = await supabase.from("owners").select("*").order("nome");

  // Quantidade de imóveis por proprietário
  const { data: props } = await supabase.from("properties").select("owner_id");
  const countByOwner: Record<string, number> = {};
  for (const p of props ?? []) {
    if (p.owner_id) countByOwner[p.owner_id] = (countByOwner[p.owner_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Proprietários</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro de proprietários e vínculo com imóveis da carteira.
          </p>
        </div>
        <NewOwnerDialog />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Cadastrados</div>
          <div className="text-2xl text-arini font-semibold">{(owners ?? []).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Com imóveis</div>
          <div className="text-2xl text-arini font-semibold">{Object.keys(countByOwner).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Sem imóveis</div>
          <div className="text-2xl text-arini font-semibold">{(owners ?? []).length - Object.keys(countByOwner).length}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos os proprietários</CardTitle>
        </CardHeader>
        <CardContent>
          <OwnersTable owners={owners ?? []} counts={countByOwner} />
        </CardContent>
      </Card>
    </div>
  );
}
