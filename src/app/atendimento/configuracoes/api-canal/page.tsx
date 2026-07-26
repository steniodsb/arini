import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";
import { ApiCanalDocs, type CanalHttp } from "./ApiCanalDocs";

export const dynamic = "force-dynamic";

/**
 * Documentação viva do canal por API genérica (e das URLs de webhook dos
 * canais de e-mail e SMS).
 *
 * A tela mostra o `webhook_secret` de cada canal — é credencial. Por isso
 * só a diretoria entra, e os dados vêm pelo client admin: a RLS de
 * atendimento_channels esconde a config do resto do time de propósito.
 */

/** Provedores que se integram por HTTP puro — os que esta tela documenta. */
const PROVEDORES_HTTP = ["api_generica", "email_smtp", "sms_generico"];

export default async function ApiCanalPage() {
  const { profile } = await requireAtendimentoUser();

  if (!profile.is_admin_central) {
    return (
      <PageShell>
        <PageHeader
          titulo="Canal por API"
          descricao="Plugue qualquer sistema próprio no inbox do atendimento."
        />
        <Alerta tipo="atencao">
          Só a diretoria vê esta tela — ela mostra os segredos que autenticam os webhooks dos
          canais.
        </Alerta>
      </PageShell>
    );
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("atendimento_channels")
    .select("id, nome, provedor, status, config")
    .in("provedor", PROVEDORES_HTTP)
    .order("created_at", { ascending: true });

  const canais: CanalHttp[] = (data ?? []).map((c) => {
    const config = (c.config ?? {}) as Record<string, string | undefined>;
    return {
      id: c.id as string,
      nome: c.nome as string,
      provedor: c.provedor as CanalHttp["provedor"],
      status: c.status as string,
      // Só o que a tela realmente precisa. api_key e afins ficam de fora:
      // não há motivo para a credencial do provedor trafegar até o browser.
      webhookSecret: config.webhook_secret ?? null,
      callbackUrl: config.callback_url ?? null,
      remetente: config.remetente ?? null,
    };
  });

  // A URL do webhook precisa ser a pública — em desenvolvimento o valor
  // cai no host local e a pessoa entende na hora que precisa de um túnel.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://atendimento.arininegociosimobiliarios.com.br";

  return (
    <PageShell>
      <ApiCanalDocs canais={canais} baseUrl={baseUrl} />
    </PageShell>
  );
}
