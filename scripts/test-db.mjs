// Testa as migrations em um Postgres embutido (PGlite), simulando o Supabase.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const db = new PGlite()
let passed = 0
let failed = 0

function ok(name) {
  passed++
  console.log(`  ✓ ${name}`)
}
function fail(name, detail) {
  failed++
  console.log(`  ✗ ${name}\n      ${detail}`)
}

async function as(role, userId, fn) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    return await fn()
  } finally {
    await db.exec('rollback')
  }
}

// Igual a as(), mas confirma a transação (para testar efeitos reais).
async function run(role, userId, sql, params = []) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    const r = await db.query(sql, params)
    await db.exec('commit')
    return r
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const eq = (name, got, want) =>
  String(got) === String(want) ? ok(name) : fail(name, `esperava ${want}, veio ${got}`)

async function expectError(name, fn, match) {
  try {
    await fn()
    fail(name, 'esperava erro, mas passou')
  } catch (e) {
    if (match && !String(e.message).match(match)) fail(name, `erro inesperado: ${e.message}`)
    else ok(name)
  }
}

async function expectRows(name, fn, n) {
  try {
    const r = await fn()
    if (r.rows.length === n) ok(name)
    else fail(name, `esperava ${n} linha(s), veio ${r.rows.length}`)
  } catch (e) {
    fail(name, e.message)
  }
}

// --- setup ---------------------------------------------------------------
await db.exec(readFileSync(join(root, 'supabase/tests/supabase-stub.sql'), 'utf8'))
const migDir = join(root, 'supabase/migrations')
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'))
  console.log(`migration aplicada: ${f}`)
}
const hasFn = async (name) =>
  (await db.query(`select 1 from pg_proc where proname = $1`, [name])).rows.length > 0

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const ADM = '33333333-3333-3333-3333-333333333333'

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}', 'a@test.com', '{"username":"kassio"}'),
    ('${B}', 'b@test.com', '{"username":"miguel"}'),
    ('${ADM}', 'adm@test.com', '{"username":"admin_on"}');
`)
// Na Fase 2 um trigger cria perfil + carteira; aqui criamos se ainda não existir.
await db.exec(`
  insert into public.profiles (id, username) values
    ('${A}', 'kassio'), ('${B}', 'miguel'), ('${ADM}', 'admin_on')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = '${ADM}';
  insert into public.wallets (user_id, balance)
    select id, 1000 from public.profiles on conflict (user_id) do nothing;
`)
const seed = await db.query(`
  with t as (
    insert into public.teams (name, short_name) values ('Milan','MIL'), ('PSV','PSV') returning id
  ), c as (
    insert into public.competitions (name, status) values ('ORG ON Champions', 'ongoing') returning id
  )
  select (select id from c) as comp,
         (select array_agg(id) from t) as teams
