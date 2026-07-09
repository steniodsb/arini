import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, UserRound } from "lucide-react";
import { LEAD_STAGES, SECTOR_LABELS, type Corretor, type LeadStage, type Sector } from "@/lib/types";
import { TransactionActions } from "@/components/crm/TransactionActions";

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  LEAD_STAGES.map((s) => [s.key, s.label]),
);

type LinkedProfile = { id: string; nome: string; email: string; sector: Sector };
type LeadRow = { id: string; nome: string; stage: LeadStage };

export default async function CorretorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { profile } = await requireSector(["administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const supabase = createSupabaseServer();

  const { data: corretor } = await supabase
    .from("corretores")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!corretor) notFound();
  const c = corretor as Corretor;

  // Usuário vinculado (se houver) + leads atribuídos a esse login.
  let linkedUser: LinkedProfile | null = null;
  let leads: LeadRow[] = [];
  if (c.user_id) {
    const [{ data: u }, { data: ls }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, sector").eq("id", c.user_id).single(),
      supabase.from("leads").select("id, nome, stage").eq("corretor_id", c.user_id).order("ultima_interacao_em", { ascending: false }),
    ]);
    linkedUser = (u as LinkedProfile) ?? null;
    leads = (ls ?? []) as LeadRow[];
  }

  // Opções de usuário para (des)vincular na edição.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nome, email")
    .eq("ativo", true)
    .order("nome");
  const userOpts = [
    { value: "", label: "— Sem login (parceiro) —" },
    ...(profiles ?? []).map((u) => ({ value: u.id as string, label: `${u.nome} (${u.email})` })),
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        href="/admin/corretores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-arini transition-colors"
      >
        <ArrowLeft size={16} /> Voltar para corretores
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">{c.nome}</h1>
          <div className="mt-2 flex gap-2">
            <Badge variant="gold">Corretor</Badge>
            {c.user_id ? <Badge variant="muted">Tem acesso ao sistema</Badge> : <Badge variant="muted">Parceiro (sem login)</Badge>}
          </div>
        </div>
        {canManage && (
          <TransactionActions
            table="corretores"
            id={c.id}
            title="Editar corretor"
            canManage={canManage}
            redirectTo="/admin/corretores"
            editLabel="Editar"
            fields={[
              { name: "nome", label: "Nome", type: "text", value: c.nome },
              { name: "creci", label: "CRECI", type: "text", value: c.creci },
              { name: "cpf_cnpj", label: "CPF/CNPJ", type: "text", value: c.cpf_cnpj },
              { name: "telefone", label: "Telefone", type: "text", value: c.telefone },
              { name: "email", label: "E-mail", type: "text", value: c.email },
              { name: "user_id", label: "Usuário do sistema (login)", type: "select", value: c.user_id, options: userOpts },
              { name: "observacoes", label: "Observações", type: "text", value: c.observacoes },
            ]}
          />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
          <div>CRECI: {c.creci ?? "—"}</div>
          <div>CPF/CNPJ: {c.cpf_cnpj ?? "—"}</div>
          <div>Telefone: {c.telefone ?? "—"}</div>
          <div>E-mail: {c.email ?? "—"}</div>
          {c.observacoes && (
            <div className="md:col-span-2 text-muted-foreground whitespace-pre-line">{c.observacoes}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Acesso ao sistema</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {linkedUser ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-gold-gradient-soft text-gold-dark flex items-center justify-center">
                  <UserRound size={16} />
                </span>
                <div>
                  <div className="text-arini font-medium">{linkedUser.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {linkedUser.email} · {SECTOR_LABELS[linkedUser.sector]}
                  </div>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/admin/usuarios/${linkedUser.id}`}><ExternalLink size={14} /> Abrir usuário</Link>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Corretor parceiro — sem login no sistema. Vincule um usuário na edição, se ele passar a ter acesso.
            </p>
          )}
        </CardContent>
      </Card>

      {c.user_id && (
        <Card>
          <CardHeader><CardTitle>Leads atribuídos ({leads.length})</CardTitle></CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum lead atribuído a este corretor.</p>
            ) : (
              <ul className="divide-y">
                {leads.map((l) => (
                  <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                    <span className="font-medium text-arini truncate">{l.nome}</span>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{STAGE_LABEL[l.stage] ?? l.stage}</Badge>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/leads/${l.id}`}><ExternalLink size={14} /> Abrir</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
