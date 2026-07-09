"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Save, X, ExternalLink } from "lucide-react";

interface Owner {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
}

export function OwnersTable({ owners, counts }: { owners: Owner[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const supabase = createSupabaseBrowser();

  const filtered = owners.filter((o) =>
    !filter ? true :
    [o.nome, o.cpf_cnpj, o.telefone, o.email].some(
      (v) => v?.toLowerCase().includes(filter.toLowerCase())
    )
  );

  async function save(id: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    await supabase.from("owners").update({
      nome: fd.get("nome"),
      cpf_cnpj: fd.get("cpf_cnpj") || null,
      telefone: fd.get("telefone") || null,
      email: fd.get("email") || null,
      observacoes: fd.get("observacoes") || null,
    }).eq("id", id);
    setEditingId(null);
    router.refresh();
  }

  async function remove(id: string, nome: string) {
    if (!confirm(`Excluir proprietário "${nome}"?`)) return;
    const { error } = await supabase.from("owners").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    else router.refresh();
  }

  return (
    <>
      <div className="mb-3">
        <Input
          placeholder="Filtrar por nome, CPF, telefone, e-mail…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Nome</th>
            <th>CPF/CNPJ</th>
            <th>Contato</th>
            <th>Imóveis</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
              {owners.length === 0 ? "Nenhum proprietário cadastrado ainda." : "Nenhum resultado."}
            </td></tr>
          )}
          {filtered.map((o) => editingId === o.id ? (
            <tr key={o.id} className="border-t bg-gold/5">
              <td colSpan={5} className="p-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); save(o.id, e.currentTarget); }}
                  className="grid md:grid-cols-2 gap-3"
                >
                  <div><Label>Nome</Label><Input name="nome" defaultValue={o.nome} required /></div>
                  <div><Label>CPF/CNPJ</Label><Input name="cpf_cnpj" defaultValue={o.cpf_cnpj ?? ""} /></div>
                  <div><Label>Telefone</Label><Input name="telefone" defaultValue={o.telefone ?? ""} /></div>
                  <div><Label>E-mail</Label><Input name="email" type="email" defaultValue={o.email ?? ""} /></div>
                  <div className="md:col-span-2"><Label>Observações</Label><Input name="observacoes" defaultValue={o.observacoes ?? ""} /></div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}><X size={14} /> Cancelar</Button>
                    <Button type="submit" variant="gold" size="sm"><Save size={14} /> Salvar</Button>
                  </div>
                </form>
              </td>
            </tr>
          ) : (
            <tr key={o.id} className="border-t hover:bg-muted/30">
              <td className="py-3 font-medium">
                <Link href={`/admin/proprietarios/${o.id}`} className="text-arini hover:text-gold-dark">
                  {o.nome}
                </Link>
              </td>
              <td>{o.cpf_cnpj ?? "—"}</td>
              <td className="text-muted-foreground">{o.telefone ?? o.email ?? "—"}</td>
              <td>
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-gold-gradient-soft text-gold-dark text-xs font-semibold">
                  {counts[o.id] ?? 0}
                </span>
              </td>
              <td className="text-right whitespace-nowrap">
                <Link
                  href={`/admin/proprietarios/${o.id}`}
                  className="inline-flex items-center gap-1 text-arini hover:text-gold-dark p-1.5 text-xs font-medium"
                >
                  <ExternalLink size={14} /> Abrir
                </Link>
                <button onClick={() => setEditingId(o.id)} className="text-arini hover:text-gold-dark p-1.5"><Pencil size={14} /></button>
                <button onClick={() => remove(o.id, o.nome)} className="text-red-600 hover:text-red-800 p-1.5"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
