/** @type {import('next').NextConfig} */

// Hosts liberados para o next/image.
//
// IMPORTANTE: o next/image valida os hosts em tempo de BUILD. Por isso não
// dependemos apenas de R2_PUBLIC_URL (que pode não estar presente no build de
// produção) — liberamos sempre o domínio público do R2 (pub-*.r2.dev) e o
// Supabase Storage. Se houver um domínio/CDN próprio em R2_PUBLIC_URL, ele é
// adicionado também. Sem isso, as imagens do site "somem" (next/image retorna 400).
const remotePatterns = [
  {
    protocol: "https",
    hostname: "vdqbwlxmaagjnfpcajwt.supabase.co",
    pathname: "/storage/v1/object/public/**",
  },
  // Bucket público padrão do Cloudflare R2 (qualquer conta/bucket).
  { protocol: "https", hostname: "*.r2.dev", pathname: "/**" },
  { protocol: "https", hostname: "**.r2.cloudflarestorage.com", pathname: "/**" },
];

if (process.env.R2_PUBLIC_URL) {
  try {
    const u = new URL(process.env.R2_PUBLIC_URL);
    const already = remotePatterns.some((p) => p.hostname === u.hostname);
    if (!already) {
      remotePatterns.push({
        protocol: u.protocol.replace(":", ""),
        hostname: u.hostname,
        pathname: "/**",
      });
    }
  } catch {
    // R2_PUBLIC_URL inválida — ignora e segue com os hosts padrão.
  }
}

const nextConfig = {
  images: {
    remotePatterns,
    // O otimizador do next/image (rodando em `next start`, self-hosted) tem
    // cache padrão de apenas 60s — ou seja, reprocessa a mesma foto o tempo
    // todo, o que deixa o site lento num VPS com CPU limitada. Subimos o TTL
    // para 31 dias: cada tamanho é otimizado UMA vez e reaproveitado (no
    // servidor e no navegador). As fotos são imutáveis por URL, então é seguro.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // Tamanhos realmente usados no site (cards ~1/3 da tela, imagem principal
    // ~800px). Enxugar a lista evita o otimizador gerar variações grandes à toa.
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200],
  },
};

export default nextConfig;
