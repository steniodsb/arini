import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// HISTÓRICO UNIFICADO
// Agrega, para uma entidade (cliente, imóvel ou corretor), tudo o que foi
// adicionado ou relacionado a ela em uma única linha do tempo. Cada fonte
// (documentos, imóveis vinculados, transações, etc.) é normalizada para o
// mesmo formato HistoryEvent e ordenada por data (mais recente primeiro).
// =====================================================================

export type HistoryKind =
  | "cadastro"
  | "documento"
  | "imovel"
  | "cliente"
  | "despesa"
  | "receita"
  | "comissao"
  | "locacao"
  | "juridico"
  | "contrato"
  | "marketing"
  | "midia"
  | "lead"
  | "edicao";

export interface HistoryEvent {
  /** id único do evento (prefixado pela fonte para evitar colisão). */
  id: string;
  /** timestamp ISO usado para ordenar e exibir. */
  when: string;
  kind: HistoryKind;
  title: string;
  description?: string | null;
  /** valor em R$ quando o evento é financeiro. */
  amount?: number | null;
  /** rótulo curto (status, papel, tipo). */
  badge?: string | null;
  /** link para o registro de origem. */
  href?: string | null;
}

// Supabase pode devolver uma relação como objeto ou como array (1:N vs 1:1).
function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// Roda uma query e nunca lança: se a RLS bloquear ou der erro, devolve [].
async function safe<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await p;
    return data ?? [];
  } catch {
    return [];
  }
}

function byWhenDesc(a: HistoryEvent, b: HistoryEvent) {
  return (b.when ?? "").localeCompare(a.when ?? "");
}

// Resumo curto de um diff de auditoria ("alterou nome, telefone").
function describeDiff(diff: unknown): string | null {
  if (!diff || typeof diff !== "object") return null;
  const keys = Object.keys(diff as Record<string, unknown>);
  if (keys.length === 0) return null;
  return `Campos: ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? "…" : ""}`;
}

