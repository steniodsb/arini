"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, TextArea, SelectInput,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_STATUS_LABELS,
  type TemplateCategory,
  type TemplateStatus,
  type WhatsappTemplate,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import {
  Plus, Trash2, FileText, RefreshCw, Send, MessageSquareText,
} from "lucide-react";

// =====================================================================
// Templates de mensagem do WhatsApp.
//
// O PORQUÊ desta tela: fora da janela de 24 h desde a última mensagem do
// cliente, a Meta só entrega mensagem baseada em TEMPLATE APROVADO. Ou
// seja, campanha de WhatsApp pela API oficial depende inteiramente disto.
//
// O que é local e o que é da Meta:
//   · criar/editar o texto aqui é 100% local (status "local");
//   · o status de verdade (PENDING/APPROVED/REJECTED) é da Meta e só muda
//     lá — por isso existe o botão "Sincronizar";
//   · template já submetido NÃO pode ser editado (regra da Meta): para
//     mudar o texto, cria-se outro com nome novo.
// =====================================================================

export type CanalTemplate = {
  id: string;
  nome: string;
  provedor: string;
  status: string;
};

/** Só a Cloud API tem templates — a Evolution manda texto normal. */
const PROVEDORES_META = ["cloud_api", "cloud_api_coexistence"];

const IDIOMAS: { valor: string; label: string }[] = [
  { valor: "pt_BR", label: "Português (Brasil)" },
  { valor: "en_US", label: "Inglês (EUA)" },
  { valor: "es_ES", label: "Espanhol (Espanha)" },
  { valor: "es_MX", label: "Espanhol (México)" },
];

const CATEGORIAS = Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[];

