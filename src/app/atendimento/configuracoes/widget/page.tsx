import { MessageSquareCode } from "lucide-react";
import Link from "next/link";
import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageShell, PageHeader, EmptyState } from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";
import { WidgetManager, type CaixaSite } from "./WidgetManager";

export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Colunas explícitas de propósito: `widget_secret` NÃO pode ser serializado
  // para o cliente. Um `select("*")` aqui mandaria o segredo no HTML da página.
  const { data } = await supabase
    .from("atendimento_inboxes")
    .select(
      "id, nome, widget_token, widget_titulo, widget_saudacao, widget_cor, " +
      "widget_posicao, widget_dominios, pre_chat_ativo, saudacao_ativa, saudacao_texto",
    )
    .eq("canal", "site")
    .eq("ativo", true)
    .order("nome");

  const caixas = (data ?? []) as unknown as CaixaSite[];

  return (
    <PageShell>
      <PageHeader
        titulo="Chat do site"
        descricao="Widget de live-chat para instalar no site do cliente. A conversa cai no inbox como qualquer outro canal."
      />

      {caixas.length === 0 ? (
        <EmptyState
          icone={<MessageSquareCode size={34} />}
          titulo="Nenhuma caixa de entrada do tipo site"
          descricao="O chat do site precisa de uma caixa com o canal “Site”. Crie uma em Configurações › Caixas de entrada e volte aqui para pegar a tag de instalação."
          acao={
            <Button asChild variant="outline" size="sm">
              <Link href="/atendimento/configuracoes/caixas">Ir para Caixas de entrada</Link>
            </Button>
          }
        />
      ) : (
        <WidgetManager
          caixas={caixas}
          siteUrl={(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")}
        />
      )}
    </PageShell>
  );
}
