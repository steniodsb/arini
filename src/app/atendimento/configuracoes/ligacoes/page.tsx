import Link from "next/link";
import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoChannelSafe } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { ChannelOptions } from "../../canais/[id]/ChannelOptions";
import { PhoneOff } from "lucide-react";

export const dynamic = "force-dynamic";

// =====================================================================
// CONFIGURAÇÕES › LIGAÇÕES RECEBIDAS
//
// A mensagem que o cliente recebe ao ligar SEMPRE foi editável — em
// Canais › (o número) › "Comportamento do número". O Carlos procurou e
// não achou (23/09): "ligação" não está em lugar nenhum do menu, e
// ninguém pensa em abrir a conexão do QR Code para trocar um texto.
//
// Esta página não inventa nada: reaproveita o MESMO formulário do canal,
// um por número conectado, e dá a ele um nome no menu que diz o que
// faz. Salvar aqui vale na hora na instância, sem novo QR.
// =====================================================================

export default async function LigacoesPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("atendimento_channels_safe")
    .select("*")
    .eq("provedor", "evolution")
    .order("nome");
  const canais = (data ?? []) as AtendimentoChannelSafe[];

  return (
    <PageShell className="max-w-2xl">
      <div>
        <h1 className="font-display text-2xl text-arini dark:text-gold flex items-center gap-2">
          <PhoneOff size={22} /> Ligações recebidas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          O WhatsApp não é atendido por ligação aqui. Quando alguém liga, a chamada é recusada
          na hora e o cliente recebe a mensagem abaixo — edite o texto para o tom da casa.
        </p>
      </div>

      {canais.length === 0 && (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Nenhum número de WhatsApp conectado pela Evolution.{" "}
          <Link href="/atendimento/canais" className="text-arini dark:text-gold hover:underline">
            Conectar um número
          </Link>
          .
        </div>
      )}

      {canais.map((c) => (
        <section key={c.id} className="space-y-2">
          {canais.length > 1 && (
            <h2 className="text-sm font-semibold">
              {c.nome}
              {c.telefone ? <span className="text-muted-foreground font-normal"> · {c.telefone}</span> : null}
            </h2>
          )}
          <ChannelOptions canalId={c.id} iniciais={c.opcoes} />
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        O mesmo formulário existe em Canais › (o número). É o mesmo dado; editar num lugar
        muda no outro.
      </p>
    </PageShell>
  );
}
