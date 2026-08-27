"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Search, UserRound, Check } from "lucide-react";
import {
  TIME_ENTRY_LABELS, type ColaboradorTerminal, type TimeEntryType,
} from "@/lib/types";

// Próximo registro sugerido a partir do último batido pela PESSOA.
const NEXT: Record<string, TimeEntryType> = {
  entrada: "intervalo_inicio",
  intervalo_inicio: "intervalo_fim",
  intervalo_fim: "saida",
  saida: "entrada",
};
const ALL: TimeEntryType[] = ["entrada", "intervalo_inicio", "intervalo_fim", "saida"];

/**
 * Terminal de ponto do setor central.
 *
 * "Em vez da gente deixar o ponto para cada um abrir no seu computador, a
 * gente deixa essa parte de ponto só pro setor central. Aí quando eles
 * chegam, eles vêm no principal e marcam o ponto." (Carlos, 21/08)
 *
 * QUEM É QUEM AQUI
 * ----------------
 * A máquina está logada numa conta só — a da recepção. Então:
 *   · `user_id`        = a conta que operou o terminal (a RLS exige que
 *                        seja o próprio auth.uid(), e continua exigindo)
 *   · `colaborador_id` = de quem é o ponto
 * Sem essa separação, o terminal seria impossível: ou todo mundo bateria
 * ponto como "Recepção", ou cada pessoa precisaria de login próprio — que
 * é justamente o que não existe e o que causou o bug do marketing.
 *
 * VOLTA AO ZERO DEPOIS DE BATER
 * -----------------------------
 * A tela limpa a seleção sozinha. Num terminal com fila, deixar a pessoa
 * anterior selecionada é o caminho curto para o próximo da fila bater
 * ponto no nome de quem acabou de sair.
 */
export function Terminal({
  colaboradores,
  operadorId,
  ultimoPorColaborador,
}: {
  colaboradores: ColaboradorTerminal[];
  operadorId: string;
  /** Último tipo batido por cada colaborador, para sugerir o próximo. */
  ultimoPorColaborador: Record<string, TimeEntryType>;
}) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<ColaboradorTerminal | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimos, setUltimos] = useState(ultimoPorColaborador);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return colaboradores;
    return colaboradores.filter(
      (c) => c.nome.toLowerCase().includes(q) || (c.codigo ?? "").toLowerCase().includes(q),
    );
  }, [colaboradores, busca]);

  const sugerido: TimeEntryType = sel
    ? NEXT[ultimos[sel.id] ?? ""] ?? "entrada"
    : "entrada";

  async function bater(tipo: TimeEntryType) {
    if (!sel) return;
    setBusy(true);
    setErro(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("time_entries").insert({
      user_id: operadorId,
      colaborador_id: sel.id,
      tipo,
      origem: "terminal",
    });
    setBusy(false);
    if (error) { setErro(`Não foi possível registrar: ${error.message}`); return; }

    setUltimos((u) => ({ ...u, [sel.id]: tipo }));
    setOk(`${TIME_ENTRY_LABELS[tipo]} de ${sel.nome} às ${new Date().toLocaleTimeString("pt-BR")}`);
    setBusca("");
    setSel(null);
    // O aviso some sozinho — num terminal ninguém fecha caixinha.
    setTimeout(() => setOk(null), 6000);
  }

  return (
    <div className="space-y-4">
      {ok && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-2">
          <Check size={18} className="text-emerald-600 shrink-0" />
          <span className="text-emerald-800 dark:text-emerald-300 font-medium">{ok}</span>
        </div>
      )}
      {erro && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-700">{erro}</div>
      )}

      {!sel ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Digite seu nome ou código…"
                className="pl-9 h-12 text-base"
                aria-label="Buscar colaborador"
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSel(c)}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left hover:border-gold hover:bg-gold/5 transition-colors"
                >
                  <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserRound size={17} className="text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{c.nome}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {c.codigo ? `#${c.codigo}` : ""}{c.codigo && c.cargo ? " · " : ""}{c.cargo ?? ""}
                    </span>
                  </span>
                </button>
              ))}
              {filtrados.length === 0 && (
                <p className="col-span-full py-8 text-center text-muted-foreground text-sm">
                  {colaboradores.length === 0
                    ? "Nenhum colaborador cadastrado ainda."
                    : "Ninguém encontrado com esse nome ou código."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-gold/15 flex items-center justify-center">
                <UserRound size={22} className="text-gold-dark" />
              </span>
              <div className="min-w-0">
                <div className="text-xl font-semibold text-arini truncate">{sel.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {sel.cargo ?? "—"}{sel.codigo ? ` · #${sel.codigo}` : ""}
                </div>
              </div>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSel(null)}>
                Não sou eu
              </Button>
            </div>

            <div className="flex items-center gap-3 border-t pt-4">
              <Clock className="text-gold-dark shrink-0" />
              <div>
                <div className="text-sm text-muted-foreground">Próximo registro</div>
                <div className="text-xl text-arini font-semibold">{TIME_ENTRY_LABELS[sugerido]}</div>
              </div>
            </div>

            <Button
              variant="gold" size="lg" disabled={busy}
              className="w-full h-14 text-base"
              onClick={() => bater(sugerido)}
            >
              {busy ? "Registrando…" : `Bater ponto — ${TIME_ENTRY_LABELS[sugerido]}`}
            </Button>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground w-full">Ou registre outro tipo:</span>
              {ALL.filter((t) => t !== sugerido).map((t) => (
                <Button key={t} type="button" size="sm" variant="outline" disabled={busy} onClick={() => bater(t)}>
                  {TIME_ENTRY_LABELS[t]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