`)
const comp = seed.rows[0].comp
const [milan, psv] = seed.rows[0].teams
const m = await db.query(
  `insert into public.matches (competition_id, home_team_id, away_team_id, scheduled_at)
   values ($1,$2,$3, now() + interval '2 days') returning id`,
  [comp, milan, psv],
)
const ev = await db.query(
  `insert into public.prediction_events (category, competition_id, match_id, title, status, closes_at)
   values ('match', $1, $2, 'Milan x PSV', 'open', now() + interval '2 days') returning id`,
  [comp, m.rows[0].id],
)
const evId = ev.rows[0].id
const draft = await db.query(
  `insert into public.prediction_events (category, competition_id, title, status, closes_at)
   values ('competition', $1, 'Campeão (rascunho)', 'draft', now() + interval '30 days') returning id`,
  [comp],
)
const opt = await db.query(
  `insert into public.prediction_options (event_id, name, odds, sort_order) values
     ($1, 'Milan', 2.10, 1), ($1, 'Empate', 3.20, 2), ($1, 'PSV', 2.80, 3) returning id`,
  [evId],
)
const optMilan = opt.rows[0].id
const walletA = (await db.query(`select id from public.wallets where user_id = $1`, [A])).rows[0].id

console.log('\nIntegridade')
const pred = await db.query(
  `insert into public.predictions (user_id, event_id, option_id, stake, odds_snapshot, idempotency_key)
   values ($1, $2, $3, 100, 2.10, gen_random_uuid()) returning id, potential_payout`,
  [A, evId, optMilan],
)
pred.rows[0].potential_payout == 210 ? ok('100 × 2,10 = 210 de retorno') : fail('retorno', pred.rows[0].potential_payout)
const predId = pred.rows[0].id

await expectError('saldo negativo é recusado', () =>
  db.query(`update public.wallets set balance = -1 where id = $1`, [walletA]), /balance_check/)
await expectError('odd abaixo de 1.01 é recusada', () =>
  db.query(`insert into public.prediction_options (event_id, name, odds) values ($1,'X',1.00)`, [evId]))
await expectError('time contra ele mesmo é recusado', () =>
  db.query(`insert into public.matches (competition_id, home_team_id, away_team_id, scheduled_at)
            values ($1,$2,$2, now())`, [comp, milan]))
await expectError('opção de outro evento é recusada no palpite', () =>
  db.query(`insert into public.predictions (user_id, event_id, option_id, stake, odds_snapshot, idempotency_key)
            values ($1, $2, $3, 10, 2, gen_random_uuid())`, [A, draft.rows[0].id, optMilan]))
await expectError('mesma idempotency_key gera erro (sem duplicar)', async () => {
  const key = '44444444-4444-4444-4444-444444444444'
  for (let i = 0; i < 2; i++)
    await db.query(`insert into public.predictions (user_id, event_id, option_id, stake, odds_snapshot, idempotency_key)
                    values ($1, $2, $3, 10, 2.10, $4)`, [A, evId, optMilan, key])
}, /idempotency/)
await expectError('stake do palpite não pode ser alterado', () =>
  db.query(`update public.predictions set stake = 999 where id = $1`, [predId]), /não podem ser alterados/)
await expectError('odd congelada não pode ser alterada', () =>
  db.query(`update public.predictions set odds_snapshot = 9 where id = $1`, [predId]), /não podem ser alterados/)
await expectError('palpite vencedor exige payout = retorno', () =>
  db.query(`update public.predictions set status='won', payout=1, settled_at=now() where id=$1`, [predId]), /payout_state/)
await expectError('segundo crédito inicial na mesma carteira é recusado', () =>
  db.query(`insert into public.transactions (wallet_id, type, kind, amount, balance_after, description)
            values ($1,'credit','initial_credit',1000,2000,'De novo')`, [walletA]), /one_initial_credit/)
await expectError('tipo incompatível com natureza (stake como crédito)', () =>
  db.query(`insert into public.transactions (wallet_id, type, kind, amount, balance_after, description, reference_id)
            values ($1,'credit','stake',10,10,'x', gen_random_uuid())`, [walletA]), /type_matches_kind/)
await expectError('transação é imutável', () =>
  db.query(`update public.transactions set amount = 1 where wallet_id = $1`, [walletA]), /imutáveis/)
await expectError('evento não vira "apurado" por UPDATE direto', () =>
  db.query(`update public.prediction_events set status='settled', winning_option_id=$2, settled_at=now() where id=$1`,
           [evId, optMilan]), /função de apuração/)
await expectError('evento de marco histórico exige regras', () =>
  db.query(`insert into public.prediction_events (category, title, closes_at) values ('milestone','Primeiro a 10 títulos', now()+interval '1 year')`),
  /milestone_rules/)

console.log('\nRLS — participante')
await expectRows('vê a própria carteira', () =>
  as('authenticated', A, () => db.query(`select * from public.wallets`)), 1)
await expectRows('não vê perfil de outro usuário', () =>
  as('authenticated', A, () => db.query(`select * from public.profiles where id = $1`, [B])), 0)
await expectRows('vê só os próprios palpites', () =>
  as('authenticated', B, () => db.query(`select * from public.predictions`)), 0)
await expectRows('vê só as próprias transações (o próprio crédito inicial)', () =>
  as('authenticated', B, () => db.query(`select * from public.transactions`)), 1)
await expectError('não altera o próprio saldo', () =>
  as('authenticated', A, () => db.query(`update public.wallets set balance = 999999`)), /permission denied/)
await expectError('não cria transação', () =>
  as('authenticated', A, () => db.query(
    `insert into public.transactions (wallet_id, type, kind, amount, balance_after, description)
     values ($1,'credit','admin_adjustment',5000,6000,'hack')`, [walletA])), /permission denied/)
await expectError('não cria palpite direto na tabela', () =>
  as('authenticated', A, () => db.query(
    `insert into public.predictions (user_id, event_id, option_id, stake, odds_snapshot, idempotency_key)
     values ($1,$2,$3,10,50,gen_random_uuid())`, [A, evId, optMilan])), /permission denied/)
await expectError('não vira admin', () =>
  as('authenticated', A, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [A])), /permission denied/)
try {
  await as('authenticated', A, () => db.query(`update public.profiles set username = 'kassio10' where id = $1`, [A]))
  ok('edita o próprio username')
} catch (e) { fail('edita o próprio username', e.message) }
await expectRows('não edita perfil de outro (0 linhas afetadas)', () =>
  as('authenticated', A, () => db.query(`update public.profiles set username = 'hacked' where id = $1 returning id`, [B])), 0)
await expectRows('não altera odds (RLS filtra: 0 linhas)', () =>
  as('authenticated', A, () => db.query(`update public.prediction_options set odds = 50 returning id`)), 0)
await expectError('não cria evento', () =>
  as('authenticated', A, () => db.query(
    `insert into public.prediction_events (category, competition_id, title, closes_at) values ('competition',$1,'x', now()+interval '1 day')`, [comp])),
  /row-level security/)
await expectRows('não vê evento em rascunho', () =>
  as('authenticated', A, () => db.query(`select * from public.prediction_events where status = 'draft'`)), 0)
await db.query(`insert into public.admin_audit_log (admin_id, action, target_table) values ($1,'test','x')`, [ADM])
await expectRows('não lê auditoria', () =>
  as('authenticated', A, () => db.query(`select * from public.admin_audit_log`)), 0)

console.log('\nRLS — visitante (anon)')
await expectRows('vê eventos abertos', () =>
  as('anon', null, () => db.query(`select * from public.prediction_events`)), 1)
await expectRows('vê opções de eventos publicados', () =>
  as('anon', null, () => db.query(`select * from public.prediction_options`)), 3)
await expectError('não lê carteiras', () =>
  as('anon', null, () => db.query(`select * from public.wallets`)), /permission denied/)

console.log('\nRLS — administrador')
await expectRows('vê eventos em rascunho', () =>
  as('authenticated', ADM, () => db.query(`select * from public.prediction_events`)), 2)
await expectRows('vê todas as carteiras', () =>
  as('authenticated', ADM, () => db.query(`select * from public.wallets`)), 3)
try {
  await as('authenticated', ADM, () => db.query(`update public.prediction_options set odds = 1.80 where id = $1`, [optMilan]))
  const snap = await db.query(`select odds_snapshot from public.predictions where id = $1`, [predId])
  snap.rows[0].odds_snapshot == 2.1 ? ok('altera odd; palpite antigo mantém 2,10') : fail('snapshot', snap.rows[0].odds_snapshot)
} catch (e) { fail('admin altera odd', e.message) }
await expectError('admin não edita saldo direto', () =>
  as('authenticated', ADM, () => db.query(`update public.wallets set balance = 1`)), /permission denied/)
await expectError('admin não promove ninguém por UPDATE direto', () =>
  as('authenticated', ADM, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [B])), /permission denied/)

if (await hasFn('handle_new_user')) {
  console.log('\nFase 2 — cadastro e perfis')
  const newUser = async (email, meta) =>
    (await db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, JSON.stringify(meta)],
    )).rows[0].id
  const profileOf = async (id) =>
    (await db.query(`select username, role, full_name from public.profiles where id = $1`, [id])).rows[0]

  const p1 = await profileOf(await newUser('vini@test.com', { username: 'Vinicius_10', full_name: 'Vinícius' }))
  p1?.username === 'Vinicius_10' && p1.full_name === 'Vinícius' ? ok('cadastro cria perfil com o username pedido') : fail('perfil', JSON.stringify(p1))
  const p2 = await profileOf(await newUser('hacker@test.com', { username: 'hacker', role: 'admin' }))
  p2?.role === 'participant' ? ok('role enviado no cadastro é ignorado') : fail('role', p2?.role)
  const p3 = await profileOf(await newUser('outro@test.com', { username: 'VINICIUS_10' }))
  ;/^VINICIUS_10\d{5}$/.test(p3?.username ?? '') ? ok(`username repetido ganha sufixo (${p3.username})`) : fail('sufixo', p3?.username)
  const p4 = await profileOf(await newUser('joao.silva+x@test.com', { username: '!!' }))
  p4?.username === 'joao.silvax' ? ok('username inválido cai para o e-mail') : fail('fallback e-mail', p4?.username)
  const p5 = await profileOf(await newUser('a@b.com', {}))
  ;/^jogador(\d{5})?$/.test(p5?.username ?? '') ? ok(`e-mail curto vira "jogador" (${p5.username})`) : fail('curto', p5?.username)

  const avail = async (role, u) =>
    as(role, null, () => db.query(`select public.is_username_available($1) ok`, [u])).then((r) => r.rows[0].ok)
  ;(await avail('anon', 'vinicius_10')) === false ? ok('disponibilidade ignora maiúsculas') : fail('case', 'disponível')
  ;(await avail('anon', 'novo_nome')) === true ? ok('visitante consegue checar username livre') : fail('livre', 'indisponível')
  ;(await avail('anon', 'a b')) === false ? ok('username com espaço é recusado') : fail('espaço', 'aceito')
  await expectError('visitante não chama handle_new_user', () =>
    as('anon', null, () => db.query(`select public.handle_new_user()`)), /permission denied|trigger/)
}

// ======================================================================
// Fase 3 — carteira
// ======================================================================
console.log('\nFase 3 — carteira')
const mkUser = async (email, username) =>
  (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ username })])).rows[0].id
const C = await mkUser('c@test.com', 'carlos')
const D = await mkUser('d@test.com', 'diego')
const balanceOf = async (uid) => Number((await one(`select balance from public.wallets where user_id = $1`, [uid])).balance)

eq('cadastro cria carteira com 1.000 ON Coins', await balanceOf(C), 1000)
eq('crédito inicial registrado no extrato', (await one(
  `select count(*)::int n from public.transactions t join public.wallets w on w.id = t.wallet_id
   where w.user_id = $1 and t.kind = 'initial_credit' and t.amount = 1000`, [C])).n, 1)
{
  const r = await run('authenticated', C, `select public.get_wallet_summary() s`)
  const s = r.rows[0].s
  s.balance == 1000 && s.total_received == 1000 && s.total_staked == 0
    ? ok('get_wallet_summary devolve saldo e totais') : fail('summary', JSON.stringify(s))
}
await db.exec(`update public.app_settings set initial_balance = 500`)
const E = await mkUser('e@test.com', 'eduardo')
eq('saldo inicial configurável (500)', await balanceOf(E), 500)
await db.exec(`update public.app_settings set initial_balance = 1000`)
eq('wallets está na publicação do Realtime', (await one(
  `select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wallets'`)).n, 1)

