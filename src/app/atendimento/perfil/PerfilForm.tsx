"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Check, Image as ImageIcon, KeyRound, Loader2, Monitor, Moon, PenLine, Sun,
  Trash2, Upload, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alerta, Card, Field, Modal, SelectInput, Switch, TextArea, TextInput,
} from "@/components/atendimento/ui";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { MAX_AVATAR_MB, removeAvatar, uploadAvatar } from "@/lib/upload";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SeletorPaleta } from "@/components/atendimento/SeletorPaleta";
import {
  aplicarCorNoDocumento, guardarEscolhaDoAgente,
  type EscolhaAgente, type PaletaAtendimento,
} from "@/lib/atendimento/cores";
import {
  AVAILABILITY_DOT, AVAILABILITY_LABELS,
  type AgentAvailability, type ThemePreference,
} from "@/lib/types";

// =====================================================================
// Perfil do agente. Cada bloco salva sozinho: o agente pode trocar só a
// assinatura sem ser obrigado a reenviar telefone, avatar e notificações.
// =====================================================================

/** Campos do profile que esta tela pode gravar. */
type CamposPerfil = Partial<{
  nome: string;
  telefone: string | null;
  avatar_url: string | null;
  assinatura: string | null;
  disponibilidade: AgentAvailability;
  notificacoes: Record<string, boolean>;
  /** null = seguir a cor padrão da conta (ver migração 0044). */
  atendimento_cor: string | null;
}>;

type EstadoSecao = { salvando: boolean; ok: boolean; erro: string | null };
const SECAO_PARADA: EstadoSecao = { salvando: false, ok: false, erro: null };

/** Estado de salvamento de UMA seção (salvando / salvo ✓ / erro). */
function useSecao() {
  const [estado, setEstado] = useState<EstadoSecao>(SECAO_PARADA);

  const executar = useCallback(async (acao: () => Promise<string | null>) => {
    setEstado({ salvando: true, ok: false, erro: null });
    const erro = await acao();
    setEstado({ salvando: false, ok: erro === null, erro });
    // O "Salvo ✓" some sozinho para não ficar preso na tela.
    if (erro === null) window.setTimeout(() => setEstado(SECAO_PARADA), 2500);
  }, []);

  const limpar = useCallback(() => setEstado(SECAO_PARADA), []);
  return { estado, executar, limpar };
}

function AcoesSecao({
  estado,
  onSalvar,
  desabilitado,
  rotulo = "Salvar",
}: {
  estado: EstadoSecao;
  onSalvar: () => void;
  desabilitado?: boolean;
  rotulo?: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button type="button" size="sm" onClick={onSalvar} disabled={desabilitado || estado.salvando}>
        {estado.salvando ? <Loader2 size={14} className="animate-spin" /> : null}
        {estado.salvando ? "Salvando…" : rotulo}
      </Button>
      {estado.ok && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check size={14} /> Salvo
        </span>
      )}
      {estado.erro && <span className="text-xs text-red-600 dark:text-red-400">{estado.erro}</span>}
    </div>
  );
}

const NOTIFICACOES: { chave: string; label: string; dica: string; padrao: boolean }[] = [
  { chave: "email_nova_conversa", label: "E-mail em nova conversa", dica: "Toda conversa que entra em qualquer caixa que você acompanha.", padrao: false },
  { chave: "email_atribuida", label: "E-mail quando uma conversa for atribuída a mim", dica: "Você vira responsável por uma conversa.", padrao: true },
  { chave: "email_mencao", label: "E-mail quando me mencionarem", dica: "Alguém usa @você em uma nota interna.", padrao: true },
  { chave: "som_nova_mensagem", label: "Som ao chegar mensagem", dica: "Toca um alerta curto com o atendimento aberto.", padrao: true },
  { chave: "desktop_nova_mensagem", label: "Notificação do navegador", dica: "Precisa autorizar notificações neste navegador.", padrao: false },
];

const TEMAS: { chave: ThemePreference; label: string; icone: typeof Sun }[] = [
  { chave: "claro", label: "Claro", icone: Sun },
  { chave: "escuro", label: "Escuro", icone: Moon },
  { chave: "sistema", label: "Automático", icone: Monitor },
];

