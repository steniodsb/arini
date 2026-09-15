// =====================================================================
// Chat interno — montagem da lista e abertura de conversa.
//
// Mora aqui, e não na página, porque a mesma montagem serve à página
// inteira e ao contador do menu. Duas cópias divergiriam no primeiro
// ajuste, e a divergência apareceria como "o sino diz 3, a tela diz 1".
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SECTOR_LABELS,
  type ChatConversa,
  type ChatItemLista,
  type ChatPessoa,
  type Sector,
} from "./types";

/** Par ordenado — `membro_a < membro_b` é a normalização que o banco exige. */
export function parOrdenado(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Todo mundo que pode conversar: pessoas ativas, menos eu.
 *
 * Sem filtro por setor de propósito — numa equipe de 10 pessoas, esconder
 * alguém da lista só faria a pessoa voltar para o WhatsApp para falar com
 * quem o sistema não mostra.
 */
export async function listarPessoas(
  supabase: SupabaseClient,
  exceto: string,
): Promise<ChatPessoa[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, nome, sector, avatar_url")
    .eq("ativo", true)
    .neq("id", exceto)
    .order("nome");
  return (data ?? []) as ChatPessoa[];
}

/**
 * A lista da esquerda, pronta para renderizar.
 *
 * As não lidas são contadas por conversa comparando `created_at` da
 * mensagem com o `lido_em` do participante. É uma consulta a mais, mas
 * evita a alternativa: um contador denormalizado que precisa ser
 * decrementado em todo lugar que abre conversa — e que fica errado na
 * primeira vez que alguém esquecer.
 */
export async function montarLista(
  supabase: SupabaseClient,
  meuId: string,
  pessoas: ChatPessoa[],
): Promise<ChatItemLista[]> {
  const { data: convsRaw } = await supabase
    .from("chat_conversas")
    .select("*")
    .order("ultima_em", { ascending: false });
  const convs = (convsRaw ?? []) as ChatConversa[];
  if (convs.length === 0) return [];

  const { data: partsRaw } = await supabase
    .from("chat_participantes")
    .select("conversa_id, lido_em, arquivada")
    .eq("profile_id", meuId);
  const meus = new Map(
    ((partsRaw ?? []) as { conversa_id: string; lido_em: string | null; arquivada: boolean }[])
      .map((p) => [p.conversa_id, p]),
  );

  // Uma consulta só para as não lidas de TODAS as conversas: traz os
  // autores e as datas e conta em memória. Com o volume de um time de 10
  // pessoas isso é mais barato que N consultas com `count`.
  const { data: msgsRaw } = await supabase
    .from("chat_mensagens")
    .select("conversa_id, autor_id, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  const msgs = (msgsRaw ?? []) as {
    conversa_id: string; autor_id: string | null; created_at: string;
  }[];

  const porPessoa = new Map(pessoas.map((p) => [p.id, p]));

  const itens: ChatItemLista[] = convs.map((conversa) => {
    const meu = meus.get(conversa.id);
    const lidoEm = meu?.lido_em ? +new Date(meu.lido_em) : 0;

    // Mensagem minha nunca conta como não lida — eu acabei de escrevê-la.
    const naoLidas = msgs.filter(
      (m) =>
        m.conversa_id === conversa.id &&
        m.autor_id !== meuId &&
        +new Date(m.created_at) > lidoEm,
    ).length;

    let titulo: string;
    let outro: ChatPessoa | null = null;
    if (conversa.tipo === "setor") {
      titulo = SECTOR_LABELS[conversa.setor as Sector] ?? "Setor";
    } else {
      const outroId = conversa.membro_a === meuId ? conversa.membro_b : conversa.membro_a;
      outro = (outroId && porPessoa.get(outroId)) || null;
      titulo = outro?.nome ?? "Conversa";
    }

    return { conversa, titulo, outro, naoLidas, arquivada: meu?.arquivada ?? false };
  });

  // Conversa direta que ainda não existe não aparece aqui — quem monta a
  // lista de "começar conversa" é a tela, a partir de `pessoas`.
  return itens;
}

/**
 * Acha ou cria a conversa direta com alguém.
 *
 * O `select` antes do `insert` não é otimização: é o caminho normal. O
 * `insert` só roda na primeira conversa entre duas pessoas, e o índice
 * único do par ordenado é quem garante que duas abas abertas ao mesmo
 * tempo não criem duas conversas — por isso o erro de conflito relê em
 * vez de estourar.
 */
export async function abrirDireta(
  supabase: SupabaseClient,
  meuId: string,
  outroId: string,
): Promise<string | null> {
  const [a, b] = parOrdenado(meuId, outroId);

  const achar = async () => {
    const { data } = await supabase
      .from("chat_conversas")
      .select("id")
      .eq("tipo", "direta")
      .eq("membro_a", a)
      .eq("membro_b", b)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  let id = await achar();

  if (!id) {
    const { data, error } = await supabase
      .from("chat_conversas")
      .insert({ tipo: "direta", membro_a: a, membro_b: b })
      .select("id")
      .maybeSingle();
    // Corrida: o outro lado criou entre o nosso select e o insert. Relê.
    if (error) id = await achar();
    else id = (data?.id as string | undefined) ?? null;
  }

  if (!id) return null;

  // Os dois entram como participantes — é o que faz a conversa aparecer
  // na lista de quem recebeu, antes mesmo de responder.
  await supabase
    .from("chat_participantes")
    .upsert(
      [
        { conversa_id: id, profile_id: a },
        { conversa_id: id, profile_id: b },
      ],
      { onConflict: "conversa_id,profile_id", ignoreDuplicates: true },
    );

  return id;
}
