"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Globe, KeyRound, Plus, RefreshCw, X } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Alerta, Card, Field, Modal, SelectInput, Spinner, TextArea, TextInput, inputCls,
} from "@/components/atendimento/ui";

// =====================================================================
// Tela de instalação do chat do site.
//
// Os campos do widget (0034) ainda não estão em `AtendimentoInbox`, então o
// tipo da linha é declarado aqui — a página server seleciona exatamente
// estas colunas (e nunca `widget_secret`, que não pode chegar ao navegador).
// =====================================================================

export interface CaixaSite {
  id: string;
  nome: string;
  widget_token: string | null;
  widget_titulo: string | null;
  widget_saudacao: string | null;
  widget_cor: string | null;
  widget_posicao: "direita" | "esquerda";
  widget_dominios: string[];
  pre_chat_ativo: boolean;
  saudacao_ativa: boolean;
  saudacao_texto: string | null;
}

const COR_PADRAO = "#092316";

/** Token novo gerado no navegador — 16 bytes em hex, igual ao do banco. */
function gerarToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Aceita o domínio digitado com protocolo/caminho e guarda só o host. */
function normalizarDominio(entrada: string): string {
  const limpo = entrada.trim().toLowerCase();
  if (!limpo) return "";
  return limpo.replace(/^[a-z]+:\/\//, "").split("/")[0].replace(/\/+$/, "");
}

/** Só aceita hex de 3 ou 6 dígitos — o input color não engole outra coisa. */
function corValida(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

export function WidgetManager({ caixas: iniciais, siteUrl }: { caixas: CaixaSite[]; siteUrl: string }) {
  const [caixas, setCaixas] = useState(iniciais);
  const [caixaId, setCaixaId] = useState(iniciais[0]?.id ?? "");

  const caixa = useMemo(() => caixas.find((c) => c.id === caixaId), [caixas, caixaId]);

  // ---- formulário -------------------------------------------------
  const [titulo, setTitulo] = useState("");
  const [saudacao, setSaudacao] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [posicao, setPosicao] = useState<"direita" | "esquerda">("direita");
  const [dominios, setDominios] = useState<string[]>([]);
  const [novoDominio, setNovoDominio] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"tag" | "token" | null>(null);
  const [confirmandoToken, setConfirmandoToken] = useState(false);
  const [regerando, setRegerando] = useState(false);

  // Trocar de caixa recarrega o formulário a partir do estado local.
  useEffect(() => {
    const c = caixas.find((x) => x.id === caixaId);
    setTitulo(c?.widget_titulo ?? "");
    setSaudacao(c?.widget_saudacao ?? c?.saudacao_texto ?? "");
    setCor(c?.widget_cor && corValida(c.widget_cor) ? c.widget_cor : COR_PADRAO);
    setPosicao(c?.widget_posicao === "esquerda" ? "esquerda" : "direita");
    setDominios(c?.widget_dominios ?? []);
    setNovoDominio("");
    setSalvo(false);
    setErro(null);
    // `caixas` só muda depois de salvar, quando o form já reflete o servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caixaId]);

  function tocar() {
    setSalvo(false);
  }

  // ---- domínios ---------------------------------------------------
  function adicionarDominio() {
    const d = normalizarDominio(novoDominio);
    if (!d) return;
    if (dominios.includes(d)) { setNovoDominio(""); return; }
    setDominios((p) => [...p, d]);
    setNovoDominio("");
    tocar();
  }

  function removerDominio(d: string) {
    setDominios((p) => p.filter((x) => x !== d));
    tocar();
  }

  // ---- persistência -----------------------------------------------
  async function salvar() {
    if (!caixa) return;
    if (!corValida(cor)) { setErro("Cor inválida. Use o formato #RRGGBB."); return; }

    setSalvando(true);
    setErro(null);
    const patch = {
      widget_titulo: titulo.trim() || null,
      widget_saudacao: saudacao.trim() || null,
      widget_cor: cor,
      widget_posicao: posicao,
      widget_dominios: dominios,
    };

    const { error } = await createSupabaseBrowser()
      .from("atendimento_inboxes")
      .update(patch)
      .eq("id", caixa.id);

    setSalvando(false);
    if (error) { setErro(error.message); return; }

    setCaixas((p) => p.map((c) => (c.id === caixa.id ? { ...c, ...patch } : c)));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  async function regerarToken() {
    if (!caixa) return;
    setRegerando(true);
    setErro(null);
    const novo = gerarToken();

    const { error } = await createSupabaseBrowser()
      .from("atendimento_inboxes")
      .update({ widget_token: novo })
      .eq("id", caixa.id);

    setRegerando(false);
    setConfirmandoToken(false);
    if (error) { setErro(error.message); return; }

    setCaixas((p) => p.map((c) => (c.id === caixa.id ? { ...c, widget_token: novo } : c)));
  }

  // ---- tag de instalação ------------------------------------------
  const [origemNavegador, setOrigemNavegador] = useState("");
  useEffect(() => {
    // Fallback para quando NEXT_PUBLIC_SITE_URL não está configurada.
    if (!siteUrl) setOrigemNavegador(window.location.origin);
  }, [siteUrl]);

  const base = (siteUrl || origemNavegador).replace(/\/+$/, "");
  const tag = caixa?.widget_token
    ? `<script src="${base}/api/widget/${caixa.widget_token}/script" async></script>`
    : "";

  async function copiar(texto: string, qual: "tag" | "token") {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione o texto e copie na mão.");
    }
  }

  if (!caixa) return null;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Barra: caixa + salvar */}
      <div className="flex items-end gap-3 flex-wrap">
        <Field label="Caixa de entrada" className="min-w-[240px] flex-1">
          <SelectInput value={caixaId} onChange={(e) => setCaixaId(e.target.value)}>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex items-center gap-2 pb-0.5">
          {salvo && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check size={14} /> Salvo
            </span>
          )}
          <Button type="button" variant="gold" size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Spinner /> : <Check size={15} />} Salvar
          </Button>
        </div>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          {/* ---------------- Aparência ---------------- */}
          <Card titulo="Aparência" descricao="Como o chat aparece no site do cliente.">
            <div className="p-4 space-y-4">
              <Field label="Título do cabeçalho" dica="Vazio usa o nome da caixa de entrada.">
                <TextInput
                  value={titulo}
                  onChange={(e) => { setTitulo(e.target.value); tocar(); }}
                  placeholder="Fale com a gente"
                  maxLength={60}
                />
              </Field>

              <Field label="Saudação" dica="Primeira mensagem exibida ao visitante abrir o chat.">
                <TextArea
                  value={saudacao}
                  onChange={(e) => { setSaudacao(e.target.value); tocar(); }}
                  placeholder="Olá! Como podemos ajudar?"
                  maxLength={400}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cor principal">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Escolher cor principal"
                      value={corValida(cor) ? cor : COR_PADRAO}
                      onChange={(e) => { setCor(e.target.value); tocar(); }}
                      className="h-9 w-12 rounded-md border bg-background p-1 cursor-pointer"
                    />
                    <input
                      value={cor}
                      onChange={(e) => { setCor(e.target.value); tocar(); }}
                      spellCheck={false}
                      className={`${inputCls} font-mono uppercase`}
                      maxLength={7}
                    />
                  </div>
                </Field>

                <Field label="Posição na tela">
                  <SelectInput
                    value={posicao}
                    onChange={(e) => { setPosicao(e.target.value as "direita" | "esquerda"); tocar(); }}
                  >
                    <option value="direita">Canto inferior direito</option>
                    <option value="esquerda">Canto inferior esquerdo</option>
                  </SelectInput>
                </Field>
              </div>

              {caixa.pre_chat_ativo && (
                <Alerta tipo="info">
                  O formulário de pré-chat está ligado nesta caixa: o visitante preenche os
                  campos antes de escrever. Ajuste os campos em Configurações › Caixas de entrada.
                </Alerta>
              )}
            </div>
          </Card>

          {/* ---------------- Domínios ---------------- */}
          <Card
            titulo="Domínios liberados"
            descricao="Somente estes sites podem usar o chat (CORS). Lista vazia libera qualquer site."
          >
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  value={novoDominio}
                  onChange={(e) => setNovoDominio(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); adicionarDominio(); }
                  }}
                  placeholder="arini.com.br  ·  *.arini.com.br  ·  localhost:3000"
                  className={inputCls}
                  spellCheck={false}
                />
                <Button type="button" variant="outline" size="sm" onClick={adicionarDominio}>
                  <Plus size={15} /> Adicionar
                </Button>
              </div>

              {dominios.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum domínio cadastrado — o chat funciona em qualquer site que cole a tag.
                  Cadastre pelo menos o domínio do cliente para evitar que outros usem sua caixa.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {dominios.map((d) => (
                    <li
                      key={d}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 pl-2.5 pr-1 py-1 text-xs"
                    >
                      <Globe size={12} className="text-muted-foreground shrink-0" />
                      <span className="font-mono">{d}</span>
                      <button
                        type="button"
                        onClick={() => removerDominio(d)}
                        aria-label={`Remover ${d}`}
                        className="p-0.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* ---------------- Instalação ---------------- */}
          <Card
            titulo="Instalação"
            descricao="Cole esta tag antes do </body> em todas as páginas do site."
          >
            <div className="p-4 space-y-3">
              {!base && (
                <Alerta tipo="atencao">
                  Configure <code className="font-mono">NEXT_PUBLIC_SITE_URL</code> para a tag sair
                  com o endereço definitivo do sistema.
                </Alerta>
              )}
              {tag ? (
                <>
                  <pre className="rounded-lg border bg-muted/50 p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                    {tag}
                  </pre>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copiar(tag, "tag")}>
                    {copiado === "tag" ? <Check size={15} /> : <Copy size={15} />}
                    {copiado === "tag" ? "Copiado" : "Copiar tag"}
                  </Button>
                </>
              ) : (
                <Alerta tipo="atencao">
                  Esta caixa está sem token. Gere um em &quot;Segurança&quot;, logo abaixo.
                </Alerta>
              )}
            </div>
          </Card>

          {/* ---------------- Segurança ---------------- */}
          <Card titulo="Segurança" descricao="O token identifica a caixa e é público — ele fica visível no HTML do site.">
            <div className="p-4 space-y-3">
              <Field label="Token do widget">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={caixa.widget_token ?? "—"}
                    className={`${inputCls} font-mono`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!caixa.widget_token}
                    onClick={() => void copiar(caixa.widget_token ?? "", "token")}
                  >
                    {copiado === "token" ? <Check size={15} /> : <Copy size={15} />}
                  </Button>
                </div>
              </Field>

              <Alerta tipo="atencao">
                Gerar um token novo <strong>derruba o widget já instalado</strong>: a tag antiga
                passa a responder 404 até o cliente trocar o código no site dele. Use só se o
                token tiver sido usado indevidamente por terceiros.
              </Alerta>

              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmandoToken(true)}>
                <RefreshCw size={15} /> Gerar novo token
              </Button>
            </div>
          </Card>
        </div>

        {/* ---------------- Preview ---------------- */}
        <div className="lg:sticky lg:top-4 self-start w-full">
          <PreviaWidget
            titulo={titulo.trim() || caixa.nome}
            saudacao={saudacao.trim()}
            cor={corValida(cor) ? cor : COR_PADRAO}
            posicao={posicao}
          />
        </div>
      </div>

      <Modal
        aberto={confirmandoToken}
        onFechar={() => setConfirmandoToken(false)}
        titulo="Gerar novo token do widget?"
        descricao="Esta ação não pode ser desfeita."
        rodape={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmandoToken(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void regerarToken()} disabled={regerando}>
              {regerando ? <Spinner /> : <KeyRound size={15} />} Gerar novo token
            </Button>
          </>
        }
      >
        <p className="text-sm">
          O chat instalado no site de <strong>{caixa.nome}</strong> vai parar de carregar
          imediatamente. Depois de gerar, copie a nova tag e peça para trocarem o código no site.
        </p>
        <p className="text-xs text-muted-foreground">
          As conversas já existentes continuam no inbox — quem quebra é apenas o script instalado.
        </p>
      </Modal>
    </div>
  );
}

