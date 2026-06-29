import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Roteamento por host:
//   - dominio raiz (ex.: arini.com.br / www.) → SITE PÚBLICO. /admin é
//     redirecionado para o subdomínio do CRM.
//   - crm.dominio → CRM (admin). A raiz "/" vai para /admin; rotas públicas
//     são devolvidas ao domínio raiz.
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
  const isAdminPath = path.startsWith("/admin");
  const isApiPath = path.startsWith("/api");

  const redirectToHost = (targetHostname: string, pathname = path) =>
    NextResponse.redirect(`${proto}://${targetHostname}${pathname}${req.nextUrl.search}`);

  // 1) Split por host (somente em domínios reais).
  if (!isSingleHost(hostname)) {
    if (isCrmHost) {
      // Entrada do CRM: crm.dominio/ → /admin
      if (path === "/") return redirectToHost(hostname, "/admin");
      // Conteúdo público não pertence ao subdomínio do CRM → volta pro raiz.
      if (!isAdminPath && !isApiPath) return redirectToHost(hostname.slice(4));
    } else {
      // No domínio raiz, o CRM (/admin) mora no subdomínio crm.
      if (isAdminPath) return redirectToHost(`crm.${hostname.replace(/^www\./, "")}`);
    }
  }

  // 2) Guarda de autenticação do CRM (igual ao comportamento anterior).
  if (isAdminPath) {
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
    const isLoginPage = path === "/admin/login";

    if (!isLoginPage && !user) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    if (isLoginPage && user) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
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
