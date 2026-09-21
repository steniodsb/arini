/* eslint-disable */
// Coloca as CONTAS DE TESTE nas filas de destino do menu de ramais, para
// dar para testar o fluxo ponta a ponta antes de a equipe real existir.
//
//   node scripts/filas-contas-teste.js          aplica
//   node scripts/filas-contas-teste.js --undo   desfaz
//
// POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE NÃO CRIA NINGUÉM
// ----------------------------------------------------------
// Em 21/09/2026 as 6 filas de destino do menu tinham 1 membro somando
// todas, e nenhum perfil do banco é uma pessoa real da Arini — são 10
// contas "Demo"/"(teste)". A tentação é cadastrar gente fictícia para
// "destravar". Isso piora:
//
//   · fila VAZIA é visivelmente vazia — o painel de Triagem denuncia e a
//     conversa fica na caixa central, onde alguém olha;
//   · conversa atribuída a um FANTASMA parece atendida: sai da caixa
//     central, ganha dono, e o dono nunca faz login.
//
// Então este script não cria conta nenhuma. Ele só usa as três que JÁ
// têm `atendimento_access`, sem ampliar quem enxerga conversa de cliente
// — o que importa porque as 10 contas dividem a mesma senha.
//
// É ANDAIME. Rode com --undo quando a equipe real for cadastrada.
const { Client } = require("pg");
const { connectionString } = require("./_db");

const CONTAS = [
  "atendimento.administrador@arininegociosimobiliarios.com.br",
  "atendimento.recepcao@arininegociosimobiliarios.com.br",
  "atendimento.atendente@arininegociosimobiliarios.com.br",
];

const desfazer = process.argv.includes("--undo");

async function main() {
  const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: perfis } = await db.query(
    `select id, nome, email, atendimento_access from public.profiles where email = any($1)`,
    [CONTAS],
  );
  if (perfis.length === 0) {
    console.error("Nenhuma das contas de teste foi encontrada.");
    process.exit(1);
  }
  // Guarda de segurança: se alguém tiver tirado o acesso, não é para este
  // script devolver — ele não concede permissão, só distribui em filas.
  const semAcesso = perfis.filter((p) => !p.atendimento_access);
  if (semAcesso.length) {
    console.error(`Estas contas não têm acesso ao atendimento: ${semAcesso.map((p) => p.email).join(", ")}`);
    console.error("Este script não concede acesso — faça isso em Configurações › Agentes.");
    process.exit(1);
  }

  // Só as filas que o menu realmente usa como destino.
  const { rows: filas } = await db.query(
    `select distinct t.id, t.nome
       from public.atendimento_teams t
       join public.atendimento_menu_opcoes o on o.team_id = t.id
      order by t.nome`,
  );
  if (filas.length === 0) {
    console.error("Nenhuma fila é destino de ramal — rode antes o seed-menu-ramais.js.");
    process.exit(1);
  }

  if (desfazer) {
    const r = await db.query(
      `delete from public.atendimento_team_members
        where profile_id = any($1) and team_id = any($2)`,
      [perfis.map((p) => p.id), filas.map((f) => f.id)],
    );
    console.log(`Removidos ${r.rowCount} vínculos das contas de teste.`);
    await db.end();
    return;
  }

  let n = 0;
  for (const f of filas) {
    for (const p of perfis) {
      const r = await db.query(
        `insert into public.atendimento_team_members (team_id, profile_id)
         values ($1,$2) on conflict do nothing`,
        [f.id, p.id],
      );
      n += r.rowCount;
    }
    console.log(`  ${f.nome}: ${perfis.length} conta(s) de teste`);
  }

  console.log(`\n${n} vínculo(s) criado(s).`);
  console.log("ANDAIME — rode `node scripts/filas-contas-teste.js --undo` quando a equipe real entrar.");
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
