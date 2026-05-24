import Link from "next/link";

/**
 * Botão flutuante de WhatsApp (Floating Action Button).
 * Aparece em todas as páginas do site público.
 */
export function WhatsAppFab() {
  const phone = "5534999745140"; // 34 99974-5140
  const message = encodeURIComponent(
    "Olá! Vim pelo site da Arini Negócios Imobiliários e gostaria de mais informações.",
  );
  const href = `https://wa.me/${phone}?text=${message}`;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar no WhatsApp"
      className="fixed bottom-6 right-6 z-50 group"
    >
      <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-60 animate-ping" />
      <span className="relative flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-xl shadow-emerald-500/30 hover:scale-110 transition-transform">
        <svg
          viewBox="0 0 32 32"
          fill="currentColor"
          className="w-7 h-7"
          aria-hidden="true"
        >
          <path d="M16.003 3C9.382 3 4 8.382 4 15c0 2.317.66 4.487 1.806 6.34L4 29l7.86-1.78A11.92 11.92 0 0 0 16.003 27C22.625 27 28 21.618 28 15S22.625 3 16.003 3Zm0 21.6c-1.93 0-3.83-.54-5.475-1.555l-.392-.235-4.667 1.058 1.07-4.55-.255-.413A9.55 9.55 0 0 1 5.6 15c0-5.736 4.665-10.4 10.403-10.4 5.737 0 10.4 4.664 10.4 10.4S21.74 24.6 16.003 24.6Zm5.71-7.78c-.313-.157-1.85-.913-2.137-1.017-.287-.105-.495-.157-.703.157-.208.313-.806 1.017-.988 1.225-.183.208-.365.235-.678.078-.313-.157-1.32-.487-2.514-1.553-.93-.83-1.557-1.853-1.74-2.166-.182-.313-.02-.482.137-.638.14-.14.313-.365.47-.547.156-.183.208-.313.313-.522.105-.208.052-.39-.026-.547-.078-.157-.703-1.694-.962-2.32-.253-.61-.51-.527-.703-.537l-.6-.01c-.208 0-.547.078-.834.39-.287.313-1.094 1.07-1.094 2.607 0 1.537 1.12 3.022 1.276 3.23.157.208 2.205 3.367 5.34 4.722.747.322 1.33.515 1.784.66.75.238 1.432.205 1.972.124.601-.09 1.85-.756 2.111-1.487.26-.73.26-1.357.182-1.487-.078-.13-.287-.208-.6-.365Z" />
        </svg>
      </span>
    </Link>
  );
}