// ======================================================================
// Fase 4 — palpites
// ======================================================================
console.log('\nFase 4 — palpites')
const mkEvent = async ({ status = 'open', opens = "now() - interval '1 hour'", closes = "now() + interval '1 day'",
                         matchAt = null, title = 'Evento teste', options = [['Milan', 2.1], ['Empate', 3.2], ['PSV', 2.8]] } = {}) => {
  let matchId = null
  if (matchAt) {
    matchId = (await one(`insert into public.matches (competition_id, home_team_id, away_team_id, scheduled_at)
                          values ($1,$2,$3, ${matchAt}) returning id`, [comp, milan, psv])).id
  }
  const e = await one(
    `insert into public.prediction_events (category, competition_id, match_id, title, status, opens_at, closes_at)
     values ($1, $2, $3, $4, $5, ${opens}, ${closes}) returning id`,
    [matchId ? 'match' : 'competition', comp, matchId, title, status])
  const ids = []
  for (const [i, [name, odds]] of options.entries()) {
    ids.push((await one(`insert into public.prediction_options (event_id, name, odds, sort_order) values ($1,$2,$3,$4) returning id`,
      [e.id, name, odds, i])).id)
  }
  return { id: e.id, opts: ids, matchId }
}
const place = (uid, opt, stake, key = crypto.randomUUID()) =>
  run('authenticated', uid, `select * from public.place_prediction($1, $2, $3)`, [opt, stake, key]).then((r) => r.rows[0])

