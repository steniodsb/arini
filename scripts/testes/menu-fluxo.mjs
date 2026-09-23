// Teste de ponta a ponta do MENU DE RAMAIS, contra o banco de verdade.
//
//   node scripts/testes/menu-fluxo.mjs
//
// POR QUE CONTRA O BANCO REAL: o que pode dar errado aqui não é a lógica
// de string (isso está em `menu-ramais.mjs`), é o encaixe — RLS, colunas,
// carimbo de triagem, log de transferência. Um banco fake concordaria com
// qualquer coisa.
//
// POR QUE ISSO É SEGURO: o envio é INJETADO. `processarMenu` recebe um
// dublê que só anota o que teria mandado, então nenhuma mensagem sai no
// WhatsApp da Arini. E tudo o que o teste cria (caixa, menu, conversa) é
// apagado no fim, inclusive se um passo falhar.
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
register("./_alias.mjs", import.meta.url);

// .env.local à mão: o script não passa pelo Next.
const raiz = path.join(import.meta.dirname, "..", "..");
for (const linha of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#")) process.env[linha.slice(0, i).trim()] ||= linha.slice(i + 1).trim();
}

const { createClient } = await import("@supabase/supabase-js");
const { processarMenu } = await import("../../src/lib/atendimento/menu.ts");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// --- O dublê do envio -------------------------------------------------
let enviadas = [];
const enviarFalso = async (_admin, args) => {
  enviadas.push(args.texto ?? "");
  return { ok: true, externalId: `teste-${enviadas.length}`, via: "teste" };
};

let passou = 0;
const falhas = [];
function ok(titulo, condicao, detalhe = "") {
  if (condicao) passou++;
  else falhas.push(`${titulo}${detalhe ? `\n    ${detalhe}` : ""}`);
}

const criados = { inbox: null, menu: null, conversa: null };

async function limpar() {
  if (criados.conversa) {
    await db.from("atendimento_menu_estado").delete().eq("conversation_id", criados.conversa);
    await db.from("atendimento_transferencias").delete().eq("conversation_id", criados.conversa);
    await db.from("messages").delete().eq("conversation_id", criados.conversa);
    await db.from("conversations").delete().eq("id", criados.conversa);
  }
  if (criados.menu) await db.from("atendimento_menus").delete().eq("id", criados.menu);
  if (criados.inbox) await db.from("atendimento_inboxes").delete().eq("id", criados.inbox);
}