/** Badge de status com cor coerente nos dois temas. */
function BadgeStatus({ status }: { status: TemplateStatus }) {
  const cls: Record<TemplateStatus, string> = {
    local: "bg-muted text-muted-foreground",
    PENDING: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
    APPROVED: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    REJECTED: "bg-red-500/12 text-red-700 dark:text-red-300",
    PAUSED: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
    DISABLED: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight ${cls[status]}`}>
      {TEMPLATE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Índices das variáveis {{n}} presentes no corpo, ordenados. */
function indicesDeVariaveis(corpo: string): number[] {
  const marcas = corpo.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  return [...new Set(marcas.map((m) => Number(m.replace(/\D/g, ""))))].sort((a, b) => a - b);
}

/** Valores de exemplo do preview — os mesmos que vão à Meta na submissão. */
function preencherExemplo(corpo: string): string {
  return corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => `exemplo ${n}`);
}

/** Regra de nome da Meta: minúsculas, números e underscore. */
const NOME_VALIDO = /^[a-z0-9_]{1,512}$/;

type Rascunho = {
  channelId: string;
  nome: string;
  idioma: string;
  categoria: TemplateCategory;
  header: string;
  corpo: string;
  footer: string;
};

const VAZIO: Rascunho = {
  channelId: "",
  nome: "",
  idioma: "pt_BR",
  categoria: "MARKETING",
  header: "",
  corpo: "",
  footer: "",
};

export function TemplatesManager({
  canais,
  initial,
}: {
  canais: CanalTemplate[];
  initial: WhatsappTemplate[];
}) {
  const canaisMeta = useMemo(
    () => canais.filter((c) => PROVEDORES_META.includes(c.provedor)),
    [canais],
  );
  const temEvolution = canais.some((c) => c.provedor === "evolution");

  const [templates, setTemplates] = useState(initial);
  const [canalSel, setCanalSel] = useState(canaisMeta[0]?.id ?? "");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<WhatsappTemplate | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [submetendo, setSubmetendo] = useState<string | null>(null);

  const visiveis = useMemo(
    () => templates.filter((t) => (canalSel ? t.channel_id === canalSel : t.channel_id == null)),
    [templates, canalSel],
  );

  function novo() {
    setErro(null);
    setAviso(null);
    setRascunho({ ...VAZIO, channelId: canalSel });
  }

  async function salvar() {
    if (!rascunho) return;
    const nome = rascunho.nome.trim().toLowerCase();
    if (!NOME_VALIDO.test(nome)) {
      setErro("O nome do template só aceita letras minúsculas, números e underscore (regra da Meta).");
      return;
    }
    const corpo = rascunho.corpo.trim();
    if (!corpo) { setErro("Escreva o corpo da mensagem."); return; }

    const indices = indicesDeVariaveis(corpo);
    if (!indices.every((n, i) => n === i + 1)) {
      setErro(
        "As variáveis precisam ser sequenciais a partir de {{1}} — " +
        `este corpo usa ${indices.map((n) => `{{${n}}}`).join(", ")}.`,
      );
      return;
    }

    // Componentes no formato da Graph API; o servidor reconstrói o BODY na
    // submissão, mas guardar aqui deixa header/footer prontos.
    const componentes: Record<string, unknown>[] = [];
    if (rascunho.header.trim()) {
      componentes.push({ type: "HEADER", format: "TEXT", text: rascunho.header.trim() });
    }
    componentes.push({ type: "BODY", text: corpo });
    if (rascunho.footer.trim()) {
      componentes.push({ type: "FOOTER", text: rascunho.footer.trim() });
    }

    setSalvando(true);
    setErro(null);
    const { data, error } = await createSupabaseBrowser()
      .from("atendimento_templates")
      .insert({
        channel_id: rascunho.channelId || null,
        nome,
        idioma: rascunho.idioma,
        categoria: rascunho.categoria,
        status: "local",
        componentes,
        corpo,
        variaveis: indices.length,
      })
      .select("*")
      .single();
    setSalvando(false);

    if (error) {
      // 23505 = par (canal, nome, idioma) repetido.
      setErro(
        error.code === "23505"
          ? "Já existe um template com esse nome e idioma neste canal."
          : error.message,
      );
      return;
    }
    setTemplates((l) => [data as WhatsappTemplate, ...l]);
    setRascunho(null);
    setAviso("Template criado localmente. Ele só vale para campanha depois de aprovado pela Meta.");
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await createSupabaseBrowser()
      .from("atendimento_templates").delete().eq("id", excluindo.id);
    if (error) { setErro(error.message); setExcluindo(null); return; }
    setTemplates((l) => l.filter((t) => t.id !== excluindo.id));
    setExcluindo(null);
  }

  async function sincronizar() {
    if (!canalSel) return;
    setSincronizando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/atendimento/templates/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: canalSel }),
      });
      const json = (await r.json()) as {
        encontrados?: number; atualizados?: number; importados?: number; error?: string;
      };
      if (!r.ok) { setErro(json.error ?? "falha ao sincronizar"); return; }

      // Recarrega a lista: a rota pode ter importado templates novos.
      const { data } = await createSupabaseBrowser()
        .from("atendimento_templates").select("*").order("created_at", { ascending: false });
      if (data) setTemplates(data as WhatsappTemplate[]);
      setAviso(
        `Sincronizado: ${json.encontrados ?? 0} na Meta, ${json.atualizados ?? 0} atualizados, ` +
        `${json.importados ?? 0} importados.`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha de rede");
    } finally {
      setSincronizando(false);
    }
  }

  async function submeter(t: WhatsappTemplate) {
    setSubmetendo(t.id);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/atendimento/templates/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      });
      const json = (await r.json()) as { status?: string; template?: WhatsappTemplate; error?: string };
      if (!r.ok) { setErro(json.error ?? "falha ao enviar para aprovação"); return; }
      if (json.template) {
        setTemplates((l) => l.map((x) => (x.id === t.id ? (json.template as WhatsappTemplate) : x)));
      }
      setAviso(
        json.status === "APPROVED"
          ? "A Meta já aprovou este template."
          : "Enviado. A análise da Meta costuma levar de alguns minutos a 24 h — use “Sincronizar” para ver o resultado.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha de rede");
    } finally {
      setSubmetendo(null);
    }
  }

  const indicesRascunho = rascunho ? indicesDeVariaveis(rascunho.corpo) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Templates do WhatsApp"
        descricao="Mensagens pré-aprovadas pela Meta — obrigatórias fora da janela de 24 h."
        acoes={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canalSel || sincronizando}
              onClick={() => void sincronizar()}
            >
              {sincronizando ? <Spinner /> : <RefreshCw size={15} />} Sincronizar com a Meta
            </Button>
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Novo template
            </Button>
          </>
        }
      />

      {/* ---------- Aviso honesto sobre o que funciona sem credencial ---------- */}
      {canaisMeta.length === 0 ? (
        <Alerta tipo="atencao">
          <strong>Nenhum canal conectado pela API Oficial da Meta (Cloud API).</strong> Você pode
          cadastrar templates aqui, mas nada será enviado para aprovação e nenhuma campanha fora da
          janela de 24 h vai sair — isso depende de um WABA com{" "}
          <code>waba_id</code> e <code>access_token</code>, conectado em Canais › Conexões.
        </Alerta>
      ) : (
        <Alerta tipo="info">
          O status abaixo é o que a <strong>Meta</strong> diz, não o nosso: aprovação, rejeição e
          pausa por qualidade acontecem lá e só aparecem aqui depois de sincronizar.
        </Alerta>
      )}

      {temEvolution && (
        <Alerta tipo="atencao">
          Você tem um canal pela <strong>Evolution API (QR Code)</strong>. Ele não usa templates da
          Meta — por lá a mensagem sai como texto normal, sem aprovação prévia. Em compensação, a
          Evolution também não tem a garantia de entrega fora da janela de 24 h: é o WhatsApp comum,
          com o risco de bloqueio que isso implica.
        </Alerta>
      )}

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      {/* ---------- Seleção do canal ---------- */}
      {canaisMeta.length > 0 && (
        <div className="max-w-sm">
          <Field label="Canal" dica="Cada WABA tem a sua própria lista de templates na Meta.">
            <SelectInput value={canalSel} onChange={(e) => setCanalSel(e.target.value)}>
              {canaisMeta.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} {c.status !== "conectado" ? `(${c.status})` : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      )}

      {/* ---------- Tabela ---------- */}
      {visiveis.length === 0 ? (
        <EmptyState
          icone={<FileText size={34} />}
          titulo="Nenhum template neste canal"
          descricao="Crie o primeiro e envie para aprovação da Meta. Sem template aprovado, campanha só alcança quem falou com você nas últimas 24 h."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Novo template
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["Nome", "Idioma", "Categoria", "Status", "Variáveis", "Sincronizado", ""]}>
            {visiveis.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30 align-top">
                <td className="px-3 py-2 max-w-[280px]">
                  <div className="font-medium font-mono text-[13px]">{t.nome}</div>
                  {t.corpo && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.corpo}</div>
                  )}
                  {t.motivo_rejeicao && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                      Motivo: {t.motivo_rejeicao}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{t.idioma}</td>
                <td className="px-3 py-2 text-xs">{t.categoria}</td>
                <td className="px-3 py-2"><BadgeStatus status={t.status} /></td>
                <td className="px-3 py-2 text-xs">{t.variaveis}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {t.sincronizado_em ? formatDateTimeBR(t.sincronizado_em) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {(t.status === "local" || t.status === "REJECTED") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submetendo === t.id}
                        onClick={() => void submeter(t)}
                      >
                        {submetendo === t.id ? <Spinner /> : <Send size={14} />} Enviar para aprovação
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExcluindo(t)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                      aria-label="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* ---------- Modal criar ---------- */}
      <Modal
        aberto={rascunho != null}
        onFechar={() => setRascunho(null)}
        titulo="Novo template"
        descricao="Depois de submetido, a Meta não deixa editar o texto — só criar outro."
        largura="max-w-2xl"
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void salvar()}
              disabled={salvando || !rascunho?.nome.trim() || !rascunho?.corpo.trim()}
            >
              {salvando && <Spinner />} Salvar
            </Button>
          </>
        }
      >
        {rascunho && (
          <>
            <Field
              label="Nome"
              obrigatorio
              dica="Regra da Meta: só minúsculas, números e underscore. Ex.: lembrete_visita_imovel"
            >
              <TextInput
                value={rascunho.nome}
                onChange={(e) =>
                  setRascunho({ ...rascunho, nome: e.target.value.toLowerCase().replace(/\s+/g, "_") })
                }
                placeholder="lembrete_visita_imovel"
                autoFocus
              />
            </Field>
            {rascunho.nome && !NOME_VALIDO.test(rascunho.nome) && (
              <Alerta tipo="erro">
                Nome inválido: use apenas <code>a-z</code>, <code>0-9</code> e <code>_</code>.
              </Alerta>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Idioma" obrigatorio>
                <SelectInput
                  value={rascunho.idioma}
                  onChange={(e) => setRascunho({ ...rascunho, idioma: e.target.value })}
                >
                  {IDIOMAS.map((i) => (
                    <option key={i.valor} value={i.valor}>{i.label}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Categoria" obrigatorio dica="Categoria errada é motivo comum de rejeição.">
                <SelectInput
                  value={rascunho.categoria}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, categoria: e.target.value as TemplateCategory })
                  }
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{TEMPLATE_CATEGORY_LABELS[c]}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <Field label="Cabeçalho (opcional)" dica="Uma linha curta de texto, exibida em negrito.">
              <TextInput
                value={rascunho.header}
                onChange={(e) => setRascunho({ ...rascunho, header: e.target.value })}
                placeholder="Arini Negócios Imobiliários"
              />
            </Field>

            <Field
              label="Corpo"
              obrigatorio
              dica="Use {{1}}, {{2}}… para os valores que mudam a cada envio. Não comece nem termine com variável."
            >
              <TextArea
                value={rascunho.corpo}
                onChange={(e) => setRascunho({ ...rascunho, corpo: e.target.value })}
                rows={5}
                placeholder="Olá {{1}}, sua visita ao imóvel {{2}} está confirmada para {{3}}."
              />
            </Field>

            <Field label="Rodapé (opcional)" dica="Texto pequeno no fim. Ex.: “Responda SAIR para não receber mais”.">
              <TextInput
                value={rascunho.footer}
                onChange={(e) => setRascunho({ ...rascunho, footer: e.target.value })}
                placeholder="Responda SAIR para não receber mais mensagens"
              />
            </Field>

            {/* ---------- Preview ---------- */}
            {rascunho.corpo.trim() && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <MessageSquareText size={13} /> Pré-visualização
                  <span className="text-muted-foreground font-normal">
                    ({indicesRascunho.length} {indicesRascunho.length === 1 ? "variável" : "variáveis"})
                  </span>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 max-w-sm space-y-1">
                  {rascunho.header.trim() && (
                    <div className="text-sm font-semibold">{rascunho.header.trim()}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">
                    {preencherExemplo(rascunho.corpo.trim())}
                  </div>
                  {rascunho.footer.trim() && (
                    <div className="text-[11px] text-muted-foreground pt-1">
                      {rascunho.footer.trim()}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Os valores de exemplo acima são os mesmos que enviamos à Meta na submissão — o
                  revisor precisa ver a mensagem preenchida para julgar o conteúdo.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ---------- Exclusão ---------- */}
      <Modal
        aberto={excluindo != null}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir template"
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void excluir()}>
              <Trash2 size={15} /> Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Excluir <strong>{excluindo?.nome}</strong> daqui? Isto remove só o cadastro local — se ele
          já foi submetido, continua existindo na Meta e voltará na próxima sincronização. Para
          apagar de verdade, exclua também no Gerenciador do WhatsApp Business.
        </p>
      </Modal>
    </div>
  );
}