// =====================================================================
// Prévia — reprodução em React do visual do script (não é o script real,
// é só para o operador ver cor/título/posição antes de salvar).
// =====================================================================

function PreviaWidget({
  titulo, saudacao, cor, posicao,
}: {
  titulo: string;
  saudacao: string;
  cor: string;
  posicao: "direita" | "esquerda";
}) {
  const [aberto, setAberto] = useState(true);
  const corpoRef = useRef<HTMLDivElement>(null);
  const ladoPainel = posicao === "esquerda" ? "left-3" : "right-3";

  return (
    <Card titulo="Prévia" descricao="Simulação — o widget real roda no site do cliente.">
      <div className="p-3">
        <div className="relative h-[430px] rounded-lg border bg-[linear-gradient(135deg,#f3f4f6,#e5e7eb)] dark:bg-[linear-gradient(135deg,#1f2225,#15181a)] overflow-hidden">
          {/* Linhas fake simulando o conteúdo do site do cliente */}
          <div className="p-4 space-y-2 opacity-40">
            <div className="h-3 w-2/3 rounded bg-foreground/20" />
            <div className="h-2 w-full rounded bg-foreground/15" />
            <div className="h-2 w-5/6 rounded bg-foreground/15" />
            <div className="h-20 w-full rounded bg-foreground/10" />
          </div>

          {aberto && (
            <div
              className={`absolute bottom-16 ${ladoPainel} w-[260px] h-[320px] rounded-xl overflow-hidden shadow-2xl flex flex-col bg-white text-neutral-900`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 text-white" style={{ background: cor }}>
                <span className="text-[12px] font-semibold truncate flex-1">
                  {titulo || "Fale com a gente"}
                </span>
                <span aria-hidden className="text-base leading-none opacity-80">×</span>
              </div>
              <div ref={corpoRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-neutral-100">
                <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-neutral-200 bg-white px-2.5 py-1.5 text-[11.5px] leading-snug">
                  {saudacao || "Olá! Como podemos ajudar?"}
                </div>
                <div
                  className="ml-auto max-w-[85%] rounded-xl rounded-br-sm px-2.5 py-1.5 text-[11.5px] leading-snug text-white"
                  style={{ background: cor }}
                >
                  Oi! Quero saber sobre um imóvel.
                </div>
              </div>
              <div className="flex gap-1.5 border-t border-neutral-200 bg-white p-2">
                <div className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-[11px] text-neutral-400">
                  Escreva sua mensagem…
                </div>
                <div
                  className="grid place-items-center rounded-lg px-2.5 text-white text-xs"
                  style={{ background: cor }}
                  aria-hidden
                >
                  ➤
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-label={aberto ? "Fechar prévia do chat" : "Abrir prévia do chat"}
            className={`absolute bottom-3 ${ladoPainel} grid h-11 w-11 place-items-center rounded-full text-white shadow-lg`}
            style={{ background: cor }}
          >
            <span aria-hidden className="text-lg leading-none">{aberto ? "×" : "💬"}</span>
          </button>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Em telas menores que 480 px o painel ocupa a tela inteira do visitante.
        </p>
      </div>
    </Card>
  );
}
