// Faz o Node rodar o código-fonte TypeScript do projeto direto.
//
// Duas coisas que o Node sozinho não faz:
//
//  1. RESOLVER O ALIAS "@/..." do tsconfig.
//  2. COMPILAR de verdade. O modo nativo do Node é "strip-only": ele só
//     APAGA anotações de tipo, e recusa qualquer sintaxe que precise ser
//     traduzida. Foi assim que `evolution.ts` derrubou o primeiro teste —
//     `constructor(readonly status?: number)` é uma "parameter property",
//     que vira uma atribuição no construtor, e apagar não basta.
//
// Aqui usamos o compilador TypeScript que já está em devDependencies, o
// mesmo do build. Com isso qualquer arquivo do projeto pode ser importado
// num teste, inclusive os que tocam banco e rede.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = path.join(import.meta.dirname, "..", "..", "src");

export function resolve(especificador, contexto, proximo) {
  // Alias do tsconfig.
  if (especificador.startsWith("@/")) {
    const alvo = path.join(SRC, especificador.slice(2));
    const comExt = path.extname(alvo) ? alvo : acharExtensao(alvo);
    return proximo(pathToFileURL(comExt).href, contexto);
  }

  // Import relativo SEM extensão — `./meta-plataformas`. O TypeScript
  // aceita, o Node não: para ele o caminho tem de ser o arquivo. Só entra
  // aqui quando o pai é do projeto, para não interferir em node_modules.
  if (especificador.startsWith(".") && !path.extname(especificador) && contexto.parentURL?.startsWith("file:")) {
    const base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
    const comExt = acharExtensao(base);
    if (fs.existsSync(comExt)) return proximo(pathToFileURL(comExt).href, contexto);
  }

  return proximo(especificador, contexto);
}

function acharExtensao(base) {
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of [".ts", ".tsx"]) {
    const idx = path.join(base, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return base + ".ts";
}

export function load(url, contexto, proximo) {
  if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
    const arquivo = fileURLToPath(url);
    const { outputText } = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        // O código do projeto importa sem extensão; quem resolve isso é o
        // hook acima, então o compilador não precisa opinar.
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: arquivo,
    });
    return { format: "module", shortCircuit: true, source: outputText };
  }
  return proximo(url, contexto);
}
