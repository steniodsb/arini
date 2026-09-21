/* eslint-disable */
// Semeia o MENU DE RAMAIS com o conteúdo do fluxograma de 18/09/2026
// ("FLUXOGRAMA — CRM OMNICHANNEL + RAMAL ARINI") e preenche o `inbox_id`
// das conversas antigas.
//
//   node scripts/seed-menu-ramais.js
//
// O menu nasce DESATIVADO de propósito. Ativá-lo muda o comportamento de
// um número de WhatsApp com cliente real do outro lado: a partir do
// clique, todo mundo que escrever recebe o menu. Essa é uma decisão de
// operação, não de deploy — a tela tem o interruptor.
//
// Idempotente: rodar de novo não duplica nada.
const { Client } = require("pg");
const { connectionString } = require("./_db");

// Os 6 ramais da slide 2, na ordem em que o cliente escreveu.
// `fila` é o NOME da fila em atendimento_teams; null = decidir na tela.
const RAMAIS = [
  { chave: "1", rotulo: "Compra e Venda", fila: "Venda Urbana" },
  { chave: "2", rotulo: "Imóveis Rurais e Fazendas", fila: "Fazenda" },
  { chave: "3", rotulo: "Locação e Administração", fila: "Locação" },
  // Financeiro x Consórcio e Documentação x Jurídico eram ambíguos no
  // fluxograma. O palpite fica como padrão e a tela corrige em um clique.
  { chave: "4", rotulo: "Financiamento Imobiliário", fila: "Financeiro" },
  { chave: "5", rotulo: "Escritura e Documentação", fila: "Documentação" },
  { chave: "6", rotulo: "Atendimento Consultivo", fila: "Atendimento Geral" },
];

const SAUDACAO = `{{saudacao}}! Seja bem-vindo à Arini Negócios Imobiliários.
Será um prazer atender você.`;

const CABECALHO = "Para direcionarmos seu atendimento, escolha uma das opções abaixo:";

const CONFIRMACAO = `Perfeito. Seu atendimento foi direcionado ao setor responsável.
Em instantes, um profissional dará continuidade à conversa.`;

const NAO_ENTENDI = "Não consegui identificar a opção. Responda apenas com o número:";

async function main() {
  const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // --- 1) A caixa do WhatsApp -----------------------------------------
  const { rows: caixas } = await db.query(
    `select id, nome from public.atendimento_inboxes
      where canal = 'whatsapp' and ativo and channel_id is not null`,
  );
  if (caixas.length !== 1) {
    console.error(`Esperava 1 caixa de WhatsApp com conexão; achei ${caixas.length}.`);
    process.exit(1);
  }
  const caixa = caixas[0];
  console.log(`Caixa: ${caixa.nome} (${caixa.id})`);

  // --- 2) Backfill do inbox_id ----------------------------------------
  // Ver src/lib/atendimento/caixa.ts: o campo nunca foi gravado, e por
  // causa disso a condição "horário comercial" das automações nunca soube
  // o expediente.
  const back = await db.query(
    `update public.conversations c
        set inbox_id = i.id
       from public.atendimento_inboxes i
      where c.inbox_id is null
        and i.channel_id = c.channel_id
        and i.ativo`,
  );
  console.log(`Conversas com a caixa preenchida agora: ${back.rowCount}`);

  // --- 3) O menu -------------------------------------------------------
  const { rows: jaExiste } = await db.query(
    `select id, ativo from public.atendimento_menus where inbox_id = $1`,
    [caixa.id],
  );

  let menuId;
  if (jaExiste.length) {
    menuId = jaExiste[0].id;
    // Não mexe no `ativo`: se alguém já ligou na tela, ligado fica.
    await db.query(
      `update public.atendimento_menus
          set nome=$2, saudacao=$3, cabecalho=$4, confirmacao=$5, nao_entendi=$6
        where id=$1`,
      [menuId, "Ramal Arini", SAUDACAO, CABECALHO, CONFIRMACAO, NAO_ENTENDI],
    );
    console.log(`Menu já existia (${menuId}) — textos atualizados, ativo=${jaExiste[0].ativo}.`);
  } else {
    const { rows } = await db.query(
      `insert into public.atendimento_menus
         (inbox_id, nome, ativo, saudacao, cabecalho, confirmacao, nao_entendi)
       values ($1,$2,false,$3,$4,$5,$6) returning id`,
      [caixa.id, "Ramal Arini", SAUDACAO, CABECALHO, CONFIRMACAO, NAO_ENTENDI],
    );
    menuId = rows[0].id;
    console.log(`Menu criado (${menuId}) — DESATIVADO.`);
  }

  // --- 4) As opções ----------------------------------------------------
  const { rows: filas } = await db.query(`select id, nome from public.atendimento_teams`);
  const porNome = new Map(filas.map((f) => [f.nome, f.id]));

  for (let i = 0; i < RAMAIS.length; i++) {
    const r = RAMAIS[i];
    const teamId = r.fila ? porNome.get(r.fila) ?? null : null;
    if (r.fila && !teamId) console.warn(`  ! fila "${r.fila}" não existe — ramal ${r.chave} fica sem destino`);

    await db.query(
      `insert into public.atendimento_menu_opcoes (menu_id, ordem, chave, rotulo, team_id, etiqueta)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (menu_id, chave) do update
          set ordem = excluded.ordem, rotulo = excluded.rotulo,
              team_id = excluded.team_id, etiqueta = excluded.etiqueta`,
      [menuId, i, r.chave, r.rotulo, teamId, r.rotulo],
    );
    console.log(`  ${r.chave} — ${r.rotulo}  →  ${r.fila ?? "(sem fila)"}${teamId ? "" : " [!]"}`);
  }

  // --- 5) Aviso honesto sobre filas vazias -----------------------------
  const { rows: vazias } = await db.query(
    `select t.nome
       from public.atendimento_teams t
       join public.atendimento_menu_opcoes o on o.team_id = t.id and o.menu_id = $1
      where not exists (select 1 from public.atendimento_team_members m where m.team_id = t.id)`,
    [menuId],
  );
  if (vazias.length) {
    console.log(`\n⚠ ${vazias.length} filas de destino estão SEM NINGUÉM:`);
    console.log("  " + vazias.map((v) => v.nome).join(", "));
    console.log("  O cliente escolhe o ramal, recebe a confirmação e não há quem atenda.");
    console.log("  Cadastre os atendentes em Configurações › Filas antes de ativar o menu.");
  }

  await db.end();
  console.log("\nPronto. O menu está DESATIVADO — reveja os textos e ligue na tela.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