export function PerfilForm({
  id,
  nome: nomeInicial,
  email,
  telefone: telefoneInicial,
  cargo,
  avatarUrl: avatarInicial,
  avatarPath: avatarPathInicial,
  assinatura: assinaturaInicial,
  temaInicial,
  corInicial,
  corDaConta,
  disponibilidadeInicial,
  notificacoesIniciais,
}: {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  /**
   * Cargo (0043). Só leitura aqui: quem define como um colaborador se
   * identifica para o time é a diretoria, em Configurações › Agentes —
   * do contrário o rótulo deixaria de ser confiável no exato momento em
   * que ele importa (na hora de assumir um lead).
   */
  cargo: string | null;
  avatarUrl: string | null;
  /** Caminho do arquivo no storage (profiles.avatar_path) — usado para apagar o anterior. */
  avatarPath: string | null;
  assinatura: string | null;
  temaInicial: ThemePreference;
  /** A escolha do agente — "auto" quando ele segue a conta. */
  corInicial: EscolhaAgente;
  /** O padrão da conta, para o cartão "Seguir o padrão" mostrar qual é. */
  corDaConta: PaletaAtendimento;
  disponibilidadeInicial: AgentAvailability;
  notificacoesIniciais: Record<string, boolean>;
}) {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  // O provider hidrata a partir do localStorage; até lá, o valor do perfil.
  const temaAtivo: ThemePreference = preference ?? temaInicial;

  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState(telefoneInicial ?? "");
  const [avatar, setAvatar] = useState(avatarInicial ?? "");
  const [avatarPath, setAvatarPath] = useState(avatarPathInicial);
  // null = nenhum upload em andamento; 0–100 = porcentagem enviada.
  const [progresso, setProgresso] = useState<number | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [assinatura, setAssinatura] = useState(assinaturaInicial ?? "");
  const [disponibilidade, setDisponibilidade] = useState<AgentAvailability>(disponibilidadeInicial);
  const [notificacoes, setNotificacoes] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const n of NOTIFICACOES) base[n.chave] = notificacoesIniciais[n.chave] ?? n.padrao;
    return base;
  });

  const [cor, setCor] = useState<EscolhaAgente>(corInicial);

  const secaoDados = useSecao();
  const secaoCor = useSecao();
  const secaoAvatar = useSecao();
  const secaoAssinatura = useSecao();
  const secaoDisponibilidade = useSecao();
  const secaoNotificacoes = useSecao();

  // Senha
  const [modalSenha, setModalSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [senhaEstado, setSenhaEstado] = useState<EstadoSecao>(SECAO_PARADA);

  const salvar = useCallback(
    async (campos: CamposPerfil): Promise<string | null> => {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.from("profiles").update(campos).eq("id", id);
      return error ? error.message : null;
    },
    [id],
  );

  const inicial = useMemo(() => (nome.trim() || "?").charAt(0).toUpperCase(), [nome]);

  /**
   * Cor: aplica na hora e salva em seguida — igual ao tema, que também
   * não tem botão "Salvar". Escolher cor e ter de confirmar depois faria
   * a prévia parecer quebrada no intervalo.
   */
  function escolherCor(escolha: EscolhaAgente) {
    setCor(escolha);
    guardarEscolhaDoAgente(escolha);
    aplicarCorNoDocumento(escolha === "auto" ? corDaConta : escolha);
    void secaoCor.executar(() =>
      salvar({ atendimento_cor: escolha === "auto" ? null : escolha }),
    );
  }

  /**
   * Sobe a foto escolhida. O uploadAvatar já valida tipo/tamanho, grava
   * avatar_url + avatar_path e apaga o arquivo anterior — aqui só cuidamos
   * do feedback (progresso, erro) e de manter a tela em dia.
   */
  function enviarAvatar(file: File) {
    void secaoAvatar.executar(async () => {
      setProgresso(0);
      try {
        const supabase = createSupabaseBrowser();
        const { url, key } = await uploadAvatar(supabase, id, file, {
          previousPath: avatarPath,
          onByteProgress: (loaded, total) =>
            setProgresso(total > 0 ? Math.round((loaded / total) * 100) : 0),
        });
        setAvatar(url);
        setAvatarPath(key);
        // A foto aparece na sidebar, renderizada no servidor.
        router.refresh();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "não foi possível enviar a imagem";
      } finally {
        setProgresso(null);
        // Permite reescolher o MESMO arquivo depois de um erro.
        if (inputArquivo.current) inputArquivo.current.value = "";
      }
    });
  }

  function removerAvatar() {
    if (!confirm("Remover sua foto de perfil? Voltamos a usar a inicial do seu nome.")) return;
    void secaoAvatar.executar(async () => {
      try {
        const supabase = createSupabaseBrowser();
        await removeAvatar(supabase, id, avatarPath);
        setAvatar("");
        setAvatarPath(null);
        router.refresh();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "não foi possível remover a imagem";
      }
    });
  }

  async function trocarSenha() {
    if (senha.length < 8) {
      setSenhaEstado({ salvando: false, ok: false, erro: "A senha precisa ter pelo menos 8 caracteres." });
      return;
    }
    if (senha !== senha2) {
      setSenhaEstado({ salvando: false, ok: false, erro: "As senhas não conferem." });
      return;
    }
    setSenhaEstado({ salvando: true, ok: false, erro: null });
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSenhaEstado({ salvando: false, ok: false, erro: error.message });
      return;
    }
    setSenhaEstado({ salvando: false, ok: true, erro: null });
    setSenha("");
    setSenha2("");
    window.setTimeout(() => {
      setModalSenha(false);
      setSenhaEstado(SECAO_PARADA);
    }, 1200);
  }

  return (
    <>
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="font-display text-xl text-arini dark:text-gold">Meu perfil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Seus dados, aparência e preferências de atendimento.
          </p>
        </div>

        {/* ---------- Dados ---------- */}
        <Card titulo="Dados" descricao="Como você aparece para o time.">
          <div className="p-4 space-y-4">
            <Field label="Nome" obrigatorio>
              <TextInput value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
            </Field>
            <Field label="E-mail" dica="O e-mail é o seu login e só pode ser alterado por um administrador.">
              <TextInput value={email} readOnly disabled />
            </Field>
            <Field
              label="Cargo"
              dica="É como você aparece para o time quando assume um lead. Quem define é a diretoria, em Configurações › Agentes."
            >
              <TextInput value={cargo ?? "Sem cargo definido"} readOnly disabled />
            </Field>
            <Field label="Telefone">
              <TextInput
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </Field>
            <AcoesSecao
              estado={secaoDados.estado}
              desabilitado={!nome.trim()}
              onSalvar={() =>
                void secaoDados.executar(async () => {
                  const erro = await salvar({ nome: nome.trim(), telefone: telefone.trim() || null });
                  // O nome aparece na sidebar — recarrega o layout do servidor.
                  if (!erro) router.refresh();
                  return erro;
                })
              }
            />
          </div>
        </Card>

        {/* ---------- Avatar ---------- */}
        <Card titulo="Foto de perfil" descricao="Imagem exibida ao lado do seu nome.">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              {avatar.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL de storage externo; next/image exigiria allowlist de domínios
                <img
                  src={avatar}
                  alt="Sua foto de perfil"
                  className="h-16 w-16 rounded-full object-cover border"
                />
              ) : (
                <span className="h-16 w-16 rounded-full bg-acao text-acao-foreground flex items-center justify-center text-xl font-semibold">
                  {inicial}
                </span>
              )}

              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-1.5 text-foreground text-sm font-medium">
                  <ImageIcon size={14} /> {nome.trim() || "Sem nome"}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => inputArquivo.current?.click()}
                    disabled={secaoAvatar.estado.salvando}
                  >
                    {secaoAvatar.estado.salvando ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    {avatar.trim() ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  {avatar.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removerAvatar}
                      disabled={secaoAvatar.estado.salvando}
                    >
                      <Trash2 size={14} /> Remover foto
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  JPG, PNG ou WEBP, até {MAX_AVATAR_MB} MB. Sem imagem, usamos a inicial do seu nome.
                </p>
              </div>
            </div>

            {/* Input escondido: o botão acima é quem dá o visual do kit. */}
            <input
              ref={inputArquivo}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarAvatar(file);
              }}
            />

            {progresso !== null && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-acao transition-all"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">Enviando… {progresso}%</div>
              </div>
            )}

            {secaoAvatar.estado.ok && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> Foto atualizada
              </span>
            )}
            {secaoAvatar.estado.erro && <Alerta tipo="erro">{secaoAvatar.estado.erro}</Alerta>}
          </div>
        </Card>

        {/* ---------- Assinatura ---------- */}
        <Card titulo="Assinatura" descricao="Fecho padrão das suas respostas.">
          <div className="p-4 space-y-4">
            <Field
              label="Assinatura"
              dica="Anexada automaticamente ao final das respostas enviadas ao cliente. Notas internas nunca recebem assinatura."
            >
              <TextArea
                value={assinatura}
                onChange={(e) => setAssinatura(e.target.value)}
                placeholder={"Atenciosamente,\nSeu nome — Arini Imóveis"}
                rows={4}
              />
            </Field>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
                <PenLine size={13} className="text-muted-foreground" /> Prévia
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap min-h-[64px]">
                <span className="text-muted-foreground">Sua resposta ao cliente…</span>
                {assinatura.trim() && (
                  <>
                    {"\n\n"}
                    <span>{assinatura}</span>
                  </>
                )}
              </div>
            </div>

            <AcoesSecao
              estado={secaoAssinatura.estado}
              onSalvar={() =>
                void secaoAssinatura.executar(() => salvar({ assinatura: assinatura.trim() || null }))
              }
            />
          </div>
        </Card>

        {/* ---------- Aparência ---------- */}
        <Card titulo="Aparência" descricao="Tema e cor ficam salvos no seu perfil e seguem você em qualquer computador.">
          <div className="p-4 pb-0 grid grid-cols-3 gap-2">
            {TEMAS.map((t) => {
              const Icone = t.icone;
              const ativo = temaAtivo === t.chave;
              return (
                <button
                  key={t.chave}
                  type="button"
                  onClick={() => setPreference(t.chave)}
                  className={`rounded-lg border p-3 flex flex-col items-center gap-1.5 text-xs transition-colors ${
                    ativo
                      ? "border-arini bg-arini/10 text-arini dark:text-gold dark:border-gold dark:bg-gold/15 font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  aria-pressed={ativo}
                >
                  <Icone size={18} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-xs font-medium">Cor</div>
                <p className="text-[11px] text-muted-foreground">
                  Muda os botões e a bolha das suas mensagens. A prévia segue o tema em uso.
                </p>
              </div>
              {secaoCor.estado.salvando && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Salvando…
                </span>
              )}
              {secaoCor.estado.ok && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                  <Check size={12} /> Salvo
                </span>
              )}
            </div>
            <SeletorPaleta valor={cor} onEscolher={escolherCor} corDaConta={corDaConta} />
            {secaoCor.estado.erro && <Alerta tipo="erro">{secaoCor.estado.erro}</Alerta>}
          </div>
        </Card>

        {/* ---------- Disponibilidade ---------- */}
        <Card titulo="Disponibilidade" descricao="Controla se novas conversas podem cair para você.">
          <div className="p-4 space-y-4">
            <Field label="Status atual">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${AVAILABILITY_DOT[disponibilidade]}`} />
                <SelectInput
                  value={disponibilidade}
                  onChange={(e) => setDisponibilidade(e.target.value as AgentAvailability)}
                >
                  {(Object.keys(AVAILABILITY_LABELS) as AgentAvailability[]).map((a) => (
                    <option key={a} value={a}>{AVAILABILITY_LABELS[a]}</option>
                  ))}
                </SelectInput>
              </div>
            </Field>
            <AcoesSecao
              estado={secaoDisponibilidade.estado}
              onSalvar={() =>
                void secaoDisponibilidade.executar(async () => {
                  const erro = await salvar({ disponibilidade });
                  if (!erro) router.refresh();
                  return erro;
                })
              }
            />
          </div>
        </Card>

        {/* ---------- Notificações ---------- */}
        <Card titulo="Notificações" descricao="Quando o sistema deve te avisar.">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bell size={13} /> Preferências pessoais — não afetam o resto do time.
            </div>
            {NOTIFICACOES.map((n) => (
              <Switch
                key={n.chave}
                checked={notificacoes[n.chave] ?? n.padrao}
                onChange={(v) => setNotificacoes((atual) => ({ ...atual, [n.chave]: v }))}
                label={n.label}
                dica={n.dica}
              />
            ))}
            <AcoesSecao
              estado={secaoNotificacoes.estado}
              onSalvar={() => void secaoNotificacoes.executar(() => salvar({ notificacoes }))}
            />
          </div>
        </Card>

        {/* ---------- Segurança ---------- */}
        <Card titulo="Segurança" descricao="Acesso da sua conta.">
          <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <User size={13} /> {email}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSenha("");
                setSenha2("");
                setSenhaEstado(SECAO_PARADA);
                setModalSenha(true);
              }}
            >
              <KeyRound size={15} /> Alterar senha
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        aberto={modalSenha}
        onFechar={() => setModalSenha(false)}
        titulo="Alterar senha"
        descricao="A nova senha vale imediatamente, em todos os dispositivos."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalSenha(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void trocarSenha()}
              disabled={senhaEstado.salvando || senha.length < 8 || senha !== senha2}
            >
              {senhaEstado.salvando ? <Loader2 size={14} className="animate-spin" /> : null}
              {senhaEstado.salvando ? "Salvando…" : "Salvar senha"}
            </Button>
          </>
        }
      >
        <Field label="Nova senha" obrigatorio dica="Mínimo de 8 caracteres.">
          <TextInput
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirmar nova senha" obrigatorio>
          <TextInput
            type="password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {senha.length > 0 && senha.length < 8 && (
          <Alerta tipo="atencao">A senha precisa ter pelo menos 8 caracteres.</Alerta>
        )}
        {senha2.length > 0 && senha !== senha2 && <Alerta tipo="erro">As senhas não conferem.</Alerta>}
        {senhaEstado.erro && <Alerta tipo="erro">{senhaEstado.erro}</Alerta>}
        {senhaEstado.ok && <Alerta tipo="sucesso">Senha alterada com sucesso.</Alerta>}
      </Modal>
    </>
  );
}
