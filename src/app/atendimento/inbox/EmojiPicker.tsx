"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Smile, Search } from "lucide-react";

// Seletor de emoji sem dependência nova: uma lista curada por categoria,
// com busca por palavra-chave em português. Cobre o que se usa de fato num
// atendimento (saudação, aprovação, imóvel, dinheiro), sem carregar os
// ~1800 emojis do Unicode.

type Grupo = { nome: string; itens: [string, string][] };

const GRUPOS: Grupo[] = [
  {
    nome: "Frequentes",
    itens: [
      ["😊", "sorriso feliz"], ["😀", "sorriso"], ["😃", "alegre"], ["👍", "joia positivo ok curtir"],
      ["🙏", "obrigado por favor"], ["👏", "palmas parabens"], ["🤝", "acordo negocio aperto de mao"],
      ["✅", "certo feito ok concluido"], ["❤️", "coracao amor"], ["🔥", "fogo top quente"],
      ["🎉", "festa parabens comemorar"], ["😉", "piscada"],
    ],
  },
  {
    nome: "Rostos",
    itens: [
      ["😂", "risada chorando de rir"], ["🥰", "apaixonado"], ["😍", "olhos de coracao"],
      ["😅", "alivio nervoso"], ["🙂", "leve sorriso"], ["😎", "oculos estiloso"],
      ["🤔", "pensando duvida"], ["😐", "neutro"], ["😔", "triste chateado"],
      ["😢", "chorando"], ["😱", "susto"], ["🥳", "comemorando"], ["😴", "dormindo"],
      ["🤗", "abraco"], ["😇", "anjo"], ["🙃", "de cabeca para baixo"],
    ],
  },
  {
    nome: "Gestos",
    itens: [
      ["👋", "oi tchau aceno"], ["👌", "ok perfeito"], ["✌️", "paz vitoria"],
      ["🤞", "torcendo dedos cruzados"], ["👇", "abaixo"], ["👆", "acima"],
      ["👉", "direita aponta"], ["💪", "forca musculo"], ["✍️", "assinar escrever"],
      ["🫶", "coracao com as maos"], ["👊", "soco toca aqui"], ["🤙", "shaka me liga"],
    ],
  },
  {
    nome: "Imóveis",
    itens: [
      ["🏠", "casa imovel"], ["🏡", "casa com jardim"], ["🏢", "predio apartamento comercial"],
      ["🏘️", "condominio casas"], ["🏗️", "construcao obra"], ["🌳", "arvore area verde"],
      ["🌾", "fazenda rural plantacao"], ["🐄", "gado fazenda"], ["🚜", "trator rural"],
      ["🔑", "chave entrega"], ["📍", "localizacao endereco"], ["🗺️", "mapa"],
      ["🛏️", "quarto dormitorio"], ["🚿", "banheiro chuveiro"], ["🚗", "garagem vaga carro"],
      ["🏊", "piscina"],
    ],
  },
  {
    nome: "Negócio",
    itens: [
      ["💰", "dinheiro valor"], ["💵", "dinheiro nota"], ["💳", "cartao pagamento"],
      ["📄", "documento contrato"], ["📝", "anotacao proposta"], ["📊", "grafico relatorio"],
      ["📈", "alta valorizacao"], ["📉", "queda desvalorizacao"], ["🧾", "recibo boleto"],
      ["🏦", "banco financiamento"], ["⚖️", "juridico advogado"], ["🔒", "seguro garantia"],
    ],
  },
  {
    nome: "Tempo e avisos",
    itens: [
      ["📅", "agenda data"], ["🕐", "hora horario"], ["⏰", "alarme lembrete"],
      ["📞", "telefone ligar"], ["📱", "celular whatsapp"], ["✉️", "email mensagem"],
      ["⚠️", "atencao aviso"], ["❗", "importante"], ["❓", "duvida pergunta"],
      ["ℹ️", "informacao"], ["⭐", "estrela destaque"], ["🚀", "rapido lancamento"],
    ],
  },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return GRUPOS;
    const achados = GRUPOS.flatMap((g) => g.itens).filter(([, kw]) => kw.includes(q));
    return achados.length ? [{ nome: "Resultados", itens: achados }] : [];
  }, [busca]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Emoji"
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Smile size={16} />
      </button>
      {open && (
        <div className="absolute bottom-10 right-0 z-40 w-72 rounded-lg border bg-popover shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 border-b">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar emoji…"
              className="flex-1 py-2 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-2">
            {grupos.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhum emoji.</p>
            )}
            {grupos.map((g) => (
              <div key={g.nome}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {g.nome}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.itens.map(([e, kw]) => (
                    <button
                      key={e + kw}
                      type="button"
                      title={kw}
                      onClick={() => { onPick(e); setOpen(false); setBusca(""); }}
                      className="h-7 w-7 rounded hover:bg-muted text-lg leading-none flex items-center justify-center"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
