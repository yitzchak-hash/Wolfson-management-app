// The search index at the office's size (src/data/searchIndex.ts), offline:
// ~1,650 jobs, 600 tasks, notes, messages, pins, files — how long the index
// takes to build, and how long ONE keystroke takes to answer. Target: a
// keystroke under 50ms on this container's CPU (the office PCs are faster).
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' - ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const X = await server.ssrLoadModule('/src/data/searchIndex.ts');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const FAMILIES = ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Avraham', 'Friedman', 'Malka', 'Azulay', 'Katz', 'Yosef', 'Dahan',
  'Amar', 'Chen', 'Gabay', 'Shapira', 'Weinstein', 'Artzi', 'Shalev', 'Levine', 'Zambini', 'Aharonov', 'Shwartz', 'Goldberg'];
const HEB = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'פרידמן', 'מלכה', 'אזולאי', 'כץ', 'יוסף', 'דהן'];
const FIRST = ['David', 'Moshe', 'Avital', 'Sarah', 'Yonatan', 'Rivka', 'Chaim', 'Tzvika', 'Noa', 'Eli'];
const CITIES = ['Ramat Gan', 'Beit Shemesh', 'Jerusalem', 'Modiin', 'Tel Aviv', 'Petah Tikva', 'Bnei Brak', 'Efrat'];
const BINS = [undefined, undefined, 'done', 'done', 'done', 'archive', 'ready', 'trash', 'CE-bin-newjobs'];
const t0 = Date.parse('2026-01-01T00:00:00Z');
const seed = (n) => { let x = n * 9301 + 49297; return () => { x = (x * 233280 + 1) % 2147483647; return x / 2147483647; }; };
const rnd = seed(7);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const N = 1650;
const apartments = [];
for (let i = 0; i < N; i++) {
  const fam = i % 7 === 0 ? pick(HEB) : pick(FAMILIES);
  const first = pick(FIRST);
  const city = pick(CITIES);
  const num = 1000 + Math.floor(rnd() * 9000);
  const at = new Date(t0 + rnd() * 240 * 86400000).toISOString();
  apartments.push({
    id: `G-${i}`, buildingId: 'G', apartmentNumber: '', displayName: `${fam}, ${first}`, floor: 0, colPosition: 1, colSpan: 1,
    isDuplexApt: false, currentStageId: `st-${i % 6}`, classification: 'standard', shinuiDetails: null,
    generalNotes: i % 3 ? `Called about the ${pick(['compressor', 'piping', 'invoice', 'plans'])} on ${at.slice(0, 10)}` : '',
    isUnnamed: false, createdAt: at, updatedAt: at, contentUpdatedAt: at,
    driveFolderName: `${fam}, ${first} - ${num} - ${city}`,
    driveLink: `https://drive.google.com/drive/folders/1${String(i).padStart(16, 'x')}`,
    address: `${pick(['Herzl', 'Hanasi', 'Begin', 'הרצל', 'הנשיא'])} ${1 + (i % 90)} ${city}`,
    phone: i % 2 ? `05${i % 10}-${String(1000000 + i * 37).slice(0, 3)} ${String(1000000 + i * 37).slice(3, 7)}` : undefined,
    boardBin: pick(BINS),
  });
}
const stages = Array.from({ length: 6 }, (_, i) => ({ id: `st-${i}`, name: ['Not started', 'Concealed Units', 'Piping', 'Geves', 'AC installation', 'Job completed'][i], color: '#000', order: i, active: true, createdAt: '', updatedAt: '' }));
const contractors = Array.from({ length: 8 }, (_, i) => ({ id: `c-${i}`, name: ['Moshe', 'Avi', 'Yossi', 'Dudu', 'Igor', 'Sasha', 'Eli', 'Meir'][i], email: '', category: 'ac', active: true, token: 't', createdAt: '' }));
const assignments = Array.from({ length: 600 }, (_, i) => ({ id: `t-${i}`, contractorId: `c-${i % 8}`, apartmentId: `G-${(i * 3) % N}`, buildingId: 'G',
  taskDescription: `${pick(['Install', 'Check', 'Replace', 'Measure'])} the ${pick(['condenser', 'thermostat', 'ducts', 'piping', 'plans'])} ${i}`,
  dueDate: null, stageId: null, completedAt: i % 4 ? null : '2026-03-01T00:00:00Z', createdAt: '2026-02-01T00:00:00Z', createdBy: 'u', createdByName: 'Esther',
  attachments: i % 5 ? [] : [{ id: `a-${i}`, filename: `memo-${i}.webm`, mimeType: 'audio/webm', dataUrl: '', transcript: `the worker said the ${pick(['fuse', 'valve', 'bracket'])} is missing` }] }));
const contractorNotes = Array.from({ length: 900 }, (_, i) => ({ id: `n-${i}`, assignmentId: `t-${i % 600}`, apartmentId: `G-${((i % 600) * 3) % N}`, contractorId: `c-${i % 8}`,
  text: `message ${i} about the ${pick(['photos', 'keys', 'ladder', 'delivery'])}`, authorType: i % 2 ? 'contractor' : 'office', authorId: 'x', authorName: pick(['Esther', 'Moshe', 'Avi']), createdAt: '2026-02-02T00:00:00Z' }));
