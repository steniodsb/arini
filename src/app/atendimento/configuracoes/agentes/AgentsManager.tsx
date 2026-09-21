"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alerta, Modal } from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";
import {
  Users2, Check, UserPlus, UserX, UserCheck, Copy, Dice5, Trash2, Link as LinkIcon,
} from "lucide-react";
import {
  PAPEL_LABELS, PAPEL_DESCRICAO, SECTOR_LABELS,
  type AtendimentoPapel, type AtendimentoTeam, type Sector,
} from "@/lib/types";

// =====================================================================
// AGENTES — acesso, CARGO, PAPEL e FILAS.
//
// As quatro colunas respondem perguntas diferentes e nenhuma substitui as
// outras:
//   · ACESSO  — a pessoa entra no sistema de atendimento?
//   · CARGO   — como ela se identifica para o time (0043). É rótulo, não
//               permissão: "Corretora", "Gerente de Locação". Aparece ao
//               lado do nome no seletor de responsável, na triagem e no
//               histórico de quem assumiu o quê.
//   · PAPEL   — ela tria, atende ou administra? (eixo da RLS na 0040)
//   · FILAS   — de quais equipes ela participa?
//
// A coluna FILAS não é enfeite: um `atendente` sem nenhuma fila não
// enxerga conversa nenhuma. A tela avisa isso explicitamente na linha,
// senão o suporte recebe "o sistema não mostra nada para o Fulano" e
// ninguém liga a causa ao efeito.
//
// Acesso e papel gravam pela rota /api/atendimento/agentes (que audita).
// As filas gravam direto em `atendimento_team_members` pelo cliente, como
// já faz a tela de Equipes — é vínculo de equipe, não permissão de
// leitura de conversa alheia.
// =====================================================================

type AgentRow = {
  id: string;
  nome: string;
  email: string;
  sector: string;
  cargo: string | null;
  is_admin_central: boolean;
  atendimento_access: boolean;
  atendimento_papel: AtendimentoPapel;
  ativo: boolean;
};

/** Mesmo limite da rota — a tela avisa antes de o servidor recusar. */
const CARGO_MAX = 40;

/** Mesmo teto da API. Nome vazio não é "apagar", é erro de digitação. */
const NOME_MAX = 60;

/**
 * Sugestões de cargo. Não é um enum: imobiliária inventa função nova toda
 * hora, e travar a lista só faria alguém escrever "Corretor" no campo
 * errado. É `datalist` — sugere sem impedir.
 */
const CARGOS_SUGERIDOS = [
  "Corretor", "Corretora", "Captador", "Captadora",
  "Recepcionista", "Gerente de Locação", "Gerente de Vendas",
  "Marketing", "Financeiro", "Jurídico", "Administrativo", "Diretoria",
];

type Member = { team_id: string; profile_id: string };

