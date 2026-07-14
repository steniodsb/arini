"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserPlus, Phone } from "lucide-react";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, type ClientType } from "@/lib/types";
import { ensureClientForOwner } from "@/lib/owners";

export interface LinkedClient {
  id: string; // id do vínculo (property_clients)
  client_id: string;
  papel: ClientType;
  observacao: string | null;
  nome: string;
  telefone: string | null;
}

export interface ClientOption {
  id: string;
  nome: string;
  tipo: ClientType;
  cpf_cnpj?: string | null;
}

// Proprietário cadastrado em "Proprietários" (tabela owners), oferecido também
// na vinculação do imóvel. Ao vincular, vira/reaproveita um cliente.
export interface OwnerOption {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
}

// Prefixo usado no <option> para diferenciar um proprietário de um cliente.
const OWNER_PREFIX = "owner:";

// Normaliza texto para deduplicar proprietário x cliente (nome/documento).
function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Controle interno do imóvel: registra de quem veio o imóvel (origem),
 * reaproveitando o cadastro de clientes. Restrito a administrativo/jurídico/
 * diretoria (a visibilidade também é garantida pela RLS de property_clients).
 */
export function PropertyClientsPanel({
  propertyId,
  initial,
  clients,
  owners = [],
}: {
  propertyId: string;
  initial: LinkedClient[];
  clients: ClientOption[];
  owners?: OwnerOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LinkedClient[]>(initial);
  const [clientId, setClientId] = useState<string>("");
  const [papel, setPapel] = useState<ClientType>("parceiro");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Proprietários que ainda NÃO têm um cliente equivalente (por documento ou
  // nome). Só estes precisam aparecer no grupo "Proprietários" do seletor —
  // os demais já estão na lista de clientes.
  const clientDocs = new Set(clients.map((c) => norm(c.cpf_cnpj)).filter(Boolean));
  const clientNames = new Set(clients.map((c) => norm(c.nome)).filter(Boolean));
  const ownersSemCliente = owners.filter((o) => {
    const doc = norm(o.cpf_cnpj);
    if (doc && clientDocs.has(doc)) return false;
    return !clientNames.has(norm(o.nome));
  });

  // Cadastro inline de cliente novo
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<ClientType>("parceiro");
  const [novoDoc, setNovoDoc] = useState("");
  const [novoTel, setNovoTel] = useState("");

  async function refetch() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("property_clients")
      .select("id, client_id, papel, observacao, client:clients(nome, telefone)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });
    const rows = (data ?? []).map((r) => {
      const cli = r.client as { nome?: string; telefone?: string | null } | { nome?: string; telefone?: string | null }[] | null;
      const c = Array.isArray(cli) ? cli[0] : cli;
      return {
        id: r.id as string,
        client_id: r.client_id as string,
        papel: r.papel as ClientType,
        observacao: (r.observacao as string | null) ?? null,
        nome: c?.nome ?? "—",
        telefone: c?.telefone ?? null,
      } as LinkedClient;
    });
    setItems(rows);
  }

  async function vincular(targetClientId: string, targetPapel: ClientType) {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("property_clients").insert({
      property_id: propertyId,
      client_id: targetClientId,
      papel: targetPapel,
      observacao: obs || null,
      created_by: user?.id,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setClientId(""); setObs("");
    await refetch();
    router.refresh();
  }

  // Vincula a seleção atual do seletor: se for um proprietário (owner:<id>),
  // primeiro garante o cliente equivalente; senão vincula o cliente direto.
  async function vincularSelecionado() {
    if (!clientId) return;
    if (clientId.startsWith(OWNER_PREFIX)) {
      const ownerId = clientId.slice(OWNER_PREFIX.length);
      const owner = owners.find((o) => o.id === ownerId);
      if (!owner) { setError("Proprietário não encontrado."); return; }
      setBusy(true);
      setError(null);
      try {
        const supabase = createSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        const realClientId = await ensureClientForOwner(supabase, owner, user?.id);
        await vincular(realClientId, papel);
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Falha ao vincular proprietário.");
      }
      return;
    }
    await vincular(clientId, papel);
  }

  async function criarEVincular() {
    if (!novoNome.trim()) { setError("Informe o nome do cliente."); return; }
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: novo, error: cErr } = await supabase
      .from("clients")
      .insert({
        nome: novoNome.trim(),
        tipo: novoTipo,
        cpf_cnpj: novoDoc || null,
        telefone: novoTel || null,
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (cErr || !novo) { setBusy(false); setError(cErr?.message ?? "Falha ao criar cliente."); return; }
    await vincular(novo.id as string, novoTipo);
    setNovoNome(""); setNovoDoc(""); setNovoTel("");
    setCreating(false);
  }

  async function remover(id: string) {
    if (!confirm("Remover este vínculo?")) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("property_clients").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== id));
    router.refresh();
  }

  // Sugere o papel = tipo do cliente selecionado (proprietário, se for owner).
  function onSelectClient(id: string) {
    setClientId(id);
    if (id.startsWith(OWNER_PREFIX)) { setPapel("proprietario"); return; }
    const found = clients.find((c) => c.id === id);
    if (found) setPapel(found.tipo);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controle do imóvel — origem / clientes vinculados</CardTitle>
        <p className="text-xs text-muted-foreground">
          De quem veio o imóvel (parceiro que trouxe, vendedor, proprietário…). Visível apenas para
          administrativo, jurídico e diretoria.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Lista de vínculos */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente vinculado a este imóvel.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/clientes/${it.client_id}`} className="font-medium text-arini hover:text-gold-dark truncate">
                      {it.nome}
                    </Link>
                    <Badge variant="gold">{CLIENT_TYPE_LABELS[it.papel]}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {it.telefone && (
                      <span className="inline-flex items-center gap-1"><Phone size={11} /> {it.telefone}</span>
                    )}
                    {it.observacao && <span className="italic">“{it.observacao}”</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remover(it.id)}
                  className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-xs shrink-0"
                >
                  <Trash2 size={13} /> Remover
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Vincular cliente existente */}
        <div className="border-t pt-4 space-y-3">
          <Label className="text-sm">Vincular cliente ou proprietário já cadastrado</Label>
          <p className="text-xs text-muted-foreground">
            Proprietários cadastrados em “Proprietários” já aparecem aqui — não é preciso recadastrá-los como cliente.
          </p>
          <div className="grid md:grid-cols-[1fr_180px] gap-2">
            <Select value={clientId} onChange={(e) => onSelectClient(e.target.value)}>
              <option value="">— Selecione cliente ou proprietário —</option>
              {clients.length > 0 && (
                <optgroup label="Clientes cadastrados">
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome} ({CLIENT_TYPE_LABELS[c.tipo]})</option>
                  ))}
                </optgroup>
              )}
              {ownersSemCliente.length > 0 && (
                <optgroup label="Proprietários">
                  {ownersSemCliente.map((o) => (
                    <option key={o.id} value={`${OWNER_PREFIX}${o.id}`}>{o.nome} (Proprietário)</option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Select value={papel} onChange={(e) => setPapel(e.target.value as ClientType)}>
              {CLIENT_TYPES.map((t) => <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <Input
            placeholder="Observação (ex.: trouxe as áreas A, B e C)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="gold"
              disabled={busy || !clientId}
              onClick={vincularSelecionado}
            >
              <Plus size={14} /> Vincular
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating((v) => !v)}>
              <UserPlus size={14} /> {creating ? "Cancelar novo" : "Cadastrar novo cliente"}
            </Button>
          </div>
        </div>

        {/* Cadastro inline de cliente novo */}
        {creating && (
          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm">Novo cliente (cadastro rápido)</Label>
            <div className="grid md:grid-cols-2 gap-2">
              <div><Label className="text-xs">Nome*</Label><Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as ClientType)}>
                  {CLIENT_TYPES.map((t) => <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>)}
                </Select>
              </div>
              <div><Label className="text-xs">CPF/CNPJ (opcional)</Label><Input value={novoDoc} onChange={(e) => setNovoDoc(e.target.value)} /></div>
              <div><Label className="text-xs">Telefone (opcional)</Label><Input value={novoTel} onChange={(e) => setNovoTel(e.target.value)} /></div>
            </div>
            <Button type="button" variant="gold" disabled={busy} onClick={criarEVincular}>
              <Plus size={14} /> Criar e vincular
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
