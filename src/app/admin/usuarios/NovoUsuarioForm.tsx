"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SECTOR_LABELS } from "@/lib/types";

export function NovoUsuarioForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/usuarios/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: fd.get("nome"),
        email: fd.get("email"),
        password: fd.get("password"),
        sector: fd.get("sector"),
        is_admin_central: fd.get("admin") === "on",
      }),
    });
    setLoading(false);
    if (res.ok) {
      setMsg("Usuário criado com sucesso");
      (e.currentTarget as HTMLFormElement).reset();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg("Erro: " + (j.error ?? "tente novamente"));
    }
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      <div><Label>Nome</Label><Input name="nome" required /></div>
      <div><Label>E-mail</Label><Input name="email" type="email" required /></div>
      <div><Label>Senha inicial</Label><Input name="password" type="password" required minLength={6} /></div>
      <div>
        <Label>Setor</Label>
        <Select name="sector" defaultValue="recepcao">
          {Object.entries(SECTOR_LABELS).filter(([k]) => k !== "admin_central").map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>
      <div className="md:col-span-2"><label className="text-sm"><input type="checkbox" name="admin" className="mr-2 accent-arini" /> Administrador Central (acesso total)</label></div>
      <div className="md:col-span-2 flex justify-end items-center gap-3">
        {msg && <span className="text-sm">{msg}</span>}
        <Button type="submit" variant="gold" disabled={loading}>{loading ? "Criando..." : "Criar usuário"}</Button>
      </div>
    </form>
  );
}
