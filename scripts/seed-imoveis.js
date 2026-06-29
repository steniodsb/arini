/* eslint-disable */
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// 6 imóveis demonstrativos
const IMOVEIS = [
  {
    type: "casa",
    category: "venda",
    titulo: "Casa moderna no Jardim Karaíba",
    descricao:
      "Casa térrea com arquitetura contemporânea, 3 suítes, área gourmet integrada com piscina e amplo jardim. Acabamento de alto padrão, automação residencial e energia solar instalada.",
    endereco: "Rua das Acácias, 250",
    bairro: "Jardim Karaíba",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38411-159",
    valor: 1450000,
    area_total: 480,
    area_construida: 320,
    dormitorios: 3,
    suites: 3,
    banheiros: 4,
    vagas: 3,
    ano_construcao: 2022,
    fotos: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80&fm=jpg",
    ],
    destaque: true,
  },
  {
    type: "apartamento",
    category: "venda",
    titulo: "Apartamento alto padrão no Centro",
    descricao:
      "Apartamento de 120m² em edifício novo, com 2 suítes, varanda gourmet com churrasqueira, área de lazer completa no condomínio (piscina, academia, salão de festas). Localização privilegiada a 5 minutos do parque.",
    endereco: "Av. Rondon Pacheco, 4200",
    bairro: "Lídice",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38400-394",
    valor: 780000,
    area_total: 120,
    area_construida: 120,
    dormitorios: 3,
    suites: 2,
    banheiros: 3,
    vagas: 2,
    ano_construcao: 2024,
    fotos: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80&fm=jpg",
    ],
    destaque: true,
  },
  {
    type: "fazenda",
    category: "rural",
    titulo: "Fazenda produtiva 150 hectares",
    descricao:
      "Fazenda em pleno funcionamento, com pastagem formada para 200 cabeças, sede principal com 4 quartos, 2 casas de funcionários, curral completo, açude e nascente. Documentação 100% regularizada.",
    endereco: "Rodovia BR-365, km 612",
    bairro: "Zona Rural",
    cidade: "Iturama",
    uf: "MG",
    cep: "38280-000",
    valor: 4500000,
    area_total: 1500000, // 150 ha em m²
    area_construida: 480,
    dormitorios: 4,
    suites: 1,
    banheiros: 3,
    vagas: 4,
    fotos: [
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&q=80&fm=jpg",
    ],
    destaque: true,
  },
  {
    type: "casa",
    category: "locacao",
    titulo: "Casa térrea para alugar no Tibery",
    descricao:
      "Casa familiar com 3 quartos sendo 1 suíte, sala ampla, cozinha com armários, área de serviço coberta e quintal com churrasqueira. Bairro tranquilo, próximo a escolas e supermercados.",
    endereco: "Rua Coronel Antônio Alves, 880",
    bairro: "Tibery",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38405-142",
    valor: 2800,
    area_total: 250,
    area_construida: 140,
    dormitorios: 3,
    suites: 1,
    banheiros: 2,
    vagas: 2,
    ano_construcao: 2018,
    fotos: [
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=1600&q=80&fm=jpg",
    ],
  },
  {
    type: "loteamento",
    category: "venda",
    titulo: "Loteamento Residencial Vista Verde",
    descricao:
      "Lotes a partir de 360m² em loteamento fechado com infraestrutura completa: asfalto, energia, água, esgoto, iluminação e portaria 24h. Área verde, playground e quadra poliesportiva.",
    endereco: "Estrada do Pequi, s/n",
    bairro: "Zona Sul",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38411-000",
    valor: 285000,
    area_total: 360,
    fotos: [
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1597047084897-51e81819a499?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80&fm=jpg",
    ],
  },
  {
    type: "galpao",
    category: "arrendamento",
    titulo: "Galpão logístico 800m² às margens da BR-050",
    descricao:
      "Galpão industrial com pé-direito de 9m, escritório administrativo, vestiários, doca para carga e descarga, pátio asfaltado para manobra de carretas. Excelente para distribuição e logística.",
    endereco: "BR-050, km 130 — Distrito Industrial",
    bairro: "Distrito Industrial",
    cidade: "Uberlândia",
    uf: "MG",
    cep: "38402-330",
    valor: 18500,
    area_total: 1200,
    area_construida: 800,
    banheiros: 4,
    vagas: 20,
    fotos: [
      "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=1600&q=80&fm=jpg",
      "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=1600&q=80&fm=jpg",
    ],
  },
];

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function uploadFoto(propertyId, idx, url) {
  const data = await downloadImage(url);
  const path = `${propertyId}/${Date.now()}-${idx}.jpg`;
  const { error } = await supabase.storage
    .from("property-media")
    .upload(path, data, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("property-media").getPublicUrl(path);
  return { url: pub.publicUrl, path, tamanho: data.length };
}

async function getAdminId() {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "arini@steniowebdesigner.com")
    .single();
  return data?.id;
}

async function main() {
  const captadorId = await getAdminId();
  console.log("Captador (admin):", captadorId);

  let totalFotos = 0;
  for (const imv of IMOVEIS) {
    console.log(`\n📦 ${imv.titulo}`);

    // Gera código
    const { data: codigo, error: codErr } = await supabase.rpc("fn_generate_property_code", {
      p_type: imv.type,
      p_category: imv.category,
    });
    if (codErr) {
      console.error("  ❌ código:", codErr.message);
      continue;
    }
    console.log("  ✓ código:", codigo);

    // Insere propriedade já publicada
    const { fotos, ...rest } = imv;
    const slug = `${codigo}-${rest.titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;

    const { data: prop, error: propErr } = await supabase
      .from("properties")
      .insert({
        ...rest,
        codigo,
        slug_publico: slug,
        captador_id: captadorId,
        status: "publicado",
        publicado_no_site: true,
        placa_status: "colocada",
        data_entrada: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (propErr) {
      console.error("  ❌ insert:", propErr.message);
      continue;
    }
    console.log("  ✓ inserido id:", prop.id);

    // Capture info mínimo
    await supabase.from("property_capture_info").insert({
      property_id: prop.id,
      utilizou_camera: true,
      utilizou_drone: imv.type === "fazenda" || imv.type === "loteamento",
      materiais: { foto: true, video: false, reels: false, tour: false, drone: imv.type === "fazenda" },
      placa_colocada: true,
      relatorio_texto: "Imóvel demonstrativo importado via seed.",
    });

    // Sobe fotos
    for (let i = 0; i < fotos.length; i++) {
      try {
        const up = await uploadFoto(prop.id, i, fotos[i]);
        await supabase.from("property_media").insert({
          property_id: prop.id,
          tipo: "imagem",
          url: up.url,
          storage_path: up.path,
          ordem: i,
          capa: i === 0,
          tamanho: up.tamanho,
          captado_com: "camera",
        });
        totalFotos++;
        process.stdout.write(`    📷 ${i + 1}/${fotos.length} OK\n`);
      } catch (e) {
        console.error(`    ❌ foto ${i}:`, e.message);
      }
    }
  }

  console.log(`\n🎉 ${IMOVEIS.length} imóveis criados, ${totalFotos} fotos enviadas.`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