const ev1 = await mkEvent({ matchAt: "now() + interval '1 day'", closes: "now() + interval '1 day'", title: 'Milan x PSV (teste)' })
const key1 = crypto.randomUUID()
const p1 = await place(C, ev1.opts[0], 100, key1)
eq('palpite registrado com odd congelada 2,10', p1.odds_snapshot, '2.10')
eq('saldo debitado (1.000 → 900)', await balanceOf(C), 900)
eq('transação de palpite com saldo após = 900', (await one(
  `select balance_after from public.transactions where kind = 'stake' and reference_id = $1`, [p1.id])).balance_after, 900)
const p1again = await place(C, ev1.opts[0], 100, key1)
eq('mesma chave devolve o mesmo palpite', p1again.id, p1.id)
eq('…e não cobra de novo', await balanceOf(C), 900)

await expectError('saldo insuficiente é recusado', () => place(C, ev1.opts[0], 5000), /Saldo insuficiente|entre/)
await db.exec(`update public.app_settings set max_stake = 100000`)
await expectError('saldo insuficiente (acima do saldo, dentro do limite)', () => place(C, ev1.opts[0], 901), /Saldo insuficiente/)
await db.exec(`update public.app_settings set max_stake = 5000`)
await expectError('valor abaixo do mínimo é recusado', () => place(C, ev1.opts[0], 5), /entre 10 e 5000/)
await expectError('valor zero/negativo é recusado', () => place(C, ev1.opts[0], -50), /entre/)
await db.query(`update public.prediction_options set status = 'inactive' where id = $1`, [ev1.opts[1]])
await expectError('opção inativa é recusada', () => place(C, ev1.opts[1], 10), /não está disponível/)
await db.query(`update public.prediction_options set status = 'active' where id = $1`, [ev1.opts[1]])

const evClosed = await mkEvent({ opens: "now() - interval '2 days'", closes: "now() - interval '1 minute'" })
await expectError('evento com prazo vencido é recusado', () => place(C, evClosed.opts[0], 10), /já foram encerrados/)
const evDraft = await mkEvent({ status: 'draft' })
await expectError('evento em rascunho é recusado', () => place(C, evDraft.opts[0], 10), /não está aberto/)
const evFuture = await mkEvent({ opens: "now() + interval '1 hour'", closes: "now() + interval '1 day'" })
await expectError('evento que ainda não abriu é recusado', () => place(C, evFuture.opts[0], 10), /ainda não abriram/)
const evStarted = await mkEvent({ matchAt: "now() - interval '5 minutes'", closes: "now() + interval '1 day'" })
await expectError('partida já iniciada é recusada', () => place(C, evStarted.opts[0], 10), /já começou/)
await expectError('visitante não registra palpite', () =>
  run('anon', null, `select * from public.place_prediction($1, 10, gen_random_uuid())`, [ev1.opts[0]]), /permission denied/)

await run('authenticated', ADM, `update public.prediction_options set odds = 1.80 where id = $1`, [ev1.opts[0]])
const p2 = await place(D, ev1.opts[0], 50)
eq('novo palpite usa a nova odd (1,80)', p2.odds_snapshot, '1.80')
eq('palpite antigo mantém 2,10', (await one(`select odds_snapshot from public.predictions where id = $1`, [p1.id])).odds_snapshot, '2.10')
eq('mudança de odd foi auditada', (await one(
  `select count(*)::int n from public.admin_audit_log where action = 'option.odds' and admin_id = $1`, [ADM])).n, 1)
const p3 = await place(D, ev1.opts[2], 200)   // D aposta em PSV
await run('authenticated', ADM, `update public.prediction_events set status = 'closed' where id = $1`, [ev1.id])
await run('authenticated', ADM, `update public.prediction_events set status = 'open' where id = $1`, [ev1.id])
eq('admin fecha/reabre evento e fica auditado', (await one(
  `select count(*)::int n from public.admin_audit_log where action = 'event.update' and target_id = $1`, [ev1.id])).n, 2)
