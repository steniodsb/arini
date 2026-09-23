"use client";

import { useState } from "react";

// =====================================================================
// AVATAR DO CONTATO — foto quando existe, iniciais coloridas quando não.
//
// As iniciais não são "fallback feio": num WhatsApp cheio de contatos sem
// foto, a cor estável por nome é o que deixa a lista escaneável. A cor sai
// de um hash do nome, então a mesma pessoa tem sempre a mesma cor.
// =====================================================================

const CORES = [
  "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-600",
  "bg-emerald-500", "bg-teal-500", "bg-cyan-600", "bg-sky-500",
  "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500", "bg-pink-500",
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  // Número no lugar do nome: mostra os dois últimos dígitos, que é o que
  // as pessoas usam para distinguir "o 51 do 87".
  if (/^\+?\d[\d\s()-]{6,}$/.test(nome)) return nome.replace(/\D/g, "").slice(-2);
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase();
}

function corDo(nome: string): string {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

export function AvatarContato({
  nome,
  url,
  tamanho = 44,
  className = "",
}: {
  nome: string;
  url?: string | null;
  /** Em px. 44 na lista (tamanho do WhatsApp), 36 no cabeçalho. */
  tamanho?: number;
  className?: string;
}) {
  // Foto que não carrega (link antigo, bucket fora) cai nas iniciais em
  // vez de deixar um quadrado quebrado.
  const [quebrou, setQuebrou] = useState(false);
  const mostrarFoto = Boolean(url) && !quebrou;
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38) };

  if (mostrarFoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url as string}
        alt=""
        width={tamanho}
        height={tamanho}
        loading="lazy"
        onError={() => setQuebrou(true)}
        className={`shrink-0 rounded-full object-cover bg-muted ${className}`}
        style={estilo}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full inline-flex items-center justify-center font-semibold text-white select-none ${corDo(nome)} ${className}`}
      style={estilo}
    >
      {iniciais(nome)}
    </span>
  );
}
