import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Camada de storage de mídia em Cloudflare R2 (S3-compatível).
 * Só roda no servidor (usa as chaves secretas). O upload em si é feito pelo
 * navegador via URL pré-assinada (presigned PUT), então arquivos grandes
 * (vídeo) vão direto pro R2 sem passar pelos limites do servidor.
 *
 * Variáveis de ambiente necessárias (servidor):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_URL  (ex.: https://cdn.seudominio.com ou https://pub-xxxx.r2.dev)
 * E, para o cliente saber que deve usar R2:
 *   NEXT_PUBLIC_STORAGE_DRIVER=r2
 */

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL,
  );
}

let _client: S3Client | null = null;
function r2(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

export function r2PublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return `${base}/${key}`;
}

/** Gera uma URL pré-assinada de upload (PUT) válida por alguns minutos. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2(), cmd, { expiresIn: 600 });
}
