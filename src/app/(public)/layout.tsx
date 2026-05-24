import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { PublicNav } from "@/components/public/PublicNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-border">
        <div className="container flex h-20 items-center justify-between">
          <Logo />
          <PublicNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-arini text-white/80">
        <div className="container py-12 grid md:grid-cols-3 gap-8">
          <div>
            <Logo variant="light" />
            <p className="mt-4 text-sm text-white/60 max-w-xs">
              Excelência em negócios imobiliários. Captação, venda e locação com
              transparência e dedicação.
            </p>
          </div>
          <div>
            <h4 className="font-display text-gold mb-3">Institucional</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/sobre" className="hover:text-gold transition-colors">Sobre nós</Link></li>
              <li><Link href="/imoveis" className="hover:text-gold transition-colors">Imóveis</Link></li>
              <li><Link href="/contato" className="hover:text-gold transition-colors">Contato</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-gold mb-3">Contato</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>contato@arininegocios.com.br</li>
              <li>+55 (00) 00000-0000</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Arini Negócios Imobiliários — Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
