"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Card, Field, TextInput, Alerta, Spinner, EmptyState,
} from "@/components/atendimento/ui";
import { Copy, Check, KeyRound, Plug, Eye, EyeOff, RefreshCw, Save } from "lucide-react";

// =====================================================================
// Contrato de integração dos canais HTTP.
//
// Esta tela existe porque o canal por API só é útil se alguém do outro
// lado souber exatamente o que mandar. Em vez de um README que envelhece,
// a documentação é gerada com a URL e o segredo REAIS do canal — dá para
// copiar o curl e testar na hora.
// =====================================================================

export type CanalHttp = {
  id: string;
  nome: string;
  provedor: "api_generica" | "email_smtp" | "sms_generico";
  status: string;
  webhookSecret: string | null;
  callbackUrl: string | null;
  remetente: string | null;
};

const ROTULO: Record<CanalHttp["provedor"], string> = {
  api_generica: "API genérica",
  email_smtp: "E-mail",
  sms_generico: "SMS",
};

/** Caminho do webhook de entrada de cada provedor. */
const CAMINHO: Record<CanalHttp["provedor"], string> = {
  api_generica: "/api/webhooks/api",
  email_smtp: "/api/webhooks/email",
  sms_generico: "/api/webhooks/sms",
};

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

/** Bloco de código com rolagem horizontal própria (não estoura a página). */
function Codigo({ children }: { children: string }) {
  return (
    <pre className="rounded-lg border bg-muted/40 p-3 overflow-x-auto text-[11px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

export function ApiCanalDocs({ canais, baseUrl }: { canais: CanalHttp[]; baseUrl: string }) {
  const [lista, setLista] = useState(canais);
  const [revelado, setRevelado] = useState<Record<string, boolean>>({});
  const [callbacks, setCallbacks] = useState<Record<string, string>>(
    Object.fromEntries(canais.map((c) => [c.id, c.callbackUrl ?? ""])),
  );
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function salvar(canal: CanalHttp, opcoes: { regenerar?: boolean } = {}) {
    setOcupado(canal.id);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/atendimento/canais/segredo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: canal.id,
          regenerar: opcoes.regenerar === true,
          ...(canal.provedor === "api_generica"
            ? { callbackUrl: callbacks[canal.id] ?? "" }
            : {}),
        }),
      });
      const json = (await r.json()) as { secret?: string; callback_url?: string | null; error?: string };
      if (!r.ok) { setErro(json.error ?? "falha ao salvar"); return; }

      setLista((l) =>
        l.map((c) =>
          c.id === canal.id
            ? { ...c, webhookSecret: json.secret ?? c.webhookSecret, callbackUrl: json.callback_url ?? null, status: "conectado" }
            : c,
        ),
      );
      setRevelado((v) => ({ ...v, [canal.id]: true }));
      setAviso(
        opcoes.regenerar
          ? "Segredo trocado. Atualize o valor no sistema que chama o webhook — o antigo parou de valer agora."
          : "Salvo.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha de rede");
    } finally {
      setOcupado(null);
    }
  }

  const temApi = lista.some((c) => c.provedor === "api_generica");

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Canal por API"
        descricao="O contrato para plugar um sistema próprio no inbox — e as URLs de webhook dos canais de e-mail e SMS."
      />

      <Alerta tipo="info">
        Estas integrações são <strong>HTTP puro</strong>: o seu sistema faz um POST para receber a
        mensagem no inbox, e nós fazemos um POST assinado de volta quando o agente responde. Não há
        conexão para &ldquo;ligar&rdquo; — basta cadastrar o canal, gerar o segredo aqui e apontar o
        seu lado para a URL abaixo.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      {lista.length === 0 ? (
        <EmptyState
          icone={<Plug size={34} />}
          titulo="Nenhum canal por API, e-mail ou SMS cadastrado"
          descricao="Cadastre o canal em Canais › Conexões. Depois volte aqui para gerar o segredo do webhook e copiar o contrato."
        />
      ) : (
        lista.map((canal) => {
          const url = `${baseUrl}${CAMINHO[canal.provedor]}?canal=${canal.id}`;
          const segredo = canal.webhookSecret;
          const mostrando = revelado[canal.id] === true;
          return (
            <Card
              key={canal.id}
              titulo={`${canal.nome} — ${ROTULO[canal.provedor]}`}
              descricao={
                canal.provedor === "email_smtp"
                  ? `Caixa: ${canal.remetente ?? "(sem remetente configurado)"}`
                  : canal.provedor === "sms_generico"
                    ? `Número/remetente: ${canal.remetente ?? "—"}`
                    : "Entrada e saída pelo seu próprio sistema."
              }
            >
              <div className="p-4 space-y-4">
                {/* ---------- URL de entrada ---------- */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">URL do webhook de entrada</div>
                  <code className="block text-xs break-all font-mono rounded-md border bg-muted/40 p-2.5">
                    {url}
                  </code>
                  <BotaoCopiar texto={url} rotulo="Copiar URL" />
                </div>

                {/* ---------- Segredo ---------- */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Segredo do webhook</div>
                  {segredo ? (
                    <>
                      <code className="block text-xs break-all font-mono rounded-md border bg-muted/40 p-2.5">
                        {mostrando ? segredo : "•".repeat(48)}
                      </code>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRevelado((v) => ({ ...v, [canal.id]: !mostrando }))}
                        >
                          {mostrando ? <EyeOff size={14} /> : <Eye size={14} />}
                          {mostrando ? "Ocultar" : "Mostrar"}
                        </Button>
                        <BotaoCopiar texto={segredo} rotulo="Copiar segredo" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={ocupado === canal.id}
                          onClick={() => void salvar(canal, { regenerar: true })}
                        >
                          {ocupado === canal.id ? <Spinner /> : <RefreshCw size={14} />} Trocar segredo
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Mande em <code className="text-foreground">Authorization: Bearer &lt;segredo&gt;</code>,
                        no header <code className="text-foreground">X-Arini-Secret</code>, ou como{" "}
                        <code className="text-foreground">&amp;secret=</code> na URL — o que o seu provedor
                        permitir. Trocar o segredo derruba na hora quem usa o antigo.
                      </p>
                    </>
                  ) : (
                    <>
                      <Alerta tipo="atencao">
                        Este canal ainda não tem segredo — o webhook de entrada vai recusar tudo com
                        401. Gere um agora.
                      </Alerta>
                      <Button
                        type="button"
                        variant="gold"
                        size="sm"
                        disabled={ocupado === canal.id}
                        onClick={() => void salvar(canal)}
                      >
                        {ocupado === canal.id ? <Spinner /> : <KeyRound size={14} />} Gerar segredo
                      </Button>
                    </>
                  )}
                </div>

                {/* ---------- Saída (só API genérica) ---------- */}
                {canal.provedor === "api_generica" && (
                  <div className="space-y-2 border-t pt-4">
                    <Field
                      label="URL de saída (callback)"
                      dica="Para onde entregamos a resposta do agente. Sem ela, o envio falha com erro explícito em vez de sumir."
                    >
                      <TextInput
                        value={callbacks[canal.id] ?? ""}
                        onChange={(e) => setCallbacks((c) => ({ ...c, [canal.id]: e.target.value }))}
                        placeholder="https://seu-sistema.com.br/arini/mensagens"
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="gold"
                      size="sm"
                      disabled={ocupado === canal.id}
                      onClick={() => void salvar(canal)}
                    >
                      {ocupado === canal.id ? <Spinner /> : <Save size={14} />} Salvar
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}

      {/* =============== Contrato =============== */}
      <Card titulo="Entrada — mandar mensagem do cliente para o inbox">
        <div className="p-4 space-y-3 text-xs text-muted-foreground">
          <p>
            Um POST por mensagem recebida. O campo <code className="text-foreground">contatoId</code> é
            a chave de tudo: é ele que agrupa a conversa e evita contato duplicado.{" "}
            <strong>Mande sempre o mesmo valor para a mesma pessoa</strong> — se ele mudar, o inbox
            abre uma conversa nova como se fosse outro cliente.
          </p>
          <Codigo>{`curl -X POST '${baseUrl}/api/webhooks/api?canal=<ID-DO-CANAL>' \\
  -H 'Authorization: Bearer <SEGREDO>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "contatoId":  "cliente-123",
    "nome":       "Fulano de Tal",
    "telefone":   "+5511999999999",
    "email":      "fulano@empresa.com",
    "texto":      "Olá, quero saber do apartamento 302",
    "externalId": "msg-987"
  }'`}</Codigo>
          <p>
            Campos: <code className="text-foreground">contatoId</code> (obrigatório),{" "}
            <code className="text-foreground">texto</code> (obrigatório se não houver mídia),{" "}
            <code className="text-foreground">nome</code>, <code className="text-foreground">telefone</code>,{" "}
            <code className="text-foreground">email</code>,{" "}
            <code className="text-foreground">mediaUrl</code> (https pública),{" "}
            <code className="text-foreground">mediaTipo</code> (imagem | audio | video | documento),{" "}
            <code className="text-foreground">mediaNome</code> e{" "}
            <code className="text-foreground">externalId</code> (id da sua mensagem — repetido, não
            grava duas vezes).
          </p>
          <p>Resposta:</p>
          <Codigo>{`{ "ok": true, "conversation_id": "…", "duplicate": false, "automacoes": 1 }`}</Codigo>
          <p>
            Em caso de erro vem <code className="text-foreground">{`{ "error": "motivo" }`}</code> com
            401 (segredo errado), 404 (canal inexistente) ou 400 (payload incompleto).
          </p>
        </div>
      </Card>

      <Card titulo="Saída — receber a resposta do agente">
        <div className="p-4 space-y-3 text-xs text-muted-foreground">
          <p>
            Quando o agente responde, fazemos um POST na sua{" "}
            <strong>URL de saída</strong> com o corpo abaixo. Esperamos 2xx em até 10 segundos.
          </p>
          <Codigo>{`POST <sua callback_url>
X-Arini-Evento: mensagem_enviada
X-Arini-Signature: sha256=<hmac hex do corpo cru>
Content-Type: application/json

{
  "evento": "mensagem_enviada",
  "enviado_em": "2026-07-26T12:00:00.000Z",
  "dados": {
    "conversation_id": "…",
    "contato_id": "cliente-123",
    "texto": "Bom dia! Já verifico para você.",
    "media": null
  }
}`}</Codigo>
          <p>
            A assinatura usa o <strong>mesmo esquema dos webhooks de saída</strong> do sistema: HMAC-SHA256
            do corpo <strong>cru</strong> (antes do <code className="text-foreground">JSON.parse</code>),
            em hex, com o segredo deste canal.
          </p>
          <Codigo>{`const esperado = "sha256=" + crypto
  .createHmac("sha256", SEGREDO_DO_CANAL)
  .update(corpoBruto)
  .digest("hex");

if (esperado !== req.headers["x-arini-signature"]) return res.status(401).end();`}</Codigo>
          <p>
            Se você devolver <code className="text-foreground">{`{ "id": "…" }`}</code>, guardamos esse
            valor como identificador externo da mensagem.
          </p>
          {!temApi && (
            <Alerta tipo="atencao">
              Nenhum canal por API cadastrado ainda — o contrato acima só passa a valer depois que
              existir um canal com a URL de saída preenchida.
            </Alerta>
          )}
        </div>
      </Card>

      <Card titulo="E-mail e SMS — o que muda">
        <div className="p-4 space-y-3 text-xs text-muted-foreground">
          <p>
            <strong>E-mail:</strong> a URL de entrada acima é a que se cadastra como{" "}
            <em>inbound webhook</em> na Resend. O corpo esperado é o formato inbound dela
            (<code className="text-foreground">{`{ type, data: { from, to, subject, text, html, headers } }`}</code>),
            e também aceitamos os mesmos campos no nível raiz. A resposta do agente sai pela API da
            Resend com o <code className="text-foreground">Message-ID</code> carregando o id da
            conversa — é assim que a resposta do cliente cai na mesma thread.
          </p>
          <p>
            <strong>SMS:</strong> o gateway deve fazer POST na URL de entrada com{" "}
            <code className="text-foreground">{`{ "de": "+5511…", "mensagem": "…" }`}</code> (aceitamos
            também from/Body/text e form-urlencoded, para casar com a maioria dos gateways). A saída
            faz POST na <code className="text-foreground">api_url</code> do canal com{" "}
            <code className="text-foreground">{`{ para, mensagem, remetente }`}</code> e{" "}
            <code className="text-foreground">Authorization: Bearer &lt;api_key&gt;</code>. SMS não
            envia mídia — tentar anexar devolve erro.
          </p>
        </div>
      </Card>
    </div>
  );
}
