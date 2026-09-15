"use client";

import { useMemo } from "react";
import { SECTOR_LABELS, type ChatItemLista, type ChatPessoa } from "@/lib/types";
import { fmtHoraBR, fmtBR, isoDiaBR, inicioDoDiaBR } from "@/lib/fuso";
import { Hash, Search, Plus } from "lucide-react";

/**
 * A lista da esquerda: PESSOAS e SETORES na mesma coluna.
 *
 * Por que os dois juntos: cinco dos sete setores da Arini têm uma pessoa
 * só. Separar em abas "pessoas" e "setores" obrigaria a lembrar se a Ana
 * é "Jurídico" ou "Ana" antes de cada mensagem — a mesma fricção que faz
 * o time voltar para o WhatsApp.
 */

/**
 * "14:32" hoje, "ontem", ou "12/09" — o carimbo curto da lista.
 *
 * Compara pelo DIA EM SÃO PAULO, não pelo relógio de quem renderiza.
 * Esta é client component, mas o Next renderiza client component no
 * servidor também — e lá o relógio é UTC, então `getDate()` cru marcaria
 * "ontem" como "12/09" (ou o contrário) na primeira pintura da tela.
 */
function quando(iso: string): string {
  const hojeBR = isoDiaBR();
  const diaBR = isoDiaBR(new Date(iso));
  if (diaBR === hojeBR) return fmtHoraBR(iso);
  // Uma hora ANTES da meia-noite de São Paulo cai sempre no dia anterior,
  // sem precisar mexer em número de dia nem em mês.
  const ontemBR = isoDiaBR(new Date(inicioDoDiaBR().getTime() - 3_600_000));
  if (diaBR === ontemBR) return "ontem";
  return fmtBR(iso, { day: "2-digit", month: "2-digit" });
}

function Inicial({ nome }: { nome: string }) {
  return (
    <span className="w-8 h-8 shrink-0 rounded-full bg-arini/10 dark:bg-gold/15 text-arini dark:text-gold grid place-items-center text-xs font-semibold">
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ListaConversas({
  itens, pessoas, selecionada, busca, onBusca, onSelecionar, onAbrirCom, totalNaoLidas,
}: {
  itens: ChatItemLista[];
  pessoas: ChatPessoa[];
  selecionada: string | null;
  busca: string;
  onBusca: (v: string) => void;
  onSelecionar: (id: string) => void;
  onAbrirCom: (pessoaId: string) => void;
  totalNaoLidas: number;
}) {
  const q = busca.trim().toLowerCase();

  const { setores, diretas, semConversa } = useMemo(() => {
    const visiveis = itens.filter(
      (i) => !i.arquivada && (!q || i.titulo.toLowerCase().includes(q)),
    );
    const setores = visiveis.filter((i) => i.conversa.tipo === "setor");

    // Conversa direta sem nenhuma mensagem ainda não ocupa espaço na
    // lista: ela aparece em "começar conversa" até alguém escrever.
    const diretas = visiveis.filter(
      (i) => i.conversa.tipo === "direta" && i.conversa.ultima_previa !== null,
    );

    const comConversa = new Set(
      diretas.map((i) => i.outro?.id).filter(Boolean) as string[],
    );
    const semConversa = pessoas.filter(
      (p) => !comConversa.has(p.id) && (!q || p.nome.toLowerCase().includes(q)),
    );

    return { setores, diretas, semConversa };
  }, [itens, pessoas, q]);

  return (
    <>
      <div className="p-2.5 border-b shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="font-display text-lg text-arini dark:text-gold">Chat</h1>
          {totalNaoLidas > 0 && (
            <span className="text-[11px] rounded-full bg-gold-dark text-arini font-bold px-1.5 py-0.5 min-w-[20px] text-center">
              {totalNaoLidas}
            </span>
          )}
        </div>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar pessoa ou setor…"
            className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {diretas.length > 0 && (
          <Secao titulo="Conversas">
            {diretas.map((i) => (
              <Linha
                key={i.conversa.id}
                item={i}
                ativa={i.conversa.id === selecionada}
                onClick={() => onSelecionar(i.conversa.id)}
              />
            ))}
          </Secao>
        )}

        {setores.length > 0 && (
          <Secao titulo="Setores">
            {setores.map((i) => (
              <Linha
                key={i.conversa.id}
                item={i}
                ativa={i.conversa.id === selecionada}
                onClick={() => onSelecionar(i.conversa.id)}
              />
            ))}
          </Secao>
        )}

        {semConversa.length > 0 && (
          <Secao titulo="Começar conversa">
            {semConversa.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAbrirCom(p.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/60 text-left"
              >
                <Inicial nome={p.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{p.nome}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {SECTOR_LABELS[p.sector]}
                  </span>
                </span>
                <Plus size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </Secao>
        )}

        {diretas.length === 0 && setores.length === 0 && semConversa.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground text-center">
            Nada encontrado para “{busca}”.
          </p>
        )}
      </div>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Linha({
  item, ativa, onClick,
}: {
  item: ChatItemLista;
  ativa: boolean;
  onClick: () => void;
}) {
  const ehSetor = item.conversa.tipo === "setor";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
        ativa ? "bg-arini/10 dark:bg-gold/15" : "hover:bg-muted/60"
      }`}
    >
      {ehSetor ? (
        <span className="w-8 h-8 shrink-0 rounded-full bg-gold/15 text-gold-dark grid place-items-center">
          <Hash size={14} />
        </span>
      ) : (
        <Inicial nome={item.titulo} />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={`text-sm truncate flex-1 ${
              item.naoLidas > 0 ? "font-semibold text-arini dark:text-gold" : ""
            }`}
          >
            {item.titulo}
          </span>
          {item.conversa.ultima_previa && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {quando(item.conversa.ultima_em)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="block text-[11px] text-muted-foreground truncate flex-1">
            {item.conversa.ultima_previa ?? "Sem mensagens ainda"}
          </span>
          {item.naoLidas > 0 && (
            <span className="text-[10px] rounded-full bg-gold-dark text-arini font-bold px-1.5 min-w-[18px] text-center shrink-0">
              {item.naoLidas}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
