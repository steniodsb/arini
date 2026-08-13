import { THEME_STORAGE_KEY } from "./ThemeProvider";
import { COR_STORAGE_KEY, PALETA_PADRAO } from "@/lib/atendimento/cores";

/**
 * Script inline que aplica tema E paleta ANTES da hidratação — sem ele a
 * tela pisca branca em quem usa o tema escuro, e piscaria na cor errada
 * em quem escolheu outra paleta. Fica no topo do layout do atendimento
 * (não no root) para não afetar o site público nem o CRM.
 *
 * A classe `atendimento` no <html> é o que ESCOPA a paleta neutra: só as
 * páginas que renderizam este script deixam de ser verdes.
 *
 * `cor` é a cor resolvida no servidor (agente › conta › padrão). O
 * localStorage tem prioridade porque é ele que dá troca instantânea; o
 * valor "auto" significa "seguir o padrão da conta" e cai no do servidor.
 */
export function ThemeScript({
  initial = "sistema",
  cor = PALETA_PADRAO,
}: {
  initial?: string;
  cor?: string;
}) {
  const code = `(function(){try{
    var k=${JSON.stringify(THEME_STORAGE_KEY)};
    var p=localStorage.getItem(k)||${JSON.stringify(initial)};
    var dark = p==='escuro' || (p==='sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var r=document.documentElement;
    r.classList.add('atendimento');
    r.classList.toggle('dark', dark);
    r.style.colorScheme = dark ? 'dark' : 'light';
    var ck=${JSON.stringify(COR_STORAGE_KEY)};
    var c=localStorage.getItem(ck);
    if(!c||c==='auto') c=${JSON.stringify(cor)};
    r.setAttribute('data-cor', c);
  }catch(e){}})();`;
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} />;
}
