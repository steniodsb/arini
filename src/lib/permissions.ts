import type { Sector } from "./types";

export const SECTOR_NAV: Record<Sector, { href: string; label: string }[]> = {
  captacao: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/captacao", label: "Captação" },
  ],
  marketing: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/marketing", label: "Marketing" },
  ],
  administrativo: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/captacao", label: "Captação" },
    { href: "/admin/marketing", label: "Marketing" },
    { href: "/admin/administrativo", label: "Administrativo" },
    { href: "/admin/aprovacoes", label: "Aprovações" },
    { href: "/admin/juridico", label: "Jurídico" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/financeiro-imovel", label: "Financ. Imóvel" },
    { href: "/admin/financeiro-empresarial", label: "Financ. Empresa" },
    { href: "/admin/auditoria", label: "Auditoria" },
  ],
  juridico: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/juridico", label: "Jurídico" },
  ],
  recepcao: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/leads", label: "Leads" },
  ],
  financeiro: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/financeiro-imovel", label: "Financ. Imóvel" },
    { href: "/admin/financeiro-empresarial", label: "Financ. Empresa" },
  ],
  admin_central: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/captacao", label: "Captação" },
    { href: "/admin/marketing", label: "Marketing" },
    { href: "/admin/administrativo", label: "Administrativo" },
    { href: "/admin/aprovacoes", label: "Aprovações" },
    { href: "/admin/juridico", label: "Jurídico" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/financeiro-imovel", label: "Financ. Imóvel" },
    { href: "/admin/financeiro-empresarial", label: "Financ. Empresa" },
    { href: "/admin/usuarios", label: "Usuários" },
    { href: "/admin/auditoria", label: "Auditoria" },
    { href: "/admin/configuracoes", label: "Configurações" },
  ],
};
