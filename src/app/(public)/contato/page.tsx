import { ContactForm } from "@/components/public/ContactForm";
import { PageHero } from "@/components/public/PageHero";
import { Phone, MessageCircle, Mail, MapPin, type LucideIcon } from "lucide-react";

export const metadata = {
  title: "Contato — Arini Negócios Imobiliários",
};

export default function ContatoPage() {
  return (
    <>
      <PageHero
        eyebrow="Fale com a Arini"
        title={
          <>
            Entre em <span className="text-gold-gradient">contato</span> conosco
          </>
        }
        subtitle="Quer comprar, alugar, anunciar seu imóvel ou tirar uma dúvida? Nossa equipe responde rápido — pelo canal que você preferir."
        bgImage="/hero-contato.jpg"
        size="md"
      />
      <div className="container py-16 grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="font-display text-2xl text-arini">Canais diretos</h2>
          <p className="mt-2 text-muted-foreground">
            Atendimento de segunda a sábado, das 8h às 18h.
          </p>

          <div className="mt-8 space-y-5">
            <ContactItem
              Icon={Phone}
              label="Telefone"
              value="34 99974-5140"
              href="tel:+5534999745140"
            />
            <ContactItem
              Icon={MessageCircle}
              label="WhatsApp"
              value="34 99974-5140"
              href="https://wa.me/5534999745140"
              external
            />
            <ContactItem
              Icon={Mail}
              label="E-mail"
              value="arininegociosimobiliario@gmail.com"
              href="mailto:arininegociosimobiliario@gmail.com"
            />
            <ContactItem
              Icon={MapPin}
              label="Endereço"
              value="Av. Campina Verde, 1130 — 38280000"
            />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 md:p-8 shadow-sm">
          <h2 className="font-display text-2xl text-arini">Envie uma mensagem</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha o formulário abaixo e responderemos em até 24h.
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
      </div>
    </>
  );
}

function ContactItem({
  Icon,
  label,
  value,
  href,
  external,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 rounded-lg bg-gold-gradient flex items-center justify-center text-arini shrink-0">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-gold-dark font-semibold">
          {label}
        </div>
        <div className="text-arini break-all">{value}</div>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block hover:opacity-80 transition-opacity"
    >
      {content}
    </a>
  );
}
