import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type PropertyStatus } from "@/lib/types";

const VARIANT: Record<PropertyStatus, "default" | "muted" | "success" | "warning" | "gold" | "danger"> = {
  rascunho: "muted",
  aguardando_aprovacao_captacao: "warning",
  aprovado_captacao: "gold",
  em_marketing: "default",
  aguardando_aprovacao_marketing: "warning",
  publicado: "success",
  reservado: "gold",
  vendido: "success",
  locado: "success",
  inativo: "danger",
};

export function StatusBadge({ status }: { status: PropertyStatus }) {
  return <Badge variant={VARIANT[status] ?? "muted"}>{STATUS_LABELS[status]}</Badge>;
}
