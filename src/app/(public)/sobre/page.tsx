import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/public/PageHero";
import {
  Handshake,
  Award,
  HeartHandshake,
  Eye,
  Users,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Quem somos — Arini Negócios Imobiliários",
  description:
    "Conheça a história da Arini Negócios Imobiliários: curadoria, transparência e atendimento dedicado em cada negócio.",
};

const STATS = [
  { value: "+10", label: "Anos de mercado" },
  { value: "+500", label: "Famílias atendidas" },
  { value: "+200", label: "Imóveis na carteira" },
  { value: "100%", label: "Documentação validada" },
];

const VALORES = [
  {
    Icon: Handshake,
    titulo: "Transparência",
    desc: "Negociações claras, sem letras miúdas, do primeiro contato ao pós-venda.",
  },
  {
    Icon: ShieldCheck,
    titulo: "Segurança jurídica",
    desc: "Cada imóvel passa por análise documental antes de ir ao mercado.",
  },
  {
    Icon: Award,
    titulo: "Curadoria",
    desc: "Selecionamos imóveis com critério — valor justo e localização certa.",
  },
  {
    Icon: HeartHandshake,
    titulo: "Atendimento dedicado",
    desc: "Acompanhamento próximo em cada etapa: visita, proposta, assinatura.",
  },
  {
    Icon: Eye,
    titulo: "Conhecimento local",
    desc: "Entendemos o valor real de cada bairro, fazenda e oportunidade da região.",
  },
  {
    Icon: Users,
    titulo: "Relacionamento",
    desc: "Mais do que um imóvel, construímos uma relação de confiança que dura.",
  },
];

export default function SobrePage() {
  return (
    <>
      <PageHero
        eyebrow="Nossa história"
        title={
          <>
            Negociando com <span className="text-gold-gradient">propósito</span>
          </>
        }
        subtitle="Uma equipe que trata cada imóvel como se fosse seu — combinando conhecimento local, tecnologia própria e atendimento dedicado para transformar transações em relações de confiança."
        size="lg"
      />

      {/* STATS STRIP */}
      <section className="border-b">
        <div className="container py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl md:text-5xl font-display text-gold-gradient">
                {s.value}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TRAJETÓRIA */}
      <section className="container py-20">
        <div className="grid lg:grid-cols-[1fr_minmax(0,420px)] gap-12 lg:gap-16 items-start">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-arini">Nossa trajetória</h2>
            <div className="mt-6 space-y-5 text-muted-foreground leading-relaxed">
              <p>
                A <strong className="text-arini">Arini Negócios Imobiliários</strong>{" "}
                nasceu da convicção de que comprar, vender ou alugar um imóvel
                precisa ser uma experiência transparente, segura e bem atendida —
                do primeiro clique até a entrega das chaves.
              </p>
              <p>
                Atuamos com casas, apartamentos, terrenos, loteamentos e
                propriedades rurais, combinando uma operação tecnológica moderna
                com o atendimento humano que só uma equipe local consegue
                oferecer. Conhecemos os bairros, as fazendas, os ritmos da
                nossa região — e é esse conhecimento que se transforma em
                negócios bem feitos.
              </p>
              <p>
                Cada imóvel da nossa carteira passa por um fluxo rigoroso:
                captação, análise documental jurídica, avaliação de valor justo
                e divulgação multicanal. Isso garante que o cliente — comprador
                ou proprietário — tenha sempre informação clara e decisão
                segura.
              </p>
              <p>
                Mais do que intermediar transações, queremos ser referência em
                atendimento e confiança. A maior conquista da Arini não está
                apenas nos contratos assinados, mas na indicação que nossos
                clientes fazem depois — sinal de que estamos no caminho certo.
              </p>
            </div>

            <blockquote className="mt-10 border-l-4 border-gold pl-6 py-2">
              <p className="font-display text-xl text-arini italic leading-relaxed">
                “Vendemos cada imóvel como se fosse para nossa própria família
                — essa é a régua da Arini.”
              </p>
              <footer className="mt-3 text-sm text-muted-foreground">
                — Equipe Arini Negócios Imobiliários
              </footer>
            </blockquote>
          </div>

          {/* Imagem lateral */}
          <div className="lg:sticky lg:top-32">
            <div className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src="/sobre-trajetoria.jpg"
                alt="Equipe Arini Negócios Imobiliários"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 420px, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-arini/60 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <div className="text-xs uppercase tracking-[0.3em] text-gold font-semibold">
                  Arini
                </div>
                <div className="font-display text-xl mt-1">
                  Mais de uma década construindo confiança.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALORES */}
      <section className="bg-muted/40 py-20 border-y">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-gold-dark text-xs uppercase tracking-[0.3em] font-semibold">
              O que nos move
            </div>
            <h2 className="font-display text-3xl md:text-4xl text-arini mt-3">
              Nossos valores
            </h2>
            <p className="mt-3 text-muted-foreground">
              Princípios que guiam cada captação, cada visita e cada
              fechamento.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {VALORES.map(({ Icon, titulo, desc }) => (
              <div
                key={titulo}
                className="rounded-xl bg-white border p-6 hover:border-gold transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-gold-gradient flex items-center justify-center text-arini mb-4">
                  <Icon size={22} />
                </div>
                <h3 className="font-display text-lg text-arini">{titulo}</h3>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 text-center">
        <h2 className="font-display text-3xl md:text-4xl text-arini">
          Conheça os imóveis da Arini
        </h2>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Descubra as oportunidades selecionadas pela nossa equipe — casas,
          apartamentos, terrenos e propriedades rurais com curadoria e
          transparência.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button asChild variant="gold" size="lg">
            <Link href="/imoveis">
              Ver imóveis <ArrowRight size={16} />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contato">Anunciar meu imóvel</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
