"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field, TextInput, TextArea, SelectInput, Switch, Card, Alerta, Spinner,
} from "@/components/atendimento/ui";
import { VARIAVEIS } from "@/lib/atendimento/variaveis";
import { montarTextoMenu } from "@/lib/atendimento/menu-resposta";
import { Check, ListOrdered, Plus, Trash2, ArrowUp, ArrowDown, MessageSquare } from "lucide-react";
import type { AtendimentoTeam, AgentOption } from "@/lib/types";

export type MenuRow = {
  id: string;
  nome: string;
  ativo: boolean;
  saudacao: string;
  cabecalho: string;
  confirmacao: string;
  nao_entendi: string;
  max_tentativas: number;
  fila_escape: string | null;
  expira_minutos: number;
};

export type OpcaoRow = {
  id?: string | null;
  chave: string;
  rotulo: string;
  team_id: string | null;
  responsavel_id: string | null;
  etiqueta: string | null;
  confirmacao: string | null;
  ativo: boolean;
};

/** Amostra usada na prévia — mostra como fica COM e SEM nome do contato. */
const EXEMPLO_NOME = "Gabriel Castro";

export function MenuManager({
  menu: menuInicial,
  opcoes: opcoesIniciais,
  equipes,
  agentes,
  saudacaoDaCaixa,
  nomeDaCaixa,
  filasVazias,
  podeEditar,
}: {
  menu: MenuRow;
  opcoes: OpcaoRow[];
  equipes: AtendimentoTeam[];
  agentes: AgentOption[];
  saudacaoDaCaixa: string | null;
  nomeDaCaixa: string;
  /** Filas de destino que não têm nenhum atendente — o aviso mais útil da tela. */
  filasVazias: string[];
  podeEditar: boolean;
}) {
  const [menu, setMenu] = useState<MenuRow>(menuInicial);
  const [opcoes, setOpcoes] = useState<OpcaoRow[]>(opcoesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const campo = <K extends keyof MenuRow>(k: K, v: MenuRow[K]) => {
    setMenu((m) => ({ ...m, [k]: v }));
    setSalvo(false);
  };

  const mexerOpcao = (i: number, patch: Partial<OpcaoRow>) => {
    setOpcoes((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));
    setSalvo(false);
  };

  const mover = (i: number, d: -1 | 1) => {
    setOpcoes((os) => {
      const j = i + d;
      if (j < 0 || j >= os.length) return os;
      const c = os.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSalvo(false);
  };

  // Prévia com o texto REAL que o cliente recebe, incluindo a substituição
  // das variáveis. É o que evita descobrir "Olá, !" só depois de ativar.
  const previa = useMemo(() => {
    const bruto = montarTextoMenu(
      { saudacao: menu.saudacao, cabecalho: menu.cabecalho },
      saudacaoDaCaixa,
      opcoes.filter((o) => o.ativo && o.chave.trim()).map((o, i) => ({
        id: String(i), chave: o.chave, rotulo: o.rotulo,
      })),
    );
    const trocar = (texto: string, nome: string) =>
      texto
        .replace(/\{\{\s*saudacao_nome\s*\}\}/g, nome ? `Boa tarde, ${nome.split(" ")[0]}` : "Boa tarde")
        .replace(/\{\{\s*saudacao\s*\}\}/g, "Boa tarde")
        .replace(/\{\{\s*primeiro_nome\s*\}\}/g, nome.split(" ")[0] ?? "")
        .replace(/\{\{\s*nome\s*\}\}/g, nome)
        .replace(/\{\{\s*canal\s*\}\}/g, "WhatsApp")
        .replace(/\s*,\s*([!?.,;:])/g, "$1")
        .replace(/[ \t]{2,}/g, " ");
    return { com: trocar(bruto, EXEMPLO_NOME), sem: trocar(bruto, "") };
  }, [menu.saudacao, menu.cabecalho, opcoes, saudacaoDaCaixa]);

  const semDestino = opcoes.filter((o) => o.ativo && !o.team_id && !o.responsavel_id);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...menu, opcoes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "falha ao salvar");
      setOpcoes(
        (j.opcoes as OpcaoRow[]).map((o) => ({ ...o, ativo: o.ativo !== false })),
      );
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ListOrdered size={18} /> Menu de ramais
          </h1>
          <p className="text-sm text-muted-foreground">
            O cliente escreve no {nomeDaCaixa}, recebe as opções e escolhe o setor pelo número.
            A conversa vai direto para a fila escolhida, já triada.
          </p>
        </div>
        <Button onClick={salvar} disabled={!podeEditar || salvando}>
          {salvando ? <Spinner /> : salvo ? <Check size={15} /> : null}
          {salvo ? "Salvo" : "Salvar"}
        </Button>
      </div>

      {!podeEditar && (
        <Alerta tipo="atencao">
          Só a administração edita o menu. Você pode ver como está configurado.
        </Alerta>
      )}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* O aviso que mais importa: ramal apontando para fila sem ninguém. */}
      {filasVazias.length > 0 && (
        <Alerta tipo="atencao">
          <strong>{filasVazias.length} fila(s) de destino sem nenhum atendente:</strong>{" "}
          {filasVazias.join(", ")}. O cliente escolhe o ramal, recebe a confirmação e não há
          quem atenda. Cadastre as pessoas em Configurações › Filas antes de ativar.
        </Alerta>
      )}
      {semDestino.length > 0 && (
        <Alerta tipo="atencao">
          {semDestino.length} opção(ões) sem fila nem responsável — quem escolher essas vai
          continuar na caixa central.
        </Alerta>
      )}

      <Card
        titulo="Ligar o menu"
        descricao="Enquanto estiver desligado, nada muda no WhatsApp."
      >
        <Switch
          checked={menu.ativo}
          onChange={(v) => campo("ativo", v)}
          disabled={!podeEditar}
          label={menu.ativo ? "Ativo — todo cliente novo recebe o menu" : "Desligado"}
          dica="A partir do momento em que ligar, quem escrever pela primeira vez recebe a saudação e as opções, e a resposta roteia a conversa."
        />
      </Card>

      <Card titulo="As mensagens">
        <div className="space-y-3">
          <Field
            label="Saudação"
            dica={
              saudacaoDaCaixa
                ? `Deixe vazio para usar a saudação da caixa: "${saudacaoDaCaixa}"`
                : "Primeira frase que o cliente recebe."
            }
          >
            <TextArea
              value={menu.saudacao}
              onChange={(e) => campo("saudacao", e.target.value)}
              disabled={!podeEditar}
              rows={3}
            />
          </Field>

          <Field label="Chamada das opções" dica="A linha que vem logo antes da lista.">
            <TextInput
              value={menu.cabecalho}
              onChange={(e) => campo("cabecalho", e.target.value)}
              disabled={!podeEditar}
            />
          </Field>

          <Field label="Confirmação" dica="Enviada depois que o cliente escolhe um ramal.">
            <TextArea
              value={menu.confirmacao}
              onChange={(e) => campo("confirmacao", e.target.value)}
              disabled={!podeEditar}
              rows={2}
            />
          </Field>

          <Field
            label="Quando não entender"
            dica="Enviada junto com a lista de novo, sem repetir a saudação."
          >
            <TextInput
              value={menu.nao_entendi}
              onChange={(e) => campo("nao_entendi", e.target.value)}
              disabled={!podeEditar}
            />
          </Field>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1.5 text-xs font-medium">Variáveis que você pode usar</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
                <span
                  key={v.chave}
                  title={`${v.descricao} — ex.: ${v.exemplo}`}
                  className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] border"
                >
                  {`{{${v.chave}}}`}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              <code>{"{{saudacao_nome}}"}</code> já inclui a vírgula e o nome — e some sozinha
              quando o contato não tem nome salvo, em vez de mandar &quot;Olá, !&quot;.
            </p>
          </div>
        </div>
      </Card>

      <Card
        titulo="Os ramais"
        descricao="A ordem aqui é a ordem em que aparecem para o cliente."
        acoes={
          podeEditar ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpcoes((os) => [
                  ...os,
                  {
                    chave: String(os.length + 1), rotulo: "", team_id: null,
                    responsavel_id: null, etiqueta: null, confirmacao: null, ativo: true,
                  },
                ]);
                setSalvo(false);
              }}
            >
              <Plus size={14} /> Adicionar
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          {opcoes.map((o, i) => (
            <div key={o.id ?? `novo-${i}`} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Digita" className="w-20">
                  <TextInput
                    value={o.chave}
                    onChange={(e) => mexerOpcao(i, { chave: e.target.value })}
                    disabled={!podeEditar}
                  />
                </Field>
                <Field label="Nome do ramal" className="min-w-[180px] flex-1">
                  <TextInput
                    value={o.rotulo}
                    onChange={(e) => mexerOpcao(i, { rotulo: e.target.value })}
                    disabled={!podeEditar}
                  />
                </Field>
                <Field label="Vai para a fila" className="min-w-[160px]">
                  <SelectInput
                    value={o.team_id ?? ""}
                    onChange={(e) => mexerOpcao(i, { team_id: e.target.value || null })}
                    disabled={!podeEditar}
                  >
                    <option value="">— caixa central —</option>
                    {equipes.map((t) => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Direto para" className="min-w-[150px]">
                  <SelectInput
                    value={o.responsavel_id ?? ""}
                    onChange={(e) => mexerOpcao(i, { responsavel_id: e.target.value || null })}
                    disabled={!podeEditar}
                  >
                    <option value="">— quem pegar —</option>
                    {agentes.map((a) => (
                      <option key={a.id} value={a.id}>{a.nome}</option>
                    ))}
                  </SelectInput>
                </Field>
                <div className="flex gap-1 pb-0.5">
                  <Button variant="ghost" size="icon" disabled={!podeEditar || i === 0}
                    onClick={() => mover(i, -1)} title="Subir">
                    <ArrowUp size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={!podeEditar || i === opcoes.length - 1}
                    onClick={() => mover(i, 1)} title="Descer">
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    variant="ghost" size="icon" disabled={!podeEditar}
                    onClick={() => {
                      setOpcoes((os) => os.filter((_, j) => j !== i));
                      setSalvo(false);
                    }}
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {opcoes.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum ramal. Adicione ao menos um antes de ativar.
            </p>
          )}
        </div>
      </Card>

      <Card titulo="Quando o cliente não escolhe">
        <div className="flex flex-wrap gap-3">
          <Field label="Repetir o menu até" dica="Depois disso, desiste." className="w-40">
            <SelectInput
              value={String(menu.max_tentativas)}
              onChange={(e) => campo("max_tentativas", Number(e.target.value))}
              disabled={!podeEditar}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} vez(es)</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Aí manda para" className="min-w-[180px]">
            <SelectInput
              value={menu.fila_escape ?? ""}
              onChange={(e) => campo("fila_escape", e.target.value || null)}
              disabled={!podeEditar}
            >
              <option value="">— deixa na caixa central —</option>
              {equipes.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Esquece o menu depois de"
            dica="Um '1' que chega semanas depois não é resposta de menu."
            className="w-44"
          >
            <SelectInput
              value={String(menu.expira_minutos)}
              onChange={(e) => campo("expira_minutos", Number(e.target.value))}
              disabled={!podeEditar}
            >
              <option value="60">1 hora</option>
              <option value="360">6 horas</option>
              <option value="1440">1 dia</option>
              <option value="4320">3 dias</option>
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card
        titulo="Como o cliente vê"
        descricao="Com as variáveis já substituídas — inclusive no caso em que o contato não tem nome salvo."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MessageSquare size={12} /> Contato com nome
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2.5 text-[13px] leading-snug">
              {previa.com || "(vazio)"}
            </pre>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MessageSquare size={12} /> Contato sem nome salvo
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2.5 text-[13px] leading-snug">
              {previa.sem || "(vazio)"}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