// ---------------------------------------------------------------------
// CLIENTE
// ---------------------------------------------------------------------
export async function buildClientHistory(
  supabase: SupabaseClient,
  clientId: string,
  client?: { nome?: string | null; created_at?: string | null } | null,
): Promise<HistoryEvent[]> {
  const [docs, links, expenses, incomes, leases, audit] = await Promise.all([
    safe(
      supabase
        .from("client_documents")
        .select("id, tipo, nome, status, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ),
    safe(
      supabase
        .from("property_clients")
        .select("id, papel, observacao, created_at, property:properties(id, codigo, titulo)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ),
    safe(
      supabase
        .from("expenses")
        .select("id, descricao, valor, vencimento, tipo_gasto, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ),
    safe(
      supabase
        .from("incomes")
        .select("id, origem, valor, data, descricao, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ),
    safe(
      supabase
        .from("lease_contracts")
        .select("id, valor_aluguel, status, data_inicio, created_at, property:properties(id, codigo, titulo)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ),
    safe(
      supabase
        .from("audit_log")
        .select("id, action, diff, created_at")
        .eq("entity_table", "clients")
        .eq("entity_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);

  const events: HistoryEvent[] = [];

  if (client?.created_at) {
    events.push({
      id: `cliente:${clientId}`,
      when: client.created_at,
      kind: "cadastro",
      title: "Cliente cadastrado",
      description: client.nome ?? null,
    });
  }

  for (const d of docs as Array<{ id: string; tipo: string; nome: string | null; status: string; created_at: string }>) {
    events.push({
      id: `doc:${d.id}`,
      when: d.created_at,
      kind: "documento",
      title: `Documento anexado — ${d.nome ?? d.tipo}`,
      badge: d.status,
    });
  }

  for (const l of links as Array<{ id: string; papel: string; observacao: string | null; created_at: string; property: unknown }>) {
    const prop = pickOne(l.property) as { id?: string; codigo?: string; titulo?: string | null } | null;
    events.push({
      id: `link:${l.id}`,
      when: l.created_at,
      kind: "imovel",
      title: `Imóvel vinculado — ${prop?.codigo ?? "—"}${prop?.titulo ? ` · ${prop.titulo}` : ""}`,
      description: l.observacao,
      badge: l.papel,
      href: prop?.id ? `/admin/captacao/${prop.id}` : null,
    });
  }

  for (const e of expenses as Array<{ id: string; descricao: string | null; valor: number; vencimento: string | null; tipo_gasto: string; created_at: string }>) {
    events.push({
      id: `exp:${e.id}`,
      when: e.created_at,
      kind: "despesa",
      title: `Despesa — ${e.descricao ?? "lançamento"}`,
      amount: -Math.abs(e.valor ?? 0),
      badge: e.tipo_gasto,
    });
  }

  for (const i of incomes as Array<{ id: string; origem: string; valor: number; data: string | null; descricao: string | null; created_at: string }>) {
    events.push({
      id: `inc:${i.id}`,
      when: i.created_at,
      kind: "receita",
      title: `Receita — ${i.descricao ?? i.origem}`,
      amount: Math.abs(i.valor ?? 0),
      badge: i.origem,
    });
  }

  for (const c of leases as Array<{ id: string; valor_aluguel: number; status: string; data_inicio: string | null; created_at: string; property: unknown }>) {
    const prop = pickOne(c.property) as { id?: string; codigo?: string; titulo?: string | null } | null;
    events.push({
      id: `lease:${c.id}`,
      when: c.created_at,
      kind: "locacao",
      title: `Contrato de locação — ${prop?.codigo ?? "imóvel"}`,
      description: c.data_inicio ? `Início ${c.data_inicio}` : null,
      amount: c.valor_aluguel ?? null,
      badge: c.status,
      href: prop?.id ? `/admin/captacao/${prop.id}` : null,
    });
  }

  for (const a of audit as Array<{ id: number; action: string; diff: unknown; created_at: string }>) {
    events.push({
      id: `audit:${a.id}`,
      when: a.created_at,
      kind: "edicao",
      title: `Registro: ${a.action}`,
      description: describeDiff(a.diff),
    });
  }

  return events.sort(byWhenDesc);
}

// ---------------------------------------------------------------------
// IMÓVEL
// ---------------------------------------------------------------------
export async function buildPropertyHistory(
  supabase: SupabaseClient,
  propertyId: string,
  property?: { codigo?: string | null; created_at?: string | null } | null,
): Promise<HistoryEvent[]> {
  const [media, docs, legal, contracts, campaigns, financials, expenses, incomes, links, leases, audit] = await Promise.all([
    safe(supabase.from("property_media").select("id, tipo, created_at").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("property_documents").select("id, tipo, nome, created_at").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("legal_records").select("id, status, data_analise, updated_at, created_at").eq("property_id", propertyId)),
    safe(supabase.from("contracts").select("id, tipo, valor, status_assinatura, criado_em").eq("property_id", propertyId).order("criado_em", { ascending: false })),
    safe(supabase.from("marketing_campaigns").select("id, status, data_publicacao_realizada, created_at").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("property_financials").select("id, operation_type, valor_fechado, data_fechamento, created_at").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("expenses").select("id, descricao, valor, tipo_gasto, created_at").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("incomes").select("id, origem, valor, descricao, created_at").eq("ref_property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("property_clients").select("id, papel, created_at, client:clients(id, nome)").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("lease_contracts").select("id, valor_aluguel, status, data_inicio, created_at, client:clients(id, nome)").eq("property_id", propertyId).order("created_at", { ascending: false })),
    safe(supabase.from("audit_log").select("id, action, diff, created_at").eq("entity_table", "properties").eq("entity_id", propertyId).order("created_at", { ascending: false }).limit(100)),
  ]);

  const events: HistoryEvent[] = [];

  if (property?.created_at) {
    events.push({
      id: `imovel:${propertyId}`,
      when: property.created_at,
      kind: "cadastro",
      title: "Imóvel captado / cadastrado",
      description: property.codigo ?? null,
    });
  }

  for (const m of media as Array<{ id: string; tipo: string; created_at: string }>) {
    events.push({ id: `media:${m.id}`, when: m.created_at, kind: "midia", title: `Mídia adicionada — ${m.tipo}` });
  }
  for (const d of docs as Array<{ id: string; tipo: string; nome: string | null; created_at: string }>) {
    events.push({ id: `pdoc:${d.id}`, when: d.created_at, kind: "documento", title: `Documento anexado — ${d.nome ?? d.tipo}`, badge: d.tipo });
  }
  for (const l of legal as Array<{ id: string; status: string; data_analise: string | null; updated_at: string | null; created_at: string }>) {
    events.push({ id: `legal:${l.id}`, when: l.updated_at ?? l.created_at, kind: "juridico", title: "Análise jurídica", badge: l.status });
  }
  for (const c of contracts as Array<{ id: string; tipo: string; valor: number | null; status_assinatura: string; criado_em: string }>) {
    events.push({ id: `contract:${c.id}`, when: c.criado_em, kind: "contrato", title: `Contrato — ${c.tipo}`, amount: c.valor, badge: c.status_assinatura });
  }
  for (const c of campaigns as Array<{ id: string; status: string; data_publicacao_realizada: string | null; created_at: string }>) {
    events.push({ id: `mkt:${c.id}`, when: c.created_at, kind: "marketing", title: "Campanha de marketing", badge: c.status });
  }
  for (const f of financials as Array<{ id: string; operation_type: string; valor_fechado: number; data_fechamento: string | null; created_at: string }>) {
    events.push({ id: `fin:${f.id}`, when: f.created_at, kind: "receita", title: `Fechamento — ${f.operation_type}`, amount: f.valor_fechado });
  }
  for (const e of expenses as Array<{ id: string; descricao: string | null; valor: number; tipo_gasto: string; created_at: string }>) {
    events.push({ id: `exp:${e.id}`, when: e.created_at, kind: "despesa", title: `Despesa — ${e.descricao ?? "lançamento"}`, amount: -Math.abs(e.valor ?? 0), badge: e.tipo_gasto });
  }
  for (const i of incomes as Array<{ id: string; origem: string; valor: number; descricao: string | null; created_at: string }>) {
    events.push({ id: `inc:${i.id}`, when: i.created_at, kind: "receita", title: `Receita — ${i.descricao ?? i.origem}`, amount: Math.abs(i.valor ?? 0), badge: i.origem });
  }
  for (const l of links as Array<{ id: string; papel: string; created_at: string; client: unknown }>) {
    const cli = pickOne(l.client) as { id?: string; nome?: string } | null;
    events.push({ id: `cl:${l.id}`, when: l.created_at, kind: "cliente", title: `Cliente vinculado — ${cli?.nome ?? "—"}`, badge: l.papel, href: cli?.id ? `/admin/clientes/${cli.id}` : null });
  }
  for (const c of leases as Array<{ id: string; valor_aluguel: number; status: string; data_inicio: string | null; created_at: string; client: unknown }>) {
    const cli = pickOne(c.client) as { id?: string; nome?: string } | null;
    events.push({ id: `lease:${c.id}`, when: c.created_at, kind: "locacao", title: `Locação — ${cli?.nome ?? "inquilino"}`, amount: c.valor_aluguel ?? null, badge: c.status, href: cli?.id ? `/admin/clientes/${cli.id}` : null });
  }
  for (const a of audit as Array<{ id: number; action: string; diff: unknown; created_at: string }>) {
    events.push({ id: `audit:${a.id}`, when: a.created_at, kind: "edicao", title: `Registro: ${a.action}`, description: describeDiff(a.diff) });
  }

  return events.sort(byWhenDesc);
}

// ---------------------------------------------------------------------
// CORRETOR (profile)
// ---------------------------------------------------------------------
export async function buildBrokerHistory(
  supabase: SupabaseClient,
  profileId: string,
): Promise<HistoryEvent[]> {
  const [properties, commissions, leads, audit] = await Promise.all([
    safe(supabase.from("properties").select("id, codigo, titulo, status, created_at").eq("captador_id", profileId).order("created_at", { ascending: false }).limit(300)),
    safe(supabase.from("commissions").select("id, valor, status, beneficiario_tipo, created_at").eq("beneficiario_id", profileId).order("created_at", { ascending: false }).limit(300)),
    safe(supabase.from("leads").select("id, nome, stage, created_at").eq("corretor_id", profileId).order("created_at", { ascending: false }).limit(300)),
    safe(supabase.from("audit_log").select("id, action, entity_table, created_at").eq("user_id", profileId).order("created_at", { ascending: false }).limit(150)),
  ]);

  const events: HistoryEvent[] = [];

  for (const p of properties as Array<{ id: string; codigo: string; titulo: string | null; status: string; created_at: string }>) {
    events.push({ id: `prop:${p.id}`, when: p.created_at, kind: "imovel", title: `Imóvel captado — ${p.codigo}${p.titulo ? ` · ${p.titulo}` : ""}`, badge: p.status, href: `/admin/captacao/${p.id}` });
  }
  for (const c of commissions as Array<{ id: string; valor: number; status: string; beneficiario_tipo: string | null; created_at: string }>) {
    events.push({ id: `com:${c.id}`, when: c.created_at, kind: "comissao", title: `Comissão${c.beneficiario_tipo ? ` (${c.beneficiario_tipo})` : ""}`, amount: c.valor, badge: c.status });
  }
  for (const l of leads as Array<{ id: string; nome: string; stage: string; created_at: string }>) {
    events.push({ id: `lead:${l.id}`, when: l.created_at, kind: "lead", title: `Lead atribuído — ${l.nome}`, badge: l.stage, href: `/admin/leads/${l.id}` });
  }
  for (const a of audit as Array<{ id: number; action: string; entity_table: string | null; created_at: string }>) {
    events.push({ id: `audit:${a.id}`, when: a.created_at, kind: "edicao", title: `${a.action}${a.entity_table ? ` · ${a.entity_table}` : ""}` });
  }

  return events.sort(byWhenDesc);
}
