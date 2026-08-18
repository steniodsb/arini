"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alerta, Field, Modal, TextInput } from "@/components/atendimento/ui";
import { Badge } from "@/components/ui/badge";
import { errMessage } from "@/lib/utils";
import {
  AlertTriangle, Check, Facebook, Instagram, Loader2, Music2, Plug, RefreshCw,
} from "lucide-react";

// =====================================================================
// Instagram, Messenger/Facebook e TikTok.
//
// Eles não vivem em `atendimento_channels` como o WhatsApp: a credencial
// é a mesma PÁGINA da Meta que o CRM já usa, então mora em
// `social_integrations`. Duplicar o cadastro faria o time conectar duas
// vezes e, pior, ter dois tokens divergindo com o tempo.
//
// O que esta tela acrescenta ao formulário antigo do CRM:
//   · diz o que FALTA em cada plataforma (token? app secret? webhook?);
//   · testa a credencial contra a Graph API antes do cliente descobrir
//     por você que ninguém consegue responder;
//   · recusa ativar sem App Secret — sem ele o webhook aceita qualquer
//     POST que chegue na URL, que é pública por natureza.
// =====================================================================

type Estado = {
  plataforma: "instagram" | "facebook" | "messenger" | "tiktok";
  ativo: boolean;
  page_id: string | null;
  verify_token: string | null;
  tem_token: boolean;
  token_invalido: string | null;
  tem_app_secret: boolean;
  atualizado_em: string | null;
};

const META = {
  instagram: {
    nome: "Instagram Direct",
    icone: Instagram,
    descricao: "DMs do Instagram viram conversa aqui, com resposta pelo mesmo lugar.",
    exige: "Conta profissional vinculada à Página do Facebook.",
  },
  facebook: {
    nome: "Facebook",
    icone: Facebook,
    descricao: "Mensagens da Página e comentários que viram lead.",
    exige: "Página do Facebook com você como administrador.",
  },
  messenger: {
    nome: "Messenger",
    icone: Facebook,
    descricao: "Conversas do Messenger da Página.",
    exige: "É a caixa da Página do Facebook — mesma credencial dos dois.",
  },
  tiktok: {
    nome: "TikTok",
    icone: Music2,
    descricao: "Só gera lead — o TikTok não tem conversa de duas vias por API.",
    exige: "Sem conversa: mensagens não chegam nem saem.",
  },
} as const;

export function MetaChannels({ webhookBase }: { webhookBase: string }) {
  const [estados, setEstados] = useState<Estado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Estado | null>(null);

  async function carregar() {
    setErro(null);
    try {
      const res = await fetch("/api/atendimento/canais/meta");
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "não foi possível carregar"); return; }
      setEstados(json.plataformas as Estado[]);
    } catch (e) {
      setErro(errMessage(e));
    }
  }

  useEffect(() => { void carregar(); }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-arini dark:text-gold">Redes sociais</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Instagram e Messenger usam a Página da Meta — a mesma credencial do CRM.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Atualizar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {estados === null ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {estados.map((e) => (
            <CartaoPlataforma
              key={e.plataforma}
              estado={e}
              onEditar={() => setEditando(e)}
            />
          ))}
        </ul>
      )}

      {editando && (
        <ModalCredenciais
          estado={editando}
          webhookBase={webhookBase}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); void carregar(); }}
        />
      )}
    </section>
  );
}

function CartaoPlataforma({ estado, onEditar }: { estado: Estado; onEditar: () => void }) {
  const meta = META[estado.plataforma];
  const Icone = meta.icone;
  const ehTikTok = estado.plataforma === "tiktok";

  // O que falta, em ordem de quem trava o quê.
  const pendencias: string[] = [];
  if (estado.token_invalido) pendencias.push(`token inválido — ${estado.token_invalido}`);
  else if (!estado.tem_token) pendencias.push("falta o token de página");
  if (!estado.tem_app_secret) pendencias.push("falta o App Secret");
  if (!estado.verify_token) pendencias.push("falta o Verify Token");
  if (!estado.page_id) pendencias.push("falta o Page ID");

  return (
    <li className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icone size={18} className="text-arini dark:text-gold shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{meta.nome}</div>
            <div className="text-[11px] text-muted-foreground">{meta.descricao}</div>
          </div>
        </div>
        <Badge variant={estado.ativo ? "success" : "muted"}>
          {estado.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      {estado.ativo && estado.token_invalido && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300 flex gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            Ativo com credencial quebrada: recebe mensagem mas <strong>não responde</strong>.
          </span>
        </div>
      )}
      {estado.ativo && !estado.tem_app_secret && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 flex gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>Sem App Secret: o webhook aceita qualquer POST na URL pública.</span>
        </div>
      )}

      {pendencias.length > 0 && !ehTikTok && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {pendencias.map((p) => <li key={p}>· {p}</li>)}
        </ul>
      )}
      {ehTikTok && (
        <p className="text-[11px] text-muted-foreground">{meta.exige}</p>
      )}

      <div className="pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onEditar}>
          <Plug size={14} /> {estado.tem_token ? "Revisar credenciais" : "Conectar"}
        </Button>
      </div>
    </li>
  );
}

