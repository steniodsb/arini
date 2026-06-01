import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CLIENT_TYPE_LABELS, type Client, type ClientType } from "@/lib/types";
import { NewClientDialog } from "./NewClientDialog";

export default async function ClientesPage() {
  await requireSector(["juridico", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: clients } = await supabase.from("clients").select("*").order("nome");
  const list = (clients ?? []) as Client[];

  const byType: Record<string, number> = {};
  for (const c of list) byType[c.tipo] = (byType[c.tipo] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro de clientes com tipo, contato e documentos.
          </p>
        </div>
        <NewClientDialog />
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Total</div>
          <div className="text-2xl text-arini font-semibold">{list.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Compradores</div>
          <div className="text-2xl text-arini font-semibold">{byType["comprador"] ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Vendedores</div>
          <div className="text-2xl text-arini font-semibold">{byType["vendedor"] ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Locatários/Locadores</div>
          <div className="text-2xl text-arini font-semibold">{(byType["locatario"] ?? 0) + (byType["locador"] ?? 0)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Todos os clientes</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Nome</th><th>Tipo</th><th>Telefone</th><th>E-mail</th><th>Cidade</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/30">
                  <td className="py-2">
                    <Link href={`/admin/clientes/${c.id}`} className="text-arini hover:text-gold-dark font-medium">{c.nome}</Link>
                  </td>
                  <td><Badge variant="outline">{CLIENT_TYPE_LABELS[c.tipo as ClientType] ?? c.tipo}</Badge></td>
                  <td>{c.telefone ?? c.whatsapp ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.cidade ?? "—"}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum cliente cadastrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
