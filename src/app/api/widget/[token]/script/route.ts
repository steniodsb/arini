import { createSupabaseAdmin } from "@/lib/supabase/server";
import { carregarCaixaPorToken } from "@/lib/atendimento/widget";

// =====================================================================
// Script embutível do chat do site.
//
//   <script src="https://atendimento.exemplo.com.br/api/widget/TOKEN/script" async></script>
//
// Devolvemos JavaScript puro (sem framework, sem bundle) porque isto roda
// no site DO CLIENTE: qualquer dependência nossa vira dependência dele.
// A aparência NÃO é embutida aqui de propósito — o script busca
// /config em tempo de execução, então mudar cor/título no painel reflete
// no site do cliente sem esperar o cache de 5 min do script expirar.
// =====================================================================

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Base pública do sistema, para o script saber onde chamar a API. */
function baseDoPedido(req: Request): string {
  const configurada = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (configurada) return configurada;

  // Sem variável configurada, derivamos do próprio pedido — atrás de proxy
  // o host real vem nos cabeçalhos X-Forwarded-*.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return proto + "://" + host;
  return new URL(req.url).origin;
}

function respostaJs(codigo: string, status: number, cacheSegundos: number): Response {
  return new Response(codigo, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=" + cacheSegundos,
      // O <script src> é cross-site por natureza; liberar aqui é inofensivo
      // (o conteúdo é o mesmo para todo mundo) e ajuda quem usa crossorigin.
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const caixa = await carregarCaixaPorToken(createSupabaseAdmin(), params.token);

  // Token inválido/caixa desativada: 404 genérico. Devolvemos um no-op em JS
  // para o site do cliente não quebrar o console com erro de parse.
  if (!caixa) {
    return respostaJs("/* widget não encontrado */\n", 404, 60);
  }

  const base = baseDoPedido(req);
  const codigo = montarScript(base, caixa.widget_token as string);
  return respostaJs(codigo, 200, 300);
}

/**
 * Monta o script. Só duas coisas são interpoladas — a base da API e o token
 * público — e ambas via JSON.stringify, então não há como injetar código.
 * O corpo do script evita template literals de propósito, para não conflitar
 * com a interpolação desta template string do TypeScript.
 */
function montarScript(base: string, token: string): string {
  return `/* Chat Arini — widget de site. Gerado automaticamente. */
(function () {
  "use strict";

  var BASE = ${JSON.stringify(base)};
  var TOKEN = ${JSON.stringify(token)};
  var CHAVE = "arini_chat_" + TOKEN;      // chave do localStorage por caixa
  var INTERVALO = 5000;                   // polling enquanto o painel está aberto

  // Colar a tag duas vezes na mesma página não pode gerar dois widgets.
  if (window.__ariniChatCarregado) return;
  window.__ariniChatCarregado = true;

  // Navegador sem Shadow DOM ou sem fetch: sai quieto em vez de quebrar o site.
  if (!window.fetch || !Element.prototype.attachShadow) return;

  // ---------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------
  var cfg = null;
  var contactToken = lerToken();
  var mensagens = [];
  var vistos = {};
  var ultimaIso = null;
  var aberto = false;
  var timer = null;
  var enviando = false;
  var sessaoPronta = false;

  function lerToken() {
    try { return window.localStorage.getItem(CHAVE); } catch (e) { return null; }
  }
  function gravarToken(t) {
    contactToken = t;
    // Navegação anônima / cookies bloqueados: o chat ainda funciona nesta
    // visita, só não reconecta a conversa na próxima.
    try { window.localStorage.setItem(CHAVE, t); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------
  function api(caminho, opcoes) {
    return fetch(BASE + "/api/widget/" + TOKEN + caminho, opcoes || {}).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (corpo) {
        if (!r.ok) {
          var e = new Error((corpo && corpo.erro) || "Falha na comunicação.");
          e.status = r.status;
          throw e;
        }
        return corpo;
      });
    });
  }
  function postar(caminho, dados) {
    return api(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados)
    });
  }

  // ---------------------------------------------------------------
  // DOM — tudo dentro de um Shadow DOM para o CSS do site do cliente
  // não vazar para cá (nem o nosso para lá).
  // ---------------------------------------------------------------
  var hospedeiro = document.createElement("div");
  hospedeiro.id = "arini-chat";
  var raiz = hospedeiro.attachShadow({ mode: "open" });

  function el(tag, cls, texto) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    // textContent (nunca innerHTML): o conteúdo vem do servidor/atendente e
    // qualquer HTML nele tem que aparecer como texto, não ser executado.
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    return n;
  }

  var estilo = document.createElement("style");
  estilo.textContent = [
    /* all:initial isola de regras globais do site (ex.: "div{margin:0!important}") */
    ":host{all:initial!important;}",
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}",
    ".bolha{position:fixed;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;",
      "background:var(--cor,#092316);color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.28);z-index:2147483000;",
      "display:flex;align-items:center;justify-content:center;font-size:26px;line-height:1;transition:transform .15s ease;}",
    ".bolha:hover{transform:scale(1.06);}",
    ".bolha:focus-visible{outline:3px solid #fff;outline-offset:2px;}",
    ".pos-direita{right:20px;}",
    ".pos-esquerda{left:20px;}",
    ".painel{position:fixed;bottom:88px;width:360px;height:520px;max-height:calc(100vh - 120px);",
      "background:#fff;color:#111;border-radius:14px;overflow:hidden;z-index:2147483001;",
      "box-shadow:0 18px 48px rgba(0,0,0,.26);display:none;flex-direction:column;}",
    ".painel.visivel{display:flex;}",
    ".cab{background:var(--cor,#092316);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;flex:0 0 auto;}",
    ".cab h2{font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".fechar{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;}",
    ".fechar:hover{background:rgba(255,255,255,.18);}",
    ".aviso{background:#fff7e6;color:#7a4b00;font-size:12px;padding:8px 12px;border-bottom:1px solid #f0dcb4;flex:0 0 auto;}",
    ".erro{background:#fdecec;color:#8c1c1c;font-size:12px;padding:8px 12px;flex:0 0 auto;}",
    ".corpo{flex:1 1 auto;overflow-y:auto;padding:14px;background:#f6f7f8;display:flex;flex-direction:column;gap:8px;}",
    ".msg{max-width:82%;display:flex;flex-direction:column;gap:2px;}",
    ".msg.dele{align-self:flex-start;}",
    ".msg.minha{align-self:flex-end;align-items:flex-end;}",
    ".txt{padding:8px 11px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;}",
    ".dele .txt{background:#fff;border:1px solid #e6e8ea;border-top-left-radius:4px;}",
    ".minha .txt{background:var(--cor,#092316);color:#fff;border-bottom-right-radius:4px;}",
    ".hora{font-size:10px;color:#8a9096;}",
    ".rodape{display:flex;gap:8px;padding:10px;border-top:1px solid #e6e8ea;background:#fff;flex:0 0 auto;}",
    ".entrada{flex:1;border:1px solid #d8dcdf;border-radius:10px;padding:9px 11px;font-size:13.5px;outline:none;color:#111;background:#fff;}",
    ".entrada:focus{border-color:var(--cor,#092316);}",
    ".enviar{border:0;border-radius:10px;background:var(--cor,#092316);color:#fff;padding:0 14px;font-size:16px;cursor:pointer;}",
    ".enviar:disabled{opacity:.5;cursor:default;}",
    ".pc{padding:16px;overflow-y:auto;flex:1 1 auto;background:#fff;display:flex;flex-direction:column;gap:11px;}",
    ".pc-intro{font-size:13px;color:#4b5257;line-height:1.5;}",
    ".pc-campo{display:flex;flex-direction:column;gap:4px;}",
    ".pc-rotulo{font-size:12px;font-weight:600;color:#333;}",
    ".pc-input{border:1px solid #d8dcdf;border-radius:9px;padding:8px 10px;font-size:13.5px;outline:none;color:#111;background:#fff;}",
    ".pc-input:focus{border-color:var(--cor,#092316);}",
    ".pc-enviar{margin-top:4px;border:0;border-radius:10px;background:var(--cor,#092316);color:#fff;padding:10px;font-size:13.5px;font-weight:600;cursor:pointer;}",
    ".pc-enviar:disabled{opacity:.6;cursor:default;}",
    ".oculto{display:none!important;}",
    /* Em telas pequenas o painel vira tela cheia — 360px não cabe num celular. */
    "@media (max-width:480px){.painel{inset:0;width:100%;height:100%;max-height:none;border-radius:0;}}",
    "@media (prefers-reduced-motion:reduce){.bolha{transition:none;}}"
  ].join("");
  raiz.appendChild(estilo);

  var bolha = el("button", "bolha", "\\uD83D\\uDCAC"); // 💬
  bolha.type = "button";
  bolha.setAttribute("aria-label", "Abrir conversa");
  bolha.setAttribute("aria-expanded", "false");

  var painel = el("div", "painel");
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-label", "Janela de conversa");

  var cab = el("div", "cab");
  var titulo = el("h2", null, "Fale com a gente");
  var btFechar = el("button", "fechar", "\\u00D7");
  btFechar.type = "button";
  btFechar.setAttribute("aria-label", "Fechar conversa");
  cab.appendChild(titulo);
  cab.appendChild(btFechar);

  var aviso = el("div", "aviso oculto");
  var erroBox = el("div", "erro oculto");
  erroBox.setAttribute("role", "alert");

  var corpo = el("div", "corpo");
  corpo.setAttribute("role", "log");
  corpo.setAttribute("aria-live", "polite");

  var formPreChat = el("form", "pc oculto");

  var rodape = el("form", "rodape oculto");
  var entrada = el("input", "entrada");
  entrada.type = "text";
  entrada.placeholder = "Escreva sua mensagem…";
  entrada.setAttribute("aria-label", "Escreva sua mensagem");
  entrada.maxLength = 2000;
  var btEnviar = el("button", "enviar", "\\u27A4");
  btEnviar.type = "submit";
  btEnviar.setAttribute("aria-label", "Enviar mensagem");
  rodape.appendChild(entrada);
  rodape.appendChild(btEnviar);

  painel.appendChild(cab);
  painel.appendChild(aviso);
  painel.appendChild(erroBox);
  painel.appendChild(corpo);
  painel.appendChild(formPreChat);
  painel.appendChild(rodape);

  raiz.appendChild(bolha);
  raiz.appendChild(painel);

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  function mostrarErro(texto) {
    if (!texto) { erroBox.className = "erro oculto"; erroBox.textContent = ""; return; }
    erroBox.textContent = texto;
    erroBox.className = "erro";
  }

  function hora(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function balao(m) {
    var minha = m.direcao === "in";
    var box = el("div", "msg " + (minha ? "minha" : "dele"));
    var conteudo = m.conteudo;
    if (!conteudo && m.mediaUrl) conteudo = "[anexo]";
    box.appendChild(el("div", "txt", conteudo || ""));
    var h = hora(m.criadaEm);
    if (h) box.appendChild(el("span", "hora", h));
    return box;
  }

  function renderizar() {
    corpo.textContent = "";
    var lista = mensagens;
    // Painel vazio é frio: enquanto não há conversa no servidor, mostramos a
    // saudação localmente. Assim que a conversa nasce, ela vem como mensagem
    // de verdade e esta versão local some (não duplica).
    if (lista.length === 0 && cfg && cfg.saudacao) {
      lista = [{ direcao: "out", conteudo: cfg.saudacao, criadaEm: null }];
    }
    for (var i = 0; i < lista.length; i++) corpo.appendChild(balao(lista[i]));
    corpo.scrollTop = corpo.scrollHeight;
  }

  function absorver(lista) {
    var novas = 0;
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (!m || !m.id || vistos[m.id]) continue;
      vistos[m.id] = true;
      mensagens.push(m);
      if (!ultimaIso || m.criadaEm > ultimaIso) ultimaIso = m.criadaEm;
      novas++;
    }
    if (novas) renderizar();
    return novas;
  }

  // ---------------------------------------------------------------
  // Pré-chat
  // ---------------------------------------------------------------
  function montarPreChat() {
    formPreChat.textContent = "";
    formPreChat.appendChild(el("p", "pc-intro", "Para começarmos, conte quem é você:"));

    var campos = (cfg && cfg.preChatCampos) || [];
    for (var i = 0; i < campos.length; i++) {
      var campo = campos[i];
      if (!campo || !campo.chave) continue;

      var wrap = el("label", "pc-campo");
      wrap.appendChild(el("span", "pc-rotulo", (campo.rotulo || campo.chave) + (campo.obrigatorio ? " *" : "")));

      var entradaCampo;
      if (campo.tipo === "lista") {
        entradaCampo = document.createElement("select");
        var vazio = document.createElement("option");
        vazio.value = "";
        vazio.textContent = "Selecione…";
        entradaCampo.appendChild(vazio);
        var opcoes = campo.opcoes || [];
        for (var j = 0; j < opcoes.length; j++) {
          var op = document.createElement("option");
          op.value = String(opcoes[j]);
          op.textContent = String(opcoes[j]);
          entradaCampo.appendChild(op);
        }
      } else {
        entradaCampo = document.createElement("input");
        entradaCampo.type = campo.tipo === "email" ? "email" : (campo.tipo === "telefone" ? "tel" : "text");
        entradaCampo.maxLength = 300;
      }
      entradaCampo.className = "pc-input";
      entradaCampo.required = !!campo.obrigatorio;
      entradaCampo.setAttribute("data-chave", campo.chave);
      wrap.appendChild(entradaCampo);
      formPreChat.appendChild(wrap);
    }

    var bt = el("button", "pc-enviar", "Iniciar conversa");
    bt.type = "submit";
    formPreChat.appendChild(bt);
  }

  formPreChat.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (enviando) return;
    var campos = formPreChat.querySelectorAll(".pc-input");
    var respostas = {};
    for (var i = 0; i < campos.length; i++) {
      var c = campos[i];
      var v = (c.value || "").trim();
      if (v) respostas[c.getAttribute("data-chave")] = v;
    }
    enviando = true;
    mostrarErro(null);
    var bt = formPreChat.querySelector(".pc-enviar");
    if (bt) bt.disabled = true;

    abrirSessao(respostas).then(function () {
      formPreChat.className = "pc oculto";
      rodape.className = "rodape";
      entrada.focus();
      // A conversa já existe a partir daqui: o atendente pode responder antes
      // do visitante escrever, então o polling começa junto com o campo.
      ligarPolling();
    }).catch(function (e) {
      mostrarErro(e.message || "Não foi possível iniciar a conversa.");
    }).then(function () {
      enviando = false;
      if (bt) bt.disabled = false;
    });
  });

  // ---------------------------------------------------------------
  // Sessão, histórico e polling
  // ---------------------------------------------------------------
  function abrirSessao(preChat) {
    var corpoReq = { contactToken: contactToken, referrer: document.referrer || null };
    if (preChat) corpoReq.preChat = preChat;
    return postar("/session", corpoReq).then(function (r) {
      if (r && r.contactToken) gravarToken(r.contactToken);
      sessaoPronta = true;
      return carregarHistorico();
    });
  }

  function carregarHistorico() {
    if (!contactToken) return Promise.resolve();
    return api("/messages?contactToken=" + encodeURIComponent(contactToken)).then(function (r) {
      absorver((r && r.mensagens) || []);
    });
  }

  function buscarNovas() {
    if (!contactToken || !aberto) return;
    var url = "/messages?contactToken=" + encodeURIComponent(contactToken);
    if (ultimaIso) url += "&depois=" + encodeURIComponent(ultimaIso);
    api(url).then(function (r) {
      absorver((r && r.mensagens) || []);
    }).catch(function () {
      // Falha de rede no polling é silenciosa: a próxima rodada tenta de novo.
    });
  }

  function ligarPolling() {
    desligarPolling();
    timer = window.setInterval(buscarNovas, INTERVALO);
  }
  function desligarPolling() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  // ---------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------
  rodape.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var texto = (entrada.value || "").trim();
    if (!texto || enviando) return;
    if (texto.length > 2000) { mostrarErro("Mensagem muito longa (máximo 2000 caracteres)."); return; }

    enviando = true;
    btEnviar.disabled = true;
    mostrarErro(null);
    entrada.value = "";

    // Sem pré-chat a conversa só nasce agora, no primeiro envio — evita criar
    // conversa vazia para quem só abriu o painel e desistiu.
    var preparo = sessaoPronta ? Promise.resolve() : abrirSessao(null);

    preparo.then(function () {
      return postar("/messages", { contactToken: contactToken, texto: texto });
    }).then(function (r) {
      if (r && r.mensagem) absorver([r.mensagem]);
      ligarPolling();
    }).catch(function (e) {
      mostrarErro(e.message || "Não foi possível enviar. Tente de novo.");
      entrada.value = texto; // devolve o texto para o visitante não reescrever
    }).then(function () {
      enviando = false;
      btEnviar.disabled = false;
      entrada.focus();
    });
  });

  // ---------------------------------------------------------------
  // Abrir / fechar
  // ---------------------------------------------------------------
  function abrir() {
    if (aberto || !cfg) return;
    aberto = true;
    painel.className = "painel visivel " + posicaoCls();
    bolha.setAttribute("aria-expanded", "true");
    bolha.setAttribute("aria-label", "Fechar conversa");

    var precisaPreChat = cfg.preChatAtivo && !contactToken;
    if (precisaPreChat) {
      formPreChat.className = "pc";
      rodape.className = "rodape oculto";
      var primeiro = formPreChat.querySelector(".pc-input");
      if (primeiro) window.setTimeout(function () { primeiro.focus(); }, 60);
    } else {
      formPreChat.className = "pc oculto";
      rodape.className = "rodape";
      window.setTimeout(function () { entrada.focus(); }, 60);
      if (contactToken && !sessaoPronta) {
        // Visitante que já falou antes: reconecta a conversa da visita passada.
        abrirSessao(null).catch(function () { mostrarErro("Não foi possível carregar a conversa."); });
      }
      ligarPolling();
    }
    renderizar();
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    painel.className = "painel " + posicaoCls();
    bolha.setAttribute("aria-expanded", "false");
    bolha.setAttribute("aria-label", "Abrir conversa");
    desligarPolling();
    bolha.focus();
  }

  function posicaoCls() {
    return cfg && cfg.posicao === "esquerda" ? "pos-esquerda" : "pos-direita";
  }

  bolha.addEventListener("click", function () { aberto ? fechar() : abrir(); });
  btFechar.addEventListener("click", fechar);

  // Esc fecha. O listener fica no documento porque o evento do Shadow DOM
  // é "composed" e chega até aqui de qualquer forma.
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && aberto) { ev.stopPropagation(); fechar(); }
  });

  // Aba volta ao foco: busca o que perdeu na hora, sem esperar o intervalo.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && aberto) buscarNovas();
  });

  // ---------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------
  api("/config").then(function (c) {
    cfg = c;
    titulo.textContent = c.titulo || "Fale com a gente";
    // A cor entra como variável CSS no hospedeiro; ela atravessa o limite do
    // Shadow DOM (custom properties herdam) e alimenta bolha, cabeçalho etc.
    hospedeiro.style.setProperty("--cor", c.cor || "#092316");
    bolha.className = "bolha " + posicaoCls();
    painel.className = "painel " + posicaoCls();

    // Fora do expediente: avisa antes de o visitante escrever e esperar.
    if (c.dentroHorario === false && c.mensagemAusencia) {
      aviso.textContent = c.mensagemAusencia;
      aviso.className = "aviso";
    }
    if (c.preChatAtivo) montarPreChat();

    (document.body || document.documentElement).appendChild(hospedeiro);
  }).catch(function () {
    // Caixa desativada, token trocado ou domínio não liberado: não renderiza
    // nada. Melhor nenhum widget do que um widget quebrado no site do cliente.
  });
})();
`;
}
