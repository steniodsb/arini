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
        <div className="mt-8 space-y-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">E-mail</div>
            <div className="text-arini">contato@arininegocios.com.br</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-gold-dark">WhatsApp</div>
            <div className="text-arini">+55 (00) 00000-0000</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <ContactForm />
      </div>
    </div>
  );
}
