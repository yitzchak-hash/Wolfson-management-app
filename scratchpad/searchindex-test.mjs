// The search index (src/data/searchIndex.ts) offline: tiers, the other
// alphabet, the folder title, digits, filter words, learned picks.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' - ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const X = await server.ssrLoadModule('/src/data/searchIndex.ts');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const t = '2026-09-01T10:00:00.000Z';
const job = (id, displayName, extra = {}) => ({ id, buildingId: 'G', apartmentNumber: '', displayName, floor: 0, colPosition: 1, colSpan: 1,
  isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null, generalNotes: '', isUnnamed: false, createdAt: t, updatedAt: t, ...extra });
const apartments = [
  job('G-1', 'Lev'), job('G-2', 'Levine'), job('G-3', 'Shalev'), job('G-4', 'Molly Lev'),
  job('G-5', 'Cohen', { driveFolderName: 'Cohen, David - 5555 - Ramat Gan', phone: '050-123 4567', driveLink: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp' }),
  job('G-6', 'ארצי', { address: 'הרצל 12 בית שמש' }),
  job('G-7', 'Yeshivat Chevron Haktana', { driveFolderName: 'Yeshivat Chevron Haktana' }),
  job('G-8', 'Thrown away', { boardBin: 'trash' }),
  job('G-9', 'Done one', { boardBin: 'done', currentStageId: 'st-1' }),
  job('G-10', 'Nameless', { driveFolderName: 'Potentials - Shwartz, Moshe' }),
];
const stages = [{ id: 'st-1', name: 'Concealed Units', nameHe: 'יחידות סמויות', color: '#000', order: 1, active: true, createdAt: t, updatedAt: t },
  { id: 'st-2', name: 'Piping', color: '#000', order: 2, active: true, createdAt: t, updatedAt: t }];
const contractors = [{ id: 'c-1', name: 'Moshe', email: '', category: 'ac', active: true, token: 'x', createdAt: t }];
const assignments = [{ id: 't-1', contractorId: 'c-1', apartmentId: 'G-9', buildingId: 'G', taskDescription: 'fix the condenser', dueDate: null, stageId: null, completedAt: null, createdAt: t, createdBy: 'u', createdByName: 'Esther' },
  { id: 't-2', contractorId: 'c-1', apartmentId: 'G-3', buildingId: 'G', taskDescription: 'leak', dueDate: null, stageId: null, completedAt: null, createdAt: t, createdBy: 'u', createdByName: 'Esther', problem: { status: 'open', photosRequired: true } }];
const canvasElements = [{ id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 0, y: 0, w: 1, h: 1, text: '', color: '' }];
const src = { apartments, stages, contractors, assignments, canvasElements };
const idx = X.workspaceIndex('test', src);
const names = (q, opts = {}) => X.searchIndex(idx, q, { projectId: 'general', ...opts }).map(h => `${h.kind}:${h.rec.displayName ?? h.rec.name ?? h.rec.taskDescription}`);
let r = names('lev');
check(r[0] === 'job:Lev' && r[1] === 'job:Levine', '"lev": Lev, Levine first', r.join(' | '));
check(r.indexOf('job:Molly Lev') < r.indexOf('job:Shalev'), 'word prefix (Molly Lev) above contains (Shalev)', r.join(' | '));
check(!r.includes('job:Thrown away'), 'trash never appears');
r = names('cohen');
check(r[0] === 'job:Cohen', '"cohen" exact');
r = names('כהן'); check(r.includes('job:Cohen'), 'Hebrew finds Cohen (sound)', r.join(' | '));
r = names('artzi'); check(r.includes('job:ארצי'), 'English finds ארצי', r.join(' | '));
r = names('david'); check(r[0] === 'job:Cohen', 'a first name only in the folder title finds the job', r.join(' | '));
let hit = X.searchIndex(idx, 'david', { projectId: 'general' })[0];
check(hit.why && (hit.why.field === 'first' || hit.why.field === 'folder') && hit.why.text.includes('Cohen, David'), 'why says the folder title', JSON.stringify(hit.why));
r = names('ramat gan'); check(r[0] === 'job:Cohen', 'two words, AND, from the folder', r.join(' | '));
r = names('chevron'); check(r[0] === 'job:Yeshivat Chevron Haktana', 'a middle word of the name', r.join(' | '));
r = names('shwartz'); check(r[0] === 'job:Nameless', 'folder title behind a placeholder name', r.join(' | '));
r = names('0501234567'); check(r[0] === 'job:Cohen', 'phone typed without dashes', r.join(' | '));
r = names('123 4567'); check(r[0] === 'job:Cohen', 'phone typed in pieces', r.join(' | '));
r = names('1AbCdEfGhIjKlMnOp'); check(r[0] === 'job:Cohen', 'a pasted Drive folder id', r.join(' | '));
r = names('coen'); check(r.includes('job:Cohen'), 'fuzzy "coen"', r.join(' | '));
r = names('cohne'); check(r.includes('job:Cohen'), 'fuzzy transposition', r.join(' | '));
r = names('akuo'); check(true, 'wrong layout does not crash', r.join(' | '));
r = names('condenser'); check(r.includes('task:fix the condenser'), 'a task by its words', r.join(' | '));
r = names('is:problem'); check(r.length && r.every(x => x.includes('Shalev') || x.includes('leak')), 'is:problem lists the red job and its task', r.join(' | '));
r = names('group:done'); check(r.includes('job:Done one') && !r.some(x => x.startsWith('group:')), 'group:done filter alone lists the jobs in it, not the group', r.join(' | '));
r = names('stage:conc'); check(r.includes('job:Done one'), 'stage: prefix filter', r.join(' | '));
r = names('worker:mos lev'); check(r.length === 1 && r[0] === 'job:Shalev', 'worker filter + text', r.join(' | '));
r = names('lev', { kinds: ['task'] }); check(r.length === 0, 'kinds narrows');
const g = X.globalIndex(contractors, stages);
r = X.searchIndex(g, 'lev', {}).map(h => h.kind + ':' + h.rec.name);
check(!r.includes('stage:Concealed Units'), 'a three-letter query is never fuzzed onto a stage ("lev" is not "concealed")', r.join(' | '));
r = X.searchIndex(g, 'conceled', {}).map(h => h.kind + ':' + h.rec.name); check(r.includes('stage:Concealed Units'), 'a misspelt stage is still found', r.join(' | '));
r = X.searchIndex(g, 'moshe', {}).map(h => h.kind + ':' + h.rec.name); check(r[0] === 'worker:Moshe', 'worker by name');
r = X.searchJobs(apartments, 'done', { includeTrash: true }).map(h => h.rec.displayName); check(r[0] === 'Done one', 'searchJobs on a bare list', r.join(' | '));
r = X.searchJobs(apartments, 'thrown', { includeTrash: true }).map(h => h.rec.displayName); check(r[0] === 'Thrown away', 'searchJobs includes trash when asked');
// incremental sync
const src2 = { ...src, apartments: [...apartments, job('G-11', 'Levinson')] };
const idx2 = X.workspaceIndex('test', src2);
check(idx2 === idx && names('levinson')[0] === 'job:Levinson', 'sync adds a new job in place');
const src3 = { ...src2, apartments: src2.apartments.filter(a => a.id !== 'G-11') };
X.workspaceIndex('test', src3); check(!names('levinson').length, 'sync drops a removed job');
const p = X.parseQuery('stage:piping ws:net cohen is:pending');
check(p.text === 'cohen' && p.filters.stage === 'piping' && p.filters.ws === 'net' && p.filters.pending === true, 'parseQuery', JSON.stringify(p));
check(X.wsMatches({ ws: 'net' }, { id: 'netiv', name: 'Netiv Neve Shamir' }) && !X.wsMatches({ ws: 'net' }, { id: 'wolfson', name: 'Wolfson' }), 'ws matches by prefix');
check(!X.queryIsEnough('l') && X.queryIsEnough('le') && X.queryIsEnough('is:problem'), 'queryIsEnough');
await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
