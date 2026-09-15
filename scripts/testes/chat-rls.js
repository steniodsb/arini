/* eslint-disable */
// =====================================================================
// Testes da RLS do chat interno (migration 0051).
//
// Rodam contra o banco de verdade, assumindo o papel `authenticated` e
// injetando o claim `sub` — é o ÚNICO jeito de exercitar a RLS: com a
// service role toda policy é ignorada, e um teste que roda como service
// role aprova qualquer coisa.
//
// Tudo em transação com rollback. O que precisa persistir entre atores é
// criado e apagado explicitamente no fim.
//
//   node scripts/testes/chat-rls.js
// =====================================================================
const { Client } = require("pg");
const { connectionString } = require("../_db");

const claims = (uid) => `'${JSON.stringify({ sub: uid, role: "authenticated" })}'`;
async function como(c, uid) {
  await c.query("begin");
  await c.query("set local role authenticated");
  await c.query(`set local request.jwt.claims = ${claims(uid)}`);
}

(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ppl = await c.query(`select id, nome, sector from profiles where ativo order by nome limit 3`);
  if (ppl.rowCount < 3) { console.error("precisa de 3 perfis ativos"); process.exit(1); }
  const [a, b, d] = ppl.rows;
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

  let ok = 0, fail = 0;
  const t = (nome, passou, extra = "") => {
    passou ? ok++ : fail++;
    console.log(`${passou ? "  ok  " : " FALHA"}  ${nome}${extra ? "  " + extra : ""}`);
  };

  console.log(`atores: A=${a.nome}  B=${b.nome}  C=${d.nome}\n`);

  // ---- fluxo completo de abrir conversa, como A ----------------------
  await como(c, a.id);
  let convId = null;
  try {
    const r = await c.query(
      `insert into chat_conversas (tipo,membro_a,membro_b) values ('direta',$1,$2) returning id`, [x, y]);
    convId = r.rows[0].id;
    t("A abre conversa direta (INSERT..RETURNING)", true);
  } catch (e) { t("A abre conversa direta (INSERT..RETURNING)", false, e.message.split("\n")[0]); }

  if (convId) {
    try {
      await c.query(`insert into chat_participantes (conversa_id,profile_id) values ($1,$2),($1,$3)`, [convId, x, y]);
      t("A inscreve os DOIS participantes de uma vez", true);
    } catch (e) { t("A inscreve os DOIS participantes de uma vez", false, e.message.split("\n")[0]); }

    try {
      const m = await c.query(
        `insert into chat_mensagens (conversa_id,autor_id,texto) values ($1,$2,'oi') returning id`, [convId, a.id]);
      t("A manda mensagem (INSERT..RETURNING)", m.rowCount === 1);
    } catch (e) { t("A manda mensagem (INSERT..RETURNING)", false, e.message.split("\n")[0]); }

    const prev = await c.query(`select ultima_previa from chat_conversas where id=$1`, [convId]);
    t("trigger denormaliza a prévia", prev.rows[0]?.ultima_previa === "oi", `("${prev.rows[0]?.ultima_previa}")`);

    try {
      await c.query(`insert into chat_mensagens (conversa_id,autor_id,texto) values ($1,$2,'forjada')`, [convId, b.id]);
      t("A não consegue assinar mensagem como B", false, "<-- vazou");
    } catch { t("A não consegue assinar mensagem como B", true); }
  }
  await c.query("rollback");

  // ---- isolamento entre pessoas (precisa persistir) ------------------
  await c.query(`insert into chat_conversas (tipo,membro_a,membro_b) values ($1,$2,$3) on conflict do nothing`, ["direta", x, y]);
  const cv = await c.query(`select id from chat_conversas where tipo='direta' and membro_a=$1 and membro_b=$2`, [x, y]);
  const cid = cv.rows[0].id;
  await c.query(`insert into chat_participantes (conversa_id,profile_id) values ($1,$2),($1,$3) on conflict do nothing`, [cid, x, y]);
  await c.query(`insert into chat_mensagens (conversa_id,autor_id,texto) values ($1,$2,'segredo')`, [cid, a.id]);

  await como(c, d.id);
  const m1 = await c.query(`select count(*) n from chat_mensagens where conversa_id=$1`, [cid]);
  t("C (terceiro) NÃO lê a mensagem privada", m1.rows[0].n === "0", `(viu ${m1.rows[0].n})`);
  const c1 = await c.query(`select count(*) n from chat_conversas where id=$1`, [cid]);
  t("C (terceiro) NÃO vê a conversa privada", c1.rows[0].n === "0", `(viu ${c1.rows[0].n})`);
  await c.query("rollback");

  await como(c, b.id);
  const m2 = await c.query(`select count(*) n from chat_mensagens where conversa_id=$1`, [cid]);
  t("B (destinatário) VÊ a mensagem", m2.rows[0].n === "1", `(viu ${m2.rows[0].n})`);
  await c.query("rollback");

  // ---- normalização do par ------------------------------------------
  await como(c, a.id);
  try {
    await c.query(`insert into chat_conversas (tipo,membro_a,membro_b) values ('direta',$1,$2)`, [y, x]);
    t("par invertido é recusado", false, "<-- criaria conversa duplicada");
  } catch { t("par invertido é recusado", true); }
  await c.query("rollback");

  // ---- canal de setor -----------------------------------------------
  await como(c, a.id);
  const meu = await c.query(`select count(*) n from chat_conversas where tipo='setor' and setor=$1`, [a.sector]);
  t("A vê o canal do próprio setor", meu.rows[0].n === "1");
  const outros = await c.query(`select count(*) n from chat_conversas where tipo='setor' and setor <> $1`, [a.sector]);
  t("A não vê canal de setor alheio", outros.rows[0].n === "0", `(viu ${outros.rows[0].n})`);
  await c.query("rollback");

  await c.query(`delete from chat_conversas where id=$1`, [cid]);
  console.log(`\n${ok} passaram, ${fail} falharam`);
  await c.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
