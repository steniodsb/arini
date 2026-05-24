import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";
import { Bell } from "lucide-react";

export default async function NotificacoesPage() {
  const { profile } = await requireUser();
  if (!profile) return null;
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .or(`user_id.eq.${profile.id},sector.eq.${profile.sector}`)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Notificações</h1>
          <p className="text-muted-foreground mt-1">Histórico das últimas 200 notificações do seu setor.</p>
        </div>
      </div>

      {(data ?? []).length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Bell className="mx-auto mb-3 opacity-40" /> Nenhuma notificação ainda.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((n) => {
            const card = (
              <Card key={n.id} className={!n.lida ? "border-gold/40 bg-gold/5" : ""}>
                <CardContent className="p-4 flex items-start gap-3">
                  {!n.lida && <span className="w-2 h-2 rounded-full bg-gold-gradient mt-2 shrink-0" />}
                  <div className={`flex-1 ${n.lida ? "ml-5" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-arini">{n.titulo}</div>
                      <Badge variant="muted" className="text-[10px]">{n.tipo}</Badge>
                    </div>
                    {n.mensagem && <p className="text-sm text-muted-foreground mt-1">{n.mensagem}</p>}
                    <div className="text-xs text-muted-foreground mt-2">{formatDateTimeBR(n.created_at)}</div>
                  </div>
                </CardContent>
              </Card>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block">{card}</Link> : <div key={n.id}>{card}</div>;
          })}
        </div>
      )}
    </div>
  );
}
