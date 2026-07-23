import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Roteamento por host — três sistemas no mesmo deploy, hosts distintos:
//   - dominio raiz (ex.: arini.com.br / www.) → SITE PÚBLICO.
//   - crm.dominio          → CRM de imóveis (/admin), login próprio.
//   - atendimento.dominio  → SISTEMA DE ATENDIMENTO (/atendimento),
//                            login próprio e sessão própria (cookie por
//                            subdomínio), compartilhando o mesmo banco.
// Em localhost e previews (*.vercel.app) tudo roda no mesmo host (sem split),
// para o desenvolvimento e os deploys de preview continuarem funcionando.

function isSingleHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".vercel.app") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  );
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "") ?? "https";
  const path = req.nextUrl.pathname;

  const isCrmHost = hostname.startsWith("crm.");
  const isAtendimentoHost = hostname.startsWith("atendimento.");
  const isAdminPath = path.startsWith("/admin");
  const isAtendimentoPath = path.startsWith("/atendimento");
  const isApiPath = path.startsWith("/api");
  const baseHost = hostname.replace(/^(crm|atendimento)\./, "").replace(/^www\./, "");

  const redirectToHost = (targetHostname: string, pathname = path) =>
    NextResponse.redirect(`${proto}://${targetHostname}${pathname}${req.nextUrl.search}`);

  // 1) Split por host (somente em domínios reais).
  if (!isSingleHost(hostname)) {
    if (isAtendimentoHost) {
      // Entrada do Atendimento: atendimento.dominio/ → /atendimento
      if (path === "/") return redirectToHost(hostname, "/atendimento");
      // O CRM não mora aqui.
      if (isAdminPath) return redirectToHost(`crm.${baseHost}`);
      // Qualquer outro conteúdo (site público) volta pro domínio raiz.
      if (!isAtendimentoPath && !isApiPath) return redirectToHost(baseHost);
    } else if (isCrmHost) {
      // Entrada do CRM: crm.dominio/ → /admin
      if (path === "/") return redirectToHost(hostname, "/admin");
      // O Atendimento é outro sistema, em outro host.
      if (isAtendimentoPath) return redirectToHost(`atendimento.${baseHost}`);
      // Conteúdo público não pertence ao subdomínio do CRM → volta pro raiz.
      if (!isAdminPath && !isApiPath) return redirectToHost(baseHost);
    } else {
      // No domínio raiz, cada sistema mora no seu subdomínio.
      if (isAdminPath) return redirectToHost(`crm.${baseHost}`);
      if (isAtendimentoPath) return redirectToHost(`atendimento.${baseHost}`);
    }
  }

  // 2) Guardas de sessão. CRM e Atendimento têm login próprio e cada um
  //    redireciona para a SUA tela de login.
  if (isAdminPath || isAtendimentoPath) {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set({ name, value, ...options });
            });
          },
        },
      },
    );

    const { data: { user } } = await supabase.auth.getUser();

    const loginPath = isAtendimentoPath ? "/atendimento/login" : "/admin/login";
    const homePath = isAtendimentoPath ? "/atendimento" : "/admin";
    const isLoginPage = path === loginPath;
    // A tela "sem acesso" precisa abrir mesmo sem permissão (só exige sessão).
    const isNoAccessPage = path === "/atendimento/sem-acesso";

    if (!isLoginPage && !user) {
      const url = req.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    if (isLoginPage && user && !isNoAccessPage) {
      const url = req.nextUrl.clone();
      url.pathname = homePath;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Roda em tudo, menos assets do Next e arquivos estáticos (com extensão).
  matcher: ["/((?!_next|favicon.ico|.*\\.[\\w]+$).*)"],
};
