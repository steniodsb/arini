"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PAPEL_DESCRICAO, PAPEL_LABELS, SECTOR_LABELS, type AtendimentoPapel } from "@/lib/types";

/** Mesmo teto da rota — avisa antes de o servidor recusar. */
const CARGO_MAX = 40;

/** Sugere sem travar: imobiliária inventa função nova toda hora. */
const CARGOS_SUGERIDOS = [
  "Corretor", "Corretora", "Captador", "Captadora",
  "Recepcionista", "Gerente de Locação", "Gerente de Vendas",
  "Marketing", "Financeiro", "Jurídico", "Administrativo", "Diretoria",
];

export function NovoUsuarioForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Controlado porque o bloco do papel/fila só aparece com o acesso ligado.
  const [atendimento, setAtendimento] = useState(false);
  const [papel, setPapel] = useState<AtendimentoPapel>("atendente");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/usuarios/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: fd.get("nome"),
        email: fd.get("email"),
        password: fd.get("password"),
        sector: fd.get("sector"),
        cargo: fd.get("cargo"),
        is_admin_central: fd.get("admin") === "on",
        atendimento_access: atendimento,
        atendimento_papel: papel,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setMsg(
        atendimento
          ? "Usuário criado. Falta só colocá-lo numa fila em Atendimento › Configurações › Agentes — atendente sem fila não vê conversa nenhuma."
          : "Usuário criado com sucesso",
      );
      form.reset();
      setAtendimento(false);
      setPapel("atendente");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg("Erro: " + (j.error ?? "tente novamente"));
    }
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      <datalist id="cargos-sugeridos-crm">
        {CARGOS_SUGERIDOS.map((c) => <option key={c} value={c} />)}
      </datalist>

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
      <div className="md:col-span-2">
        <Label>Cargo</Label>
        <Input
          name="cargo"
          list="cargos-sugeridos-crm"
          maxLength={CARGO_MAX}
          placeholder="Ex.: Corretora"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Como a pessoa se identifica para o time — aparece ao lado do nome no CRM e no
          Atendimento, inclusive quando ela assume um lead. Não muda permissão nenhuma.
        </p>
      </div>

      <div className="md:col-span-2">
        <label className="text-sm">
          <input type="checkbox" name="admin" className="mr-2 accent-arini" />
          Administrador Central (acesso total)
        </label>
      </div>

      {/* ---- Atendimento ------------------------------------------------
          Fica aqui e não numa segunda tela porque, separado, o passo era
          esquecido e o colaborador novo não conseguia entrar na caixa. */}
      <div className="md:col-span-2 rounded-lg border bg-muted/30 p-3 space-y-2">
        <label className="text-sm font-medium">
          <input
            type="checkbox"
            checked={atendimento}
            onChange={(e) => setAtendimento(e.target.checked)}
            className="mr-2 accent-arini"
          />
          Liberar acesso ao Atendimento (caixa multicanal)
        </label>

        {atendimento && (
          <div className="grid md:grid-cols-2 gap-3 pt-1">
            <div>
              <Label>Papel no Atendimento</Label>
              <Select
                value={papel}
                onChange={(e) => setPapel(e.target.value as AtendimentoPapel)}
              >
                {(Object.keys(PAPEL_LABELS) as AtendimentoPapel[]).map((p) => (
                  <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{PAPEL_DESCRICAO[papel]}</p>
            </div>
            <p className="text-xs text-muted-foreground self-end pb-1">
              {papel === "atendente"
                ? "Depois de criar, coloque a pessoa numa fila em Atendimento › Configurações › Agentes. Atendente sem fila não vê conversa nenhuma."
                : "Não precisa de fila para este papel."}
            </p>
          </div>
        )}
      </div>

      <div className="md:col-span-2 flex justify-end items-center gap-3">
        {msg && <span className="text-sm">{msg}</span>}
        <Button type="submit" variant="gold" disabled={loading}>{loading ? "Criando..." : "Criar usuário"}</Button>
      </div>
    </form>
  );
}