const stageNotes = Array.from({ length: 400 }, (_, i) => ({ id: `s-${i}`, apartmentId: `G-${(i * 5) % N}`, stageId: `st-${i % 6}`, noteText: `stage note ${i} ${pick(['waiting for parts', 'client away', 'done early'])}`, updatedAt: '2026-02-03T00:00:00Z', updatedBy: 'u', updatedByName: 'Esther' }));
const planPins = Array.from({ length: 300 }, (_, i) => ({ id: `p-${i}`, apartmentId: `G-${(i * 7) % N}`, xPct: 1, yPct: 1, text: `snag ${i} ${pick(['crack', 'leak', 'paint'])}`, createdAt: '2026-02-04T00:00:00Z', createdBy: 'Moshe' }));
const officeNoteFiles = Array.from({ length: 300 }, (_, i) => ({ id: `f-${i}`, apartmentId: `G-${(i * 11) % N}`, dataUrl: '', filename: `${pick(['quote', 'plan', 'invoice'])}-${i}.pdf`, mimeType: 'application/pdf', uploadedAt: '2026-02-05T00:00:00Z', uploadedBy: 'u', uploadedByName: 'Esther' }));
const canvasElements = [
  { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 0, y: 0, w: 1, h: 1, text: '', color: '' },
  { id: 'CE-bin-newjobs', type: 'bin', x: 0, y: 0, w: 1, h: 1, text: 'New Jobs Came In', color: '' },
  ...Array.from({ length: 80 }, (_, i) => ({ id: `CE-${i}`, type: 'note', x: 0, y: 0, w: 1, h: 1, text: `note ${i} ${pick(['call back', 'order parts', 'ask Esther'])}`, color: '' })),
];
const src = { apartments, assignments, stageNotes, contractorNotes, canvasElements, planPins, officeNoteFiles, contractors, stages };

const ms = (f) => { const a = performance.now(); const r = f(); return [performance.now() - a, r]; };
const [build, idx] = ms(() => X.workspaceIndex('perf', src));
console.log(`       index of ${idx.docs.size} docs built in ${build.toFixed(0)}ms`);
check(build < 2500, 'the whole workspace indexes in under 2.5s', `${build.toFixed(0)}ms`);
const [again] = ms(() => X.workspaceIndex('perf', src));
check(again < 2, 'and unchanged sources cost nothing on the next keystroke', `${again.toFixed(2)}ms`);
const src2 = { ...src, apartments: [...apartments.slice(0, -1), { ...apartments[N - 1], displayName: 'Renamed, Job' }] };
const [inc] = ms(() => X.workspaceIndex('perf', src2));
check(inc < 400, 'one changed job re-syncs in well under a frame budget', `${inc.toFixed(0)}ms`);

const QUERIES = ['c', 'co', 'coh', 'cohe', 'cohen', 'cohen ramat', 'כהן', 'moshe', 'condenser', '050', '5555', 'ramat gan', 'valve', 'group:done cohen', 'is:problem', 'akuo', 'levinson'];
let worst = 0, total = 0;
for (const q of QUERIES) {
  const [t, hits] = ms(() => X.searchIndex(idx, q, { projectId: 'general' }));
  total += t; if (t > worst) worst = t;
  console.log(`       "${q}" → ${hits.length} hits in ${t.toFixed(1)}ms${hits[0] ? ` · first ${hits[0].kind}:${hits[0].rec.displayName ?? hits[0].rec.taskDescription ?? hits[0].rec.text ?? ''} [${hits[0].tier}]` : ''}`);
}
check(worst < 50, 'every keystroke answers in under 50ms', `worst ${worst.toFixed(1)}ms, mean ${(total / QUERIES.length).toFixed(1)}ms`);
const r = X.searchIndex(idx, 'cohen', { projectId: 'general' });
check(r.length && r.every(h => h.rec.boardBin !== 'trash'), 'trash never appears in a workspace search');
check(r.some(h => h.binLabel === 'Done'), 'jobs in Done appear, labeled');
// The Hebrew spellings fill the first page (a start-tier hit outranks a sound-alike, rightly); the English ones follow.
const hebrew = X.searchIndex(idx, 'כהן', { projectId: 'general', limit: 300, perKind: 300 });
check(hebrew.some(h => /^Cohen/.test(h.rec.displayName ?? '')) && hebrew.some(h => /^כהן/.test(h.rec.displayName ?? '')), 'Hebrew finds both spellings', hebrew.slice(0, 3).map(h => h.rec.displayName).join(' | '));
const phone = X.searchIndex(idx, apartments[1].phone.replace(/\D/g, ''), { projectId: 'general' });
check(phone[0]?.rec.id === 'G-1' && phone[0].why?.field === 'phone', 'a phone typed without punctuation finds its job and says so', JSON.stringify(phone[0]?.why));
await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
