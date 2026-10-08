// The worker's list order and the calendar's done fold
// (src/components/portal/portalOrder.ts), offline, against a fixed "today":
// Thursday 2026-10-08.
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', cacheDir: process.env.VITE_CACHE_DIR });
const { orderTaskRows, openBucketOf, foldDoneByDay, isoToday } = await server.ssrLoadModule('/src/components/portal/portalOrder.ts');

const T = '2026-10-08';
const t = (id, dueDate, extra = {}) => ({ a: { id, dueDate, priority: 'normal', completedAt: null, ...extra }, projectId: extra.pid ?? 'wolfson' });

// ── openBucketOf ─────────────────────────────────────────────────────────────
check(openBucketOf(t('x', T).a, T).bucket === 'today', 'due today → today');
check(eq(openBucketOf(t('x', '2026-10-09', { days: ['2026-10-07', '2026-10-08', '2026-10-09'] }).a, T), { bucket: 'today', day: T }),
  'a three-day task covering today → today');
check(eq(openBucketOf(t('x', '2026-10-12', { days: ['2026-10-06', '2026-10-12'] }).a, T), { bucket: 'future', day: '2026-10-12' }),
  'a task with a day behind and a day ahead → future, placed by the NEXT day it covers');
check(eq(openBucketOf(t('x', '2026-10-07', { days: ['2026-10-05', '2026-10-07'] }).a, T), { bucket: 'overdue', day: '2026-10-07' }),
  'every day behind → past due, placed by its LAST day');
check(openBucketOf(t('x', null).a, T).bucket === 'dateless', 'no date → dateless');
check(openBucketOf(t('x', '2026-10-20', { problem: { status: 'open' } }).a, T).bucket === 'problem', 'a live problem keeps the head of the list');
check(openBucketOf(t('x', '2026-10-20', { problem: { status: 'waiting' } }).a, T).bucket === 'waiting', 'a problem waiting for approval comes right after');

// ── orderTaskRows ────────────────────────────────────────────────────────────
const rows = [
  t('done-old', '2026-10-01', { completedAt: '2026-10-01T10:00:00' }),
  t('fut-far', '2026-10-15'),
  t('over-far', '2026-10-01'),
  t('nodate', null),
  t('today-low', T, { priority: 'low' }),
  t('today', T),
  t('done-new', '2026-10-07', { completedAt: '2026-10-07T16:00:00' }),
  t('over-near', '2026-10-07'),
  t('fut-near', '2026-10-09'),
  t('today-urgent', T, { priority: 'urgent' }),
  t('prob', '2026-10-20', { problem: { status: 'open' } }),
];
const got = orderTaskRows(rows, T).map(r => r.a.id);
check(eq(got, ['prob', 'today-urgent', 'today', 'today-low', 'over-near', 'over-far', 'fut-near', 'fut-far', 'nodate', 'done-new', 'done-old']),
  'problem · today (urgent first) · past due (most recently due first) · future (soonest first) · dateless · done (newest closed first)', got.join(' '));
check(eq(orderTaskRows([t('b', T), t('a', T)], T).map(r => r.a.id), ['b', 'a']), 'ties keep their order (stable)');

// ── foldDoneByDay ────────────────────────────────────────────────────────────
const fold = foldDoneByDay([
  t('w1', '2026-10-06', { completedAt: '2026-10-06T09:00:00' }),
  t('w2', '2026-10-06', { completedAt: '2026-10-06T13:00:00' }),
  t('g1', '2026-10-06', { completedAt: '2026-10-06T11:00:00', pid: 'general' }),
  t('m', '2026-10-07', { completedAt: '2026-10-07T17:00:00', days: ['2026-10-06', '2026-10-07'] }),
  t('open', '2026-10-06'),
]);
check(eq([...fold.keys()].sort(), ['2026-10-06', '2026-10-07']), 'only days with DONE work have a fold');
check(eq(fold.get('2026-10-06').get('wolfson').map(r => r.a.id), ['m', 'w2', 'w1']),
  'one fold per workspace per day, newest closed first; a two-day task counts on both of its days');
check(eq(fold.get('2026-10-06').get('general').map(r => r.a.id), ['g1']), 'the Job Board has its own fold on that day');
check(!fold.get('2026-10-06').get('wolfson').some(r => r.a.id === 'open'), 'open work is never folded');

check(isoToday(new Date(2026, 9, 8, 23, 59)) === '2026-10-08', 'today is the LOCAL date, never the UTC one');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
