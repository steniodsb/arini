"use client";

import { useState } from "react";
import { Check, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alerta, Card } from "@/components/atendimento/ui";
import { SeletorPaleta } from "@/components/atendimento/SeletorPaleta";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { errMessage } from "@/lib/utils";
import {
  aplicarCorNoDocumento, escolhaGuardada,
  type PaletaAtendimento,
} from "@/lib/atendimento/cores";

/**
 * Padrão de cor da CONTA — vale para todo agente que não escolheu a sua.
 *
 * Só a diretoria salva. Para os demais a tela abre em modo leitura, em
 * vez de sumir do menu: saber que existe um padrão (e qual é) explica por
 * que a tela do colega tem outra cor.
 */
export function AparenciaManager({
  corInicial,
  ehDiretoria,
}: {
  corInicial: PaletaAtendimento;
  ehDiretoria: boolean;
}) {
  const [cor, setCor] = useState<PaletaAtendimento>(corInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("atendimento_settings")
      .update({ cor_padrao: cor, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSalvando(false);
    if (error) {
      setErro(errMessage(error));
      return;
    }
    // Quem não tem escolha pessoal segue a conta — inclusive quem acabou
    // de salvar. Com escolha pessoal, a tela de quem salvou não muda: o
    // contrário faria parecer que a preferência dele foi sobrescrita.
    const pessoal = escolhaGuardada();
    if (!pessoal || pessoal === "auto") aplicarCorNoDocumento(cor);
    setAviso("Salvo ✓");
    window.setTimeout(() => setAviso(null), 2500);
  }

  return (
    <>
      <div>
        <h1 className="font-display text-xl text-arini dark:text-gold flex items-center gap-2">
          <Palette size={18} /> Aparência
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          A cor padrão do atendimento. Cada agente pode escolher outra para si em Meu perfil.
        </p>
      </div>

      {/* O tema é de cada um (fica no perfil), mas quem está aqui mexendo
          em aparência quer poder alternar na hora para conferir as duas
          faces do que escolheu. */}
      <Card titulo="Seu tema" descricao="Vale só para você. A cor abaixo é o padrão de todos.">
        <div className="p-4 flex items-center gap-3">
          <ThemeSwitch comRotulo />
          <span className="text-[11px] text-muted-foreground">
            Para seguir o sistema operacional, use Meu perfil › Aparência.
          </span>
        </div>
      </Card>

      <Card
        titulo="Cor padrão da conta"
        descricao="Muda a cor dos botões e da bolha das mensagens enviadas. Fundo, texto e a sidebar verde não mudam."
        className="p-5 space-y-4"
      >
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {!ehDiretoria && (
          <Alerta tipo="atencao">
            Só a diretoria altera o padrão da conta. Você pode escolher a sua cor em{" "}
            <strong>Meu perfil › Aparência</strong>.
          </Alerta>
        )}

        <fieldset disabled={!ehDiretoria} className={!ehDiretoria ? "opacity-60" : undefined}>
          <SeletorPaleta valor={cor} onEscolher={(c) => c !== "auto" && setCor(c)} />
        </fieldset>

        {ehDiretoria && (
          <div className="flex items-center gap-3 flex-wrap border-t pt-4">
            <Button type="button" size="sm" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : null}
              {salvando ? "Salvando…" : "Salvar padrão da conta"}
            </Button>
            {aviso && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> {aviso}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              Vale para quem não escolheu cor própria. Ninguém precisa sair e entrar de novo.
            </span>
          </div>
        )}
      </Card>
    </>
  );
}