function ModalCredenciais({
  estado,
  webhookBase,
  onFechar,
  onSalvo,
}: {
  estado: Estado;
  webhookBase: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const meta = META[estado.plataforma];
  const [pageId, setPageId] = useState(estado.page_id ?? "");
  const [verifyToken, setVerifyToken] = useState(estado.verify_token ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [ativo, setAtivo] = useState(estado.ativo);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);

  const url = `${webhookBase}/api/webhooks/${estado.plataforma}`;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/atendimento/canais/meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plataforma: estado.plataforma,
          page_id: pageId,
          verify_token: verifyToken,
          access_token: accessToken,
          app_secret: appSecret,
          ativo,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "não foi possível salvar"); return; }
      onSalvo();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    setErro(null);
    try {
      const res = await fetch("/api/atendimento/canais/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plataforma: estado.plataforma }),
      });
      const json = await res.json();
      setTeste(
        json.ok
          ? {
              ok: true,
              texto: json.instagram
                ? `Página "${json.pagina}", Instagram @${json.instagram}`
                : `Página "${json.pagina}"`,
            }
          : { ok: false, texto: json.motivo ?? json.error ?? "falhou" },
      );
    } catch (e) {
      setTeste({ ok: false, texto: errMessage(e) });
    } finally {
      setTestando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={meta.nome}
      descricao={meta.exige}
      largura="max-w-xl"
      rodape={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          {estado.plataforma !== "tiktok" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void testar()}
              disabled={testando || !estado.tem_token}
              title={estado.tem_token ? "Consulta a Página na Graph API" : "Salve o token primeiro"}
            >
              {testando ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
              Testar
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar
          </Button>
        </>
      }
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {teste && (
        <Alerta tipo={teste.ok ? "sucesso" : "erro"}>
          {teste.ok ? `Credencial válida — ${teste.texto}` : `Falhou: ${teste.texto}`}
        </Alerta>
      )}

      {estado.plataforma === "tiktok" ? (
        <Alerta tipo="info">
          O TikTok entra só como <strong>origem de lead</strong>: não existe API pública de
          mensagens para responder. Quem escreve por lá precisa ser trazido para outro canal.
        </Alerta>
      ) : (
        <>
          {(estado.plataforma === "messenger" || estado.plataforma === "facebook") && (
            <Alerta tipo="info">
              <strong>Facebook e Messenger dividem a mesma credencial</strong> — é a mesma
              Página da Meta. Salvar aqui altera os dois cartões, e as duas URLs de webhook
              (<code>/facebook</code> e <code>/messenger</code>) passam a valer com este
              mesmo Verify Token.
            </Alerta>
          )}

          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <div className="font-medium text-arini dark:text-gold">URL do webhook</div>
            <code className="text-[11px] font-mono break-all">{url}</code>
            <p className="text-muted-foreground">
              Cadastre no app da Meta com o mesmo Verify Token abaixo e assine os eventos{" "}
              <code>messages</code> e <code>messaging_postbacks</code>. Depois, inscreva a Página
              no app — sem isso a Meta valida a URL e mesmo assim não entrega nada.
            </p>
          </div>

          <Field label="Page ID" dica="O ID numérico da Página do Facebook.">
            <TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="671747376016929" />
          </Field>

          <Field
            label="Access Token de Página"
            dica={
              estado.tem_token
                ? "Já existe um token salvo. Deixe em branco para mantê-lo."
                : "Use um token permanente de System User — o de teste expira em horas."
            }
          >
            <TextInput
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={estado.tem_token ? "•••••••• (mantido)" : "EAAG..."}
            />
          </Field>

          <Field label="Verify Token" dica="Você escolhe; precisa ser idêntico ao cadastrado na Meta.">
            <TextInput value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
          </Field>

          <Field
            label="App Secret"
            dica={
              estado.tem_app_secret
                ? "Já existe um segredo salvo. Deixe em branco para mantê-lo."
                : "Valida a assinatura dos webhooks. Obrigatório para ativar."
            }
          >
            <TextInput
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={estado.tem_app_secret ? "•••••••• (mantido)" : "do app na Meta"}
            />
          </Field>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Integração ativa — recebe mensagens desta plataforma.
              {!estado.tem_app_secret && !appSecret && (
                <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                  Exige o App Secret preenchido.
                </span>
              )}
            </span>
          </label>
        </>
      )}
    </Modal>
  );
}
