// =====================================================================
// Helpers de cor do portal.
//
// Ficam num módulo à parte (e não em `dados.ts`) porque componentes CLIENT
// precisam deles: `dados.ts` importa `createSupabaseAdmin`, que puxa
// `next/headers` — importar isso de um "use client" quebra o build.
// Aqui não há nada além de matemática pura, seguro nos dois lados.
// =====================================================================

const COR_PADRAO = "#092316";

/**
 * A cor vem do banco, escrita por um admin. Ela acaba num `style` inline e
 * (via custom property) dentro do CSS, então validamos o formato antes:
 * um valor arbitrário ali seria injeção de CSS. Só hex de 3/6 dígitos passa.
 */
export function corSegura(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return COR_PADRAO;
  // Normalizamos para 6 dígitos: a UI concatena alfa em hex (`${cor}1f`) e
  // "#abc" + "1f" viraria uma cor inválida de 5 dígitos.
  return v.length === 4
    ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase()
    : v.toLowerCase();
}

/**
 * Cor de texto legível sobre a cor de marca.
 * O admin escolhe `cor_destaque` livremente — se ele puser um amarelo claro,
 * um `text-white` fixo no botão ficaria ilegível. Decidimos pela luminância
 * percebida em vez de chutar branco.
 */
export function corDeTextoSobre(hex: string): "#ffffff" | "#111111" {
  const n = parseInt(corSegura(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#111111" : "#ffffff";
}
