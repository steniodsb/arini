"use client";

import { useEffect } from "react";
import { X, Inbox as InboxIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// =====================================================================
// Kit de UI do Atendimento — modal, campo, switch, cabeçalho e estados
// vazios. Todas as telas do atendimento usam estes blocos para o visual
// ficar consistente (e funcionar no tema claro E no escuro).
// =====================================================================

/** Cabeçalho padrão de página (título, descrição e ações à direita). */
export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-display text-xl text-arini dark:text-gold">{titulo}</h1>
        {descricao && <p className="text-sm text-muted-foreground mt-0.5">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  );
}

/** Casca de página com padding e rolagem — use em toda tela do atendimento. */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-6 space-y-5 h-full overflow-y-auto", className)}>{children}</div>;
}

/** Modal centralizado com overlay. Fecha no Esc e no clique fora. */
export function Modal({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = "max-w-lg",
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onFechar}
    >
      <div
        className={cn(
          "w-full rounded-xl border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[90vh]",
          largura,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sm">{titulo}</h2>
            {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1 rounded text-muted-foreground hover:bg-muted shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">{children}</div>
        {rodape && <div className="px-5 py-3 border-t flex justify-end gap-2 shrink-0">{rodape}</div>}
      </div>
    </div>
  );
}

/** Campo de formulário com rótulo e dica. */
export function Field({
  label,
  dica,
  obrigatorio,
  children,
  className,
}: {
  label: string;
  dica?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium">
        {label}
        {obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {dica && <span className="block text-[11px] text-muted-foreground">{dica}</span>}
    </label>
  );
}

/** Input de texto padrão (classe compartilhada). */
export const inputCls =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "resize-y min-h-[70px]", props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, props.className)} />;
}

/** Interruptor liga/desliga. */
export function Switch({
  checked,
  onChange,
  label,
  dica,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  dica?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors relative disabled:opacity-50",
          checked ? "bg-acao" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      {(label || dica) && (
        <div className="min-w-0">
          {label && <div className="text-sm leading-tight">{label}</div>}
          {dica && <div className="text-[11px] text-muted-foreground mt-0.5">{dica}</div>}
        </div>
      )}
    </div>
  );
}

/** Estado vazio com ícone, texto e ação opcional. */
export function EmptyState({
  titulo,
  descricao,
  icone,
  acao,
}: {
  titulo: string;
  descricao?: string;
  icone?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="text-muted-foreground/40">{icone ?? <InboxIcon size={34} />}</div>
      <p className="text-sm font-medium">{titulo}</p>
      {descricao && <p className="text-xs text-muted-foreground max-w-sm">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/** Cartão simples com borda. */
export function Card({
  children,
  className,
  titulo,
  descricao,
  acoes,
}: {
  children?: React.ReactNode;
  className?: string;
  titulo?: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {(titulo || acoes) && (
        <header className="px-4 py-3 border-b flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {titulo && <h3 className="text-sm font-semibold truncate">{titulo}</h3>}
            {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
          </div>
          {acoes}
        </header>
      )}
      {children}
    </section>
  );
}

/** Tabela leve, com cabeçalho e zebra sutil. */
export function Table({
  colunas,
  children,
}: {
  colunas: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {colunas.map((c) => (
              <th key={c} className="text-left font-medium px-3 py-2 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Spinner({ size = 15 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}

/** Aviso colorido (info / atenção / erro / sucesso). */
export function Alerta({
  tipo = "info",
  children,
}: {
  tipo?: "info" | "atencao" | "erro" | "sucesso";
  children: React.ReactNode;
}) {
  const cls = {
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
    atencao: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25",
    erro: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25",
    sucesso: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  }[tipo];
  return <div className={cn("rounded-lg border px-3 py-2 text-xs", cls)}>{children}</div>;
}
