/* eslint-disable */
/**
 * Compromissos de DEMONSTRAÇÃO na agenda — para ver as visualizações
 * funcionando antes de existir movimento real.
 *
 * Por que existe: as duas tabelas da agenda estão zeradas em produção, e
 * um calendário vazio não mostra nada de quadro, timeline, barra multi-dia
 * ou sobreposição de horário. Sem dado, não dá para julgar o resultado.
 *
 * SEGURANÇA — leia antes de rodar:
 *  · Todo registro criado leva o prefixo "[DEMO]" no título e a marca
 *    `demo` nas observações. É por isso que o undo consegue apagar
 *    exatamente o que foi criado, sem tocar em compromisso de verdade.
 *  · Isto grava no banco de PRODUÇÃO. Se a equipe já estiver usando a
 *    agenda, ela vai ver esses itens. Apague quando terminar de olhar.
 *
 * Uso:
 *   node scripts/seed-agenda-demo.js          cria
 *   node scripts/seed-agenda-demo.js --undo   apaga tudo que foi criado
 */
const { Client } = require("pg");
const { connectionString } = require("./_db");

const MARCA = "[DEMO]";
const OBS = "Compromisso de demonstração — apague com: node scripts/seed-agenda-demo.js --undo";

/** Data relativa a hoje, com hora local cravada. */
function em(dias, hora, minuto = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

// Cobre de propósito os casos que cada vista precisa exercitar:
// sobreposição de horário, multi-dia, dia inteiro, status variados,
// item sem responsável e item SEM DATA (para o painel lateral).
const EVENTOS = [
  { titulo: "Visita — Casa no Jardim Europa", tipo: "visita", dias: 0, hora: 9, dur: 60, status: "confirmado" },
  { titulo: "Reunião de captação", tipo: "reuniao", dias: 0, hora: 9, dur: 90, status: "agendado" },
  { titulo: "Ligação de retorno — proposta", tipo: "ligacao", dias: 0, hora: 14, dur: 30, status: "agendado" },
  { titulo: "Assinatura de contrato", tipo: "assinatura", dias: 1, hora: 10, dur: 60, status: "confirmado" },
  { titulo: "Gravação de vídeo do imóvel", tipo: "gravacao", dias: 1, hora: 15, dur: 120, status: "agendado" },
  { titulo: "Feirão de imóveis", tipo: "outro", dias: 2, hora: 8, dur: 60 * 24 * 3, status: "confirmado", diaInteiro: true },
  { titulo: "Reunião semanal da equipe", tipo: "reuniao", dias: 3, hora: 8, dur: 60, status: "agendado" },
  { titulo: "Visita — Apartamento Centro", tipo: "visita", dias: 4, hora: 16, dur: 45, status: "agendado" },
  { titulo: "Retorno ao proprietário", tipo: "retorno", dias: 5, hora: 11, dur: 30, status: "concluido" },
  { titulo: "Visita cancelada pelo cliente", tipo: "visita", dias: -1, hora: 14, dur: 60, status: "cancelado" },
  { titulo: "Cliente não compareceu", tipo: "visita", dias: -2, hora: 10, dur: 60, status: "nao_compareceu" },
  { titulo: "Vistoria de entrega", tipo: "outro", dias: 8, hora: 9, dur: 90, status: "agendado" },
  { titulo: "Reunião com investidor", tipo: "reuniao", dias: 11, hora: 15, dur: 60, status: "agendado" },
  // Sem data: aparecem no painel lateral de não agendados.
  { titulo: "Avaliar imóvel na Vila Nova", tipo: "visita", semData: true, dur: 60, status: "agendado" },
  { titulo: "Retorno — cliente pediu para ligar depois", tipo: "retorno", semData: true, dur: 30, status: "agendado" },
  { titulo: "Fotografar fachada", tipo: "gravacao", semData: true, dur: 45, status: "agendado" },
];

async function main() {
  const undo = process.argv.includes("--undo");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  if (undo) {
    const r = await client.query(
      `delete from public.agenda_events where titulo like $1 returning id`,
      [`${MARCA}%`],
    );
    console.log(`🗑️  ${r.rowCount} compromisso(s) de demonstração apagado(s).`);
    await client.end();
    return;
  }

  // Responsável e setor: pega quem já existe, para os cartões não nascerem órfãos.
  const { rows: perfis } = await client.query(
    `select id, sector from public.profiles where ativo order by created_at limit 4`,
  );
  if (perfis.length === 0) {
    console.error("Nenhum perfil ativo — crie um usuário antes.");
    process.exit(1);
  }

  let criados = 0;
  for (let i = 0; i < EVENTOS.length; i++) {
    const e = EVENTOS[i];
    const perfil = perfis[i % perfis.length];
    const { rowCount } = await client.query(
      `insert into public.agenda_events
         (titulo, tipo, data_hora, duracao_min, status, dia_inteiro,
          responsavel_id, criado_por, criado_por_sector, observacoes, ordem)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        `${MARCA} ${e.titulo}`,
        e.tipo,
        e.semData ? null : em(e.dias, e.hora),
        e.dur,
        e.status,
        e.diaInteiro === true,
        // Um item de propósito sem responsável, para a linha "Sem responsável"
        // da timeline não nascer vazia.
        i === 2 ? null : perfil.id,
        perfil.id,
        perfil.sector,
        OBS,
        i,
      ],
    );
    criados += rowCount;
  }

  console.log(`✅ ${criados} compromissos de demonstração criados.`);
  console.log(`   Inclui: sobreposição de horário, evento de 3 dias, status variados`);
  console.log(`   e 3 itens SEM DATA (painel lateral).`);
  console.log(`\n   Para apagar: node scripts/seed-agenda-demo.js --undo`);
  await client.end();
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
