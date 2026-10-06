// The day story (src/data/dayStory.ts) — offline, every number worked by hand.
// One card per person per local day; one line per VISIT (a gap of 2h splits);
// opened-only places fold into "also looked at"; nothing is ever flagged.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { dayStories, visitFragments, placeKind, DAY_WORDS } = await server.ssrLoadModule('/src/data/dayStory.ts');

const ST = [
  { id: 's-drilling', name: 'Drilling', nameHe: 'קידוחים', order: 2 },
  { id: 's1-piping', name: 'Piping', nameHe: 'צנרת', order: 3 },
  { id: 's1-fans', name: 'Fans', nameHe: 'מפוחים', order: 5 },
  { id: 's7-registers', name: 'Registers', nameHe: 'פתחים', order: 8 },
];
let n = 0;
const L = (t, apt, actionType, extra = {}) => ({
  id: `L${++n}`, userId: 'w1', userName: 'Igor', buildingId: apt.split('-')[0], apartmentId: apt,
  apartmentNumber: apt.split('-')[1], createdAt: `2026-10-05T${t}:00.000Z`, actionType, fieldChanged: '', ws: 'wolfson', ...extra,
});
const logs = [
  L('08:17', 'A3-15', 'task_created', { fieldChanged: 'work_started', newValue: 'Piping — working here today', stageId: 's1-piping' }),
  L('08:40', 'A3-15', 'contractor_upload', { fieldChanged: 'photo_uploaded', newValue: 'a.jpg' }),
  L('08:41', 'A3-15', 'contractor_upload', { fieldChanged: 'photo_uploaded', newValue: 'b.jpg' }),
  L('09:02', 'A3-15', 'contractor_complete', { fieldChanged: 'completedAt', newValue: '2026-10-05T09:02:00.000Z' }),
  L('09:02', 'A3-15', 'stage_marks', { fieldChanged: 'stageMarks', marks: [
    { id: 's-drilling', name: 'Drilling', from: 'todo', to: 'done' },
    { id: 's1-piping', name: 'Piping', from: 'doing', to: 'done' }] }),
  L('09:30', 'A3-16', 'opened', { fieldChanged: 'viewed' }),
  L('11:02', 'A3-12', 'stage_marks', { fieldChanged: 'stageMarks', marks: [{ id: 's1-fans', name: 'Fans', from: 'todo', to: 'pending' }] }),
  L('11:05', 'A3-12', 'contractor_note', { fieldChanged: 'note_added', newValue: 'left the last fan' }),
  // Back on A3-15 four hours later — a second visit, not one long one.
  L('13:10', 'A3-15', 'contractor_upload', { fieldChanged: 'photo_uploaded', newValue: 'c.jpg' }),
  // Opened A3-12 too: worked places never repeat as "looked at".
  L('13:30', 'A3-12', 'opened', { fieldChanged: 'viewed' }),
  L('14:00', 'A1-9', 'task_moved_out', { fieldChanged: 'task', previousValue: 'A1 9', newValue: 'A3 9' }),
  // Another day, another person, a Job Board job.
  L('10:00', 'G-1', 'stage_marks', { userName: 'Esther', userId: 'u2', buildingId: 'G', ws: 'general', createdAt: '2026-10-06T10:00:00.000Z',
    marks: [{ id: 's7-registers', name: 'Registers', from: 'done', to: 'todo' }] }),
  // No apartment — left to the full log.
  { id: 'Lx', userName: 'Esther', userId: 'u2', apartmentId: '', createdAt: '2026-10-06T10:05:00.000Z', actionType: 'update', fieldChanged: 'x' },
];
const cards = dayStories(logs, { lang: 'en', stages: ST });
check(cards.length === 2, 'one card per person per day', cards.map(c => c.key).join(' · '));
check(cards[0].person === 'Esther' && cards[0].day === '2026-10-06', 'the newest day comes first');
const igor = cards[1];
check(igor.visits.length === 4, 'Igor: four visits (A3-15 twice, A3-12, A1-9)', igor.visits.map(v => v.aptId + '@' + v.first.slice(11, 16)).join(' '));
check(igor.visits[0].aptId === 'A3-15' && igor.visits[0].first.slice(11, 16) === '08:17' && igor.visits[0].last.slice(11, 16) === '09:02', 'the day reads forward, with each visit\'s span');
const v1 = igor.visits[0];
check(eq(v1.started, ['Piping']) && eq(v1.done, ['Drilling', 'Piping']) && v1.photos === 2 && v1.closedAt?.slice(11, 16) === '09:02', 'the first visit: started, ticked, pictures, closed');
check(igor.visits[1].aptId === 'A3-12' && eq(igor.visits[1].half, ['Fans']) && igor.visits[1].messages === 1, 'half done and a message');
check(igor.visits[2].aptId === 'A3-15' && igor.visits[2].photos === 1 && !igor.visits[2].closedAt, 'a gap of more than two hours starts a new visit');
check(eq(igor.visits[3].movedTo, ['A3 9']), 'a moved task names where it went');
check(igor.looked.length === 1 && igor.looked[0].aptId === 'A3-16', 'only-opened places fold into "looked at", and a worked place is never repeated there', igor.looked.map(v => v.aptId).join(','));
check(igor.places === 3 && igor.closed === 1, 'the header: 3 places worked, 1 closed', `${igor.places}/${igor.closed}`);
check(placeKind(igor) === 'apt' && placeKind(cards[0]) === 'job', 'apartments vs jobs in the header');
check(eq(igor.workspaces, ['wolfson']), 'the workspaces a day touched');

const clock = iso => iso.slice(11, 16);
const f = visitFragments(v1, 'en', clock);
check(eq(f, ['started Piping', 'Drilling and Piping done', '2 photos', 'closed 09:02']), 'the line in English', f.join(' · '));
const esther = cards[0].visits[0];
check(eq(visitFragments(esther, 'en', clock), ['un-ticked Registers']), 'an untick reads as one');
// Hebrew stage names come through the words context — the cards are built in the reader's language.
const heCards = dayStories(logs, { lang: 'he', stages: ST });
const he = visitFragments(heCards[1].visits[0], 'he', clock);
check(eq(he, ['התחיל צנרת', 'קידוחים וצנרת בוצעו', '2 תמונות', 'נסגר 09:02']), 'the line in Hebrew, stage names in Hebrew', he.join(' · '));
check(eq(heCards[1].visits[0].done, ['קידוחים', 'צנרת']), 'stage words follow the reader\'s language');
check(DAY_WORDS.en.places(1, 'apt') === '1 apartment' && DAY_WORDS.en.places(3, 'mix') === '3 places', 'counted words');
// A worker and a user with the same name are one person.
const one = dayStories([
  L('08:00', 'A1-1', 'contractor_upload', { userId: 'c-igor' }),
  L('09:00', 'A1-2', 'contractor_upload', { userId: 'u-igor' }),
], { lang: 'en', stages: ST });
check(one.length === 1 && one[0].visits.length === 2, 'one person by name, whichever id wrote it');
await server.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
