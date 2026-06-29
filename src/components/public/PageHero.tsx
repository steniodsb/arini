interface Props {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  bgImage?: string;
  /** Opacidade do overlay verde (0–1). Default 0.92 */
  overlay?: number;
  /** Altura mínima. Default "auto" (padding controla) */
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "py-16 md:py-20",
  md: "py-20 md:py-28",
  lg: "py-24 md:py-32",
};

/**
 * Hero padrão para páginas internas — fundo verde Arini com imagem de fundo
 * (overlay) e título centralizado.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  bgImage = "/hero-bg.jpg",
  overlay = 0.92,
  size = "md",
}: Props) {
  return (
    <section className="relative overflow-hidden text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgImage}')` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-arini" style={{ opacity: overlay }} aria-hidden />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(248,191,50,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <div className={`container relative z-10 ${SIZE_CLASSES[size]} text-center`}>
        {eyebrow && (
          <div className="text-gold text-xs uppercase tracking-[0.35em] font-semibold inline-flex items-center gap-3">
            <span className="h-px w-8 bg-gold" /> {eyebrow}{" "}
            <span className="h-px w-8 bg-gold" />
          </div>
        )}
        <h1 className="mt-5 font-display text-4xl md:text-6xl leading-[1.05] max-w-3xl mx-auto">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-5 text-white/80 text-base md:text-lg max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