export function AgentsManager({
  initial,
  canManage,
  teams,
  initialMembers,
  assinaturaLigada,
}: {
  initial: AgentRow[];
  canManage: boolean;
  teams: AtendimentoTeam[];
  initialMembers: Member[];
  /**
   * Alguma caixa assina a resposta com o nome do atendente (0053)? Quando
   * sim, o nome desta tela vai para o WhatsApp do cliente — e a tela
   * precisa dizer isso, senão ninguém liga uma coisa à outra.
   */
  assinaturaLigada: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filasDe, setFilasDe] = useState<AgentRow | null>(null);
  // O que está sendo digitado no campo de cargo, por agente. Some no blur:
  // aí a fonte da verdade volta a ser a linha (que já foi gravada, ou
  // revertida se o servidor recusou).
  const [rascunhoCargo, setRascunhoCargo] = useState<Record<string, string>>({});
  const [rascunhoNome, setRascunhoNome] = useState<Record<string, string>>({});
  const [rascunhoEmail, setRascunhoEmail] = useState<Record<string, string>>({});
  // E-mail NÃO grava no blur como os outros campos: ele é a credencial de
  // login. Trocar sem querer, ao sair do campo, tranca a pessoa para fora
  // do sistema. Aqui fica o valor esperando um segundo clique.
  const [emailPendente, setEmailPendente] = useState<Record<string, string>>({});

  // --- Cadastro de agente novo ---------------------------------------
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({
    nome: "", email: "", sector: "recepcao", cargo: "",
    atendimento_papel: "atendente" as AtendimentoPapel, access: true, filas: [] as string[],
  });
  const [criando, setCriando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  // Segredo recém-gerado (senha ou link). Aparece uma vez, por linha.
  const [segredo, setSegredo] = useState<{ id: string; tipo: "senha" | "link"; valor: string } | null>(null);
  const [senhaDigitada, setSenhaDigitada] = useState<Record<string, string>>({});
  // A senha volta do servidor UMA vez e não fica gravada em lugar nenhum.
  const [recemCriado, setRecemCriado] = useState<{ nome: string; email: string; senha: string } | null>(null);

  async function criarAgente() {
    setCriando(true);
    setError(null);
    const res = await fetch("/api/atendimento/agentes/criar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    });
    setCriando(false);
    const j = (await res.json().catch(() => ({}))) as {
      error?: string; agente?: AgentRow; senha?: string;
    };
    if (!res.ok || !j.agente) {
      setError(j.error ?? "Falha ao criar o agente.");
      return;
    }
    setRows((p) => [...p, j.agente as AgentRow].sort((a, b) => a.nome.localeCompare(b.nome)));
    if (novo.filas.length) {
      setMembers((p) => [
        ...p,
        ...novo.filas.map((team_id) => ({ team_id, profile_id: (j.agente as AgentRow).id })),
      ]);
    }
    setRecemCriado({ nome: novo.nome, email: novo.email, senha: j.senha ?? "" });
    setNovoAberto(false);
    setNovo({
      nome: "", email: "", sector: "recepcao", cargo: "",
      atendimento_papel: "atendente", access: true, filas: [],
    });
  }

  const nomeEquipe = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.nome);
    return m;
  }, [teams]);

  const filasDoAgente = (id: string) =>
    members.filter((m) => m.profile_id === id).map((m) => m.team_id);

  async function salvar(id: string, corpo: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/atendimento/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: id, ...corpo }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Falha ao salvar.");
      return false;
    }
    return true;
  }

  async function alternarAcesso(id: string, access: boolean) {
    if (await salvar(id, { access })) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_access: access } : r)));
    }
  }

  /**
   * Chamada que devolve um SEGREDO (senha nova ou link de acesso). A
   * resposta aparece uma vez na tela e não fica guardada em lugar nenhum:
   * a senha vira hash no Auth e o link é de uso único.
   */
  async function pedirSegredo(id: string, corpo: Record<string, unknown>, tipo: "senha" | "link") {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/atendimento/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: id, ...corpo }),
    });
    setBusy(null);
    const j = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok) {
      setError(j.error ?? "Não deu certo.");
      return;
    }
    const valor = tipo === "link" ? (j.link ?? "") : String(corpo.senha ?? "");
    setSegredo({ id, tipo, valor });
    largar(id, setSenhaDigitada);
  }

  /** Senha ditável por telefone: sílabas simples, sem 0/O nem 1/l. */
  function senhaSugerida(): string {
    const sil = "ba be bi bo ca ce co da de do fa fe fi ga go la le li lo ma me mi mo na ne no pa pe pi ra re ri ro sa se si ta te ti to va ve vi".split(" ");
    const pega = (n: number) => Array.from({ length: n }, () => sil[Math.floor(Math.random() * sil.length)]).join("");
    const p = pega(3);
    return `${p[0].toUpperCase()}${p.slice(1)}-${pega(2)}${Math.floor(Math.random() * 90) + 10}!`;
  }

  /**
   * Exclusão de verdade. Só passa para conta sem histórico — o banco
   * recusa o resto, e a mensagem do servidor explica o porquê e manda
   * desativar. Ver o comentário da rota DELETE.
   */
  async function excluir(r: AgentRow) {
    if (!confirm(
      `Excluir ${r.nome} definitivamente?

` +
      "Só funciona se ela nunca tiver usado o sistema. Se já tiver histórico, " +
      "o banco recusa e você deve usar Desativar."
    )) return;

    setBusy(r.id);
    setError(null);
    const res = await fetch(`/api/atendimento/agentes?profileId=${r.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Não foi possível excluir.");
      return;
    }
    setRows((p) => p.filter((x) => x.id !== r.id));
    setMembers((p) => p.filter((m) => m.profile_id !== r.id));
  }

  async function alternarAtivo(r: AgentRow) {
    const novoAtivo = !r.ativo;
    if (!novoAtivo && !confirm(`Desativar ${r.nome}? Ela perde o acesso na hora, e o histórico fica.`)) return;
    if (await salvar(r.id, { ativo: novoAtivo })) {
      setRows((p) => p.map((x) => (x.id === r.id ? { ...x, ativo: novoAtivo } : x)));
    }
  }

  /**
   * Grava o cargo no blur (e no Enter), não a cada tecla: seriam dez POSTs
   * e dez linhas de auditoria para escrever "Corretora". Sai cedo quando
   * nada mudou, senão trocar de campo já geraria log.
   */
  async function salvarCargo(id: string, valor: string) {
    const limpo = valor.trim().slice(0, CARGO_MAX);
    const atual = rows.find((r) => r.id === id)?.cargo ?? null;
    // `cargoNovo`, e não `novo`: o estado do formulário de cadastro se
    // chama `novo`, e um shadow aqui faria o próximo leitor achar que esta
    // função mexe no agente que está sendo criado.
    const cargoNovo = limpo || null;
    if (cargoNovo === atual) return;

    setRows((p) => p.map((r) => (r.id === id ? { ...r, cargo: cargoNovo } : r)));
    const ok = await salvar(id, { cargo: cargoNovo });
    if (!ok) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, cargo: atual } : r)));
    }
  }

  function largarCargo(id: string) {
    setRascunhoCargo((p) => {
      if (!(id in p)) return p;
      const resto: Record<string, string> = {};
      for (const chave of Object.keys(p)) if (chave !== id) resto[chave] = p[chave];
      return resto;
    });
  }

  function largar(
    id: string,
    set: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) {
    set((p) => {
      if (!(id in p)) return p;
      const resto: Record<string, string> = {};
      for (const chave of Object.keys(p)) if (chave !== id) resto[chave] = p[chave];
      return resto;
    });
  }

  /**
   * Grava o nome no blur, como o cargo.
   *
   * O nome DEIXOU DE SER COSMÉTICO: desde que a caixa passa a assinar a
   * resposta com ele, o primeiro nome vai para o WhatsApp do cliente. Foi
   * assim que "Admin Arini" virou "*Admin:*" em conversa real.
   */
  async function salvarNome(id: string, valor: string) {
    const limpo = valor.trim().slice(0, NOME_MAX);
    const atual = rows.find((r) => r.id === id)?.nome ?? "";
    if (!limpo || limpo === atual) return;

    setRows((p) => p.map((r) => (r.id === id ? { ...r, nome: limpo } : r)));
    const ok = await salvar(id, { nome: limpo });
    if (!ok) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, nome: atual } : r)));
    }
  }

  /** Troca o e-mail SÓ depois do segundo clique — é a credencial de login. */
  async function confirmarEmail(id: string) {
    const novo = (emailPendente[id] ?? "").trim().toLowerCase();
    const atual = rows.find((r) => r.id === id)?.email ?? "";
    largar(id, setEmailPendente);
    largar(id, setRascunhoEmail);
    if (!novo || novo === atual) return;

    setRows((p) => p.map((r) => (r.id === id ? { ...r, email: novo } : r)));
    const ok = await salvar(id, { email: novo });
    if (!ok) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, email: atual } : r)));
    }
  }

  async function trocarPapel(id: string, papel: AtendimentoPapel) {
    const anterior = rows.find((r) => r.id === id)?.atendimento_papel;
    // Otimista: o select já mostra o novo valor. Se a rota recusar,
    // voltamos — deixar o select "pulando" depois do salvamento é pior.
    setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_papel: papel } : r)));
    const ok = await salvar(id, { atendimento_papel: papel });
    if (!ok && anterior) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_papel: anterior } : r)));
    }
  }

  async function alternarFila(profileId: string, teamId: string, dentro: boolean) {
    setError(null);
    const supabase = createSupabaseBrowser();
    if (dentro) {
      const { error } = await supabase
        .from("atendimento_team_members")
        .insert({ team_id: teamId, profile_id: profileId });
      if (error) { setError(error.message); return; }
      setMembers((p) => [...p, { team_id: teamId, profile_id: profileId }]);
    } else {
      const { error } = await supabase
        .from("atendimento_team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("profile_id", profileId);
      if (error) { setError(error.message); return; }
      setMembers((p) => p.filter((m) => !(m.team_id === teamId && m.profile_id === profileId)));
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex items-center justify-end gap-3">
          {rows.some((r) => !r.ativo) && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={mostrarInativos}
                onChange={(e) => setMostrarInativos(e.target.checked)}
              />
              Mostrar desativados ({rows.filter((r) => !r.ativo).length})
            </label>
          )}
          <Button size="sm" onClick={() => setNovoAberto(true)}>
            <UserPlus size={14} /> Novo agente
          </Button>
        </div>
      )}

      {/* A senha aparece UMA vez — não fica gravada em lugar nenhum nosso. */}
      {recemCriado && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
          <p className="text-sm font-medium">
            {recemCriado.nome} foi cadastrado.
          </p>
          <p className="text-[13px]">
            Entra com <strong>{recemCriado.email}</strong> e a senha inicial{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono">{recemCriado.senha}</code>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Anote agora: esta senha não pode ser vista de novo — o que fica guardado é um hash, que
            não volta a ser texto. Peça para a pessoa trocá-la em Meu perfil › Segurança no primeiro
            acesso.
          </p>
          <Button variant="outline" size="sm" onClick={() => setRecemCriado(null)}>
            Já anotei
          </Button>
        </div>
      )}

      {/* Uma lista só para a tela inteira — cada linha aponta para ela. */}
      <datalist id="cargos-sugeridos">
        {CARGOS_SUGERIDOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Alerta tipo="info">
        <strong>Como o atendimento se organiza:</strong> tudo que chega cai na{" "}
        <strong>caixa central</strong>, que só o administrador e a recepção enxergam.
        <br />
        A <strong>recepção</strong> classifica a conversa numa fila e encaminha; o{" "}
        <strong>atendente</strong> só vê as filas de que participa e o que está atribuído a ele.
        <br />
        O <strong>administrador</strong> vê tudo, transfere e devolve conversas para a caixa
        central.
        <br />
        O <strong>cargo</strong> não muda permissão nenhuma — é só como a pessoa se
        identifica para o time quando assume um lead.
      </Alerta>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Só a diretoria pode alterar acesso, cargo, papel e filas dos agentes.
        </p>
      )}

      <div className="rounded-xl border bg-card divide-y">
        {rows.filter((r) => r.ativo || mostrarInativos).map((r) => {
          const habilitado = r.atendimento_access || r.is_admin_central;
          const filas = filasDoAgente(r.id);
          // A diretoria é administradora pela regra do banco
          // (`fn_atendimento_papel`), aconteça o que acontecer com a
          // coluna. Mostrar um select editável ali seria mentira.
          const papelEfetivo: AtendimentoPapel = r.is_admin_central
            ? "administrador"
            : r.atendimento_papel;
          const semFilaAtrapalha = habilitado && papelEfetivo === "atendente" && filas.length === 0;

          return (
            <div key={r.id} className={`p-3 space-y-2 ${r.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                    {r.nome}
                    {r.cargo && (
                      <span className="rounded-full border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                        {r.cargo}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.sector}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.is_admin_central && (
                    <span className="text-[11px] text-muted-foreground">diretoria (sempre)</span>
                  )}
                  <button
                    type="button"
                    disabled={!canManage || r.is_admin_central || busy === r.id}
                    onClick={() => void alternarAcesso(r.id, !r.atendimento_access)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${habilitado ? "bg-acao" : "bg-muted"} ${(!canManage || r.is_admin_central) ? "opacity-50" : ""}`}
                    title={habilitado ? "Com acesso" : "Sem acesso"}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${habilitado ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              {/* -------- Acesso: link, senha e desativar -------- */}
              {canManage && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-1.5">
                  <Button
                    variant="outline" size="sm" disabled={busy === r.id || !r.ativo}
                    onClick={() => void pedirSegredo(r.id, { gerarLink: true }, "link")}
                    title="Gera um link que faz a pessoa entrar já logada. Serve para o primeiro acesso e para quem esqueceu a senha."
                  >
                    <LinkIcon size={13} /> Link de acesso
                  </Button>

                  <div className="flex items-center gap-1">
                    <input
                      value={senhaDigitada[r.id] ?? ""}
                      disabled={busy === r.id || !r.ativo}
                      placeholder="nova senha (8+)"
                      onChange={(e) => setSenhaDigitada((p) => ({ ...p, [r.id]: e.target.value }))}
                      className="w-36 rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-60"
                    />
                    <Button
                      variant="ghost" size="sm" disabled={busy === r.id || !r.ativo}
                      onClick={() => setSenhaDigitada((p) => ({ ...p, [r.id]: senhaSugerida() }))}
                      title="Sugere uma senha fácil de ditar por telefone"
                    >
                      <Dice5 size={13} />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={busy === r.id || !r.ativo || (senhaDigitada[r.id] ?? "").length < 8}
                      onClick={() => void pedirSegredo(r.id, { senha: senhaDigitada[r.id] }, "senha")}
                    >
                      Definir senha
                    </Button>
                  </div>

                  <div className="flex-1" />

                  {!r.ativo && (
                    <Button
                      variant="ghost" size="sm"
                      disabled={busy === r.id || r.is_admin_central}
                      onClick={() => void excluir(r)}
                      title="Só funciona para conta que nunca foi usada. Com histórico, o banco recusa."
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={13} /> Excluir
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    disabled={busy === r.id || r.is_admin_central}
                    onClick={() => void alternarAtivo(r)}
                    title={r.is_admin_central ? "A diretoria não pode ser desativada por aqui" : undefined}
                    className={r.ativo ? "text-red-600 hover:text-red-700" : "text-emerald-700"}
                  >
                    {r.ativo ? <><UserX size={13} /> Desativar</> : <><UserCheck size={13} /> Reativar</>}
                  </Button>
                </div>
              )}

              {/* O segredo aparece UMA vez. Depois não há como recuperá-lo:
                  a senha vira hash e o link é de uso único. */}
              {segredo?.id === r.id && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 space-y-1.5">
                  <p className="text-xs font-medium">
                    {segredo.tipo === "link"
                      ? `Link de acesso de ${r.nome} — mande no WhatsApp dela`
                      : `Senha nova de ${r.nome}`}
                  </p>
                  <code className="block break-all rounded bg-background px-2 py-1 font-mono text-[11px]">
                    {segredo.valor}
                  </code>
                  <p className="text-[11px] text-muted-foreground">
                    {segredo.tipo === "link"
                      ? "Quem tiver este link entra como esta pessoa — mande só para ela, nunca em grupo. Ele expira em pouco tempo e é de uso único."
                      : "Anote agora: não dá para ver de novo. Peça para ela trocar em Meu perfil › Segurança."}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => void navigator.clipboard?.writeText(segredo.valor)}
                    >
                      <Copy size={13} /> Copiar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSegredo(null)}>
                      Já anotei
                    </Button>
                  </div>
                </div>
              )}

              {/* -------- Identidade: nome e e-mail -------- */}
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome
                  </span>
                  <input
                    value={rascunhoNome[r.id] ?? r.nome ?? ""}
                    disabled={!canManage || busy === r.id}
                    maxLength={NOME_MAX}
                    placeholder="Ex.: Michelle Santos"
                    onChange={(e) => setRascunhoNome((p) => ({ ...p, [r.id]: e.target.value }))}
                    onBlur={(e) => {
                      const valor = e.target.value;
                      largar(r.id, setRascunhoNome);
                      void salvarNome(r.id, valor);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        largar(r.id, setRascunhoNome);
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  />
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    {assinaturaLigada ? (
                      <>
                        O <strong>primeiro nome</strong> vai assinar a resposta no WhatsApp do
                        cliente: <code>*{(r.nome ?? "").trim().split(/\s+/)[0] || "—"}:*</code>
                      </>
                    ) : (
                      "Como a pessoa aparece no sistema."
                    )}
                  </span>
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    E-mail de acesso
                  </span>
                  <input
                    type="email"
                    value={rascunhoEmail[r.id] ?? r.email ?? ""}
                    disabled={!canManage || busy === r.id}
                    placeholder="nome@arininegociosimobiliarios.com.br"
                    onChange={(e) => setRascunhoEmail((p) => ({ ...p, [r.id]: e.target.value }))}
                    onBlur={(e) => {
                      const valor = e.target.value.trim().toLowerCase();
                      // Não grava aqui: só arma a confirmação abaixo.
                      if (!valor || valor === (r.email ?? "").toLowerCase()) {
                        largar(r.id, setRascunhoEmail);
                        largar(r.id, setEmailPendente);
                        return;
                      }
                      setEmailPendente((p) => ({ ...p, [r.id]: valor }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        largar(r.id, setRascunhoEmail);
                        largar(r.id, setEmailPendente);
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  />
                  {emailPendente[r.id] ? (
                    <span className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px]">
                      <span className="flex-1">
                        Esta pessoa passa a entrar com <strong>{emailPendente[r.id]}</strong>. A
                        senha continua a mesma.
                      </span>
                      <button
                        type="button"
                        onClick={() => void confirmarEmail(r.id)}
                        className="rounded border border-amber-600/50 px-1.5 py-0.5 font-medium hover:bg-amber-500/20"
                      >
                        Trocar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          largar(r.id, setEmailPendente);
                          largar(r.id, setRascunhoEmail);
                        }}
                        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <span className="block text-[11px] text-muted-foreground leading-snug">
                      É com ele que a pessoa faz login. Trocar pede confirmação.
                    </span>
                  )}
                </label>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {/* -------- Cargo -------- */}
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cargo
                  </span>
                  <input
                    value={rascunhoCargo[r.id] ?? r.cargo ?? ""}
                    disabled={!canManage || busy === r.id}
                    maxLength={CARGO_MAX}
                    list="cargos-sugeridos"
                    placeholder="Ex.: Corretora"
                    onChange={(e) =>
                      setRascunhoCargo((p) => ({ ...p, [r.id]: e.target.value }))
                    }
                    onBlur={(e) => {
                      const valor = e.target.value;
                      largarCargo(r.id);
                      void salvarCargo(r.id, valor);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      // Esc desiste da edição sem gravar.
                      if (e.key === "Escape") {
                        largarCargo(r.id);
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  />
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    Aparece ao lado do nome quando esta pessoa assume um lead.
                  </span>
                </label>

                {/* -------- Papel -------- */}
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Papel no atendimento
                  </span>
                  <select
                    value={papelEfetivo}
                    disabled={!canManage || r.is_admin_central || busy === r.id}
                    onChange={(e) => void trocarPapel(r.id, e.target.value as AtendimentoPapel)}
                    // A descrição também vai no title: quem já sabe o que
                    // é não precisa ler a linha de baixo toda vez.
                    title={PAPEL_DESCRICAO[papelEfetivo]}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  >
                    {(Object.keys(PAPEL_LABELS) as AtendimentoPapel[]).map((p) => (
                      <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    {PAPEL_DESCRICAO[papelEfetivo]}
                  </span>
                </label>

                {/* -------- Filas -------- */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filas
                  </span>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setFilasDe(r)}
                    className="w-full flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-left hover:bg-muted disabled:opacity-60"
                  >
                    <Users2 size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">
                      {filas.length === 0
                        ? "Nenhuma fila"
                        : filas.map((id) => nomeEquipe.get(id) ?? "—").join(", ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">alterar</span>
                  </button>
                  <span className="block text-[11px] leading-snug">
                    {semFilaAtrapalha ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Sem fila, este atendente não enxerga conversa nenhuma.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        As conversas da fila aparecem para todos os membros dela.
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        titulo="Novo agente"
        descricao="Cria o acesso e o perfil. A senha inicial aparece uma vez, depois de salvar."
        rodape={
          <>
            <Button variant="outline" size="sm" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={criando || !novo.nome.trim() || !novo.email.trim()}
              onClick={() => void criarAgente()}
            >
              {criando ? "Criando…" : "Criar agente"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nome
            </span>
            <input
              value={novo.nome}
              maxLength={NOME_MAX}
              placeholder="Ex.: Michelle Santos"
              onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
            {assinaturaLigada && novo.nome.trim() && (
              <span className="block text-[11px] text-muted-foreground">
                Vai assinar a resposta no WhatsApp como{" "}
                <code>*{novo.nome.trim().split(/\s+/)[0]}:*</code>
              </span>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              E-mail de acesso
            </span>
            <input
              type="email"
              value={novo.email}
              placeholder="nome@arininegociosimobiliarios.com.br"
              onChange={(e) => setNovo((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Setor
              </span>
              <select
                value={novo.sector}
                onChange={(e) => setNovo((p) => ({ ...p, sector: e.target.value }))}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(SECTOR_LABELS) as Sector[])
                  .filter((s) => s !== "admin_central")
                  .map((s) => (
                    <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                  ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Papel no atendimento
              </span>
              <select
                value={novo.atendimento_papel}
                onChange={(e) =>
                  setNovo((p) => ({ ...p, atendimento_papel: e.target.value as AtendimentoPapel }))
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(PAPEL_LABELS) as AtendimentoPapel[]).map((p) => (
                  <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cargo
            </span>
            <input
              value={novo.cargo}
              maxLength={CARGO_MAX}
              list="cargos-sugeridos"
              placeholder="Ex.: Corretora"
              onChange={(e) => setNovo((p) => ({ ...p, cargo: e.target.value }))}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          {/* Fila já aqui: um `atendente` sem fila não enxerga conversa
              nenhuma, e exigir uma segunda visita a outra tela é o jeito
              mais fácil de esquecer. */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Filas
            </span>
            {teams.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma fila cadastrada ainda.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={novo.filas.includes(t.id)}
                      onChange={(e) =>
                        setNovo((p) => ({
                          ...p,
                          filas: e.target.checked
                            ? [...p.filas, t.id]
                            : p.filas.filter((x) => x !== t.id),
                        }))
                      }
                    />
                    {t.nome}
                  </label>
                ))}
              </div>
            )}
            {novo.atendimento_papel === "atendente" && novo.filas.length === 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Sem fila, este atendente não enxerga conversa nenhuma.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        aberto={filasDe !== null}
        onFechar={() => setFilasDe(null)}
        titulo={filasDe ? `Filas de ${filasDe.nome}` : "Filas"}
        descricao="Marque as equipes de que a pessoa participa. Vale na hora."
        rodape={
          <Button variant="outline" size="sm" onClick={() => setFilasDe(null)}>Fechar</Button>
        }
      >
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma equipe cadastrada. Crie as filas em Configurações › Equipes.
          </p>
        ) : (
          <div className="space-y-1">
            {teams.map((t) => {
              const dentro =
                filasDe != null &&
                members.some((m) => m.team_id === t.id && m.profile_id === filasDe.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canManage || !filasDe}
                  onClick={() => filasDe && void alternarFila(filasDe.id, t.id, !dentro)}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-muted text-left disabled:opacity-60"
                >
                  <span
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                      dentro ? "bg-acao border-acao text-acao-foreground" : ""
                    }`}
                  >
                    {dentro && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm">{t.nome}</span>
                    {t.descricao && (
                      <span className="block text-[11px] text-muted-foreground">{t.descricao}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