await run('authenticated', ADM, `update public.matches set stage = 'Final', scheduled_at = scheduled_at + interval '1 minute' where id = $1`, [ev1.matchId])
eq('admin edita partida e fica auditado', (await one(
  `select count(*)::int n from public.admin_audit_log where action = 'match.update' and target_id = $1`, [ev1.matchId])).n, 1)
{
  const dist = await run('anon', null, `select * from public.get_event_distribution($1)`, [ev1.id])
  const byOpt = Object.fromEntries(dist.rows.map((r) => [r.option_id, Number(r.predictions)]))
  byOpt[ev1.opts[0]] === 2 && byOpt[ev1.opts[2]] === 1 ? ok('distribuição pública conta os palpites') : fail('dist', JSON.stringify(byOpt))
}

// ======================================================================
// Fase 5 — administração e apuração
// ======================================================================
console.log('\nFase 5 — administração e apuração')
await expectError('participante não apura evento', () =>
  run('authenticated', C, `select public.settle_event($1, $2)`, [ev1.id, ev1.opts[0]]), /Apenas administradores/)
await expectError('opção de outro evento não pode vencer', () =>
  run('authenticated', ADM, `select public.settle_event($1, $2)`, [ev1.id, evDraft.opts[0]]), /não pertence/)

const dBefore = await balanceOf(D)
const res = (await run('authenticated', ADM, `select public.settle_event($1, $2) r`, [ev1.id, ev1.opts[0]])).rows[0].r
res.winners === 2 && res.losers === 1 && res.total_paid === 210 + 90
  ? ok('apuração: 2 vencedores, 1 perdedor, 300 pagos') : fail('apuração', JSON.stringify(res))
eq('vencedor recebe stake × odd (900 + 210 = 1.110)', await balanceOf(C), 1110)
eq('vencedor com odd nova recebe 50 × 1,80 = 90', await balanceOf(D), dBefore + 90)
eq('palpite perdedor marcado como lost', (await one(`select status from public.predictions where id = $1`, [p3.id])).status, 'lost')
eq('evento marcado como apurado', (await one(`select status from public.prediction_events where id = $1`, [ev1.id])).status, 'settled')
await expectError('apuração não acontece duas vezes', () =>
  run('authenticated', ADM, `select public.settle_event($1, $2)`, [ev1.id, ev1.opts[2]]), /já apurado/)
eq('…e nenhum crédito extra foi gerado', await balanceOf(C), 1110)
await expectError('evento apurado não pode ser editado', () =>
  run('authenticated', ADM, `update public.prediction_events set title = 'x' where id = $1`, [ev1.id]), /não pode ser alterado/)
await expectError('odds de evento apurado congeladas', () =>
  run('authenticated', ADM, `update public.prediction_options set odds = 5 where id = $1`, [ev1.opts[0]]), /congeladas/)

const ev2 = await mkEvent({ title: 'Campeão (teste anulação)' })
await place(C, ev2.opts[1], 300)
eq('saldo após palpite no evento a anular', await balanceOf(C), 810)
await expectError('anulação exige motivo', () =>
  run('authenticated', ADM, `select public.void_event($1, 'x')`, [ev2.id]), /motivo/)
const vres = (await run('authenticated', ADM, `select public.void_event($1, 'Campeonato cancelado') r`, [ev2.id])).rows[0].r
vres.refunded === 1 && vres.total_refunded === 300 ? ok('anulação devolve 300 sem multiplicador') : fail('void', JSON.stringify(vres))
eq('saldo restaurado (1.110)', await balanceOf(C), 1110)
await expectError('evento anulado não é apurado depois', () =>
  run('authenticated', ADM, `select public.settle_event($1, $2)`, [ev2.id, ev2.opts[0]]), /já apurado ou anulado/)

const adjKey = crypto.randomUUID()
const adj = (amount, reason, key = crypto.randomUUID(), uid = ADM) =>
  run('authenticated', uid, `select public.admin_adjust_wallet($1, $2, $3, $4) r`, [E, amount, reason, key]).then((r) => r.rows[0].r)
await adj(250, 'Prêmio do bolão da rodada', adjKey)
await adj(250, 'Prêmio do bolão da rodada', adjKey)
eq('ajuste de +250 aplicado uma única vez (500 → 750)', await balanceOf(E), 750)
await adj(-100, 'Correção de crédito duplicado')
eq('débito administrativo (750 → 650)', await balanceOf(E), 650)
await expectError('débito não deixa saldo negativo', () => adj(-1000, 'Teste de débito alto'), /Saldo insuficiente/)
await expectError('ajuste exige justificativa', () => adj(10, 'ok'), /justificativa/)
await expectError('participante não ajusta saldo', () => adj(1000, 'quero mais pontos', crypto.randomUUID(), C), /Apenas administradores/)
eq('ajustes auditados com admin, valor e justificativa', (await one(
  `select count(*)::int n from public.admin_audit_log where action = 'wallet.adjust' and admin_id = $1 and reason is not null`, [ADM])).n, 2)

