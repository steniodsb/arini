import { redirect } from "next/navigation";

// A carteira (contas/caixa) agora vive dentro dos financeiros.
export default function CaixaRedirect() {
  redirect("/admin/financeiro-empresarial");
}
