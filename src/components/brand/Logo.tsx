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
  const src = variant === "light" ? "/logoarini-dark.webp" : "/logoarini.webp";
  return (
    <Link href={href} className="flex items-center">
      <Image
        src={src}
        alt="Arini Negócios Imobiliários"
        width={size}
        height={size}
        className="rounded-md"
        priority
      />
    </Link>
  );
}