await expectError('único admin não pode se rebaixar', () =>
  run('authenticated', ADM, `select public.admin_set_role($1, 'participant', 'Teste de rebaixamento')`, [ADM]), /pelo menos um administrador/)
await run('authenticated', ADM, `select public.admin_set_role($1, 'admin', 'Novo moderador da ORG')`, [B])
eq('admin promove outro usuário (com auditoria)', (await one(`select role from public.profiles where id = $1`, [B])).role, 'admin')
await run('authenticated', ADM, `select public.admin_set_role($1, 'participant', 'Fim do mandato')`, [B])

await expectError('limites inválidos de palpite são recusados', () =>
  run('authenticated', ADM, `select public.admin_update_settings(1000, 500, 100)`), /stake_range/)
await run('authenticated', ADM, `select public.admin_update_settings(1500, 10, 5000)`)
eq('configuração alterada e auditada', (await one(
  `select count(*)::int n from public.admin_audit_log where action = 'settings.update'`)).n, 1)
await db.exec(`update public.app_settings set initial_balance = 1000`)

{
  const st = (await run('authenticated', ADM, `select public.admin_dashboard_stats() s`)).rows[0].s
  st.participants >= 5 && st.predictions >= 4 ? ok('dashboard: estatísticas para admin') : fail('stats', JSON.stringify(st))
  await expectError('dashboard bloqueado para participante', () =>
    run('authenticated', C, `select public.admin_dashboard_stats()`), /Apenas administradores/)
  const users = await run('authenticated', ADM, `select * from public.admin_list_users('carl')`)
  users.rows.length === 1 && users.rows[0].email === 'c@test.com' ? ok('busca de participantes (com e-mail) para admin') : fail('list users', JSON.stringify(users.rows))
  const sum = await run('authenticated', ADM, `select * from public.admin_event_summary($1)`, [ev1.id])
  sum.rows.length === 3 ? ok('resumo de exposição por opção') : fail('summary', sum.rows.length)
}

// ======================================================================
// Fase 6 — ranking e estatísticas
// ======================================================================
console.log('\nFase 6 — ranking e estatísticas')
{
  const r = await run('anon', null, `select * from public.get_ranking(10)`)
  r.rows[0].username === 'carlos' && Number(r.rows[0].position) === 1 && Number(r.rows[0].wins) === 1
    ? ok('ranking público: carlos em 1º com 1 acerto') : fail('ranking', JSON.stringify(r.rows[0]))
  const s = (await run('authenticated', C, `select public.get_my_stats() s`)).rows[0].s
  s.total === 2 && s.won === 1 && s.void === 1 && s.hit_rate === 100 && s.staked_settled === 400 && s.returned === 510
    ? ok('estatísticas individuais (2 palpites, 1 acerto, 1 anulado)') : fail('stats', JSON.stringify(s))
  const me = (await run('authenticated', C, `select public.get_my_rank() r`)).rows[0].r
  eq('posição do usuário logado', me.position, 1)
  const h = await run('anon', null, `select * from public.get_highlights(30, 5)`)
  h.rows[0]?.username === 'carlos' && Number(h.rows[0].payout) === 210 ? ok('destaques: maior acerto recente') : fail('highlights', JSON.stringify(h.rows[0]))
}

// ======================================================================
// Múltiplas
// ======================================================================
console.log('\nMúltiplas')
const F = await mkUser('f@test.com', 'fabio')
const G = await mkUser('g@test.com', 'gabriel')
const H = await mkUser('h@test.com', 'helena')
const placeParlay = (uid, opts, stake, key = crypto.randomUUID()) =>
  run('authenticated', uid, `select * from public.place_parlay($1::uuid[], $2, $3)`, [opts, stake, key]).then((r) => r.rows[0])
const settle = (ev, opt) => run('authenticated', ADM, `select public.settle_event($1, $2) r`, [ev, opt]).then((r) => r.rows[0].r)
const voidEv = (ev) => run('authenticated', ADM, `select public.void_event($1, 'Evento cancelado') r`, [ev]).then((r) => r.rows[0].r)
const parlayOf = (id) => one(`select status, payout, total_odds, potential_payout from public.parlays where id = $1`, [id])

const mA = await mkEvent({ title: 'Múltipla A', options: [['Sim', 2.0], ['Não', 1.8]] })
const mB = await mkEvent({ title: 'Múltipla B', options: [['Sim', 3.0], ['Não', 1.3]] })
const mC = await mkEvent({ title: 'Múltipla C', options: [['Sim', 1.5], ['Não', 2.5]] })
const mD = await mkEvent({ title: 'Múltipla D', options: [['Sim', 2.0], ['Não', 1.9]] })

