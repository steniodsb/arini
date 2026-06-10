import { redirect } from "next/navigation";

// Comissões agora vivem dentro do Financeiro da Empresa.
export default function ComissoesRedirect() {
  redirect("/admin/financeiro-empresarial");
}
