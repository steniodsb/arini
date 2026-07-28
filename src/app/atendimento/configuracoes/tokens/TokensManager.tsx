"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, SelectInput,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import { API_SCOPE_LABELS, type ApiScope, type ApiToken } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { Plus, KeyRound, Ban, Copy, Check } from "lucide-react";

const ESCOPOS = Object.keys(API_SCOPE_LABELS) as ApiScope[];

const OPCOES_EXPIRACAO: { valor: string; rotulo: string }[] = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "365", rotulo: "1 ano" },
  { valor: "", rotulo: "Nunca expira" },
];

function Badge({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "ok" | "erro" | "alerta" }) {
  const cls = {
    neutro: "bg-muted text-muted-foreground",
    ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    erro: "bg-red-500/12 text-red-700 dark:text-red-300",
    alerta: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
  }[tom];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight ${cls}`}>
      {children}
    </span>
  );
}

function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        });
      }}
    >
      {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Copiado" : rotulo}
    </Button>
  );
}

/** Três estados possíveis, nesta ordem de precedência. */
function situacao(t: ApiToken): { rotulo: string; tom: "ok" | "erro" | "alerta" } {
  if (t.revogado) return { rotulo: "Revogado", tom: "erro" };
  if (t.expira_em && new Date(t.expira_em).getTime() < Date.now()) {
    return { rotulo: "Expirado", tom: "alerta" };
  }
  return { rotulo: "Ativo", tom: "ok" };
}

export function TokensManager({ initial }: { initial: ApiToken[] }) {
  const [tokens, setTokens] = useState(initial);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<ApiScope[]>(["leitura"]);
  const [dias, setDias] = useState("90");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Token em claro devolvido pela API. Vive só na memória desta tela.
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<ApiToken | null>(null);

  function abrirCriacao() {
    setNome("");
    setEscopos(["leitura"]);
    setDias("90");
    setErro(null);
    setCriando(true);
  }

  async function criar() {
    if (!nome.trim() || escopos.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          escopos,
          dias: dias === "" ? null : Number(dias),
        }),
      });
      const json = await r.json();
      if (!r.ok) { setErro(json.error ?? "falha ao criar token"); return; }
      setTokens((lista) => [json.registro as ApiToken, ...lista]);
      setCriando(false);
      setTokenNovo(json.token as string);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar token");
    } finally {
      setSalvando(false);
    }
  }

  async function revogar() {
    if (!revogando) return;
    const alvo = revogando;
    setRevogando(null);
    try {
      const r = await fetch("/api/atendimento/tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alvo.id }),
      });
      const json = await r.json();
      if (!r.ok) { setErro(json.error ?? "falha ao revogar"); return; }
      setTokens((lista) => lista.map((t) => (t.id === alvo.id ? { ...t, revogado: true } : t)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao revogar");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Tokens de API"
        descricao="Chaves para outro sistema conversar com o atendimento em nome da empresa."
        acoes={
          <Button type="button" variant="gold" size="sm" onClick={abrirCriacao}>
            <Plus size={15} /> Novo token
          </Button>
        }
      />

      <Alerta tipo="atencao">
        <strong>Sinceridade primeiro:</strong> a API pública que consome estes tokens{" "}
        <strong>ainda não existe</strong>. Hoje eles ficam apenas cadastrados (com hash, escopo e
        validade) — nenhum endpoint valida um <code>Bearer</code> ainda. Emitir agora só faz sentido
        para preparar a integração; nada vai funcionar do outro lado até a próxima onda.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {tokens.length === 0 ? (
        <EmptyState
          icone={<KeyRound size={34} />}
          titulo="Nenhum token emitido"
          descricao="Crie um token para preparar a integração de um sistema externo com o atendimento."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={abrirCriacao}>
              <Plus size={15} /> Novo token
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["Nome", "Prefixo", "Escopos", "Último uso", "Expira em", "Situação", ""]}>
            {tokens.map((t) => {
              const s = situacao(t);
              return (
                <tr key={t.id} className="hover:bg-muted/30 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      criado em {formatDateTimeBR(t.created_at)}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <code className="text-xs font-mono text-muted-foreground">{t.prefixo}…</code>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(t.escopos ?? []).map((e) => (
                        <Badge key={e}>{e}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {t.ultimo_uso_em ? formatDateTimeBR(t.ultimo_uso_em) : "nunca usado"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {t.expira_em ? formatDateTimeBR(t.expira_em) : "não expira"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge tom={s.tom}>{s.rotulo}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      {!t.revogado && (
                        <button
                          type="button"
                          onClick={() => setRevogando(t)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                          aria-label="Revogar"
                          title="Revogar token"
                        >
                          <Ban size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {/* ---------- Documentação da API ---------- */}
      <Card titulo="Como usar (quando a API existir)" descricao="Contrato previsto, para já ir programando do outro lado.">
        <div className="p-4 space-y-3 text-xs text-muted-foreground">
          <p>
            O token vai no header <code className="text-foreground">Authorization: Bearer &lt;token&gt;</code>.
            Guarde-o no cofre de segredos do seu sistema — quem tem o token age como a empresa inteira,
            dentro dos escopos marcados.
          </p>

          <div>
            <div className="text-foreground font-medium mb-1">Endpoints previstos</div>
            <ul className="space-y-0.5 font-mono text-[11px]">
              <li><span className="text-foreground">GET</span> /api/v1/conversas — lista conversas (escopo leitura)</li>
              <li><span className="text-foreground">GET</span> /api/v1/conversas/:id/mensagens — histórico (leitura)</li>
              <li><span className="text-foreground">POST</span> /api/v1/conversas/:id/mensagens — responde (escrita)</li>
              <li><span className="text-foreground">GET</span> /api/v1/contatos — lista contatos (leitura)</li>
              <li><span className="text-foreground">POST</span> /api/v1/contatos — cria contato (escrita)</li>
              <li><span className="text-foreground">GET</span> /api/v1/caixas — lista caixas e canais (admin)</li>
            </ul>
            <p className="mt-1">
              Nenhum deles responde hoje — a lista é o contrato pretendido, não uma promessa de
              disponibilidade.
            </p>
          </div>

          <div>
            <div className="text-foreground font-medium mb-1">Exemplo</div>
            <pre className="rounded-lg border bg-muted/40 p-3 overflow-x-auto text-[11px] leading-relaxed text-foreground">
{`curl -X POST https://atendimento.arini.com.br/api/v1/conversas/UUID/mensagens \\
  -H "Authorization: Bearer arini_xxxxxxxx..." \\
  -H "Content-Type: application/json" \\
  -d '{"texto":"Olá! Já estamos verificando."}'`}
            </pre>
          </div>

          <p>
            Guardamos apenas o <strong>sha256</strong> do token. Se ele vazar ou se perder, revogue e
            emita outro — não existe &ldquo;ver de novo&rdquo;.
          </p>
        </div>
      </Card>

      {/* ---------- Modal de criação ---------- */}
      <Modal
        aberto={criando}
        onFechar={() => setCriando(false)}
        titulo="Novo token de API"
        descricao="O valor em claro aparece uma única vez, logo depois de criar."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCriando(false)}>Cancelar</Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void criar()}
              disabled={salvando || !nome.trim() || escopos.length === 0}
            >
              {salvando && <Spinner />} Gerar token
            </Button>
          </>
        }
      >
        <Field label="Nome" obrigatorio dica="Diga qual sistema vai usar — facilita revogar o certo depois.">
          <TextInput
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Integração ERP"
            autoFocus
          />
        </Field>

        <div className="space-y-1.5">
          <span className="text-xs font-medium">
            Escopos<span className="text-red-500 ml-0.5">*</span>
          </span>
          <div className="space-y-1.5">
            {ESCOPOS.map((esc) => {
              const marcado = escopos.includes(esc);
              return (
                <label key={esc} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setEscopos((l) => (marcado ? l.filter((x) => x !== esc) : [...l, esc]))
                    }
                    className="mt-1 rounded border accent-arini"
                  />
                  <span className="min-w-0">{API_SCOPE_LABELS[esc]}</span>
                </label>
              );
            })}
          </div>
          <span className="block text-[11px] text-muted-foreground">
            Dê o mínimo necessário. Um token só de leitura que vaze causa muito menos estrago.
          </span>
        </div>

        <Field label="Expiração" dica="Token sem prazo é token que você esquece que existe.">
          <SelectInput value={dias} onChange={(e) => setDias(e.target.value)}>
            {OPCOES_EXPIRACAO.map((o) => (
              <option key={o.rotulo} value={o.valor}>{o.rotulo}</option>
            ))}
          </SelectInput>
        </Field>
      </Modal>

      {/* ---------- Token em claro (exibição única) ---------- */}
      <Modal
        aberto={tokenNovo != null}
        onFechar={() => setTokenNovo(null)}
        titulo="Token criado"
        largura="max-w-xl"
        rodape={
          <Button type="button" variant="gold" size="sm" onClick={() => setTokenNovo(null)}>
            Já guardei
          </Button>
        }
      >
        {tokenNovo && (
          <>
            <Alerta tipo="atencao">
              <strong>Copie agora.</strong> Guardamos só o hash — fechando esta janela, não há como
              exibir este token de novo. Se perder, é só revogar e gerar outro.
            </Alerta>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-[11px] text-muted-foreground">Seu token</div>
              <code className="block text-xs break-all font-mono">{tokenNovo}</code>
              <BotaoCopiar texto={tokenNovo} rotulo="Copiar token" />
            </div>

            <p className="text-xs text-muted-foreground">
              Uso: <code className="text-foreground">Authorization: Bearer {tokenNovo.slice(0, 14)}…</code>
            </p>
          </>
        )}
      </Modal>

      {/* ---------- Confirmação de revogação ---------- */}
      <Modal
        aberto={revogando != null}
        onFechar={() => setRevogando(null)}
        titulo="Revogar token"
        descricao="O token deixa de valer imediatamente."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRevogando(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void revogar()}>
              <Ban size={15} /> Revogar
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Revogar <strong>{revogando?.nome}</strong> (<code className="text-xs">{revogando?.prefixo}…</code>)?
          Qualquer integração que use esta chave para de funcionar. A linha continua na lista, marcada
          como revogada, para o histórico não sumir.
        </p>
      </Modal>
    </div>
  );
}
