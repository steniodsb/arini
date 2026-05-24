import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { PublicNav } from "@/components/public/PublicNav";
import { WhatsAppFab } from "@/components/public/WhatsAppFab";
import { Phone, MessageCircle, Mail, MapPin, LogIn, Instagram, Facebook, Youtube } from "lucide-react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-border">
        <div className="container flex h-28 items-center justify-between">
          <Logo size={80} />
          <PublicNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-arini-dark text-white/80">
        <div className="container py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Coluna 1 — Logo + descrição + redes */}
          <div className="space-y-5">
            <Logo variant="light" size={140} />
            <p className="text-sm text-white/70 max-w-xs leading-relaxed">
              Curadoria, transparência e atendimento dedicado em cada negócio
              imobiliário. Construindo confiança há mais de uma década.
            </p>
            <div className="flex items-center gap-3">
              <SocialIcon href="https://www.instagram.com/arininegociosimobiliarios/" label="Instagram">
                <Instagram size={18} />
              </SocialIcon>
              <SocialIcon href="https://www.facebook.com/arininegociosimobiliarios" label="Facebook">
                <Facebook size={18} />
              </SocialIcon>
              <SocialIcon href="https://www.youtube.com/@arininegociosimobiliarios" label="YouTube">
                <Youtube size={18} />
              </SocialIcon>
            </div>
          </div>

          {/* Coluna 2 — Menu */}
          <div>
            <h4 className="font-display text-white text-xl mb-4">Menu</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="text-gold hover:opacity-80 transition-opacity">Home</Link></li>
              <li><Link href="/imoveis" className="hover:text-gold transition-colors">Imóveis</Link></li>
              <li><Link href="/imoveis?category=venda" className="hover:text-gold transition-colors">Venda</Link></li>
              <li><Link href="/imoveis?category=locacao" className="hover:text-gold transition-colors">Aluguel</Link></li>
              <li><Link href="/imoveis?category=arrendamento" className="hover:text-gold transition-colors">Arrendamento</Link></li>
              <li><Link href="/sobre" className="hover:text-gold transition-colors">Quem somos</Link></li>
              <li><Link href="/contato" className="hover:text-gold transition-colors">Anuncie Seu Imóvel</Link></li>
              <li><Link href="/contato" className="hover:text-gold transition-colors">Contato</Link></li>
            </ul>
          </div>

          {/* Coluna 3 — Contatos */}
          <div>
            <h4 className="font-display text-white text-xl mb-4">Contatos</h4>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-start gap-2">
                <Phone size={16} className="text-gold mt-0.5 shrink-0" />
                <a href="tel:+5534999745140" className="hover:text-gold transition-colors">34 99974-5140</a>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle size={16} className="text-gold mt-0.5 shrink-0" />
                <a href="https://wa.me/5534999745140" target="_blank" rel="noopener" className="hover:text-gold transition-colors">34 99974-5140</a>
              </li>
              <li className="flex items-start gap-2">
                <Mail size={16} className="text-gold mt-0.5 shrink-0" />
                <a href="mailto:arininegociosimobiliario@gmail.com" className="hover:text-gold transition-colors break-all">arininegociosimobiliario@gmail.com</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={16} className="text-gold mt-0.5 shrink-0" />
                <span>Av. Campina Verde, 1130 — 38280000</span>
              </li>
            </ul>
          </div>

          {/* Coluna 4 — Outros */}
          <div>
            <h4 className="font-display text-white text-xl mb-4">Outros</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/admin/login" className="inline-flex items-center gap-2 text-gold hover:opacity-80 transition-opacity">
                  <LogIn size={16} /> Login
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
          Arini Negócios Imobiliários — Todos os direitos reservados
        </div>
      </footer>
      <WhatsAppFab />
    </div>
  );
}

function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-10 h-10 rounded-full bg-white/10 hover:bg-gold-gradient hover:text-arini text-white flex items-center justify-center transition-all"
    >
      {children}
    </a>
  );
}
