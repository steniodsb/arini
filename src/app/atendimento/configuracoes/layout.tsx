import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { SettingsNav } from "./SettingsNav";

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requireAtendimentoUser();
  return (
    <div className="flex h-full">
      <SettingsNav />
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
