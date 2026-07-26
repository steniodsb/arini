import { THEME_STORAGE_KEY } from "./ThemeProvider";

/**
 * Script inline que aplica o tema ANTES da hidratação — sem ele a tela
 * pisca branca em quem usa o tema escuro. Fica no topo do layout do
 * atendimento (não no root) para não afetar o site público nem o CRM.
 */
export function ThemeScript({ initial = "sistema" }: { initial?: string }) {
  const code = `(function(){try{
    var k=${JSON.stringify(THEME_STORAGE_KEY)};
    var p=localStorage.getItem(k)||${JSON.stringify(initial)};
    var dark = p==='escuro' || (p==='sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var r=document.documentElement;
    r.classList.toggle('dark', dark);
    r.style.colorScheme = dark ? 'dark' : 'light';
  }catch(e){}})();`;
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} />;
}
