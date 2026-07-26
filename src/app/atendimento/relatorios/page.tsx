import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { CHANNEL_LABELS, CONVERSATION_STATUS_LABELS, type ConversationChannel, type ConversationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = {
  status: ConversationStatus;
  canal: ConversationChannel;
  responsavel_id: string | null;
  created_at: string;
  primeira_resposta_em: string | null;
};

function minutosMedios(rows: Row[]): string {
  const difs = rows
    .filter((r) => r.primeira_resposta_em)
    .map((r) => (new Date(r.primeira_resposta_em as string).getTime() - new Date(r.created_at).getTime()) / 60000)
    .filter((d) => d >= 0);
  if (difs.length === 0) return "—";
  const media = difs.reduce((a, b) => a + b, 0) / difs.length;
  if (media < 60) return `${Math.round(media)} min`;
  return `${(media / 60).toFixed(1)} h`;
}

export default async function RelatoriosPage() {
  await requireAtendimentoUser();
  const admin = createSupabaseAdmin();

  const [{ data: convs }, { data: agents }] = await Promise.all([
    admin.from("conversations").select("status, canal, responsavel_id, created_at, primeira_resposta_em"),
    admin.from("profiles").select("id, nome"),
  ]);

  const rows = (convs ?? []) as Row[];
  const nomeDe = new Map<string, string>();
  for (const a of (agents ?? []) as { id: string; nome: string }[]) nomeDe.set(a.id, a.nome);

  const total = rows.length;
  const porStatus = countBy(rows, (r) => r.status);
  const porCanal = countBy(rows, (r) => r.canal);
  const naoAtribuidas = rows.filter((r) => !r.responsavel_id).length;
  const porAgente = countBy(rows.filter((r) => r.responsavel_id), (r) => r.responsavel_id as string);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <h1 className="font-display text-2xl text-arini">Relatórios de Atendimento</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Conversas" value={total} />
        <Stat label="Abertas" value={porStatus["aberta"] ?? 0} />
        <Stat label="Não atribuídas" value={naoAtribuidas} />
        <Stat label="1ª resposta (média)" value={minutosMedios(rows)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Por status">
          {(Object.keys(CONVERSATION_STATUS_LABELS) as ConversationStatus[]).map((s) => (
            <BarRow key={s} label={CONVERSATION_STATUS_LABELS[s]} value={porStatus[s] ?? 0} total={total} />
          ))}
        </Card>
        <Card title="Por canal">
          {Object.entries(porCanal).map(([canal, n]) => (
            <BarRow key={canal} label={CHANNEL_LABELS[canal as ConversationChannel] ?? canal} value={n} total={total} />
          ))}
          {Object.keys(porCanal).length === 0 && <Empty />}
        </Card>
      </div>

      <Card title="Por atendente">
        {Object.entries(porAgente).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
          <BarRow key={id} label={nomeDe.get(id) ?? "—"} value={n} total={total} />
        ))}
        {Object.keys(porAgente).length === 0 && <Empty />}
      </Card>
    </div>
  );
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) { const k = key(r); acc[k] = (acc[k] ?? 0) + 1; }
  return acc;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-2xl font-semibold text-arini">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BarRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-arini" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground">Sem dados ainda.</p>;
}
