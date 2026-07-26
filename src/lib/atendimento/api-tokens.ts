import crypto from "crypto";

// =====================================================================
// Tokens de API do Atendimento — geração e hash.
//
// Por que isto mora aqui e não dentro de route.ts:
//   o Next 14 valida os exports de um `app/**/route.ts` contra uma lista
//   fechada (GET/POST/PUT/... + config). Qualquer export extra — inclusive
//   um helper puro como `hashToken` — quebra o `next build` com
//   "is not a valid Route export field". Como o objetivo é justamente
//   reusar o hash depois (no middleware que vai autenticar a API pública),
//   ele fica num módulo normal e a rota importa.
// =====================================================================

/** Prefixo humano do token — deixa óbvio de onde a chave veio se vazar. */
export const TOKEN_PREFIXO = "arini_";

/** Quantos caracteres do token guardamos em claro só para identificação. */
export const TAMANHO_PREFIXO = 14;

/**
 * sha256 em hex. É o que vai para `token_hash`.
 *
 * Não usamos bcrypt/argon2 de propósito: token de API é um segredo de 256
 * bits gerado por nós, não uma senha escolhida por humano — não há
 * dicionário para atacar, e o hash precisa ser rápido porque roda em TODA
 * requisição autenticada.
 */
export function hashToken(t: string): string {
  return crypto.createHash("sha256").update(t).digest("hex");
}

/** Gera um token novo em claro: `arini_` + 32 bytes aleatórios em hex. */
export function gerarToken(): string {
  return TOKEN_PREFIXO + crypto.randomBytes(32).toString("hex");
}

/** Os primeiros caracteres, para o usuário reconhecer a chave na lista. */
export function prefixoDe(token: string): string {
  return token.slice(0, TAMANHO_PREFIXO);
}
