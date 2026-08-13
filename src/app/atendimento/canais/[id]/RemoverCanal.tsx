"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alerta, Modal, TextInput } from "@/components/atendimento/ui";
import { errMessage } from "@/lib/utils";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

// =====================================================================
// Remover canal.
//
// Duas travas de propósito:
//
// 1. Digitar o NOME do canal. Não é burocracia: numa tela com vários
//    números conectados, "Excluir" no canal errado tira do ar o WhatsApp
//    que estava atendendo — e o histórico não diz qual era.
//
// 2. Apagar a instância na Evolution é OPT-IN, separado. Remover o
//    cadastro daqui é reversível (recadastra e lê o QR de novo); apagar a
//    instância lá é definitivo, leva junto sessão, contatos e chats.
// =====================================================================

export function RemoverCanal({
  canalId,
  nome,
  ehEvolution,
  instancia,
}: {
  canalId: string;
  nome: string;
  ehEvolution: boolean;
  instancia?: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagarInstancia, setApagarInstancia] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeExcluir = confirmacao.trim() === nome.trim();

  async function excluir() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(
        `/api/atendimento/canais/${canalId}${apagarInstancia ? "?apagarInstancia=1" : ""}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "não foi possível remover"); return; }
      router.push("/atendimento/canais");
      router.refresh();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-red-500/30 p-4 space-y-2">
        <h2 className="font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
          <AlertTriangle size={15} /> Remover canal
        </h2>
        <p className="text-sm text-muted-foreground">
          As conversas <strong>não são apagadas</strong>: elas perdem o vínculo com este número e
          passam a ser respondidas por outro canal conectado do mesmo tipo.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => { setErro(null); setAberto(true); }}>
          <Trash2 size={14} /> Remover
        </Button>
      </div>

      <Modal
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={`Remover ${nome}?`}
        descricao="Para confirmar, digite o nome do canal exatamente como está acima."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void excluir()}
              disabled={ocupado || !podeExcluir}
            >
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Remover canal
            </Button>
          </>
        }
      >
        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <TextInput
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          placeholder={nome}
          autoFocus
        />

        {ehEvolution && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={apagarInstancia}
              onChange={(e) => setApagarInstancia(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Apagar também a instância <code className="font-mono">{instancia ?? "—"}</code> no
              servidor da Evolution.
              <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                Irreversível: derruba a sessão do WhatsApp e apaga contatos e chats guardados lá.
                Sem marcar, a instância continua no servidor e pode ser reaproveitada.
              </span>
            </span>
          </label>
        )}
      </Modal>
    </>
  );
}
