import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Approval, type Property, type PropertyMedia, type SectorObservation } from "@/lib/types";
import { Pencil, ExternalLink, MapPin } from "lucide-react";
import Image from "next/image";
import { SectorObservations } from "@/components/crm/SectorObservations";
import { DeletePropertyButton } from "@/components/crm/DeletePropertyButton";
import { SendToMarketingButton } from "@/components/crm/SendToMarketingButton";
import { ResubmitApprovalButton } from "@/components/crm/ResubmitApprovalButton";

// Status nos quais o imóvel ainda não foi aprovado pela diretoria/gerência.
const PRE_APPROVAL_STATUSES = ["rascunho", "aguardando_aprovacao_captacao", "aprovado_captacao"];

export default async function PropertyDetailAdminPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();
  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!property) notFound();
  const p = property as Property;

  const [{ data: media }, { data: capture }, { data: approvals }, { data: observations }] = await Promise.all([
    supabase.from("property_media").select("*").eq("property_id", p.id).order("ordem"),
    supabase.from("property_capture_info").select("*").eq("property_id", p.id).maybeSingle(),
    supabase.from("approvals").select("*").eq("entity_table", "properties").eq("entity_id", p.id).order("created_at", { ascending: false }),
    supabase.from("sector_observations").select("*").eq("entity_table", "properties").eq("entity_id", p.id).order("created_at", { ascending: false }),
  ]);
  const mediaList = (media ?? []) as PropertyMedia[];

  const isDiretoria = profile?.is_admin_central || profile?.sector === "admin_central";
  const canDelete =
    isDiretoria ||
    profile?.sector === "administrativo" ||
    (profile?.sector === "captacao" && p.captador_id === user.id && PRE_APPROVAL_STATUSES.includes(p.status));
  // Edição/observações: diretoria e administrativo sempre; captação só enquanto
  // não aprovado e dono do imóvel. Demais setores não editam imóvel não aprovado.
  const canEdit =
    isDiretoria ||
    profile?.sector === "administrativo" ||
    (profile?.sector === "captacao" && p.captador_id === user.id && PRE_APPROVAL_STATUSES.includes(p.status));
  // Observações ficam liberadas após o imóvel ser aprovado (sai dos status pré-aprovação),
  // ou sempre para diretoria/administrativo/captação-dono.
  const canObserve = canEdit || !PRE_APPROVAL_STATUSES.includes(p.status);

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
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/captacao/${p.id}/editar`}><Pencil size={14} /> Editar</Link>
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

      {mediaList.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Mídia</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {mediaList.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                  {m.tipo === "imagem" ? (
                    <Image src={m.url} alt="" fill className="object-cover" sizes="160px" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{m.tipo}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
            {capture.relatorio_texto && (
              <div className="mt-2 p-3 rounded-md bg-muted text-muted-foreground whitespace-pre-line">{capture.relatorio_texto}</div>
            )}
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
