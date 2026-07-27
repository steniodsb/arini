"use client";

/**
 * =====================================================================
 * NewEventDialog — criação de compromisso.
 * =====================================================================
 *
 * A versão anterior tinha só título, tipo, data, setor e observações — e
 * a migração 0038/0039 acrescentou duração, status, local, imóvel,
 * responsável, cor e "sem data". Sem esses campos aqui, as visualizações
 * novas nasceriam sempre com os valores padrão e o quadro/timeline não
 * teriam o que mostrar.
 *
 * Também aceita valores iniciais: é o que faz o "+ Adicionar cartão" de
 * uma coluna abrir o diálogo já no dia/status/responsável daquela coluna.
 */

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENDA_STATUS_LABELS,
  AGENDA_STATUS_ORDEM,
  AGENDA_TIPO_COR,
  AGENDA_TIPO_LABELS,
  SECTOR_LABELS,
  type AgendaStatus,
  type AgendaTipo,
  type Sector,
} from "@/lib/types";
import { errMessage } from "@/lib/utils";
import { AlertCircle, Building2, Plus, X } from "lucide-react";
import { chaveDia, type Agente } from "./shared";

const TIPOS = Object.keys(AGENDA_TIPO_LABELS) as AgendaTipo[];

const SETORES: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico",
  "financeiro", "recepcao", "aluguel", "admin_central",
];

/** Durações usuais numa imobiliária — evita digitar minutos na mão. */
const DURACOES: { valor: number; rotulo: string }[] = [
  { valor: 15, rotulo: "15 min" },
  { valor: 30, rotulo: "30 min" },
  { valor: 45, rotulo: "45 min" },
  { valor: 60, rotulo: "1 hora" },
  { valor: 90, rotulo: "1h30" },
  { valor: 120, rotulo: "2 horas" },
  { valor: 180, rotulo: "3 horas" },
  { valor: 240, rotulo: "4 horas" },
  { valor: 480, rotulo: "8 horas" },
];

/** Paleta fixa: cor livre viraria arco-íris e o quadro perderia leitura. */
const CORES: string[] = [
  "#a855f7", "#3b82f6", "#f59e0b", "#ec4899",
  "#10b981", "#6366f1", "#ef4444", "#64748b",
];

interface Imovel {
  id: string;
  codigo: string;
  titulo: string | null;
}

export interface NewEventDialogProps {
  userId: string;
  sector: Sector;
  agentes?: Agente[];
  /** "AAAA-MM-DDTHH:mm" — formato do input datetime-local. */
  dataInicial?: string;
  /** Abre já marcado como "sem data" (nasce no painel lateral). */
  semDataInicial?: boolean;
  statusInicial?: AgendaStatus;
  responsavelInicial?: string;
  tipoInicial?: AgendaTipo;
  setorInicial?: Sector;
  /** Modo controlado (usado pelo "+ Adicionar cartão"). */
  open?: boolean;
  onOpenChange?: (aberto: boolean) => void;
  /** Esconde o botão próprio — quem abre é o componente de fora. */
  semGatilho?: boolean;
  onCriado?: () => void;
}

/** Agora + 1h, arredondado para a hora cheia, no formato do datetime-local. */
function proximaHoraCheia(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return `${chaveDia(d)}T${String(d.getHours()).padStart(2, "0")}:00`;
}

