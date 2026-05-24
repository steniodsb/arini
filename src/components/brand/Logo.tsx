import Image from "next/image";
import Link from "next/link";

export function Logo({
  href = "/",
  size = 40,
}: {
  href?: string;
  variant?: "default" | "light";
  size?: number;
}) {
  return (
    <Link href={href} className="flex items-center">
      <Image
        src="/logoarini.webp"
        alt="Arini Negócios Imobiliários"
        width={size}
        height={size}
        className="rounded-md"
        priority
      />
    </Link>
  );
}
