export default function SobrePage() {
  return (
    <div className="container py-16 max-w-3xl">
      <h1 className="font-display text-4xl text-arini">Sobre a Arini</h1>
      <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
        A Arini Negócios Imobiliários nasceu para transformar a forma como
        pessoas encontram, vendem e gerenciam imóveis. Combinamos conhecimento
        local, tecnologia própria de gestão e atendimento dedicado em cada etapa
        — da captação à pós-venda.
      </p>
      <div className="grid md:grid-cols-3 gap-6 mt-10">
        {[
          { titulo: "Curadoria", desc: "Cada imóvel é avaliado por nossa equipe antes de ir ao mercado." },
          { titulo: "Transparência", desc: "Documentação validada juridicamente e contratos claros." },
          { titulo: "Tecnologia", desc: "Plataforma própria de CRM e divulgação multicanal." },
        ].map((b) => (
          <div key={b.titulo} className="rounded-lg border p-6">
            <div className="text-gold-dark text-xs uppercase tracking-wider font-semibold">
              Pilar
            </div>
            <div className="font-display text-xl text-arini mt-1">{b.titulo}</div>
            <p className="text-sm text-muted-foreground mt-2">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
