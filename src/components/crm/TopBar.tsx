"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Bell, Search, User, ChevronDown, LogOut, Settings } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";

interface Notification {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  nome: string;
  email: string;
  sector: string;
  is_admin_central: boolean;
}

export function TopBar({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [openNotif, setOpenNotif] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .or(`user_id.eq.${profile.id},sector.eq.${profile.sector}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (mounted) setNotifications((data ?? []) as Notification[]);
    }
    load();
    const interval = setInterval(load, 30000); // polling 30s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [profile.id, profile.sector, supabase]);

  const unread = notifications.filter((n) => !n.lida).length;

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({ lida: true }).eq("id", id);
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, lida: true } : x)));
  }

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.lida).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ lida: true }).in("id", ids);
    setNotifications((n) => n.map((x) => ({ ...x, lida: true })));
  }

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/admin/buscar?q=${encodeURIComponent(search.trim())}`);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b flex items-center px-6 gap-4">
      {/* Busca */}
      <form onSubmit={onSearch} className="flex-1 max-w-md relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar imóvel, lead, código…"
          className="w-full h-10 pl-9 pr-4 rounded-md border border-input bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white"
        />
      </form>

      <div className="flex items-center gap-2">
        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => { setOpenNotif((v) => !v); setOpenMenu(false); }}
            className="relative w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center text-arini"
            aria-label="Notificações"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-gradient text-arini text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {openNotif && (
            <div className="absolute right-0 top-full mt-2 w-96 max-h-[500px] bg-white border rounded-lg shadow-xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-arini text-sm">Notificações</h3>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-gold-dark hover:underline">
                    Marcar todas como lidas
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-[420px]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nada por aqui ainda.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <NotificationItem key={n.id} n={n} onClick={() => markAsRead(n.id)} />
                  ))
                )}
              </div>
              <div className="border-t p-2 text-center">
                <Link href="/admin/notificacoes" className="text-xs text-arini hover:text-gold-dark">
                  Ver todas →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Menu usuário */}
        <div className="relative">
          <button
            onClick={() => { setOpenMenu((v) => !v); setOpenNotif(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-sm"
          >
            <div className="w-8 h-8 rounded-full bg-gold-gradient text-arini font-semibold flex items-center justify-center text-xs">
              {profile.nome.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <div className="text-arini font-medium">{profile.nome}</div>
              <div className="text-xs text-muted-foreground">
                {profile.is_admin_central ? "Admin Central" : profile.sector}
              </div>
            </div>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>

          {openMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border rounded-lg shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b">
                <div className="text-sm font-medium text-arini truncate">{profile.email}</div>
                <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {profile.is_admin_central ? "Administrador Central" : profile.sector}
                </div>
              </div>
              <div className="py-1">
                {profile.is_admin_central && (
                  <Link href="/admin/configuracoes" className="flex items-center gap-2 px-4 py-2 text-sm text-arini hover:bg-muted">
                    <Settings size={14} /> Configurações
                  </Link>
                )}
                <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <LogOut size={14} /> Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotificationItem({
  n,
  onClick,
}: {
  n: Notification;
  onClick: () => void;
}) {
  const content = (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b cursor-pointer hover:bg-muted/40 transition-colors ${
        !n.lida ? "bg-gold/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {!n.lida && <span className="w-2 h-2 rounded-full bg-gold-gradient mt-2 shrink-0" />}
        <div className={`flex-1 min-w-0 ${n.lida ? "ml-5" : ""}`}>
          <div className="text-sm font-medium text-arini">{n.titulo}</div>
          {n.mensagem && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1">{formatDateTimeBR(n.created_at)}</div>
        </div>
      </div>
    </div>
  );
  return n.link ? <Link href={n.link}>{content}</Link> : content;
}
