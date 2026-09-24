import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Camada de storage de mídia em Cloudflare R2 (S3-compatível).
 * Só roda no servidor (usa as chaves secretas). O upload em si é feito pelo
 * navegador via URL pré-assinada (presigned PUT), então arquivos grandes
 * (vídeo) vão direto pro R2 sem passar pelos limites do servidor.
 *
 * Variáveis de ambiente (servidor) — DOIS nomes aceitos, nesta ordem:
 *
 *   R2_*  (nosso nome)            S3_*  (o que o painel da WaveHost injeta)
 *   R2_ACCOUNT_ID                 S3_ENDPOINT  (https://<conta>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID              S3_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY          S3_SECRET_ACCESS_KEY
 *   R2_BUCKET                     S3_BUCKET
 *   R2_PUBLIC_URL                 S3_PUBLIC_URL (https://pub-xxxx.r2.dev)
 *
 * POR QUE OS DOIS: a Arini contratou o armazenamento da WaveHost, que cria
 * o bucket na Cloudflare e injeta as credenciais no app como `S3_*`. Este
 * código só lia `R2_*` — não achava nada e gravava tudo no Supabase
 * Storage (882 MB em 24/09/2026). O bucket era o mesmo; só o nome das
 * variáveis não batia.
 *
 * O navegador NÃO precisa mais de `NEXT_PUBLIC_STORAGE_DRIVER`: ele pede a
 * URL pré-assinada e, se o servidor não tiver storage, cai no upload pelo
 * servidor (ver `upload.ts`).
 */

interface ConfigStorage {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

/** Lê a configuração de R2_* ou, na falta, de S3_*. `null` se incompleta. */
function configStorage(): ConfigStorage | null {
  const e = process.env;
  const endpoint = e.R2_ACCOUNT_ID
    ? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : (e.S3_ENDPOINT || "").replace(/\/$/, "");
  const cfg = {
    endpoint,
    accessKeyId: e.R2_ACCESS_KEY_ID || e.S3_ACCESS_KEY_ID || "",
    secretAccessKey: e.R2_SECRET_ACCESS_KEY || e.S3_SECRET_ACCESS_KEY || "",
    bucket: e.R2_BUCKET || e.S3_BUCKET || "",
    publicUrl: (e.R2_PUBLIC_URL || e.S3_PUBLIC_URL || "").replace(/\/$/, ""),
  };
  return Object.values(cfg).every(Boolean) ? cfg : null;
}

/**
 * Chamado nos caminhos que caem no Supabase Storage por falta de R2.
 * Em 24/09/2026 o servidor de produção estava sem as chaves do R2 e 882 MB
 * de mídia foram parar no Supabase sem ninguém perceber. Agora fica no log
 * do servidor, uma vez por processo, com o nome do que falta.
 */
let avisouSemR2 = false;
export function avisarSemR2(onde: string): void {
  if (avisouSemR2) return;
  avisouSemR2 = true;
  console.error(
    `[storage] R2 NÃO configurado — "${onde}" gravou no Supabase Storage. ` +
      "Faltam as variáveis do bucket (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, " +
      "S3_SECRET_ACCESS_KEY e S3_PUBLIC_URL — ou os equivalentes R2_*) no ambiente do servidor.",
  );
}

export function isR2Configured(): boolean {
  return configStorage() !== null;
}

let _client: S3Client | null = null;
function r2(): S3Client {
  if (_client) return _client;
  const cfg = configStorage();
  if (!cfg) throw new Error("storage não configurado (R2_* ou S3_*)");
  _client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return _client;
}

export function r2PublicUrl(key: string): string {
  return `${configStorage()?.publicUrl ?? ""}/${key}`;
}

/** Gera uma URL pré-assinada de upload (PUT) válida por alguns minutos. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: configStorage()!.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2(), cmd, { expiresIn: 600 });
}

/**
 * Sobe um buffer direto do servidor para o R2 (sem passar pelo navegador).
 * É o caminho usado pela mídia que CHEGA por webhook: o provedor entrega
 * uma URL temporária — no Telegram ela ainda carrega o token do bot e
 * morre em ~1 h — então copiamos o arquivo para o nosso storage na hora.
 */
export async function uploadBufferR2(
  key: string,
  corpo: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await r2().send(
    new PutObjectCommand({
      Bucket: configStorage()!.bucket,
      Key: key,
      Body: corpo,
      ContentType: contentType,
    }),
  );
  return r2PublicUrl(key);
}

/** Remove um objeto do bucket R2. */
export async function deleteR2Object(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: configStorage()!.bucket, Key: key }));
}
