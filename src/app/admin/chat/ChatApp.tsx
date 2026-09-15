"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { abrirDireta, montarLista } from "@/lib/chat";
import { uploadAtendimentoMedia } from "@/lib/upload";
import { errMessage } from "@/lib/utils";
import {
  SECTOR_LABELS,
  type ChatItemLista,
  type ChatMensagem,
  type ChatPessoa,
  type Sector,
  type SectorObservation,
} from "@/lib/types";
import { ListaConversas } from "./ListaConversas";
import { Thread } from "./Thread";
import { CampoEnvio } from "./CampoEnvio";
import { Hash, MessageSquare, ArrowLeft } from "lucide-react";

// =====================================================================
// CHAT INTERNO — a tela.
//
// FORMATO: lista à esquerda, fio à direita, campo embaixo. É o mesmo
// desenho do inbox do Atendimento de propósito: o time já usa aquilo
// todo dia, e reaproveitar o modelo mental sai de graça.
//
// O QUE ISTO SUBSTITUI: a página "Comunicação entre setores", que
// separava a MESMA conversa em abas "Recebidas" e "Enviadas", e o widget
// flutuante, que fazia polling de 60s, só listava o que você recebeu e
// contava "não resolvidas" como se fossem não lidas.
// =====================================================================

export function ChatApp({
  meuId, meuNome, meuSetor, pessoas, itensIniciais, observacoes, imoveis,
}: {
  meuId: string;
  meuNome: string;
  meuSetor: Sector;
  pessoas: ChatPessoa[];
  itensIniciais: ChatItemLista[];
  observacoes: SectorObservation[];
  imoveis: Record<string, { codigo: string; titulo: string | null }>;
}) {
  const [itens, setItens] = useState<ChatItemLista[]>(itensIniciais);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [respondendoA, setRespondendoA] = useState<ChatMensagem | null>(null);

  // No celular a tela não cabe dividida: ou a lista, ou o fio.
  const [mostrandoFio, setMostrandoFio] = useState(false);

  const supa = useCallback(() => createSupabaseBrowser(), []);
  const fimRef = useRef<HTMLDivElement | null>(null);

  const item = itens.find((i) => i.conversa.id === selecionada) ?? null;

  const porPessoa = useMemo(() => {
    const m = new Map(pessoas.map((p) => [p.id, p]));
    m.set(meuId, { id: meuId, nome: meuNome, sector: meuSetor, avatar_url: null });
    return m;
  }, [pessoas, meuId, meuNome, meuSetor]);

  // ------------------------------------------------------------------
  // Carregamento
  // ------------------------------------------------------------------
  /** Devolve o `created_at` da última mensagem — o carimbo de "li até aqui". */
  const carregarMensagens = useCallback(async (convId: string): Promise<string | null> => {
    const { data } = await supa()
      .from("chat_mensagens")
      .select("*")
      .eq("conversa_id", convId)
      .order("created_at", { ascending: true });
    const lista = (data ?? []) as ChatMensagem[];
    setMensagens(lista);
    return lista.length > 0 ? lista[lista.length - 1].created_at : null;
  }, [supa]);

  const recarregarLista = useCallback(async () => {
    const novos = await montarLista(supa(), meuId, pessoas);
    setItens(novos);
  }, [supa, meuId, pessoas]);

  /**
   * Marca como lida até o `created_at` da última mensagem vista.
   *
   * Por que NÃO `new Date()`: esse timestamp vem do relógio do navegador,
   * e o `created_at` das mensagens vem do banco. Máquina adiantada faria
   * mensagem nova nascer "lida" (o carimbo estaria no futuro dela);
   * máquina atrasada deixaria mensagem lida contando como não lida para
   * sempre. Comparar dois relógios diferentes é o bug — usar o carimbo do
   * próprio banco elimina a comparação.
   *
   * Sem mensagem nenhuma (conversa vazia) cai no relógio local, que aí é
   * inofensivo: não há o que contar.
   */
  const marcarLida = useCallback(async (convId: string, ate?: string | null) => {
    await supa()
      .from("chat_participantes")
      .upsert(
        { conversa_id: convId, profile_id: meuId, lido_em: ate ?? new Date().toISOString() },
        { onConflict: "conversa_id,profile_id" },
      );
    setItens((prev) =>
      prev.map((i) => (i.conversa.id === convId ? { ...i, naoLidas: 0 } : i)),
    );
  }, [supa, meuId]);

  useEffect(() => {
    if (!selecionada) return;
    const conv = selecionada;
    setCarregando(true);
    setRespondendoA(null);
    // Marca lida DEPOIS de carregar, com o carimbo da última mensagem que
    // de fato apareceu na tela — nunca antes, senão marcaria como lido o
    // que ainda não foi mostrado.
    carregarMensagens(conv)
      .then((ultima) => marcarLida(conv, ultima))
      .finally(() => setCarregando(false));
  }, [selecionada, carregarMensagens, marcarLida]);

  // Rola para o fim quando a thread muda.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "auto" });
  }, [mensagens.length, selecionada]);

  // ------------------------------------------------------------------
  // Tempo real — o mesmo `postgres_changes` do inbox do Atendimento.
  // É o que separa isto do widget antigo, que buscava de 60 em 60s.
  // ------------------------------------------------------------------
  useEffect(() => {
    const supabase = supa();
    const canal = supabase
      .channel("chat-interno")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens" },
        (payload) => {
          const nova = payload.new as ChatMensagem;
          // Mensagem da conversa aberta entra no fio na hora. A checagem
          // de duplicata existe porque quem envia já insere localmente
          // para a bolha aparecer sem esperar a ida ao servidor.
          if (nova.conversa_id === selecionada) {
            setMensagens((prev) =>
              prev.some((m) => m.id === nova.id) ? prev : [...prev, nova],
            );
            // Carimbo da própria mensagem que acabou de chegar, pelo mesmo
            // motivo: é hora do banco, não do navegador.
            if (nova.autor_id !== meuId) void marcarLida(nova.conversa_id, nova.created_at);
          }
          void recarregarLista();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [supa, selecionada, meuId, marcarLida, recarregarLista]);

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  async function abrirConversaCom(pessoaId: string) {
    setErro(null);
    const id = await abrirDireta(supa(), meuId, pessoaId);
    if (!id) { setErro("Não deu para abrir a conversa."); return; }
    await recarregarLista();
    setSelecionada(id);
    setMostrandoFio(true);
  }

  function selecionar(convId: string) {
    setSelecionada(convId);
    setMostrandoFio(true);
  }

  async function enviar({ texto, arquivos }: { texto: string; arquivos: File[] }) {
    if (!selecionada || enviando) return;
    setEnviando(true);
    setErro(null);
    const supabase = supa();

    try {
      // Anexos primeiro, um por mensagem — igual ao Atendimento.
      for (const file of arquivos) {
        try {
          const up = await uploadAtendimentoMedia(supabase, selecionada, file);
          const { data, error } = await supabase
            .from("chat_mensagens")
            .insert({
              conversa_id: selecionada,
              autor_id: meuId,
              texto: null,
              media_url: up.url,
              media_nome: up.nome,
              media_mime: up.mime,
              media_tamanho: up.tamanho,
              responde_a: respondendoA?.id ?? null,
            })
            .select()
            .single();
          if (error) throw new Error(error.message);
          setMensagens((p) =>
            p.some((m) => m.id === (data as ChatMensagem).id) ? p : [...p, data as ChatMensagem],
          );
        } catch (e) {
          setErro(`Anexo "${file.name}": ${errMessage(e)}`);
        }
      }

      if (texto.trim()) {
        const { data, error } = await supabase
          .from("chat_mensagens")
          .insert({
            conversa_id: selecionada,
            autor_id: meuId,
            texto: texto.trim(),
            responde_a: respondendoA?.id ?? null,
          })
          .select()
          .single();
        if (error) { setErro(error.message); return; }
        setMensagens((p) =>
          p.some((m) => m.id === (data as ChatMensagem).id) ? p : [...p, data as ChatMensagem],
        );
      }

      setRespondendoA(null);
      void recarregarLista();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(id: string) {
    const agora = new Date().toISOString();
    await supa().from("chat_mensagens").update({ apagada_em: agora }).eq("id", id);
    setMensagens((p) => p.map((m) => (m.id === id ? { ...m, apagada_em: agora } : m)));
  }

  // Delegações do setor desta conversa — só na conversa de setor.
  const delegacoes = useMemo(() => {
    if (!item || item.conversa.tipo !== "setor") return [];
    return observacoes.filter((o) => o.target_sector === item.conversa.setor);
  }, [item, observacoes]);

  const totalNaoLidas = itens.reduce((s, i) => s + i.naoLidas, 0);

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-lg border overflow-hidden bg-card">
      {/* ---------------- Lista ---------------- */}
      <aside
        className={`w-full sm:w-[300px] sm:shrink-0 border-r flex-col ${
          mostrandoFio ? "hidden sm:flex" : "flex"
        }`}
      >
        <ListaConversas
          itens={itens}
          pessoas={pessoas}
          selecionada={selecionada}
          busca={busca}
          onBusca={setBusca}
          onSelecionar={selecionar}
          onAbrirCom={abrirConversaCom}
          totalNaoLidas={totalNaoLidas}
        />
      </aside>

      {/* ---------------- Fio ---------------- */}
      <section className={`flex-1 min-w-0 flex-col ${mostrandoFio ? "flex" : "hidden sm:flex"}`}>
        {!item ? (
          <div className="flex-1 grid place-items-center text-center p-6">
            <div className="max-w-xs">
              <MessageSquare size={32} className="mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Escolha uma conversa à esquerda, ou comece uma nova com alguém da equipe.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-3 py-2 border-b flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMostrandoFio(false)}
                className="sm:hidden p-1 -ml-1 text-muted-foreground hover:text-arini"
                aria-label="Voltar para a lista"
              >
                <ArrowLeft size={18} />
              </button>
              {item.conversa.tipo === "setor" ? (
                <Hash size={16} className="text-gold-dark shrink-0" />
              ) : null}
              <div className="min-w-0">
                <p className="font-semibold text-arini dark:text-gold truncate leading-tight">
                  {item.titulo}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.conversa.tipo === "setor"
                    ? "Todo mundo do setor vê e responde"
                    : SECTOR_LABELS[item.outro?.sector ?? meuSetor]}
                </p>
              </div>
            </header>

            <Thread
              mensagens={mensagens}
              carregando={carregando}
              meuId={meuId}
              porPessoa={porPessoa}
              delegacoes={delegacoes}
              imoveis={imoveis}
              onResponder={setRespondendoA}
              onApagar={apagar}
              fimRef={fimRef}
            />

            {erro && (
              <p className="px-3 py-1.5 text-xs text-red-600 border-t bg-red-500/5 shrink-0">
                {erro}
              </p>
            )}

            <CampoEnvio
              enviando={enviando}
              respondendoA={respondendoA}
              autorDaResposta={
                respondendoA?.autor_id ? porPessoa.get(respondendoA.autor_id)?.nome ?? null : null
              }
              onCancelarResposta={() => setRespondendoA(null)}
              onEnviar={enviar}
            />
          </>
        )}
      </section>
    </div>
  );
}