export function NewEventDialog({
  userId,
  sector,
  agentes = [],
  dataInicial,
  semDataInicial = false,
  statusInicial = "agendado",
  responsavelInicial,
  tipoInicial = "reuniao",
  setorInicial,
  open,
  onOpenChange,
  semGatilho = false,
  onCriado,
}: NewEventDialogProps) {
  const controlado = open !== undefined;
  const [abertoInterno, setAbertoInterno] = useState(false);
  const aberto = controlado ? open : abertoInterno;

  function definirAberto(valor: boolean) {
    if (!controlado) setAbertoInterno(valor);
    onOpenChange?.(valor);
  }

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [semData, setSemData] = useState(semDataInicial);
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [dataHora, setDataHora] = useState(dataInicial ?? proximaHoraCheia());
  const [cor, setCor] = useState<string>("");

  // Busca de imóvel por código
  const [buscaImovel, setBuscaImovel] = useState("");
  const [resultados, setResultados] = useState<Imovel[]>([]);
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const buscaRef = useRef(0);

  // Reabrir com outros valores iniciais (colunas diferentes do quadro)
  // precisa refletir na tela — o estado local não se atualiza sozinho.
  useEffect(() => {
    if (!aberto) return;
    setSemData(semDataInicial);
    setDataHora(dataInicial ?? proximaHoraCheia());
    setErro(null);
  }, [aberto, dataInicial, semDataInicial]);

  useEffect(() => {
    const termo = buscaImovel.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    // Debounce: o campo dispara a cada tecla e a tabela de imóveis é grande.
    const id = ++buscaRef.current;
    const timer = setTimeout(async () => {
      const { data } = await createSupabaseBrowser()
        .from("properties")
        .select("id, codigo, titulo")
        .ilike("codigo", `%${termo}%`)
        .limit(8);
      // Ignora resposta de uma busca que já foi superada por outra.
      if (id === buscaRef.current) setResultados((data ?? []) as Imovel[]);
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaImovel]);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const fd = new FormData(e.currentTarget);

    // `datetime-local` devolve hora LOCAL sem fuso; `new Date(...)` a
    // interpreta como local e `toISOString` converte para UTC — que é o
    // que a coluna timestamptz espera.
    const quando = semData ? null : new Date(dataHora).toISOString();

    const { error } = await createSupabaseBrowser().from("agenda_events").insert({
      titulo: fd.get("titulo"),
      tipo: fd.get("tipo"),
      data_hora: quando,
      duracao_min: Number(fd.get("duracao_min") ?? 60),
      dia_inteiro: diaInteiro,
      // Escreve SEMPRE em `status`: um trigger deriva `confirmado` daqui.
      // Gravar `confirmado` direto criaria duas verdades no banco.
      status: fd.get("status"),
      responsavel_id: (fd.get("responsavel_id") as string) || null,
      setor_destino: (fd.get("setor_destino") as string) || null,
      local: (fd.get("local") as string) || null,
      property_id: imovel?.id ?? null,
      cor: cor || null,
      observacoes: (fd.get("observacoes") as string) || null,
      criado_por: userId,
      criado_por_sector: sector,
    });

    setSalvando(false);
    if (error) {
      setErro(errMessage(error));
      return;
    }
    definirAberto(false);
    limpar();
    onCriado?.();
  }

  function limpar() {
    setImovel(null);
    setBuscaImovel("");
    setResultados([]);
    setCor("");
    setDiaInteiro(false);
  }

  return (
    <>
      {!semGatilho && (
        <Button variant="gold" onClick={() => definirAberto(true)}>
          <Plus size={16} /> Novo compromisso
        </Button>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => definirAberto(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl text-arini">Novo compromisso</h2>
              <button
                onClick={() => definirAberto(false)}
                className="text-muted-foreground hover:text-arini"
              >
                <X size={18} />
              </button>
            </div>

            {erro && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <form onSubmit={salvar} className="space-y-4">
              <div>
                <Label>Título*</Label>
                <Input
                  name="titulo"
                  required
                  placeholder="Ex.: Gravação de imóvel com o administrativo"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Tipo*</Label>
                  <Select name="tipo" defaultValue={tipoInicial} required>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {AGENDA_TIPO_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Status*</Label>
                  <Select name="status" defaultValue={statusInicial} required>
                    {AGENDA_STATUS_ORDEM.map((s) => (
                      <option key={s} value={s}>
                        {AGENDA_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Duração</Label>
                  <Select name="duracao_min" defaultValue="60">
                    {DURACOES.map((d) => (
                      <option key={d.valor} value={d.valor}>
                        {d.rotulo}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Data e hora</Label>
                  <Input
                    type="datetime-local"
                    value={dataHora}
                    onChange={(e) => setDataHora(e.target.value)}
                    disabled={semData}
                    required={!semData}
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5 pb-1">
                  <label className="flex items-center gap-2 text-sm text-arini">
                    <input
                      type="checkbox"
                      checked={semData}
                      onChange={(e) => setSemData(e.target.checked)}
                      className="rounded border-input"
                    />
                    Ainda sem data (vai para o painel lateral)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-arini">
                    <input
                      type="checkbox"
                      checked={diaInteiro}
                      onChange={(e) => setDiaInteiro(e.target.checked)}
                      className="rounded border-input"
                    />
                    Dia inteiro
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Responsável</Label>
                  <Select name="responsavel_id" defaultValue={responsavelInicial ?? ""}>
                    <option value="">— Sem responsável</option>
                    {agentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Delegar para o setor</Label>
                  <Select name="setor_destino" defaultValue={setorInicial ?? ""}>
                    <option value="">— Somente minha agenda</option>
                    {SETORES.map((s) => (
                      <option key={s} value={s}>
                        {SECTOR_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label>Local</Label>
                <Input name="local" placeholder="Endereço, sala ou link da reunião" />
              </div>

              <div>
                <Label>Imóvel (busca por código)</Label>
                {imovel ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <Building2 size={14} className="text-muted-foreground" />
                    <span className="text-arini font-medium">{imovel.codigo}</span>
                    <span className="truncate text-muted-foreground">{imovel.titulo}</span>
                    <button
                      type="button"
                      onClick={() => setImovel(null)}
                      className="ml-auto text-muted-foreground hover:text-arini"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={buscaImovel}
                      onChange={(e) => setBuscaImovel(e.target.value)}
                      placeholder="Digite o código do imóvel…"
                    />
                    {resultados.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
                        {resultados.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setImovel(r);
                                setBuscaImovel("");
                                setResultados([]);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="font-medium text-arini">{r.codigo}</span>
                              <span className="truncate text-muted-foreground">{r.titulo}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label>Cor</Label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCor("")}
                    title="Usar a cor do tipo"
                    className={`h-7 rounded-md border px-2 text-xs ${
                      cor === "" ? "border-arini text-arini" : "text-muted-foreground"
                    }`}
                  >
                    Cor do tipo
                  </button>
                  {CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-7 w-7 rounded-md ring-offset-2 transition-shadow ${
                        cor === c ? "ring-2 ring-arini" : ""
                      }`}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                  <span
                    className="ml-1 h-7 w-7 rounded-md border"
                    style={{ backgroundColor: cor || AGENDA_TIPO_COR[tipoInicial] }}
                    title="Prévia"
                  />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea name="observacoes" rows={2} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => definirAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gold" disabled={salvando}>
                  {salvando ? "Salvando..." : semData ? "Salvar sem data" : "Agendar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
