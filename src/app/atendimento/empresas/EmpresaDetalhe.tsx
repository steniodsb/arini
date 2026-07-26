"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/atendimento/ui";
import type { AtendimentoCompany } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import type { ContatoVinculado } from "./EmpresasList";
import {
  X, Pencil, Trash2, Building2, Globe, Phone, Mail, MapPin,
  Briefcase, Users, ExternalLink,
} from "lucide-react";

/**
 * Painel lateral (drawer) com o detalhe da empresa e os contatos ligados
 * a ela. Excluir a empresa NÃO apaga os contatos — eles só ficam sem
 * empresa; o aviso do modal deixa isso explícito.
 */
export function EmpresaDetalhe({
  empresa,
  contatos,
  onFechar,
  onEditar,
  onExcluir,
}: {
  empresa: AtendimentoCompany;
  contatos: ContatoVinculado[];
  onFechar: () => void;
  onEditar: (e: AtendimentoCompany) => void;
  onExcluir: (e: AtendimentoCompany) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <>
      {/* Overlay só em telas menores; no desktop o drawer convive com a lista. */}
      <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onFechar} />

      <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-md border-l bg-card shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b flex items-start gap-3">
          <span className="h-10 w-10 shrink-0 rounded-lg bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 flex items-center justify-center">
            <Building2 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sm truncate">{empresa.nome}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {empresa.dominio || empresa.site || "sem domínio"}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1 rounded text-muted-foreground hover:bg-muted shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Secao titulo="Dados">
            <Dado icone={<Globe size={13} />} rotulo="Domínio" valor={empresa.dominio} />
            <Dado icone={<Phone size={13} />} rotulo="Telefone" valor={empresa.telefone} />
            <Dado icone={<Mail size={13} />} rotulo="E-mail" valor={empresa.email} />
            <Dado
              icone={<ExternalLink size={13} />}
              rotulo="Site"
              valor={empresa.site}
              href={empresa.site ? (empresa.site.startsWith("http") ? empresa.site : `https://${empresa.site}`) : null}
            />
            <Dado
              icone={<MapPin size={13} />}
              rotulo="Local"
              valor={[empresa.cidade, empresa.uf].filter(Boolean).join(" / ") || null}
            />
            <Dado icone={<Briefcase size={13} />} rotulo="Setor" valor={empresa.setor} />
            <Dado icone={<Users size={13} />} rotulo="Porte" valor={empresa.tamanho} />
            <Dado icone={<Building2 size={13} />} rotulo="Criada em" valor={formatDateBR(empresa.created_at)} />
          </Secao>

          {empresa.observacoes && (
            <Secao titulo="Observações">
              <p className="text-xs whitespace-pre-line break-words">{empresa.observacoes}</p>
            </Secao>
          )}

          <Secao titulo={`Contatos vinculados (${contatos.length})`}>
            {contatos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum contato ligado a esta empresa ainda. Vincule pelo cadastro do contato.
              </p>
            ) : (
              <div className="space-y-1">
                {contatos.map((c) => (
                  <Link
                    key={c.id}
                    href="/atendimento/contatos"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted -mx-2"
                  >
                    <span className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">
                      {(c.nome || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate">{c.nome}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {c.telefone || c.email || "—"}
                      </span>
                    </span>
                    <ExternalLink size={11} className="text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </Secao>
        </div>

        <footer className="px-5 py-3 border-t flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onEditar(empresa)} className="flex-1">
            <Pencil size={14} /> Editar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmando(true)}>
            <Trash2 size={14} /> Excluir
          </Button>
        </footer>
      </aside>

      <Modal
        aberto={confirmando}
        onFechar={() => setConfirmando(false)}
        titulo="Excluir empresa"
        descricao="Esta ação não pode ser desfeita."
        rodape={
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setConfirmando(false); onExcluir(empresa); }}
            >
              Excluir empresa
            </Button>
          </>
        }
      >
        <p className="text-sm">
          A empresa <strong>{empresa.nome}</strong> será apagada.
        </p>
        {contatos.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Os <strong>{contatos.length}</strong> contato(s) vinculado(s) <strong>não</strong> serão
            apagados — apenas ficam sem empresa.
          </p>
        )}
      </Modal>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Dado({
  icone, rotulo, valor, href,
}: {
  icone: React.ReactNode; rotulo: string; valor: string | null; href?: string | null;
}) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 flex items-center gap-1.5 min-w-[84px]">
        {icone} {rotulo}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-arini dark:text-gold hover:underline"
        >
          {valor}
        </a>
      ) : (
        <span className="truncate" title={valor}>{valor}</span>
      )}
    </div>
  );
}
