/* eslint-disable */
require("dotenv").config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arini@steniowebdesigner.com", password: "Arini2026@!" }),
  });
  const j = await res.json();
  if (!j.access_token) { console.error("LOGIN FAIL:", j); return; }
  console.log("✅ Login Supabase:", j.user?.email);

  const ref = process.env.SUPABASE_PROJECT_REF;
  const cookieName = `sb-${ref}-auth-token`;
  const cookieValue = `base64-${Buffer.from(JSON.stringify({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    user: j.user,
    expires_at: Math.floor(Date.now() / 1000) + j.expires_in,
    expires_in: j.expires_in,
    token_type: "bearer",
  })).toString("base64")}`;

  for (const path of ["/admin", "/admin/captacao", "/admin/leads", "/admin/marketing", "/admin/aprovacoes", "/admin/financeiro-imovel", "/admin/financeiro-empresarial"]) {
    const r = await fetch(`http://localhost:3001${path}`, {
      headers: { Cookie: `${cookieName}=${encodeURIComponent(cookieValue)}` },
      redirect: "manual",
    });
    const body = await r.text();
    const hasError = body.includes("server-side exception") || body.includes("Application error");
    console.log(`${path} → HTTP ${r.status}${hasError ? " ❌ APP ERROR" : ""}`);
  }
}
main().catch(console.error);
