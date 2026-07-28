"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alerta,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  Spinner,
  Table,
} from "@/components/atendimento/ui";
import type { ContatoRow } from "../tipos";

// =====================================================================
// Lista de CONTATOS BLOQUEADOS.
//
// Tela curta de propósito: quem chega aqui quer conferir quem está na
// lista e, quase sempre, tirar alguém dela.
//
// O aviso do topo é o coração da tela. O bloqueio deste sistema NÃO é o
// bloqueio de um app de mensagens — ele age em alguns canais e não age em
// outros. Esconder isso faria o operador achar que um cliente parou de
// escrever quando na verdade a mensagem dele continua entrando na caixa.
// =====================================================================

/** Só as colunas que esta tela mostra — o resto de `leads` não interessa aqui. */
export type ContatoBloqueado = Pick<
  ContatoRow,
  "id" | "nome" | "telefone" | "whatsapp" | "email" | "created_at" | "ultima_interacao_em"
>;

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function BloqueadosList({ initial }: { initial: ContatoBloqueado[] }) {
  const [contatos, setContatos] = useState<ContatoBloqueado[]>(initial);
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function desbloquear(id: string) {
    setDesbloqueando(id);
    setErro(null);
    try {
      // Mesma rota da lista de contatos: a policy `leads_write` não libera o
      // agente de atendimento, então a escrita passa pela service role da API.
      const resp = await fetch("/api/atendimento/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "massa", ids: [id], dados: { bloqueado: false } }),
      });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Falha ao desbloquear.");
      setContatos((atual) => atual.filter((c) => c.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado ao desbloquear.");
    } finally {
      setDesbloqueando(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Contatos bloqueados"
        descricao={`${contatos.length} contato(s) marcado(s) como bloqueado(s).`}
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link href="/atendimento/contatos">
              <ArrowLeft size={15} /> Todos os contatos
            </Link>
          </Button>
        }
      />

      {/* O que o bloqueio faz HOJE, canal por canal. Conferido no código. */}
      <Alerta tipo="atencao">
        <p className="font-medium mb-1">O que o bloqueio faz de verdade hoje</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <strong>Telegram e chat do site:</strong> a mensagem do contato bloqueado é descartada em
            silêncio — não é gravada e não abre nem reabre conversa. Ele não recebe aviso nenhum.
          </li>
          <li>
            <strong>WhatsApp, e-mail, SMS e canal por API:</strong> a mensagem <strong>continua
            entrando</strong> normalmente na caixa. Nesses canais o bloqueio é só uma marcação
            visual — o webhook de entrada deles ainda não confere esta flag.
          </li>
          <li>
            <strong>Campanhas:</strong> o disparo pula contato bloqueado (a tentativa fica registrada
            como falha &quot;contato bloqueado&quot;), e o público-alvo pode excluí-los no filtro.
          </li>
          <li>
            <strong>Não impede o atendente</strong> de responder manualmente uma conversa existente
            desse contato.
          </li>
        </ul>
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Card className="overflow-hidden">
        {contatos.length === 0 ? (
          <EmptyState
            icone={<ShieldCheck size={34} />}
            titulo="Nenhum contato bloqueado"
            descricao="Para bloquear alguém, selecione o contato na lista de contatos e use a ação em massa “Bloquear”, ou abra a ficha dele e clique no escudo."
            acao={
              <Button asChild variant="gold" size="sm">
                <Link href="/atendimento/contatos">Ir para contatos</Link>
              </Button>
            }
          />
        ) : (
          <Table colunas={["Nome", "Telefone", "E-mail", "Última interação", "Cadastrado em", ""]}>
            {contatos.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <ShieldOff size={14} className="text-red-500 shrink-0" />
                    {c.nome}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {c.telefone || c.whatsapp || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.email || "—"}</td>
                {/* Não existe coluna com a DATA DO BLOQUEIO em `leads` — o
                    banco só guarda o booleano. Mostrar a última interação é o
                    mais próximo honesto disso; inventar uma data seria pior. */}
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatarData(c.ultima_interacao_em)}
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatarData(c.created_at)}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={desbloqueando === c.id}
                    onClick={() => void desbloquear(c.id)}
                  >
                    {desbloqueando === c.id ? <Spinner size={14} /> : <ShieldCheck size={14} />}
                    Desbloquear
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground">
        O sistema não guarda a data em que o contato foi bloqueado — a tabela de contatos tem apenas o
        indicador de bloqueio. Se precisar dessa auditoria, ela depende de uma coluna nova no banco.
      </p>
    </PageShell>
  );
}
