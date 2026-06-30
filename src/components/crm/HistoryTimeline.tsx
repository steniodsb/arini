import Link from "next/link";
import {
  FileText,
  Home,
  User,
  UserPlus,
  KeyRound,
  Scale,
  FileSignature,
  Megaphone,
  Image as ImageIcon,
  Pencil,
  Percent,
  ArrowDownCircle,
  ArrowUpCircle,
  Sparkles,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateTimeBR } from "@/lib/utils";
import type { HistoryEvent, HistoryKind } from "@/lib/history";

const KIND_META: Record<HistoryKind, { icon: LucideIcon; tone: string; label: string }> = {
  cadastro: { icon: Sparkles, tone: "text-gold-dark bg-gold/10", label: "Cadastro" },
  documento: { icon: FileText, tone: "text-blue-600 bg-blue-50", label: "Documento" },
  imovel: { icon: Home, tone: "text-arini bg-muted", label: "Imóvel" },
  cliente: { icon: User, tone: "text-arini bg-muted", label: "Cliente" },
  despesa: { icon: ArrowDownCircle, tone: "text-red-600 bg-red-50", label: "Despesa" },
  receita: { icon: ArrowUpCircle, tone: "text-green-600 bg-green-50", label: "Receita" },
  comissao: { icon: Percent, tone: "text-amber-600 bg-amber-50", label: "Comissão" },
  locacao: { icon: KeyRound, tone: "text-teal-600 bg-teal-50", label: "Locação" },
  juridico: { icon: Scale, tone: "text-purple-600 bg-purple-50", label: "Jurídico" },
  contrato: { icon: FileSignature, tone: "text-indigo-600 bg-indigo-50", label: "Contrato" },
  marketing: { icon: Megaphone, tone: "text-pink-600 bg-pink-50", label: "Marketing" },
  midia: { icon: ImageIcon, tone: "text-cyan-600 bg-cyan-50", label: "Mídia" },
  lead: { icon: UserPlus, tone: "text-orange-600 bg-orange-50", label: "Lead" },
  edicao: { icon: Pencil, tone: "text-muted-foreground bg-muted", label: "Registro" },
};

function EventRow({ ev }: { ev: HistoryEvent }) {
  const meta = KIND_META[ev.kind] ?? KIND_META.edicao;
  const Icon = meta.icon;

  const body = (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-foreground truncate">
            {ev.title}
            {ev.href && <ExternalLink size={11} className="ml-1 inline opacity-60" />}
          </p>
          {ev.amount != null && (
            <span className={`shrink-0 text-sm font-semibold ${ev.amount < 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrencyBRL(ev.amount)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatDateTimeBR(ev.when)}</span>
          {ev.badge && <Badge variant="outline" className="text-[10px]">{ev.badge}</Badge>}
          {ev.description && <span className="truncate">· {ev.description}</span>}
        </div>
      </div>
    </div>
  );

  return (
    <li className="relative pl-0">
      {ev.href ? (
        <Link href={ev.href} className="block rounded-md p-2 -m-2 transition-colors hover:bg-muted/50">
          {body}
        </Link>
      ) : (
        <div className="p-2 -m-2">{body}</div>
      )}
    </li>
  );
}

export function HistoryTimeline({
  events,
  title = "Histórico",
  emptyLabel = "Nenhum registro ainda.",
}: {
  events: HistoryEvent[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tudo o que foi adicionado ou relacionado, em ordem cronológica.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