const pkey = crypto.randomUUID()
const pf = await placeParlay(F, [mA.opts[0], mB.opts[0], mC.opts[0]], 100, pkey)
eq('odds se multiplicam (2,00 × 3,00 × 1,50 = 9,00)', pf.total_odds, '9.00')
eq('retorno possível = 900', pf.potential_payout, 900)
eq('valor debitado uma vez (1.000 → 900)', await balanceOf(F), 900)
eq('3 palpites gravados na múltipla', (await one(`select count(*)::int n from public.parlay_legs where parlay_id = $1`, [pf.id])).n, 3)
eq('mesma chave devolve a mesma múltipla', (await placeParlay(F, [mA.opts[0], mB.opts[0], mC.opts[0]], 100, pkey)).id, pf.id)
eq('…e não cobra de novo', await balanceOf(F), 900)
await expectError('múltipla com 1 palpite é recusada', () => placeParlay(F, [mA.opts[0]], 50), /pelo menos 2/)
await expectError('duas opções do mesmo evento são recusadas', () => placeParlay(F, [mA.opts[0], mA.opts[1]], 50), /um palpite por evento/)
{
  // mesma partida, dois mercados: "quem vence" e "quem se classifica" (apostas correlacionadas)
  const vence = await mkEvent({ matchAt: "now() + interval '1 day'", title: 'Ida e volta: quem vence' })
  const classifica = await one(
    `insert into public.prediction_events (category, competition_id, match_id, title, status, opens_at, closes_at)
     values ('match', $1, $2, 'Ida e volta: quem se classifica', 'open', now() - interval '1 hour', now() + interval '1 day') returning id`,
    [comp, vence.matchId])
  const classMilan = (await one(`insert into public.prediction_options (event_id, name, odds, sort_order) values ($1,'Milan',1.8,1) returning id`, [classifica.id])).id
  await one(`insert into public.prediction_options (event_id, name, odds, sort_order) values ($1,'PSV',2.0,2) returning id`, [classifica.id])
  const I = await mkUser('i@test.com', 'iris') // usuário só deste bloco (não mexe nos saldos dos outros testes)
  const before = await balanceOf(I)
  await expectError('duas apostas da mesma partida na múltipla são recusadas', () =>
    placeParlay(I, [vence.opts[0], classMilan], 50), /mesma partida/)
  eq('…e nada é cobrado', await balanceOf(I), before)
  const ok1 = await placeParlay(I, [vence.opts[0], mD.opts[0]], 10)
  eq('aposta da partida + outro evento continua valendo', ok1.total_odds, '4.20')
  const s1 = await place(I, vence.opts[0], 10)
  const s2 = await place(I, classMilan, 10)
  eq('as duas apostas da mesma partida valem como simples', [s1.odds_snapshot, s2.odds_snapshot].join(' e '), '2.10 e 1.80')
}
await expectError('evento fechado na múltipla é recusado', () => placeParlay(F, [mA.opts[0], evClosed.opts[0]], 50), /não está aceitando/)
await expectError('valor acima do saldo é recusado', () => placeParlay(H, [mA.opts[0], mB.opts[0]], 1001), /Saldo insuficiente|entre/)
await expectError('participante não cria múltipla direto na tabela', () =>
  as('authenticated', F, () => db.query(`insert into public.parlays (user_id, stake, total_odds, idempotency_key) values ($1, 10, 500, gen_random_uuid())`, [F])),
  /permission denied/)
await expectRows('outro usuário não vê a múltipla', () =>
  as('authenticated', G, () => db.query(`select * from public.parlays`)), 0)
await expectRows('dono vê os palpites da múltipla', () =>
  as('authenticated', F, () => db.query(`select * from public.parlay_legs`)), 3)

const pg = await placeParlay(G, [mC.opts[0], mD.opts[0]], 100)   // 1,50 × 2,00
const ph = await placeParlay(H, [mA.opts[0], mD.opts[1]], 50)    // 2,00 × 1,90

await settle(mA.id, mA.opts[0])
eq('acertou o 1º: múltipla segue pendente', (await parlayOf(pf.id)).status, 'pending')
const rb = await settle(mB.id, mB.opts[1])
eq('errou o 2º: múltipla perde na hora', (await parlayOf(pf.id)).status, 'lost')
eq('apuração informa múltiplas perdidas', rb.parlays_lost, 1)
eq('…e nada é creditado', await balanceOf(F), 900)
await settle(mC.id, mC.opts[0])
eq('acerto depois do erro não ressuscita a múltipla', (await parlayOf(pf.id)).status, 'lost')
eq('…palpite da perna fica marcado como acerto', (await one(
  `select status from public.parlay_legs where parlay_id = $1 and event_id = $2`, [pf.id, mC.id])).status, 'won')

await voidEv(mD.id)
const rg = await parlayOf(pg.id)
rg.status === 'won' && Number(rg.payout) === 150
  ? ok('evento anulado vale odd 1,00 (100 × 1,50 = 150)') : fail('anulado na múltipla', JSON.stringify(rg))
eq('saldo do vencedor (900 + 150)', await balanceOf(G), 1050)
const rh = await parlayOf(ph.id)
rh.status === 'won' && Number(rh.payout) === 100 ? ok('H: 1 acerto + 1 anulado paga 50 × 2,00 = 100') : fail('H', JSON.stringify(rh))

