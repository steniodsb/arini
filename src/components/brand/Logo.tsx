import Image from "next/image";
import Link from "next/link";

export function Logo({
  href = "/",
  variant = "default",
  size = 40,
}: {
  href?: string;
  variant?: "default" | "light";
  size?: number;
}) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <Image
        src="/logoarini.webp"
        alt="Arini Negócios Imobiliários"
        width={size}
        height={size}
        className="rounded-md"
        priority
      />
      <div className="leading-tight">
        <div
          className={`font-display text-lg font-semibold ${
            variant === "light" ? "text-white" : "text-arini"
          }`}
        >
          Arini
        </div>
        <div
          className={`text-[10px] uppercase tracking-[0.2em] ${
            variant === "light" ? "text-gold" : "text-gold-dark"
          }`}
        >
          Negócios Imobiliários
        </div>
      </div>
    </Link>
  );
}
