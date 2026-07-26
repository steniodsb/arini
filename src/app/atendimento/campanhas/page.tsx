import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { Megaphone } from "lucide-react";

export default async function CampanhasPage() {
  await requireAtendimentoUser();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
      <Megaphone size={40} className="text-muted-foreground/40" />
      <h1 className="font-display text-xl text-arini">Campanhas</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Disparo de mensagens em massa (WhatsApp) e campanhas ao vivo no site.
        Em desenvolvimento (Onda E).
      </p>
    </div>
  );
}
