/**
 * Compressão LEVE de imagens no navegador, antes do upload.
 *
 * Objetivo: reduzir o peso dos arquivos (hoje fotos de 8 MB deixam o site
 * lento) SEM perda visível de qualidade. Por isso:
 *   - mantém a RESOLUÇÃO original por padrão (não redimensiona — só reencoda);
 *   - usa qualidade ALTA (0.9);
 *   - reencoda para WebP (preserva nitidez e transparência, com ótimo tamanho);
 *   - só aproveita o resultado se ele for realmente menor (senão mantém o
 *     arquivo original — evita "inflar" um JPEG que já estava bem comprimido);
 *   - qualquer falha → devolve o original (nunca quebra o upload).
 *
 * Ajuste fino em um lugar só: QUALITY (0.9 = leve). Se quiser comprimir um
 * pouco mais, baixe para ~0.85; para comprimir menos ainda, suba para ~0.92.
 */

/** Qualidade do reencode (0–1). 0.9 = compressão leve, sem perda visível. */
export const IMAGE_QUALITY = 0.9;

/** Formato de saída: WebP mantém qualidade/transparência com menor tamanho. */
const OUTPUT_TYPE = "image/webp";

/** Tipos que vale a pena reencodar (fotos). GIF/SVG e afins ficam de fora. */
const COMPRESSIBLE = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Abaixo disso não compensa comprimir (já está leve). */
const MIN_BYTES = 400 * 1024; // 400 KB

/** Só usa o resultado se economizar pelo menos isto (10%). */
const MIN_SAVINGS = 0.1;

/** Teto de segurança de resolução — fotos normais ficam bem abaixo disso. */
const MAX_DIMENSION = 6000;

/**
 * Reencoda UMA imagem de forma leve. Retorna um novo File (.webp) menor, ou o
 * próprio arquivo original quando não há ganho / não é imagem / dá erro.
 */
export async function compressImageFile(file: File): Promise<File> {
  // Só roda no navegador (usa canvas).
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!COMPRESSIBLE.includes(file.type)) return file;
  if (file.size < MIN_BYTES) return file;

  try {
    // createImageBitmap respeita a orientação EXIF (não deita a foto).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    // Mantém a resolução; só reduz se passar do teto de segurança.
    let { width, height } = bitmap;
    const maior = Math.max(width, height);
    if (maior > MAX_DIMENSION) {
      const escala = MAX_DIMENSION / maior;
      width = Math.round(width * escala);
      height = Math.round(height * escala);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, OUTPUT_TYPE, IMAGE_QUALITY),
    );
    // toBlob nulo = formato não suportado pelo navegador → mantém original.
    if (!blob) return file;

    // Só aproveita se ficou de fato menor (com margem mínima).
    if (blob.size >= file.size * (1 - MIN_SAVINGS)) return file;

    const novoNome = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], novoNome, { type: OUTPUT_TYPE, lastModified: Date.now() });
  } catch {
    // Qualquer erro de decode/encode → mantém o arquivo original.
    return file;
  }
}
