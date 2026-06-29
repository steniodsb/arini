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
  images: { remotePatterns },
};

export default nextConfig;
