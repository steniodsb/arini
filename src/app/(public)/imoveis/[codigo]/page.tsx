import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
  type PropertyMedia,
} from "@/lib/types";
import {
  MapPin,
  ArrowLeft,
  Bed,
  Bath,
  Car,
  Maximize2,
  Calendar,
  Check,
  Hash,
} from "lucide-react";
import { PropertyGallery } from "@/components/public/PropertyGallery";
import { PropertyContactForm } from "@/components/public/PropertyContactForm";

export const revalidate = 60;

const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  publicado: { label: "Disponível", className: "bg-emerald-500 text-white" },
  reservado: { label: "Reservado", className: "bg-amber-500 text-white" },
  vendido: { label: "Vendido", className: "bg-rose-500 text-white" },
  locado: { label: "Locado", className: "bg-sky-500 text-white" },
};

export default async function PropertyDetailPage({
  params,
}: {
  params: { codigo: string };
}) {
  const supabase = createSupabaseServer();
  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("codigo", params.codigo)
    .eq("publicado_no_site", true)
    .single();
  if (!property) notFound();
  const p = property as Property;

  const { data: media } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", p.id)
    .order("capa", { ascending: false })
    .order("ordem", { ascending: true });
  const mediaList = (media ?? []) as PropertyMedia[];
  const images = mediaList.filter((m) => m.tipo === "imagem");

  const status = STATUS_BADGE[p.status] ?? STATUS_BADGE.publicado;

  // Lista de diferenciais calculada
  const diferenciais: string[] = [];
  if (p.dormitorios) diferenciais.push(`${p.dormitorios} ${p.dormitorios === 1 ? "quarto" : "quartos"}`);
  if (p.suites) diferenciais.push(`${p.suites} ${p.suites === 1 ? "suíte" : "suítes"}`);
  if (p.banheiros) diferenciais.push(`${p.banheiros} ${p.banheiros === 1 ? "banheiro" : "banheiros"}`);
  if (p.vagas) diferenciais.push(`${p.vagas} ${p.vagas === 1 ? "vaga de garagem" : "vagas de garagem"}`);
  if (p.area_total) diferenciais.push(`${p.area_total} m² de área total`);
  if (p.area_construida) diferenciais.push(`${p.area_construida} m² construídos`);
  if (p.ano_construcao) diferenciais.push(`Construído em ${p.ano_construcao}`);
  if (p.exclusividade) diferenciais.push("Imóvel exclusivo");

  const mapsHref = p.maps_url
    ? p.maps_url
    : p.lat && p.lng
    ? `https://www.google.com/maps?q=${p.lat},${p.lng}`
    : p.endereco
    ? `https://www.google.com/maps?q=${encodeURIComponent([p.endereco, p.bairro, p.cidade, p.uf].filter(Boolean).join(", "))}`
    : null;

  const wppMessage = encodeURIComponent(
    `Olá! Tenho interesse no imóvel ${p.codigo} — ${p.titulo ?? PROPERTY_TYPE_LABELS[p.type]}. Pode me passar mais informações?`,
  );
  const wppHref = `https://wa.me/5534999745140?text=${wppMessage}`;

  return (
    <div className="bg-muted/20">
      {/* Breadcrumb */}
      <div className="border-b bg-white">
        <div className="container py-3 text-sm text-muted-foreground flex items-center gap-2">
          <Link href="/" className="hover:text-arini transition-colors">Home</Link>
          <span>/</span>
          <Link href="/imoveis" className="hover:text-arini transition-colors">Imóveis</Link>
          <span>/</span>
          <span className="text-arini font-medium truncate">{p.titulo ?? p.codigo}</span>
        </div>
      </div>

      <div className="container py-8">
        <Link
          href="/imoveis"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-arini transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Voltar para imóveis
        </Link>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8">
          {/* COLUNA PRINCIPAL */}
          <div className="space-y-8">
            {/* Galeria */}
            <PropertyGallery images={images} title={p.titulo ?? p.codigo} />

            {/* Header info */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={`${status.className} border-0 rounded-full px-3 py-1 font-semibold tracking-wide uppercase text-xs`}>
                  {status.label}
                </Badge>
                {(p.endereco || p.bairro || p.cidade) && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin size={14} className="text-gold-dark" />
                    {[p.bairro, p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ""}`]
                      .filter(Boolean)
                      .join(" — ")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  <Hash size={12} /> {p.codigo}
                </span>
              </div>
              <h1 className="mt-3 font-display text-3xl md:text-4xl text-arini">
                {p.titulo ?? `${PROPERTY_TYPE_LABELS[p.type]} em ${p.cidade ?? "—"}`}
              </h1>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl md:text-4xl font-semibold text-gold-gradient">
                  {formatCurrencyBRL(p.valor)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {CATEGORY_LABELS[p.category]}
                  {p.category === "locacao" || p.category === "arrendamento" ? " / mês" : ""}
                </span>
              </div>
            </div>

            {/* Diferenciais */}
            {diferenciais.length > 0 && (
              <div className="rounded-xl border bg-card p-6 md:p-7">
                <div className="text-xs uppercase tracking-[0.3em] text-gold-dark font-semibold">
                  Diferenciais
                </div>
                <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                  {diferenciais.map((d) => (
                    <li key={d} className="flex items-center gap-3 text-sm text-arini">
                      <span className="w-6 h-6 rounded-md bg-gold-gradient-soft text-gold-dark flex items-center justify-center shrink-0">
                        <Check size={14} />
                      </span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {p.dormitorios != null && (
                <QuickStat icon={<Bed size={18} />} label="Quartos" value={String(p.dormitorios)} />
              )}
              {p.banheiros != null && (
                <QuickStat icon={<Bath size={18} />} label="Banheiros" value={String(p.banheiros)} />
              )}
              {p.vagas != null && (
                <QuickStat icon={<Car size={18} />} label="Vagas" value={String(p.vagas)} />
              )}
              {p.area_total != null && (
                <QuickStat icon={<Maximize2 size={18} />} label="Área" value={`${p.area_total} m²`} />
              )}
            </div>

            {/* Descrição */}
            {p.descricao && (
              <div>
                <h2 className="font-display text-2xl text-arini">Sobre o imóvel</h2>
                <p className="mt-4 text-muted-foreground whitespace-pre-line leading-relaxed">
                  {p.descricao}
                </p>
              </div>
            )}

            {/* Localização */}
            {(p.endereco || p.bairro || p.cidade) && (
              <div>
                <h2 className="font-display text-2xl text-arini">Localização</h2>
                <div className="mt-4 rounded-xl border bg-card overflow-hidden">
                  <div className="p-5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold-gradient text-arini flex items-center justify-center shrink-0">
                      <MapPin size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-arini font-medium">
                        {[p.endereco, p.bairro, p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ""}`]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      {p.cep && (
                        <div className="text-xs text-muted-foreground mt-0.5">CEP {p.cep}</div>
                      )}
                      {mapsHref && (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gold-dark hover:underline mt-1 inline-block"
                        >
                          Ver no Google Maps →
                        </a>
                      )}
                    </div>
                  </div>
                  {mapsHref && (
                    <div className="border-t">
                      <iframe
                        src={`https://www.google.com/maps?q=${
                          p.lat && p.lng
                            ? `${p.lat},${p.lng}`
                            : encodeURIComponent([p.endereco, p.bairro, p.cidade].filter(Boolean).join(", "))
                        }&output=embed&z=15`}
                        loading="lazy"
                        className="w-full h-72 border-0"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Localização no mapa"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Calendar size={12} /> Imóvel anunciado em{" "}
              {new Date(p.data_entrada).toLocaleDateString("pt-BR")}
            </div>
          </div>

          {/* SIDEBAR */}
          <aside className="lg:sticky lg:top-32 self-start space-y-4">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="font-display text-lg text-arini">Receba todos os detalhes</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Preencha seus dados e falaremos com você pelo WhatsApp.
              </p>
              <div className="mt-5">
                <PropertyContactForm propertyId={p.id} propertyCode={p.codigo} />
              </div>
            </div>

            <a
              href={wppHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] hover:bg-[#1ebd5b] text-white font-semibold py-3.5 shadow-md transition-colors"
            >
              <svg viewBox="0 0 32 32" fill="currentColor" className="w-5 h-5">
                <path d="M16.003 3C9.382 3 4 8.382 4 15c0 2.317.66 4.487 1.806 6.34L4 29l7.86-1.78A11.92 11.92 0 0 0 16.003 27C22.625 27 28 21.618 28 15S22.625 3 16.003 3Zm5.71 17.82c-.313-.157-1.85-.913-2.137-1.017-.287-.105-.495-.157-.703.157-.208.313-.806 1.017-.988 1.225-.183.208-.365.235-.678.078-.313-.157-1.32-.487-2.514-1.553-.93-.83-1.557-1.853-1.74-2.166-.182-.313-.02-.482.137-.638.14-.14.313-.365.47-.547.156-.183.208-.313.313-.522.105-.208.052-.39-.026-.547-.078-.157-.703-1.694-.962-2.32-.253-.61-.51-.527-.703-.537l-.6-.01c-.208 0-.547.078-.834.39-.287.313-1.094 1.07-1.094 2.607 0 1.537 1.12 3.022 1.276 3.23.157.208 2.205 3.367 5.34 4.722.747.322 1.33.515 1.784.66.75.238 1.432.205 1.972.124.601-.09 1.85-.756 2.111-1.487.26-.73.26-1.357.182-1.487-.078-.13-.287-.208-.6-.365Z" />
              </svg>
              Chamar no WhatsApp
            </a>
          </aside>
        </div>
      </div>
    </div>
  );
}

function QuickStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-gold-dark">{icon}</div>
      <div className="mt-2 text-arini font-semibold text-lg leading-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}
