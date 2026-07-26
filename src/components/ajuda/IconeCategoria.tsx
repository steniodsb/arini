// =====================================================================
// Ícone da categoria.
//
// A coluna `icone` (migração 0035) é texto livre e o admin ainda não a
// preenche, então aceitamos os três formatos plausíveis sem quebrar:
//   - nome de ícone lucide ("book-open", "BookOpen", "credit_card");
//   - emoji ou qualquer texto curto (renderizado como está);
//   - vazio/desconhecido → livro aberto, o neutro da Central de Ajuda.
//
// Só um punhado de ícones entra no mapa de propósito: importar o pacote
// inteiro do lucide dinamicamente derrubaria o tree-shaking e engordaria o
// bundle de uma página que precisa ser leve no 3G.
// =====================================================================

import {
  BookOpen,
  CreditCard,
  FileText,
  HelpCircle,
  Lightbulb,
  LifeBuoy,
  Lock,
  MessageCircle,
  Package,
  Rocket,
  Settings,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const MAPA: Record<string, LucideIcon> = {
  bookopen: BookOpen,
  book: BookOpen,
  creditcard: CreditCard,
  pagamento: CreditCard,
  filetext: FileText,
  documento: FileText,
  helpcircle: HelpCircle,
  duvida: HelpCircle,
  lightbulb: Lightbulb,
  dica: Lightbulb,
  lifebuoy: LifeBuoy,
  suporte: LifeBuoy,
  lock: Lock,
  seguranca: ShieldCheck,
  shieldcheck: ShieldCheck,
  messagecircle: MessageCircle,
  package: Package,
  pedido: Package,
  rocket: Rocket,
  comecar: Rocket,
  settings: Settings,
  configuracoes: Settings,
  smartphone: Smartphone,
  truck: Truck,
  entrega: Truck,
  users: Users,
  conta: Users,
  wrench: Wrench,
};

/**
 * "book-open" / "Book_Open" / "Configurações" → "bookopen" / "configuracoes".
 * O NFD separa o acento em marca combinante e o filtro `[^a-z0-9]` a descarta
 * junto com hífen, espaço e underline — um passo só resolve os dois casos.
 */
function normalizar(valor: string): string {
  return valor.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function IconeCategoria({
  icone,
  tamanho = 22,
  className,
}: {
  icone: string | null;
  tamanho?: number;
  className?: string;
}) {
  const bruto = (icone ?? "").trim();
  const Componente = MAPA[normalizar(bruto)];

  if (Componente) {
    return <Componente size={tamanho} className={className} aria-hidden />;
  }

  // Não bateu no mapa mas há algo escrito: se for curto tratamos como emoji.
  if (bruto && bruto.length <= 3) {
    return (
      <span
        aria-hidden
        className={className}
        style={{ fontSize: tamanho, lineHeight: 1 }}
      >
        {bruto}
      </span>
    );
  }

  return <BookOpen size={tamanho} className={className} aria-hidden />;
}