const mE = await mkEvent({ title: 'Múltipla E', options: [['Sim', 2.5], ['Não', 1.5]] })
const mF = await mkEvent({ title: 'Múltipla F', options: [['Sim', 2.0], ['Não', 1.7]] })
const mG = await mkEvent({ title: 'Múltipla G', options: [['Sim', 1.2], ['Não', 4.0]] })
const mH = await mkEvent({ title: 'Múltipla H', options: [['Sim', 1.2], ['Não', 4.0]] })
const pAll = await placeParlay(G, [mE.opts[0], mF.opts[0]], 40)
const pVoid = await placeParlay(H, [mG.opts[1], mH.opts[1]], 30)
const before = await balanceOf(G)
await settle(mE.id, mE.opts[0])
await settle(mF.id, mF.opts[0])
eq('acertou tudo: paga 40 × 5,00 = 200', (await parlayOf(pAll.id)).payout, 200)
eq('saldo creditado', await balanceOf(G), before + 200)
await expectError('múltipla apurada não muda mais', () =>
  db.query(`update public.parlays set status = 'pending', payout = 0, settled_at = null where id = $1`, [pAll.id]), /já apurada/)
const hBefore = await balanceOf(H)
await voidEv(mG.id)
await voidEv(mH.id)
const rv = await parlayOf(pVoid.id)
rv.status === 'void' && Number(rv.payout) === 30 ? ok('todos anulados: devolve o valor (30)') : fail('void total', JSON.stringify(rv))
eq('saldo restaurado', await balanceOf(H), hBefore + 30)
{
  const s = (await run('authenticated', F, `select public.get_my_stats() s`)).rows[0].s
  s.total === 1 && s.lost === 1 ? ok('estatísticas contam a múltipla como 1 palpite') : fail('stats múltipla', JSON.stringify(s))
}

// ======================================================================
// Pênaltis
// ======================================================================
console.log('\nPênaltis')
{
  const newMatch = async () =>
    (await one(`insert into public.matches (competition_id, home_team_id, away_team_id) values ($1,$2,$3) returning id`, [comp, milan, psv])).id
  const pm = await newMatch()
  await run('authenticated', ADM, `update public.matches set status = 'finished', home_score = 1, away_score = 1,
    home_penalties = 4, away_penalties = 3 where id = $1`, [pm])
  eq('empate decidido nos pênaltis é salvo', (await one(`select concat(home_penalties,'x',away_penalties) p from public.matches where id = $1`, [pm])).p, '4x3')
  eq('pênaltis ficam auditados', (await one(
    `select count(*)::int n from public.admin_audit_log where action = 'match.update' and target_id = $1 and details ? 'penalties'`, [pm])).n, 1)
  // ex.: jogo de volta 2 x 1, empate no agregado, decidido nos pênaltis
  await run('authenticated', ADM, `update public.matches set home_score = 2, away_score = 1 where id = $1`, [pm])
  eq('pênaltis valem também sem empate no placar do jogo', (await one(
    `select concat(home_score,'x',away_score,' ',home_penalties,'x',away_penalties) p from public.matches where id = $1`, [pm])).p, '2x1 4x3')
  await expectError('pênaltis empatados são recusados', () =>
    db.query(`update public.matches set home_penalties = 3 where id = $1`, [pm]), /penalties_finished/)
  await expectError('só um lado dos pênaltis é recusado', () =>
    db.query(`update public.matches set away_penalties = null where id = $1`, [pm]), /penalties_both/)
  const pm2 = await newMatch()
  await expectError('pênaltis em partida não finalizada são recusados', () =>
    db.query(`update public.matches set home_penalties = 5, away_penalties = 4 where id = $1`, [pm2]), /penalties_finished/)
  const r = await run('authenticated', A, `update public.matches set home_penalties = 9 where id = $1 returning id`, [pm]).catch(() => ({ rows: [] }))
  eq('participante não altera pênaltis', r.rows.length, 0)
}

// ======================================================================
// Consistência do livro-razão
// ======================================================================
console.log('\nConsistência')
{
  const bad = await db.query(`
    select w.user_id, w.balance,
           coalesce(sum(case when t.type = 'credit' then t.amount else -t.amount end), 0) as ledger,
           (select t2.balance_after from public.transactions t2 where t2.wallet_id = w.id
             order by t2.created_at desc, t2.balance_after limit 1) as last_after
    from public.wallets w left join public.transactions t on t.wallet_id = w.id
    where w.user_id in ($1, $2, $3, $4, $5, $6)
    group by w.id
    having w.balance <> coalesce(sum(case when t.type = 'credit' then t.amount else -t.amount end), 0)`, [C, D, E, F, G, H])
  bad.rows.length === 0 ? ok('saldo = soma do extrato para todas as carteiras testadas') : fail('ledger', JSON.stringify(bad.rows))
}

console.log('\nSeed de demonstração')
try {
  await db.exec(readFileSync(join(root, 'supabase/seed/demo.sql'), 'utf8'))
  const r = await db.query(`select count(*)::int n from public.prediction_options o join public.prediction_events e on e.id = o.event_id where e.title like '%(demo)' or e.competition_id in (select id from public.competitions where name like '%(demo)')`)
  r.rows[0].n === 14 ? ok('demo.sql cria 4 eventos com 14 opções') : fail('demo.sql', `${r.rows[0].n} opções`)
} catch (e) { fail('demo.sql', e.message) }

console.log(`\n${passed} passaram, ${failed} falharam`)
process.exit(failed ? 1 : 0)
