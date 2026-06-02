import Link from "next/link";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SECTOR_LABELS, type Profile } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { NovoUsuarioForm } from "../../usuarios/NovoUsuarioForm";

export default async function FuncionariosPontoPage() {
  const { profile } = await requireSector(["administrativo", "admin_central"]);
  const podeCadastrar = isDiretoria(profile);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("profiles").select("*").order("nome");
  const list = (data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Funcionários</h1>
          <p className="text-muted-foreground mt-1">Cadastro de funcionários que batem ponto e acessam o sistema.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/ponto"><ArrowLeft size={14} /> Voltar ao ponto</Link>
        </Button>
      </div>

      {podeCadastrar ? (
        <Card>
          <CardHeader><CardTitle>Cadastrar funcionário</CardTitle></CardHeader>
          <CardContent><NovoUsuarioForm /></CardContent>
        </Card>
      ) : (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          O cadastro de novos funcionários é feito pela diretoria. Você pode consultar a equipe abaixo.
        </CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Equipe</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Nome</th><th>E-mail</th><th>Setor</th><th>Status</th><th>Desde</th></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{u.is_admin_central ? <Badge variant="gold">Diretoria</Badge> : <Badge variant="outline">{SECTOR_LABELS[u.sector]}</Badge>}</td>
                  <td><Badge variant={u.ativo ? "success" : "muted"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></td>
                  <td>{formatDateBR(u.created_at)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum funcionário.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
