"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { MessageCircle } from "lucide-react";

// =====================================================================
// Atalho flutuante para o Chat interno.
//
// O QUE ISTO ERA ANTES, E POR QUE MUDOU
// -------------------------------------
// Era uma mini-caixa de mensagens com três defeitos que, somados,
// ensinavam o time a ignorá-la:
//   · buscava de 60 em 60 segundos — uma resposta demorava até um minuto
//     para aparecer, e ninguém conversa assim;
//   · só listava o que você RECEBEU. Ao enviar, o campo limpava e nada
//     aparecia: não existia fio da conversa em lugar nenhum;
//   · o número vermelho contava mensagens NÃO RESOLVIDAS, não não-lidas.
//     Mensagem lida ontem continuava contando, então o número perdia o
//     sentido e as pessoas paravam de olhar.
//
// Agora ele faz uma coisa só, e faz certo: mostra quantas mensagens
// esperam por você e leva ao chat. Conversa acontece na página, que tem
// espaço para o fio inteiro.
// =====================================================================

export function ChatWidget({ userId }: { userId: string }) {
  const [naoLidas, setNaoLidas] = useState(0);
  const pathname = usePathname();

  const contar = useCallback(async () => {
    const supabase = createSupabaseBrowser();

    // As conversas em que eu participo, com até onde eu li.
    const { data: parts } = await supabase
      .from("chat_participantes")
      .select("conversa_id, lido_em")
      .eq("profile_id", userId)
      .eq("arquivada", false);
    const minhas = (parts ?? []) as { conversa_id: string; lido_em: string | null }[];
    if (minhas.length === 0) { setNaoLidas(0); return; }

    const { data: msgs } = await supabase
      .from("chat_mensagens")
      .select("conversa_id, autor_id, created_at")
      .in("conversa_id", minhas.map((p) => p.conversa_id))
      .neq("autor_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    const lidoPor = new Map(minhas.map((p) => [p.conversa_id, p.lido_em ? +new Date(p.lido_em) : 0]));
    const n = ((msgs ?? []) as { conversa_id: string; created_at: string }[]).filter(
      (m) => +new Date(m.created_at) > (lidoPor.get(m.conversa_id) ?? 0),
    ).length;
    setNaoLidas(n);
  }, [userId]);

  useEffect(() => { void contar(); }, [contar, pathname]);

  // Tempo real em vez de polling: o contador reage à mensagem que chega,
  // não ao relógio.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const canal = supabase
      .channel("chat-widget")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens" },
        () => { void contar(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [contar]);

  // Dentro do próprio chat o botão seria ruído — e o contador estaria
  // sempre zerando na frente de quem está lendo.
  if (pathname?.startsWith("/admin/chat")) return null;

  return (
    <Link
      href="/admin/chat"
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-arini text-white shadow-xl hover:scale-105 transition flex items-center justify-center"
      title={naoLidas > 0 ? `${naoLidas} mensagem(ns) não lida(s)` : "Chat da equipe"}
    >
      <MessageCircle size={22} />
      {naoLidas > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gold-dark text-arini text-[11px] font-bold flex items-center justify-center">
          {naoLidas > 99 ? "99+" : naoLidas}
        </span>
      )}
    </Link>
  );
}
