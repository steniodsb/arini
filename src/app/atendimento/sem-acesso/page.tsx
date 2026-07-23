import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "../LogoutButton";

// Sessão válida, mas o usuário não tem a flag atendimento_access.
export default function SemAcessoPage() {
  return (
    <div className="min-h-screen bg-arini-radial flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-block mb-8">
          <Logo variant="light" size={56} />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display text-2xl text-arini">Sem acesso ao Atendimento</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sua conta existe, mas ainda não foi liberada para o sistema de Atendimento.
            Peça à diretoria para habilitar o seu acesso.
          </p>
          <div className="mt-6 flex justify-center">
            <div className="rounded-md bg-arini px-4 py-2">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
