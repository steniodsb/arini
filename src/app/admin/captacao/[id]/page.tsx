import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Approval, type ClientType, type MarketingMedia, type Property, type PropertyMedia, type SectorObservation } from "@/lib/types";
import { Pencil, ExternalLink, MapPin } from "lucide-react";
import Image from "next/image";
import { PropertyMediaBlock } from "@/components/crm/PropertyMediaBlock";
import { SectorObservations } from "@/components/crm/SectorObservations";
import { PropertyClientsPanel, type ClientOption, type LinkedClient, type OwnerOption } from "@/components/crm/PropertyClientsPanel";
import { PropertyDocuments } from "@/app/admin/juridico/[id]/PropertyDocuments";
import { DeletePropertyButton } from "@/components/crm/DeletePropertyButton";
import { SendToMarketingButton } from "@/components/crm/SendToMarketingButton";
import { ResubmitApprovalButton } from "@/components/crm/ResubmitApprovalButton";
import { ApprovalActions } from "@/app/admin/aprovacoes/ApprovalActions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HistoryTimeline } from "@/components/crm/HistoryTimeline";
import { buildPropertyHistory } from "@/lib/history";

// Status nos quais o imóvel ainda não foi aprovado pela diretoria/gerência.
const PRE_APPROVAL_STATUSES = ["rascunho", "aguardando_aprovacao_captacao", "aprovado_captacao"];

type PropertyDocItem = {
  id: string;
  tipo: string;
  nome: string | null;
  url: string;
  storage_path: string | null;
  created_at: string;
};

