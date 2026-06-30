import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SECTOR_LABELS, type Profile } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { NovoUsuarioForm } from "./NovoUsuarioForm";
import { UsuarioActions } from "./UsuarioActions";

export default async function UsuariosPage() {
  const { user } = await requireSector(["admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("profiles").select("*").order("nome");
  const list = (data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Usuários</h1>
        <p className="text-muted-foreground mt-1">Crie acessos individualizados por setor.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Convidar usuário</CardTitle></CardHeader>
        <CardContent><NovoUsuarioForm /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Equipe</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Nome</th><th>E-mail</th><th>Setor</th><th>Status</th><th>Criado em</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">
                    <a href={`/admin/usuarios/${u.id}`} className="text-arini hover:text-gold-dark font-medium">{u.nome}</a>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {u.is_admin_central ? <Badge variant="gold">Admin Central</Badge> : <Badge variant="outline">{SECTOR_LABELS[u.sector]}</Badge>}
                  </td>
                  <td><Badge variant={u.ativo ? "success" : "muted"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></td>
                  <td>{formatDateBR(u.created_at)}</td>
                  <td><UsuarioActions user={u} currentUserId={user.id} /></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum usuário cadastrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
