"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage } from "@/lib/utils";
import type { ChannelProvider } from "@/lib/types";
import {
  Plus,
  X,
  QrCode,
  BadgeCheck,
  Smartphone,
  Check,
  AlertTriangle,
  ArrowLeft,
  Send,
} from "lucide-react";

// As formas de conectar um canal, com os trade-offs explícitos.
// A escolha é de negócio, não técnica — por isso a tela mostra o que cada
// caminho custa (risco de bloqueio, perder o app, burocracia na Meta) em
// vez de só listar campos de formulário.
// Três caminhos são de WhatsApp; o quarto é o Telegram, que não concorre
// com eles (é outra rede) e por isso aparece na mesma lista.
const OPTIONS: {
  provider: ChannelProvider;
  titulo: string;
  subtitulo: string;
  icon: typeof QrCode;
  destaque: string;
  pros: string[];
  contras: string[];
}[] = [
  {
    provider: "evolution",
    titulo: "Evolution API",
    subtitulo: "Conexão por QR Code",
    icon: QrCode,
    destaque: "Mais rápido de subir",
    pros: [
      "Conecta em minutos, lendo um QR Code",
      "O número continua funcionando no celular",
      "Sem burocracia com a Meta e sem custo por mensagem",
    ],
    contras: [
      "Não é oficial: o WhatsApp pode bloquear o número",
      "Depende de um servidor da Evolution API no ar",
    ],
  },
  {
    provider: "cloud_api",
    titulo: "API Oficial da Meta",
    subtitulo: "O número migra para a API",
    icon: BadgeCheck,
    destaque: "Mais estável",
    pros: [
      "Oficial: sem risco de bloqueio por uso indevido",
      "Suporta templates e alto volume de mensagens",
    ],
    contras: [
      "O número PARA de funcionar no app do celular",
      "Templates de marketing são cobrados por mensagem",
    ],
  },
  {
    provider: "cloud_api_coexistence",
    titulo: "API Oficial + celular",
    subtitulo: "Coexistence — mantém o número no app",
    icon: Smartphone,
    destaque: "Melhor dos dois mundos",
    pros: [
      "Oficial E o número continua no app do celular",
      "Sincroniza o histórico dos últimos 180 dias",
      "Quem responde pelo celular aparece aqui, e vice-versa",
    ],
    contras: [
      "Exige aprovação como Tech Provider na Meta (leva semanas)",
      "Não sincroniza conversas em grupo nem chamadas",
    ],
  },
  {
    provider: "telegram_bot",
    titulo: "Telegram",
    subtitulo: "Bot criado no @BotFather",
    icon: Send,
    destaque: "Oficial e gratuito",
    pros: [
      "API oficial, gratuita e sem risco de bloqueio",
      "Conecta em minutos: basta o token do bot",
      "Aceita foto, vídeo, áudio e documento",
    ],
    contras: [
      "É outra rede — não atende quem só usa WhatsApp",
      "O cliente precisa iniciar a conversa com o bot",
      "O Telegram não informa o telefone do contato",
    ],
  },
];

