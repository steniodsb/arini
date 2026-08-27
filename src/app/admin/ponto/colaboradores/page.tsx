import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MonitorSmartphone } from "lucide-react";
import type { Colaborador } from "@/lib/types";
import { ColaboradoresManager } from "./ColaboradoresManager";

export default async function ColaboradoresPontoPage() {
  // A RLS de `colaboradores` já barra os outros setores (0049). Isto evita
  // a tela abrir vazia e parecer defeito para quem não deveria estar aqui.
  await requireSector(["administrativo", "admin_central"]);

  const supabase = createSupabaseServer();
  const { data } = await supabase.from("colaboradores").select("*").order("nome");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-arini">Colaboradores</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Quem bate ponto — com jornada, almoço, pausa e escala. É um cadastro de
            PESSOA, separado do login: três pessoas do mesmo setor têm três registros
            de ponto, mesmo compartilhando uma conta no sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto/terminal"><MonitorSmartphone size={14} /> Terminal</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto"><ArrowLeft size={14} /> Voltar ao ponto</Link>
          </Button>
        </div>
      </div>

      <ColaboradoresManager initial={(data ?? []) as Colaborador[]} />
    </div>
  );
}
