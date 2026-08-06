import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PAPEL_LABELS, SECTOR_LABELS, type Profile } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { Pencil } from "lucide-react";
import Link from "next/link";
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
        <p className="text-muted-foreground mt-1">
          Um login por colaborador, com setor, cargo e acesso ao Atendimento.
        </p>
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
              <tr><th className="py-2">Nome</th><th>E-mail</th><th>Setor</th><th>Atendimento</th><th>Status</th><th>Criado em</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">
                    <a href={`/admin/usuarios/${u.id}`} className="text-arini hover:text-gold-dark font-medium">{u.nome}</a>
                    {u.cargo && (
                      <div className="text-xs text-muted-foreground">{u.cargo}</div>
                    )}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {u.is_admin_central ? <Badge variant="gold">Admin Central</Badge> : <Badge variant="outline">{SECTOR_LABELS[u.sector]}</Badge>}
                  </td>
                  {/* A diretoria é administradora da caixa pela regra do
                      banco (fn_atendimento_papel), tenha ou não a flag. */}
                  <td>
                    {u.is_admin_central || u.atendimento_access ? (
                      <Badge variant="outline">
                        {u.is_admin_central ? PAPEL_LABELS.administrador : PAPEL_LABELS[u.atendimento_papel]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td><Badge variant={u.ativo ? "success" : "muted"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></td>
                  <td>{formatDateBR(u.created_at)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/usuarios/${u.id}`}><Pencil size={14} /> Abrir</Link>
                      </Button>
                      <UsuarioActions user={u} currentUserId={user.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhum usuário cadastrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