function OptionCard({
  opt,
  onPick,
}: {
  opt: (typeof OPTIONS)[number];
  onPick: () => void;
}) {
  const Icon = opt.icon;
  return (
    <button
      type="button"
      onClick={onPick}
      className="text-left rounded-lg border p-4 hover:border-gold hover:bg-gold/5 transition-colors flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={20} className="text-arini dark:text-gold shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-arini dark:text-gold text-sm truncate">{opt.titulo}</div>
            <div className="text-[11px] text-muted-foreground truncate">{opt.subtitulo}</div>
          </div>
        </div>
        <span className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground shrink-0">
          {opt.destaque}
        </span>
      </div>
      <ul className="space-y-1">
        {opt.pros.map((p) => (
          <li key={p} className="text-[11px] text-muted-foreground flex gap-1.5">
            <Check size={12} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>{p}</span>
          </li>
        ))}
        {opt.contras.map((c) => (
          <li key={c} className="text-[11px] text-muted-foreground flex gap-1.5">
            <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function ConnectChannelWizard({ webhookBase }: { webhookBase: string }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ChannelProvider | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  function close() {
    setOpen(false);
    setProvider(null);
    setErro(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!provider) return;
    setLoading(true);
    setErro(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/atendimento/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provedor: provider,
          nome: fd.get("nome"),
          config: Object.fromEntries(
            Array.from(fd.entries()).filter(([k]) => k !== "nome").map(([k, v]) => [k, String(v).trim()]),
          ),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível criar o canal.");
        return;
      }
      close();
      // Evolution abre a tela do QR Code; os oficiais já ficam prontos.
      router.push(json.id ? `/atendimento/canais/${json.id}` : "/atendimento/canais");
      router.refresh();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const chosen = OPTIONS.find((o) => o.provider === provider) ?? null;

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}>
        <Plus size={16} /> Conectar canal
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={close}
        >
          <div
            className="bg-card text-card-foreground rounded-xl shadow-2xl w-full max-w-3xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2 min-w-0">
                {chosen && (
                  <button
                    type="button"
                    onClick={() => { setProvider(null); setErro(null); }}
                    className="text-muted-foreground hover:text-arini"
                    title="Voltar"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h2 className="font-display text-xl text-arini dark:text-gold truncate">
                  {chosen ? chosen.titulo : "Qual canal você quer conectar?"}
                </h2>
              </div>
              <button onClick={close} className="text-muted-foreground hover:text-arini">
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              {!chosen ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Três caminhos para o WhatsApp, com trocas diferentes, mais o Telegram. Dá para
                    ter vários canais conectados ao mesmo tempo, cada um do seu jeito.
                  </p>
                  <div className="grid md:grid-cols-3 gap-3">
                    {OPTIONS.map((o) => (
                      <OptionCard key={o.provider} opt={o} onPick={() => setProvider(o.provider)} />
                    ))}
                  </div>
                </>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <Label>Nome do canal*</Label>
                    <Input name="nome" required placeholder="Ex.: WhatsApp Comercial" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Só para o time se localizar quando houver mais de um número.
                    </p>
                  </div>

                  {provider === "evolution" && <EvolutionFields webhookBase={webhookBase} />}
                  {provider === "cloud_api" && <CloudApiFields webhookBase={webhookBase} />}
                  {provider === "cloud_api_coexistence" && (
                    <CoexistenceFields webhookBase={webhookBase} />
                  )}
                  {provider === "telegram_bot" && <TelegramFields />}

                  {erro && (
                    <div className="text-sm bg-red-50 text-red-800 border border-red-200 rounded-md px-3 py-2">
                      {erro}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="ghost" onClick={close}>
                      Cancelar
                    </Button>
                    <Button type="submit" variant="gold" disabled={loading}>
                      {loading ? "Conectando…" : "Conectar"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WebhookHint({ url }: { url: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-xs font-medium text-arini dark:text-gold mb-1">URL do webhook</div>
      <code className="text-[11px] font-mono break-all">{url}</code>
      <p className="text-xs text-muted-foreground mt-1">
        Configure este endereço no provedor para as mensagens chegarem aqui.
      </p>
    </div>
  );
}

function EvolutionFields({ webhookBase }: { webhookBase: string }) {
  return (
    <>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          A Evolution API não é oficial — ela se conecta como se fosse o WhatsApp Web. O WhatsApp
          pode bloquear o número, principalmente com disparo em massa. Para volume alto, prefira a
          API oficial.
        </span>
      </div>
      <div>
        <Label>Endereço do servidor Evolution*</Label>
        <Input name="base_url" required placeholder="https://evolution.seudominio.com.br" />
      </div>
      <div>
        <Label>API Key*</Label>
        <Input name="api_key" required type="password" placeholder="chave global da sua Evolution" />
      </div>
      <div>
        <Label>Nome da instância*</Label>
        <Input name="instance_name" required placeholder="arini-comercial" />
        <p className="text-xs text-muted-foreground mt-1">
          Sem espaços. Depois de salvar, aparece o QR Code para ler no celular.
        </p>
      </div>
      <WebhookHint url={`${webhookBase}/api/webhooks/evolution`} />
    </>
  );
}

// Telegram: só o token do BotFather. O resto (nome do bot, @usuário e o
// webhook) o sistema descobre e configura sozinho ao clicar em conectar —
// por isso aqui não há WebhookHint: a URL só existe depois de o canal ter
// um id, já que ela carrega ?canal=<id>.
function TelegramFields() {
  return (
    <>
      <div className="rounded-md bg-muted p-3 text-xs space-y-1.5">
        <div className="font-medium text-arini dark:text-gold">Como criar o bot</div>
        <ol className="list-decimal ml-4 space-y-1 text-muted-foreground">
          <li>
            No Telegram, abra a conversa com <strong>@BotFather</strong>.
          </li>
          <li>
            Envie <code>/newbot</code> e escolha um nome e um @usuário para o bot.
          </li>
          <li>Copie o token que ele devolve e cole abaixo.</li>
        </ol>
        <p className="text-muted-foreground">
          Depois de conectar, o webhook é registrado automaticamente — não é preciso configurar nada
          no Telegram.
        </p>
      </div>
      <div>
        <Label>Token do bot*</Label>
        <Input
          name="bot_token"
          required
          type="password"
          placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <p className="text-xs text-muted-foreground mt-1">
          O token dá controle total do bot — trate como senha. Quem fala com o bot precisa iniciar a
          conversa: o Telegram não deixa o bot escrever primeiro.
        </p>
      </div>
    </>
  );
}

function CloudApiFields({ webhookBase }: { webhookBase: string }) {
  return (
    <>
      <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-900 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          <strong>Atenção:</strong> neste modo o número migra para a API e <strong>deixa de
          funcionar no app do celular</strong>. Quem atendia pelo aparelho passa a atender só por
          aqui. Se isso for um problema, use a opção &ldquo;API Oficial + celular&rdquo;.
        </span>
      </div>
      <CloudApiCredentialFields />
      <WebhookHint url={`${webhookBase}/api/webhooks/whatsapp`} />
    </>
  );
}

function CoexistenceFields({ webhookBase }: { webhookBase: string }) {
  return (
    <>
      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 space-y-2">
        <div className="flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            O modo Coexistence só é liberado pela Meta para parceiros aprovados como{" "}
            <strong>Tech Provider</strong> ou <strong>Solution Partner</strong>. Antes de conectar
            é preciso concluir a verificação do negócio e a revisão do app na Meta.
          </span>
        </div>
        <div>
          Requisitos: app WhatsApp Business 2.24.17 ou superior no celular, verificação do negócio
          aprovada e permissões <code>whatsapp_business_messaging</code> e{" "}
          <code>whatsapp_business_management</code> liberadas.
        </div>
      </div>
      <CloudApiCredentialFields />
      <WebhookHint url={`${webhookBase}/api/webhooks/whatsapp`} />
      <p className="text-xs text-muted-foreground">
        Além dos campos acima, assine no painel da Meta os eventos <code>history</code>,{" "}
        <code>smb_app_state_sync</code> e <code>smb_message_echoes</code> — são eles que trazem o
        histórico e o que for respondido pelo celular.
      </p>
    </>
  );
}

// Campos comuns aos dois modos oficiais (Cloud API).
function CloudApiCredentialFields() {
  return (
    <>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Phone Number ID*</Label>
          <Input name="phone_number_id" required placeholder="106540352242922" />
        </div>
        <div>
          <Label>WhatsApp Business Account ID*</Label>
          <Input name="waba_id" required placeholder="102290129340398" />
        </div>
      </div>
      <div>
        <Label>Access Token*</Label>
        <Input name="access_token" required type="password" placeholder="token do System User" />
        <p className="text-xs text-muted-foreground mt-1">
          Use um token permanente de System User, não o token temporário de teste.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Verify Token*</Label>
          <Input name="verify_token" required placeholder="você escolhe — repita na Meta" />
        </div>
        <div>
          <Label>App Secret*</Label>
          <Input name="app_secret" required type="password" placeholder="do app na Meta" />
        </div>
      </div>
    </>
  );
}
