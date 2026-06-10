import { redirect } from "next/navigation";

// Contratos agora vivem dentro do Jurídico (aba "Contratos").
export default function ContratosRedirect() {
  redirect("/admin/juridico?tab=contratos");
}
