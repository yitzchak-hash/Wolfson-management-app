// The multi-day task arithmetic (src/data/taskDays.ts), offline, every number
// worked by hand against August 2026: Sun 23 · Mon 24 · Tue 25 · Wed 26 ·
// Thu 27 · FRI 28 · SAT 29 · Sun 30 · Mon 31 · Tue Sep 1.
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const {
  workingRun, stretchDays, nextWorkingDay, dayNumberOf, futureDaysOf, daysOf,
  moveTaskDay, removeTaskDay, addTaskDay,
} = await server.ssrLoadModule('/src/data/taskDays.ts');

// ── workingRun: Saturday never, Friday by the checkbox ──────────────────────
let r = workingRun('2026-08-26', 2, false);
check(eq(r.days, ['2026-08-26', '2026-08-27']) && !r.crossesFriday,
  'Wed + 2 days = Wed, Thu — no Friday passed, no checkbox', JSON.stringify(r));
r = workingRun('2026-08-26', 3, false);
check(eq(r.days, ['2026-08-26', '2026-08-27', '2026-08-30']) && r.crossesFriday,
  'Wed + 3 days (Friday off) = Wed, Thu, SUNDAY — and the checkbox exists', JSON.stringify(r));
r = workingRun('2026-08-26', 3, true);
check(eq(r.days, ['2026-08-26', '2026-08-27', '2026-08-28']),
  'Wed + 3 days (Friday on) = Wed, Thu, FRIDAY', JSON.stringify(r.days));
r = workingRun('2026-08-27', 2, false);
check(eq(r.days, ['2026-08-27', '2026-08-30']),
  'Thu + 2 days skips Fri AND Sat to Sunday', JSON.stringify(r.days));
r = workingRun('2026-08-23', 6, true);
check(!r.days.includes('2026-08-29'),
  'Saturday NEVER counts, even with Friday on', JSON.stringify(r.days));

// ── stretches ───────────────────────────────────────────────────────────────
const merged = stretchDays([
  { start: '2026-08-26', days: 2 },
  { start: '2026-09-01', days: 1 },
]);
check(eq(merged, ['2026-08-26', '2026-08-27', '2026-09-01']),
  'two stretches merge sorted', JSON.stringify(merged));
check(eq(stretchDays([{ start: '2026-08-26', days: 2 }, { start: '2026-08-27', days: 1 }]),
  ['2026-08-26', '2026-08-27']), 'overlapping stretches dedupe');
check(nextWorkingDay('2026-08-27') === '2026-08-30',
  'the day after Thursday is Sunday', nextWorkingDay('2026-08-27'));

// ── the pill, the future days, the fallback ─────────────────────────────────
const days3 = ['2026-08-26', '2026-08-27', '2026-08-30'];
check(eq(dayNumberOf(days3, '2026-08-27'), { k: 2, n: 3 }), 'day 2 of 3');
check(dayNumberOf(['2026-08-26'], '2026-08-26') === null, 'a one-day task wears no pill');
check(eq(futureDaysOf(days3, '2026-08-27'), ['2026-08-30']),
  'finishing on day 2 leaves one future day to cross off');
check(eq(daysOf({ days: days3, dueDate: '2026-08-30' }), days3)
  && eq(daysOf({ dueDate: '2026-08-24' }), ['2026-08-24']),
  'daysOf: the list when there is one, else the due date');

// ── the single-day edits behind the planner gestures ────────────────────────
check(eq(moveTaskDay(days3, '2026-08-30', '2026-09-01'),
  { days: ['2026-08-26', '2026-08-27', '2026-09-01'], dueDate: '2026-09-01' }),
  'moving the last day forward moves the due date with it');
check(eq(moveTaskDay(days3, '2026-08-30', '2026-08-24'),
  { days: ['2026-08-24', '2026-08-26', '2026-08-27'], dueDate: '2026-08-27' }),
  'moving the last day earlier re-sorts and the due date falls back');
check(moveTaskDay(days3, '2026-08-30', '2026-08-26') === null,
  'moving onto a day the task already covers changes nothing');
check(eq(removeTaskDay(days3, '2026-08-30'),
  { days: ['2026-08-26', '2026-08-27'], dueDate: '2026-08-27' }),
  'taking a day off shortens the task');
check(removeTaskDay(['2026-08-26'], '2026-08-26') === null,
  'the LAST day cannot be silently removed — that is the ask');
check(eq(addTaskDay(['2026-08-26', '2026-08-27'], '2026-08-30'),
  { days: ['2026-08-26', '2026-08-27', '2026-08-30'], dueDate: '2026-08-30' }),
  'a copied card adds its landing day');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
