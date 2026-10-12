// Offline test for src/data/timeOff.ts — hand-worked numbers.
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const T = await vite.ssrLoadModule('/src/data/timeOff.ts');
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const gadi = { id: 'a', person: 'c:gadi', from: '2026-10-13', to: '2026-10-15', kind: 'vacation' };
const list = [gadi, { id: 'b', person: 'c:ari', from: '2026-10-17', to: '2026-10-17', kind: 'sick' }];
ok(T.offOn(list, 'c:gadi', '2026-10-14')?.id === 'a', 'Wed is inside Tue–Thu');
ok(!T.offOn(list, 'c:gadi', '2026-10-16'), 'Fri is after');
ok(!T.offOn(list, 'c:ari', '2026-10-14'), 'another person is not away');
ok(T.backDay(gadi) === '2026-10-18', 'back Sun 18 after Thu 15');
ok(T.daysOfTimeOff(gadi).join() === '2026-10-13,2026-10-14,2026-10-15', 'three days inclusive');
ok(T.awaySentence('Gadi', T.awayOnAny(list, 'c:gadi', ['2026-10-12', '2026-10-13']), 'en') === 'Gadi is on vacation on Tue, Oct 13 (back Sun, Oct 18).' || /on vacation on .*13.*back .*18/.test(T.awaySentence('Gadi', T.awayOnAny(list, 'c:gadi', ['2026-10-12', '2026-10-13']), 'en')), 'the warning sentence names the day and the way back');
ok(T.awayOnAny(list, 'c:gadi', ['2026-10-12', '2026-10-16']) === null, 'no clash outside the range');
const tasks = [
  { id: 't1', contractorId: 'gadi', days: ['2026-10-12', '2026-10-14'], dueDate: '2026-10-14', completedAt: null },
  { id: 't2', contractorId: 'gadi', dueDate: '2026-10-20', completedAt: null },
  { id: 't3', contractorId: 'gadi', dueDate: '2026-10-13', completedAt: '2026-10-13T10:00' },
  { id: 't4', contractorId: 'ari', dueDate: '2026-10-13', completedAt: null },
];
ok(T.bookedDuring(tasks, 'c:gadi', gadi.from, gadi.to).map(t => t.id).join() === 't1', 'only the open task of his inside the range');
ok(T.bookedDuring(tasks, 'u:esther', gadi.from, gadi.to).length === 0, 'an office person carries no tasks');
let l2 = T.offThisDay(list, 'c:gadi', '2026-10-16', 'vacation');
ok(l2.filter(t => t.person === 'c:gadi').length === 1 && l2.find(t => t.id === 'a').to === '2026-10-16', 'Off this day next to a run joins it');
l2 = T.offThisDay(list, 'c:yaakov', '2026-10-20');
ok(l2.length === 3 && T.offOn(l2, 'c:yaakov', '2026-10-20'), 'Off this day alone makes a one-day entry');
let l3 = T.backOnThisDay(list, 'c:gadi', '2026-10-14');
const m = l3.filter(t => t.person === 'c:gadi');
ok(m.length === 2 && m[0].to === '2026-10-13' && m[1].from === '2026-10-15', 'Back on a middle day splits the run');
l3 = T.backOnThisDay(list, 'c:ari', '2026-10-17');
ok(!l3.some(t => t.person === 'c:ari'), 'Back on its only day removes it');
ok(T.bandLine(gadi, 'ru').startsWith('Отпуск'), 'the band in his own language (Отпуск)');
ok(T.bandLine(gadi, 'en', true).includes('until') && T.bandLine(gadi, 'en').includes('back'), 'band line: until / back');
ok(T.upsertTimeOff(list, { ...gadi, to: '2026-10-19' }).find(t => t.id === 'a').to === '2026-10-19', 'upsert replaces by id');
ok(T.removeTimeOff(list, 'a').length === 1, 'remove by id');
ok(T.shiftDay('2026-03-27', 1) === '2026-03-28' && T.shiftDay('2026-10-25', 1) === '2026-10-26', 'day shifts survive the clock changes');
console.log(`\n${n - fail}/${n} passed`);
await vite.close();
process.exit(fail ? 1 : 0);
