import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { Building2 } from "lucide-react";

export default async function EmpresasPage() {
  await requireAtendimentoUser();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
      <Building2 size={40} className="text-muted-foreground/40" />
      <h1 className="font-display text-xl text-arini">Empresas</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Agrupamento de contatos por empresa/organização. Em desenvolvimento (Onda C) —
        vai reunir contatos, conversas e atributos por empresa.
      </p>
    </div>
  );
}
