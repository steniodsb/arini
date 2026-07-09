import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Corretor } from "@/lib/types";
import { CorretoresTable, type LinkedUser } from "./CorretoresTable";
import { NewCorretorDialog } from "./NewCorretorDialog";

export default async function CorretoresPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  const { data: corretores } = await supabase
    .from("corretores")
    .select("*")
    .order("nome");
  const list = (corretores ?? []) as Corretor[];

  // Usuários do sistema — para vincular um corretor a um login e mostrar quem
  // tem acesso. Traz todos os ativos; a lista de "disponíveis" (sem vínculo) é
  // calculada no cliente.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nome, email, sector, ativo")
    .eq("ativo", true)
    .order("nome");
  const users = (profiles ?? []) as LinkedUser[];
  const usersById: Record<string, LinkedUser> = {};
  for (const u of users) usersById[u.id] = u;

  const comAcesso = list.filter((c) => c.user_id).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Corretores</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro de corretores como pessoa — com ou sem login no sistema.
          </p>
        </div>
        <NewCorretorDialog users={users} linkedUserIds={list.map((c) => c.user_id).filter(Boolean) as string[]} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Cadastrados</div>
          <div className="text-2xl text-arini font-semibold">{list.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Com acesso ao sistema</div>
          <div className="text-2xl text-arini font-semibold">{comAcesso}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Parceiros (sem login)</div>
          <div className="text-2xl text-arini font-semibold">{list.length - comAcesso}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos os corretores</CardTitle>
        </CardHeader>
        <CardContent>
          <CorretoresTable corretores={list} usersById={usersById} />
        </CardContent>
      </Card>
    </div>
  );
}
