import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PropertyCard } from "@/components/public/PropertyCard";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, MapPinned, Sparkles, MapPin } from "lucide-react";
import type { Property, PropertyMedia } from "@/lib/types";

export const revalidate = 60;

async function getFeatured() {
  const supabase = createSupabaseServer();
  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("publicado_no_site", true)
    .order("destaque", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);

  const ids = (properties ?? []).map((p) => p.id);
  let mediaByProp: Record<string, string> = {};
  if (ids.length) {
    const { data: media } = await supabase
      .from("property_media")
      .select("property_id, url, capa, ordem")
      .in("property_id", ids);
    for (const m of (media ?? []) as PropertyMedia[]) {
      if (!mediaByProp[m.property_id] || m.capa) mediaByProp[m.property_id] = m.url;
    }
  }
  return { properties: (properties ?? []) as Property[], mediaByProp };
}

export default async function HomePage() {
  const { properties, mediaByProp } = await getFeatured();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden text-white min-h-[78vh] flex items-center">
        {/* Imagem de fundo */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
          aria-hidden
        />
        {/* Overlay verde Arini bem presente */}
        <div className="absolute inset-0 bg-arini" style={{ opacity: 0.94 }} aria-hidden />

        {/* Conteúdo centralizado */}
        <div className="container relative z-10 py-24 md:py-32 text-center flex flex-col items-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-semibold tracking-[0.2em] uppercase text-gold">
            <MapPin size={14} /> Arini Negócios Imobiliários
          </span>
          <h1 className="mt-6 font-display text-5xl md:text-7xl leading-[1.05] max-w-4xl">
            Encontre o <span className="text-gold-gradient">imóvel</span> certo
            <br className="hidden md:block" /> para a próxima fase da sua vida.
          </h1>
          <p className="mt-6 text-white/80 text-lg max-w-2xl">
            Casas, apartamentos, fazendas e oportunidades de investimento com
            curadoria, transparência e atendimento dedicado.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Button asChild variant="gold" size="lg">
              <Link href="/imoveis"><Search size={18} /> Ver imóveis</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
              <Link href="/contato">Falar com um corretor</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* DESTAQUES */}
      <section className="container py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="text-gold-dark text-xs uppercase tracking-[0.3em] font-semibold">
              Destaques
            </div>
            <h2 className="font-display text-3xl md:text-4xl text-arini mt-2">
              Imóveis selecionados
            </h2>
          </div>
          <Button asChild variant="link">
            <Link href="/imoveis">Ver todos →</Link>
          </Button>
        </div>

        {properties.length === 0 ? (
          <div className="text-center py-16 rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              Nenhum imóvel publicado ainda. Em breve, novidades.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} coverUrl={mediaByProp[p.id]} />
            ))}
          </div>
        )}
      </section>

      {/* BENEFITS */}
      <section className="bg-muted/50 py-20">
        <div className="container grid md:grid-cols-3 gap-8">
          {[
            { Icon: ShieldCheck, title: "Documentação verificada", desc: "Cada imóvel passa por análise jurídica antes da publicação." },
            { Icon: MapPinned, title: "Conhecimento local", desc: "Sabemos o valor real de cada bairro, fazenda e oportunidade." },
            { Icon: Sparkles, title: "Atendimento curado", desc: "Acompanhamento dedicado da visita ao pós-venda." },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-lg p-6 border">
              <div className="w-12 h-12 rounded-md bg-gold-gradient flex items-center justify-center text-arini">
                <Icon size={22} />
              </div>
              <h3 className="mt-4 font-display text-xl text-arini">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="rounded-2xl bg-arini text-white p-10 md:p-16 grid md:grid-cols-2 gap-8 items-center overflow-hidden relative">
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gold-gradient opacity-20 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-4xl">
              Tem um imóvel para <span className="text-gold-gradient">vender</span> ou <span className="text-gold-gradient">alugar</span>?
            </h2>
            <p className="mt-4 text-white/70">
              Nossa equipe de captação avalia, fotografa e divulga seu imóvel nos
              principais canais — com curadoria e contratos seguros.
            </p>
          </div>
          <div className="relative flex md:justify-end">
            <Button asChild variant="gold" size="lg">
              <Link href="/contato">Cadastrar meu imóvel</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
