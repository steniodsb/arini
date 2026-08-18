// =====================================================================
// De qual LINHA de `social_integrations` cada plataforma da Meta lê.
//
// O PROBLEMA QUE ISTO RESOLVE
// ---------------------------
// A tela Atendimento › Canais › Redes sociais oferece quatro cartões —
// Instagram, Facebook, Messenger e TikTok. Só que a tabela tem um CHECK
// que aceita apenas `instagram | facebook | whatsapp | tiktok`: NÃO
// EXISTE (nem pode existir) linha `messenger`.
//
// O efeito era um beco sem saída silencioso: o PUT das credenciais fazia
// `update ... where plataforma = 'messenger'`, atingia zero linhas e
// respondia `ok: true`. A tela dizia "salvo" e continuava listando
// "falta o token"; o handshake em `/api/webhooks/messenger` respondia
// 403 para sempre, porque não havia verify_token nenhum para comparar.
//
// POR QUE ALIAS EM VEZ DE CRIAR A LINHA
// -------------------------------------
// Messenger É a caixa de mensagens da própria Página do Facebook: mesma
// Página, mesmo Page ID, mesmo Access Token, mesmo App Secret. Duas
// linhas significariam dois tokens para manter em dia — e, no dia em que
// divergissem, um canal responderia e o outro não, sem nada na tela
// explicando por quê. É o mesmo motivo pelo qual `meta-messaging.ts` já
// aceitava "facebook" como credencial do canal `messenger`.
//
// Consequência prática: as DUAS URLs de webhook funcionam —
// `/api/webhooks/facebook` e `/api/webhooks/messenger` — com o mesmo
// Verify Token. Vale a que estiver cadastrada no app da Meta.
// =====================================================================

/** Linha de `social_integrations` que atende esta plataforma de webhook. */
export function linhaSocialDaPlataforma(plataforma: string): string {
  return plataforma === "messenger" ? "facebook" : plataforma;
}
