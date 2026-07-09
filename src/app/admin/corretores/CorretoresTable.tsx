"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Save, X, ExternalLink } from "lucide-react";
import type { Corretor } from "@/lib/types";

export interface LinkedUser {
  id: string;
  nome: string;
  email: string;
  sector: string;
  ativo: boolean;
}

export function CorretoresTable({
  corretores,
  usersById,
}: {
  corretores: Corretor[];
  usersById: Record<string, LinkedUser>;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const supabase = createSupabaseBrowser();

  const filtered = corretores.filter((c) =>
    !filter ? true :
    [c.nome, c.cpf_cnpj, c.creci, c.telefone, c.email].some(
      (v) => v?.toLowerCase().includes(filter.toLowerCase())
    )
  );

  async function save(id: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    await supabase.from("corretores").update({
      nome: fd.get("nome"),
      cpf_cnpj: fd.get("cpf_cnpj") || null,
      creci: fd.get("creci") || null,
      telefone: fd.get("telefone") || null,
      email: fd.get("email") || null,
      observacoes: fd.get("observacoes") || null,
    }).eq("id", id);
    setEditingId(null);
    router.refresh();
  }

  async function remove(id: string, nome: string) {
    if (!confirm(`Excluir corretor "${nome}"?`)) return;
    const { error } = await supabase.from("corretores").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    else router.refresh();
  }

  return (
    <>
      <div className="mb-3">
        <Input
          placeholder="Filtrar por nome, CPF, CRECI, telefone, e-mail…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Nome</th>
            <th>CRECI</th>
            <th>Contato</th>
            <th>Acesso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
              {corretores.length === 0 ? "Nenhum corretor cadastrado ainda." : "Nenhum resultado."}
            </td></tr>
          )}
          {filtered.map((c) => editingId === c.id ? (
            <tr key={c.id} className="border-t bg-gold/5">
              <td colSpan={5} className="p-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); save(c.id, e.currentTarget); }}
                  className="grid md:grid-cols-2 gap-3"
                >
                  <div><Label>Nome</Label><Input name="nome" defaultValue={c.nome} required /></div>
                  <div><Label>CRECI</Label><Input name="creci" defaultValue={c.creci ?? ""} /></div>
                  <div><Label>CPF/CNPJ</Label><Input name="cpf_cnpj" defaultValue={c.cpf_cnpj ?? ""} /></div>
                  <div><Label>Telefone</Label><Input name="telefone" defaultValue={c.telefone ?? ""} /></div>
                  <div><Label>E-mail</Label><Input name="email" type="email" defaultValue={c.email ?? ""} /></div>
                  <div className="md:col-span-2"><Label>Observações</Label><Input name="observacoes" defaultValue={c.observacoes ?? ""} /></div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}><X size={14} /> Cancelar</Button>
                    <Button type="submit" variant="gold" size="sm"><Save size={14} /> Salvar</Button>
                  </div>
                </form>
              </td>
            </tr>
          ) : (
            <tr key={c.id} className="border-t hover:bg-muted/30">
              <td className="py-3 font-medium">
                <Link href={`/admin/corretores/${c.id}`} className="text-arini hover:text-gold-dark">
                  {c.nome}
                </Link>
              </td>
              <td>{c.creci ?? "—"}</td>
              <td className="text-muted-foreground">{c.telefone ?? c.email ?? "—"}</td>
              <td>
                {c.user_id ? (
                  <Link href={`/admin/usuarios/${c.user_id}`} className="inline-flex items-center gap-1.5" title={usersById[c.user_id]?.nome}>
                    <Badge variant="gold">Tem acesso</Badge>
                  </Link>
                ) : (
                  <Badge variant="muted">Parceiro</Badge>
                )}
              </td>
              <td className="text-right whitespace-nowrap">
                <Link
                  href={`/admin/corretores/${c.id}`}
                  className="inline-flex items-center gap-1 text-arini hover:text-gold-dark p-1.5 text-xs font-medium"
                >
                  <ExternalLink size={14} /> Abrir
                </Link>
                <button onClick={() => setEditingId(c.id)} className="text-arini hover:text-gold-dark p-1.5"><Pencil size={14} /></button>
                <button onClick={() => remove(c.id, c.nome)} className="text-red-600 hover:text-red-800 p-1.5"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
