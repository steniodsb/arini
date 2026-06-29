import { requireSector } from "@/lib/auth";
import { NovoLeadForm } from "./NovoLeadForm";

export default async function NovoLeadPage() {
  await requireSector(["recepcao", "administrativo", "admin_central"]);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl text-arini">Novo lead</h1>
      <p className="text-muted-foreground mt-1">Cadastre manualmente um contato.</p>
      <div className="mt-6">
        <NovoLeadForm />
      </div>
    </div>
  );
}
