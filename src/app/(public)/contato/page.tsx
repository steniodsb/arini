import { ContactForm } from "@/components/public/ContactForm";

export default function ContatoPage() {
  return (
    <div className="container py-16 grid md:grid-cols-2 gap-12">
      <div>
        <h1 className="font-display text-4xl text-arini">Fale com a Arini</h1>
        <p className="mt-4 text-muted-foreground">
          Tem um imóvel para vender, alugar ou está procurando? Conte para a
          gente — nossa equipe entra em contato rapidamente.
        </p>
        <div className="mt-8 space-y-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">Telefone</div>
            <a href="tel:+5534999745140" className="text-arini hover:text-gold-dark">34 99974-5140</a>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">WhatsApp</div>
            <a href="https://wa.me/5534999745140" target="_blank" rel="noopener" className="text-arini hover:text-gold-dark">34 99974-5140</a>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">E-mail</div>
            <a href="mailto:arininegociosimobiliario@gmail.com" className="text-arini hover:text-gold-dark break-all">arininegociosimobiliario@gmail.com</a>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">Endereço</div>
            <div className="text-arini">Av. Campina Verde, 1130 — 38280000</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <ContactForm />
      </div>
    </div>
  );
}