async function main() {
  // --- Monta um cenário isolado ---------------------------------------
  // Caixa SEM conexão: não colide com o menu real (que exige channel_id) e
  // não aparece na tela de configuração.
  const { data: inbox, error: e1 } = await db
    .from("atendimento_inboxes")
    .insert({ nome: "ZZ teste menu", canal: "whatsapp", ativo: true, horario_comercial_ativo: false })
    .select("id")
    .single();
  if (e1) throw new Error(`criar caixa: ${e1.message}`);
  criados.inbox = inbox.id;

  const { data: filas } = await db.from("atendimento_teams").select("id, nome").order("nome").limit(3);
  if (!filas || filas.length < 3) throw new Error("preciso de 3 filas para testar");

  const { data: menu, error: e2 } = await db
    .from("atendimento_menus")
    .insert({
      inbox_id: inbox.id, nome: "ZZ teste", ativo: true,
      saudacao: "{{saudacao_nome}}! Bem-vindo.",
      cabecalho: "Escolha:",
      confirmacao: "Direcionado para {{fila}}.",
      nao_entendi: "Não entendi.",
      max_tentativas: 2,
      fila_escape: filas[2].id,
    })
    .select("id")
    .single();
  if (e2) throw new Error(`criar menu: ${e2.message}`);
  criados.menu = menu.id;

  await db.from("atendimento_menu_opcoes").insert([
    { menu_id: menu.id, ordem: 0, chave: "1", rotulo: "Compra e Venda", team_id: filas[0].id, etiqueta: "ramal-1" },
    { menu_id: menu.id, ordem: 1, chave: "2", rotulo: "Locação", team_id: filas[1].id },
  ]);

  async function novaConversa() {
    if (criados.conversa) {
      await db.from("atendimento_menu_estado").delete().eq("conversation_id", criados.conversa);
      await db.from("atendimento_transferencias").delete().eq("conversation_id", criados.conversa);
      await db.from("messages").delete().eq("conversation_id", criados.conversa);
      await db.from("conversations").delete().eq("id", criados.conversa);
    }
    const { data, error } = await db
      .from("conversations")
      .insert({
        canal: "whatsapp",
        external_id: `zz-teste-${Date.now()}`,
        contato_nome: "Gabriel Castro",
        contato_telefone: "550000000000",
        inbox_id: inbox.id,
        status: "aberta",
      })
      .select("id")
      .single();
    if (error) throw new Error(`criar conversa: ${error.message}`);
    criados.conversa = data.id;
    enviadas = [];
    return data.id;
  }

  const gat = (conteudo, conversaNova = false) => ({ conversaNova, conteudo, direcao: "in", interna: false });
  // Sai da janela de RAJADA (90 s): envelhece o que o sistema mandou por
  // último. Sem isto, uma frase logo depois do menu é "cliente ainda
  // digitando" e o motor fica em silêncio de propósito — ver teste 13.
  const envelhece = async (id) => db.from("messages")
    .update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .eq("conversation_id", id).eq("remetente", "sistema");
  const corre = (id, g) => processarMenu(db, id, g, { enviar: enviarFalso });

  // =====================================================================
  // 1. Primeira mensagem: manda o menu e passa a esperar resposta
  // =====================================================================
  let id = await novaConversa();
  let r = await corre(id, gat("oi", true));
  ok("1. primeira mensagem envia o menu", r.acao === "enviou", `acao=${r.acao} erros=${r.erros}`);
  ok("1. fica aguardando resposta", r.aguardandoResposta === true);
  ok("1. o texto traz a saudação com o nome", enviadas[0]?.includes("Gabriel"), enviadas[0]);
  ok("1. o texto lista os ramais", enviadas[0]?.includes("1 — Compra e Venda"), enviadas[0]);

  const { data: est1 } = await db.from("atendimento_menu_estado").select("*").eq("conversation_id", id).maybeSingle();
  ok("1. grava o estado aberto", est1 && !est1.respondido_em);

  // =====================================================================
  // 2. Mensagem seguinte que NÃO é opção: repete, não roteia
  // =====================================================================
  await envelhece(id);
  enviadas = [];
  r = await corre(id, gat("quero saber de um apartamento de 2 quartos"));
  ok("2. frase com número não roteia", r.acao === "repetiu", `acao=${r.acao}`);
  ok("2. repete sem a saudação", !enviadas[0]?.includes("Bem-vindo"), enviadas[0]);
  ok("2. e SEM a lista de opções (só o empurrão)", !enviadas[0]?.includes("1 — Compra e Venda"), enviadas[0]);
  const { data: conv2 } = await db.from("conversations").select("team_id, triada_em").eq("id", id).maybeSingle();
  ok("2. a conversa continua sem fila", !conv2.team_id && !conv2.triada_em);

  // =====================================================================
  // 3. Estourar as tentativas manda para a fila de escape
  // =====================================================================
  await envelhece(id);
  enviadas = [];
  r = await corre(id, gat("blablabla"));
  ok("3. na 2ª tentativa desiste", r.acao === "escapou", `acao=${r.acao}`);
  ok("3. escape em silêncio (sem 'identificamos sua necessidade')", enviadas.length === 0, JSON.stringify(enviadas));
  const { data: conv3 } = await db.from("conversations").select("team_id, triada_em").eq("id", id).maybeSingle();
  ok("3. foi para a fila de escape", conv3.team_id === filas[2].id, `team=${conv3.team_id}`);
  ok("3. e saiu da caixa central", Boolean(conv3.triada_em));

  // =====================================================================
  // 4. O caminho feliz: escolher um ramal
  // =====================================================================
  id = await novaConversa();
  await corre(id, gat("oi", true));
  enviadas = [];
  r = await corre(id, gat("1"));
  ok("4. escolher 1 roteia", r.acao === "roteou", `acao=${r.acao} erros=${r.erros}`);
  ok("4. não espera mais resposta", r.aguardandoResposta === false);

  const { data: conv4 } = await db
    .from("conversations").select("team_id, triada_em, tags").eq("id", id).maybeSingle();
  ok("4. caiu na fila certa", conv4.team_id === filas[0].id, `team=${conv4.team_id}`);
  ok("4. ESCOLHER O RAMAL É TRIAR", Boolean(conv4.triada_em), "triada_em continua nulo");
  ok("4. aplicou a etiqueta", (conv4.tags ?? []).includes("ramal-1"), JSON.stringify(conv4.tags));
  ok("4. confirmação nomeia a fila", enviadas[0]?.includes(filas[0].nome), enviadas[0]);

  const { data: log } = await db
    .from("atendimento_transferencias").select("acao, para_equipe, motivo").eq("conversation_id", id);
  ok("4. registrou no log de transferências", log?.length === 1, JSON.stringify(log));
  ok("4. o log diz que veio do menu", log?.[0]?.motivo?.startsWith("Menu: 1"), log?.[0]?.motivo);
  ok("4. e a ação é triagem", log?.[0]?.acao === "triagem", log?.[0]?.acao);

  // =====================================================================
  // 5. Depois de respondido, o menu não volta
  // =====================================================================
  enviadas = [];
  r = await corre(id, gat("2"));
  ok("5. não reabre o menu", r.acao === "nada", `acao=${r.acao}`);
  ok("5. e não manda nada", enviadas.length === 0);
  const { data: conv5 } = await db.from("conversations").select("team_id").eq("id", id).maybeSingle();
  ok("5. a fila não muda com um '2' depois", conv5.team_id === filas[0].id);

  // =====================================================================
  // 6. Estado expirado: "1" três semanas depois não é resposta de menu
  // =====================================================================
  id = await novaConversa();
  await corre(id, gat("oi", true));
  await db
    .from("atendimento_menu_estado")
    .update({ enviado_em: new Date(Date.now() - 40 * 24 * 3600_000).toISOString() })
    .eq("conversation_id", id);
  enviadas = [];
  r = await corre(id, gat("1"));
  ok("6. menu expirado não roteia", r.acao === "expirou", `acao=${r.acao}`);
  const { data: conv6 } = await db.from("conversations").select("team_id").eq("id", id).maybeSingle();
  ok("6. a conversa fica onde estava", !conv6.team_id);

  // =====================================================================
  // 7. Conversa que NÃO é nova não recebe menu
  // =====================================================================
  id = await novaConversa();
  enviadas = [];
  r = await corre(id, gat("oi", false));
  ok("7. conversa em andamento não recebe menu", r.acao === "nada", `acao=${r.acao}`);
  ok("7. e nada é enviado", enviadas.length === 0);

  // =====================================================================
  // 9. CLIENTE QUE VOLTA — a regra que o Carlos desenhou
  //
  // "Depois que for concluído o processo, coloca resolvido. Aí ele vai
  //  pra base principal. Aí o ramal já chama ele de novo. Agora, enquanto
  //  não tiver concluído, o ramal dele não aparece."
  //
  // As duas metades importam, e a segunda mais: mandar o menu no meio de
  // um atendimento seria interromper quem já está sendo atendido.
  // =====================================================================
  await db.from("atendimento_menus").update({ reenviar_apos_resolver: true }).eq("id", menu.id);

  id = await novaConversa();
  await corre(id, gat("oi", true));          // menu vai
  await corre(id, gat("1"));                 // escolhe, roteia
  enviadas = [];

  // 9a. Conversa EM ANDAMENTO: o cliente escreve de novo, o menu cala.
  let r9 = await corre(id, gat("mais uma pergunta"));
  ok("9a. conversa em andamento NÃO recebe o menu de novo", r9.acao === "nada", `acao=${r9.acao}`);
  ok("9a. e nada é enviado", enviadas.length === 0);

  // 9b. RESOLVIDA e o cliente volta: o ramal recomeça.
  await db.from("conversations").update({ status: "resolvida" }).eq("id", id);
  enviadas = [];
  r9 = await corre(id, { conversaNova: false, conteudo: "oi de novo", direcao: "in", interna: false, reabriuResolvida: true });
  ok("9b. depois de RESOLVIDA, o menu volta", r9.acao === "enviou", `acao=${r9.acao} erros=${r9.erros}`);
  ok("9b. e traz os ramais outra vez", enviadas[0]?.includes("1 — Compra e Venda"), enviadas[0]);

  // 9c. O estado recomeça do zero — inclusive as tentativas.
  const { data: est9 } = await db
    .from("atendimento_menu_estado").select("tentativas, respondido_em").eq("conversation_id", id).maybeSingle();
  ok("9c. estado zerado para a nova rodada", est9 && est9.tentativas === 0 && !est9.respondido_em, JSON.stringify(est9));

  // 9d. Ele pode escolher OUTRO setor desta vez.
  enviadas = [];
  r9 = await corre(id, gat("2"));
  ok("9d. escolhe outro ramal na volta", r9.acao === "roteou", `acao=${r9.acao}`);
  const { data: conv9 } = await db.from("conversations").select("team_id").eq("id", id).maybeSingle();
  ok("9d. e a conversa muda de fila", conv9.team_id === filas[1].id, `team=${conv9.team_id}`);

  // =====================================================================
  // 10. COM A OPÇÃO DESLIGADA, nada disso acontece
  // =====================================================================
  await db.from("atendimento_menus").update({ reenviar_apos_resolver: false }).eq("id", menu.id);
  id = await novaConversa();
  await corre(id, gat("oi", true));
  await corre(id, gat("1"));
  await db.from("conversations").update({ status: "resolvida" }).eq("id", id);
  enviadas = [];
  const r10 = await corre(id, { conversaNova: false, conteudo: "voltei", direcao: "in", interna: false, reabriuResolvida: true });
  ok("10. só contato novo: resolvida não reabre o menu", r10.acao === "nada", `acao=${r10.acao}`);
  ok("10. e nada é enviado", enviadas.length === 0);

  // =====================================================================
  // 11. HUMANO JÁ RESPONDEU: o menu cede a vez, em silêncio
  //
  // Caso real (Wilson Moreira, 23/09): menu 12:23, Carlos respondeu pelo
  // celular 13:14, e às 14:03 os áudios do cliente levaram "não entendi"
  // ×2 + "Perfeito, identificamos…" por cima da conversa do Carlos.
  // =====================================================================
  await db.from("atendimento_menus").update({ max_tentativas: 3, reenviar_apos_resolver: false }).eq("id", menu.id);
  id = await novaConversa();
  await corre(id, gat("oi", true));
  // O Carlos responde pelo celular: eco fromMe = out / atendente / sem autor.
  await db.from("messages").insert({
    conversation_id: id, direcao: "out", remetente: "atendente", autor_id: null,
    tipo: "texto", conteudo: "Boa tarde! Aqui é o Carlos, me conta o que precisa", interna: false, status: "enviada",
  });
  enviadas = [];
  let r11 = await corre(id, gat("quero ver o apartamento"));
  ok("11. humano já respondeu → menu CEDE", r11.acao === "cedeu", `acao=${r11.acao}`);
  ok("11. e não manda 'não entendi' por cima da conversa", enviadas.length === 0, JSON.stringify(enviadas));
  ok("11. bot externo liberado", r11.aguardandoResposta === false);
  const { data: est11 } = await db.from("atendimento_menu_estado").select("respondido_em").eq("conversation_id", id).maybeSingle();
  ok("11. estado fechado", Boolean(est11?.respondido_em));
  const { data: conv11 } = await db.from("conversations").select("team_id").eq("id", id).maybeSingle();
  ok("11. e NÃO roteou para lugar nenhum", !conv11.team_id);

  // =====================================================================
  // 12. MÍDIA SEM TEXTO não é tentativa
  // =====================================================================
  id = await novaConversa();
  await corre(id, gat("oi", true));
  enviadas = [];
  const r12 = await corre(id, gat(null));                 // áudio/foto sem legenda
  ok("12. áudio sem texto: silêncio", r12.acao === "nada" && enviadas.length === 0, `acao=${r12.acao} enviadas=${enviadas.length}`);
  ok("12. o menu continua aberto", r12.aguardandoResposta === true);
  const { data: est12 } = await db.from("atendimento_menu_estado").select("tentativas").eq("conversation_id", id).maybeSingle();
  ok("12. e NÃO contou tentativa", est12?.tentativas === 0, `tentativas=${est12?.tentativas}`);

  // =====================================================================
  // 13. RAJADA: frase logo depois do menu não conta nem responde…
  // =====================================================================
  enviadas = [];
  const r13 = await corre(id, gat("quero saber do apartamento"));   // < 90 s do menu
  ok("13. frase logo após o menu: silêncio (cliente ainda digitando)", r13.acao === "nada" && enviadas.length === 0, `acao=${r13.acao}`);
  const { data: est13 } = await db.from("atendimento_menu_estado").select("tentativas").eq("conversation_id", id).maybeSingle();
  ok("13. não contou tentativa", est13?.tentativas === 0);
  // …mas um NÚMERO logo depois do menu é resposta válida e roteia.
  enviadas = [];
  const r13b = await corre(id, gat("2"));
  ok("13. número dentro dos 90 s ROTEIA normalmente", r13b.acao === "roteou", `acao=${r13b.acao}`);

  // =====================================================================
  // 14. Fora da rajada: repete SÓ o empurrão, sem a lista; escape em silêncio
  // =====================================================================
  id = await novaConversa();
  await corre(id, gat("oi", true));
  // Envelhece o envio do menu para sair da janela de rajada.
  await db.from("messages").update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .eq("conversation_id", id).eq("remetente", "sistema");
  enviadas = [];
  const r14 = await corre(id, gat("quero saber do apartamento"));
  ok("14. frase fora da rajada: repete", r14.acao === "repetiu", `acao=${r14.acao}`);
  ok("14. manda SÓ o empurrão", enviadas[0] === "Não entendi.", JSON.stringify(enviadas[0]));
  ok("14. SEM reenviar a lista de opções", !enviadas[0]?.includes("1 — Compra e Venda"));

  await db.from("atendimento_menus").update({ max_tentativas: 1 }).eq("id", menu.id);
  id = await novaConversa();
  await corre(id, gat("oi", true));
  await db.from("messages").update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .eq("conversation_id", id).eq("remetente", "sistema");
  enviadas = [];
  const r14b = await corre(id, gat("preciso de um contrato de aluguel"));
  ok("14. com teto 1, a primeira frase já escapa", r14b.acao === "escapou", `acao=${r14b.acao}`);
  ok("14. e o escape NÃO manda 'identificamos sua necessidade' (mentira)", enviadas.length === 0, JSON.stringify(enviadas));
  const { data: conv14 } = await db.from("conversations").select("team_id").eq("id", id).maybeSingle();
  ok("14. mas a conversa foi para a fila de escape", conv14.team_id === filas[2].id);
  await db.from("atendimento_menus").update({ max_tentativas: 2 }).eq("id", menu.id);

  // =====================================================================
  // 8. Mensagem do ATENDENTE não conta como escolha
  // =====================================================================
  id = await novaConversa();
  await corre(id, gat("oi", true));
  enviadas = [];
  r = await processarMenu(db, id, { conversaNova: false, conteudo: "1", direcao: "out", interna: false }, { enviar: enviarFalso });
  ok("8. resposta do atendente não escolhe ramal", r.acao === "nada", `acao=${r.acao}`);
}

try {
  await main();
} catch (e) {
  falhas.push(`ERRO: ${e.message}`);
} finally {
  await limpar();
}

console.log(`\n${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log("\n" + falhas.map((f) => `  ✗ ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("✓ tudo certo — e nada foi enviado no WhatsApp");
