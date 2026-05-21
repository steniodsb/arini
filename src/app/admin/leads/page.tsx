import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LeadsKanban } from "./LeadsKanban";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Lead } from "@/lib/types";

export default async function LeadsPage() {
  await requireSector(["recepcao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("leads").select("*").order("ultima_interacao_em", { ascending: false }).limit(500);
  const leads = (data ?? []) as Lead[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Leads</h1>
          <p className="text-muted-foreground mt-1">Funil de atendimento e prospecção.</p>
        </div>
        <Button asChild variant="gold">
          <Link href="/admin/leads/novo"><Plus size={16} /> Novo lead</Link>
        </Button>
      </div>
      <LeadsKanban initial={leads} />
    </div>
  );
}
