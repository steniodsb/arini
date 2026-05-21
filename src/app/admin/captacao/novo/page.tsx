import { requireSector } from "@/lib/auth";
import { NovaCaptacaoForm } from "./NovaCaptacaoForm";

export default async function NovaCaptacaoPage() {
  await requireSector(["captacao", "administrativo", "admin_central"]);
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-arini">Nova captação</h1>
        <p className="text-muted-foreground mt-1">
          Preencha os dados do imóvel. Ao final, o registro será enviado para aprovação administrativa.
        </p>
      </div>
      <NovaCaptacaoForm />
    </div>
  );
}
