import { requireDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationCard } from "./IntegrationCard";

const PLATFORMS: { key: string; label: string; help: string }[] = [
  { key: "instagram", label: "Instagram", help: "Meta App + Instagram Graph API. Configure o verify_token e o access_token da página." },
  { key: "facebook", label: "Facebook", help: "Meta App + Facebook Page. Webhook de mensagens (Messenger)." },
  { key: "whatsapp", label: "WhatsApp", help: "WhatsApp Cloud API (Meta). Phone Number ID + token + verify_token." },
  { key: "tiktok", label: "TikTok", help: "TikTok for Developers. Lead generation / messaging API." },
];

export default async function IntegracoesPage() {
  await requireDiretoria();
  const supabase = createSupabaseServer();
  const { data: integrations } = await supabase.from("social_integrations").select("*");
  const byPlatform: Record<string, { id: string; ativo: boolean; config: Record<string, unknown> }> = {};
  for (const i of integrations ?? []) byPlatform[i.plataforma] = i;

  // URL pública do webhook (preencha NEXT_PUBLIC_SITE_URL no deploy).
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://SEU-DOMINIO";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Integrações</h1>
        <p className="text-muted-foreground mt-1">
          Conecte Instagram, Facebook, WhatsApp e TikTok para receber mensagens como leads.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Como conectar</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Crie um app no Meta for Developers (IG/FB/WhatsApp) ou TikTok for Developers.</p>
          <p>2. Configure o webhook apontando para a URL abaixo e defina o mesmo <code>verify_token</code> aqui.</p>
          <p>3. Cole o <code>access_token</code> e ative a integração. As mensagens recebidas viram leads automaticamente.</p>
          <div className="mt-2 space-y-1">
            {PLATFORMS.map((p) => (
              <div key={p.key} className="font-mono text-xs bg-muted rounded px-2 py-1">
                {base}/api/webhooks/{p.key}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {PLATFORMS.map((p) => (
          <IntegrationCard
            key={p.key}
            platform={p.key}
            label={p.label}
            help={p.help}
            ativo={byPlatform[p.key]?.ativo ?? false}
            config={byPlatform[p.key]?.config ?? {}}
          />
        ))}
      </div>
    </div>
  );
}
