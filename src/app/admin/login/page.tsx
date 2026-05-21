import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/brand/Logo";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-arini-radial flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block">
            <Logo variant="light" size={56} href="/" />
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display text-2xl text-arini">Acesso interno</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com seu e-mail e senha do CRM.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
