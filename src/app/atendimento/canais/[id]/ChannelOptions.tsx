"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errMessage } from "@/lib/utils";
import type { EvolutionInstanceOptions } from "@/lib/types";
import { PhoneOff, Save, History, Users, Eye, CheckCheck } from "lucide-react";

// =====================================================================
// Comportamento da instância (só Evolution/Baileys).
//
// Por que esta tela existe: estes valores eram literais dentro de
// `ensureInstance`, no corpo do `/instance/create`. Esse corpo só roda uma
// vez na vida da instância — depois disso a Evolution responde 403 e o
// código cai no caminho de reconectar, que nem olhava para eles. Na
// prática a recepção ficou meses recusando ligação com um texto que
// ninguém conseguia mudar, nem editando o código-fonte.
//
// Agora o salvar bate no `/settings/set`, que é o endpoint que alcança
// instância já criada, e o valor vale na hora, sem novo QR.
// =====================================================================

const PADRAO: EvolutionInstanceOptions = {
  rejectCall: true,
  msgCall: "Não atendemos ligações por aqui. Pode escrever que respondemos.",
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: true,
  syncFullHistory: false,
};

// Limite do WhatsApp para a mensagem de recusa. Acima disso a Evolution
// aceita e o WhatsApp trunca — melhor barrar aqui, onde dá para explicar.
const MAX_MSG = 200;

function Chave({
  icone, titulo, descricao, valor, onChange, aviso,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  aviso?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[#c9a961] shrink-0"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-arini dark:text-gold">
          {icone} {titulo}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
        {aviso && valor && (
          <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-1">{aviso}</p>
        )}
      </div>
    </label>
  );
}

export function ChannelOptions({
  canalId,
  iniciais,
}: {
  canalId: string;
  iniciais: EvolutionInstanceOptions | null;
}) {
  // Canal criado antes da coluna existir vem `null` — cai nos padrões, que
  // são exatamente o que estava fixo no código até aqui.
  const [op, setOp] = useState<EvolutionInstanceOptions>({ ...PADRAO, ...(iniciais ?? {}) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  function set<K extends keyof EvolutionInstanceOptions>(k: K, v: EvolutionInstanceOptions[K]) {
    setOp((p) => ({ ...p, [k]: v }));
    setOk(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch(`/api/atendimento/canais/${canalId}/opcoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "falha ao salvar");
      setOp({ ...PADRAO, ...(json.opcoes ?? {}) });
      setOk(true);
      router.refresh();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(false);
    }
  }

  const msgVazia = op.rejectCall && !op.msgCall.trim();

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-arini dark:text-gold">Comportamento do número</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Vale na hora, sem precisar ler o QR Code de novo.
        </p>
      </div>

      <Chave
        icone={<PhoneOff size={14} />}
        titulo="Recusar ligações automaticamente"
        descricao="O WhatsApp corta a chamada assim que ela chega e responde com a mensagem abaixo."
        valor={op.rejectCall}
        onChange={(v) => set("rejectCall", v)}
      />

      {op.rejectCall && (
        <div className="pl-3 border-l-2 border-gold/40 space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            Mensagem enviada ao recusar
          </label>
          <Textarea
            rows={2}
            maxLength={MAX_MSG}
            value={op.msgCall}
            onChange={(e) => set("msgCall", e.target.value)}
            placeholder="Ex.: Olá! Não atendemos por ligação. Escreva aqui que respondemos rapidinho."
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {msgVazia
                ? "Sem texto, o cliente leva uma chamada cortada sem explicação."
                : "É o que o cliente lê logo após a chamada cair."}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {op.msgCall.length}/{MAX_MSG}
            </span>
          </div>
        </div>
      )}

      <Chave
        icone={<History size={14} />}
        titulo="Importar o histórico do aparelho ao parear"
        descricao="Traz as conversas que já estão no celular para dentro da plataforma."
        valor={op.syncFullHistory}
        onChange={(v) => set("syncFullHistory", v)}
        aviso="Só vale a partir do PRÓXIMO pareamento — ligar isto agora não traz o que já passou. E a importação deixa a instância pesada nos primeiros minutos."
      />

      <Chave
        icone={<Users size={14} />}
        titulo="Ignorar mensagens de grupo"
        descricao="Grupos não viram conversa no inbox. Recomendado: o atendimento aqui é um a um."
        valor={op.groupsIgnore}
        onChange={(v) => set("groupsIgnore", v)}
      />

      <Chave
        icone={<CheckCheck size={14} />}
        titulo="Marcar como lida ao responder"
        descricao="O cliente vê o visto azul quando alguém responde pela plataforma."
        valor={op.readMessages}
        onChange={(v) => set("readMessages", v)}
      />

      <Chave
        icone={<Eye size={14} />}
        titulo='Manter o número sempre "online"'
        descricao="O cliente vê o número como online o tempo todo."
        valor={op.alwaysOnline}
        onChange={(v) => set("alwaysOnline", v)}
        aviso="Com isto ligado o WhatsApp deixa de enviar notificação para o celular — o aparelho é tratado como se já estivesse com a conversa aberta."
      />

      <div className="flex items-center gap-3 pt-1">
        <Button type="button" variant="gold" size="sm" onClick={salvar} disabled={salvando}>
          <Save size={14} /> {salvando ? "Salvando…" : "Salvar"}
        </Button>
        {ok && <span className="text-xs text-emerald-600">Aplicado no número.</span>}
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>
    </div>
  );
}