export default async function PropertyDetailAdminPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();
  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!property) notFound();
  const p = property as Property;

  const [{ data: media }, { data: editedMedia }, { data: campaign }, { data: capture }, { data: approvals }, { data: observations }] = await Promise.all([
    supabase.from("property_media").select("*").eq("property_id", p.id).order("ordem"),
    supabase.from("marketing_media").select("*").eq("property_id", p.id).eq("fase", "editada").order("created_at", { ascending: false }),
    supabase.from("marketing_campaigns").select("id").eq("property_id", p.id).maybeSingle(),
    supabase.from("property_capture_info").select("*").eq("property_id", p.id).maybeSingle(),
    supabase.from("approvals").select("*").eq("entity_table", "properties").eq("entity_id", p.id).order("created_at", { ascending: false }),
    supabase.from("sector_observations").select("*").eq("entity_table", "properties").eq("entity_id", p.id).order("created_at", { ascending: false }),
  ]);
  const mediaList = (media ?? []) as PropertyMedia[];
  const editedList = (editedMedia ?? []) as MarketingMedia[];

  const isDiretoria = profile?.is_admin_central || profile?.sector === "admin_central";
  const canDelete =
    isDiretoria ||
    profile?.sector === "administrativo" ||
    (profile?.sector === "captacao" && p.captador_id === user.id && PRE_APPROVAL_STATUSES.includes(p.status));
  // Edição: diretoria e administrativo sempre; captação edita o PRÓPRIO imóvel
  // em qualquer status (decisão do cliente — ver migration 0020). Demais setores
  // seguem a regra da RLS (marketing na fase de marketing, jurídico sempre).
  const canEdit =
    isDiretoria ||
    profile?.sector === "administrativo" ||
    (profile?.sector === "captacao" && p.captador_id === user.id);
  // Observações: liberadas para qualquer setor com acesso ao imóvel, inclusive
  // ANTES da aprovação (a RLS de sector_observations já permite o insert).
  const canObserve = true;

  // Controle interno do imóvel (origem / clientes vinculados): administrativo,
  // jurídico e diretoria. A RLS de property_clients reforça isso no banco.
  const canControl = isDiretoria || profile?.sector === "administrativo" || profile?.sector === "juridico";
  let linkedClients: LinkedClient[] = [];
  let clientOptions: ClientOption[] = [];
  let ownerOptions: OwnerOption[] = [];
  // Documentos do imóvel (matrícula, contrato de compra e venda, etc.) anexados
  // ao longo do processo — direto na "aba Imóveis", para o controle interno.
  let propertyDocs: PropertyDocItem[] = [];
  if (canControl) {
    const [{ data: links }, { data: clients }, { data: owners }, { data: docs }] = await Promise.all([
      supabase
        .from("property_clients")
        .select("id, client_id, papel, observacao, client:clients(nome, telefone)")
        .eq("property_id", p.id)
        .order("created_at", { ascending: true }),
      supabase.from("clients").select("id, nome, tipo, cpf_cnpj").eq("ativo", true).order("nome"),
      supabase.from("owners").select("id, nome, cpf_cnpj, telefone, email").order("nome"),
      supabase.from("property_documents").select("*").eq("property_id", p.id).order("created_at", { ascending: false }),
    ]);
    propertyDocs = (docs ?? []) as PropertyDocItem[];
    linkedClients = (links ?? []).map((r) => {
      const cli = r.client as { nome?: string; telefone?: string | null } | { nome?: string; telefone?: string | null }[] | null;
      const c = Array.isArray(cli) ? cli[0] : cli;
      return {
        id: r.id as string,
        client_id: r.client_id as string,
        papel: r.papel as ClientType,
        observacao: (r.observacao as string | null) ?? null,
        nome: c?.nome ?? "—",
        telefone: c?.telefone ?? null,
      };
    });
    clientOptions = (clients ?? []).map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
      tipo: c.tipo as ClientType,
      cpf_cnpj: (c.cpf_cnpj as string | null) ?? null,
    }));
    ownerOptions = (owners ?? []).map((o) => ({
      id: o.id as string,
      nome: o.nome as string,
      cpf_cnpj: (o.cpf_cnpj as string | null) ?? null,
      telefone: (o.telefone as string | null) ?? null,
      email: (o.email as string | null) ?? null,
    }));
  }

  // Decisão de aprovação direto na página do imóvel (revisar + aprovar/reprovar).
  // Captação: administrativo ou diretoria. Marketing/publicação: só diretoria.
  const stageAprovacao =
    p.status === "aguardando_aprovacao_marketing" ? "marketing"
    : p.status === "aguardando_aprovacao_captacao" ? "captacao"
    : null;
  const podeAprovar =
    (stageAprovacao === "captacao" && (isDiretoria || profile?.sector === "administrativo")) ||
    (stageAprovacao === "marketing" && isDiretoria);
  const pendingApproval = ((approvals ?? []) as Approval[]).find((a) => a.status === "pendente") ?? null;

  const history = await buildPropertyHistory(supabase, p.id, p);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">{p.codigo}</div>
          <h1 className="font-display text-3xl text-arini">{p.titulo || `${PROPERTY_TYPE_LABELS[p.type]}`}</h1>
          <div className="mt-2 flex gap-2">
            <Badge variant="outline">{PROPERTY_TYPE_LABELS[p.type]}</Badge>
            <Badge variant="gold">{CATEGORY_LABELS[p.category]}</Badge>
            <StatusBadge status={p.status} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-muted-foreground">Valor</div>
          <div className="text-3xl text-gold-gradient font-semibold">{formatCurrencyBRL(p.valor)}</div>
          <div className="mt-3 flex gap-2 justify-end">
            {canEdit && (
              <Button asChild variant="gold" size="sm">
                <Link href={`/admin/captacao/${p.id}/editar`}><Pencil size={14} /> Editar imóvel</Link>
              </Button>
            )}
            {p.publicado_no_site && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/imoveis/${p.codigo}`} target="_blank">
                  <ExternalLink size={14} /> Ver no site
                </Link>
              </Button>
            )}
            {canDelete && <DeletePropertyButton propertyId={p.id} codigo={p.codigo} />}
          </div>
          {canEdit && p.status === "aprovado_captacao" && !p.enviado_para_marketing && (
            <div className="mt-2 flex justify-end">
              <SendToMarketingButton propertyId={p.id} userId={user.id} />
            </div>
          )}
          {canEdit && p.status === "rascunho" && (
            <div className="mt-2 flex justify-end">
              <ResubmitApprovalButton propertyId={p.id} userId={user.id} />
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {podeAprovar && stageAprovacao && (
        <Card className="border-gold/40 bg-gold/5">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Aprovação pendente — etapa {stageAprovacao}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Revise as informações e mídias acima e decida. Aprovar avança o imóvel para a próxima etapa.
            </p>
            <ApprovalActions
              approvalId={pendingApproval?.id ?? null}
              entityTable="properties"
              entityId={p.id}
              stage={stageAprovacao}
            />
          </CardContent>
        </Card>
      )}

      {canEdit ? (
        <PropertyMediaBlock
          propertyId={p.id}
          coverUrl={p.foto_principal_url}
          coverPath={p.foto_principal_path}
          campaignId={(campaign?.id as string | undefined) ?? null}
          rawMedia={mediaList}
          editedMedia={editedList}
        />
      ) : (
        (mediaList.length > 0 || editedList.length > 0 || p.foto_principal_url) && (
          <div className="space-y-4">
            {/* Foto principal (capa) */}
            {p.foto_principal_url && (
              <Card>
                <CardHeader><CardTitle>Foto principal (capa do site)</CardTitle></CardHeader>
                <CardContent>
                  <a
                    href={p.foto_principal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-[4/3] w-48 rounded-md overflow-hidden bg-muted block group"
                    title="Foto principal (capa)"
                  >
                    <Image src={p.foto_principal_url} alt="" fill className="object-cover group-hover:opacity-90" sizes="192px" />
                    <span className="absolute top-1 left-1 bg-gold-gradient text-arini text-[9px] font-bold px-1.5 py-0.5 rounded">CAPA</span>
                  </a>
                </CardContent>
              </Card>
            )}
            {/* Mídias brutas (captação) */}
            <ReadOnlyMediaGrid title="Mídias brutas (captação)" items={mediaList} />
            {/* Mídias editadas (vão para o site) */}
            <ReadOnlyMediaGrid title="Mídias editadas (publicadas no site)" items={editedList} />
          </div>
        )
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Localização</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{p.endereco ?? "—"}</div>
            <div>{p.bairro} {p.cidade && `· ${p.cidade}`} {p.uf && `/${p.uf}`}</div>
            <div className="text-muted-foreground text-xs">CEP: {p.cep ?? "—"} · Lat/Lng: {p.lat ?? "—"} / {p.lng ?? "—"}</div>
            {(() => {
              const mapsHref = p.maps_url
                || (p.lat && p.lng ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : null)
                || (p.endereco ? `https://www.google.com/maps?q=${encodeURIComponent([p.endereco, p.bairro, p.cidade, p.uf].filter(Boolean).join(", "))}` : null);
              return mapsHref ? (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-arini hover:text-gold-dark text-xs font-semibold mt-1">
                  <MapPin size={12} /> Ver no Google Maps →
                </a>
              ) : null;
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Características</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-2 gap-2">
            <div>Dorm: {p.dormitorios ?? "—"}</div>
            <div>Banh: {p.banheiros ?? "—"}</div>
            <div>Vagas: {p.vagas ?? "—"}</div>
            <div>Área total: {p.area_total ? `${p.area_total} m²` : "—"}</div>
            <div>Área const.: {p.area_construida ? `${p.area_construida} m²` : "—"}</div>
            <div>Data entrada: {formatDateBR(p.data_entrada)}</div>
          </CardContent>
        </Card>
      </div>

      {capture && (
        <Card>
          <CardHeader><CardTitle>Informações da captação</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>
              Equipamentos:{" "}
              {[
                capture.utilizou_camera && "Câmera",
                capture.utilizou_drone && "Drone",
                capture.utilizou_gimbal && "Gimbal",
                capture.utilizou_celular && "Celular",
              ].filter(Boolean).join(", ") || "—"}
            </div>
            <div>
              Material:{" "}
              {Object.entries(capture.materiais ?? {})
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(", ") || "—"}
            </div>
            <div>Placa: {capture.placa_colocada ? "Colocada" : "Não colocada"}</div>
            {capture.link_midias && (
              <div className="flex items-center gap-1">
                Mídias (drive):{" "}
                <a href={capture.link_midias} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-arini hover:text-gold-dark font-semibold">
                  <ExternalLink size={12} /> Abrir pasta →
                </a>
              </div>
            )}
            {capture.relatorio_texto && (
              <div className="mt-2 p-3 rounded-md bg-muted text-muted-foreground whitespace-pre-line">{capture.relatorio_texto}</div>
            )}
          </CardContent>
        </Card>
      )}

      {canControl && (
        <PropertyClientsPanel
          propertyId={p.id}
          initial={linkedClients}
          clients={clientOptions}
          owners={ownerOptions}
        />
      )}

      {canControl && <PropertyDocuments propertyId={p.id} initial={propertyDocs} />}

      {profile && (
        <SectorObservations
          entityTable="properties"
          entityId={p.id}
          currentUserId={user.id}
          currentSector={profile.sector}
          initial={(observations ?? []) as SectorObservation[]}
          canAdd={canObserve}
        />
      )}

      <Card>
        <CardHeader><CardTitle>Histórico de aprovações</CardTitle></CardHeader>
        <CardContent>
          {(approvals ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem aprovações registradas.</p>}
          <div className="space-y-2">
            {((approvals ?? []) as Approval[]).map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b pb-2 text-sm">
                <div>
                  <span className="font-semibold">{a.stage}</span> ·{" "}
                  <Badge variant={a.status === "aprovado" ? "success" : a.status === "reprovado" ? "danger" : a.status === "corrigir" ? "warning" : "muted"}>{a.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{formatDateBR(a.decidido_em || a.created_at)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history">
          <HistoryTimeline events={history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Grade só-leitura de mídias (para setores sem permissão de edição).
function ReadOnlyMediaGrid({
  title,
  items,
}: {
  title: string;
  items: { id: string; url: string; tipo: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({items.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {items.map((m) => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-md overflow-hidden bg-muted block group"
              title="Abrir em tamanho original"
            >
              {m.tipo === "imagem" ? (
                <Image src={m.url} alt="" fill className="object-cover group-hover:opacity-90" sizes="160px" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                  <ExternalLink size={16} /> {m.tipo}
                </div>
              )}
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Clique em uma mídia para abrir/baixar em tamanho original.</p>
      </CardContent>
    </Card>
  );
}
