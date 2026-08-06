"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function IntegrationCard({
  platform, label, help, ativo: ativoInit, config,
}: {
  platform: string;
  label: string;
  help: string;
  ativo: boolean;
  config: Record<string, unknown>;
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInit);
  const [verifyToken, setVerifyToken] = useState((config.verify_token as string) ?? "");
  const [accessToken, setAccessToken] = useState((config.access_token as string) ?? "");
  const [extraId, setExtraId] = useState((config.page_id as string) ?? (config.phone_number_id as string) ?? "");
  const [appSecret, setAppSecret] = useState((config.app_secret as string) ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const idLabel = platform === "whatsapp" ? "Phone Number ID" : "Page / App ID";

  async function save() {
    setSaving(true);
    setMsg(null);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const newConfig: Record<string, unknown> = {
      ...config,
      verify_token: verifyToken || null,
      access_token: accessToken || null,
      app_secret: appSecret || null,
      [platform === "whatsapp" ? "phone_number_id" : "page_id"]: extraId || null,
    };
    const { error } = await supabase
      .from("social_integrations")
      .update({ ativo, config: newConfig, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq("plataforma", platform);
    setSaving(false);
    if (error) { setMsg(`Erro: ${error.message}`); return; }
    setMsg("Salvo.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{label}</span>
          <Badge variant={ativo ? "success" : "muted"}>{ativo ? "Ativo" : "Inativo"}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{help}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label>Verify Token</Label><Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="token de verificação" /></div>
          <div><Label>{idLabel}</Label><Input value={extraId} onChange={(e) => setExtraId(e.target.value)} /></div>
        </div>
        <div><Label>Access Token</Label><Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} type="password" placeholder="token de acesso" /></div>
        {/* Sem App Secret o webhook aceita QUALQUER POST que chegue na URL:
            a validação de assinatura só roda quando há segredo cadastrado.
            O campo não existia na tela, então na prática nunca rodava. */}
        <div>
          <Label>App Secret</Label>
          <Input
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            type="password"
            placeholder="segredo do app na Meta"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Valida a assinatura dos webhooks. <strong>Sem ele, qualquer um que descubra a URL
            consegue injetar mensagem falsa</strong> — a URL é pública por natureza.
          </p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativar integração
          </label>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
            <Button variant="gold" size="sm" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
