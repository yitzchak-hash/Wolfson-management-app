// The server's ancestor resolver, offline: early stop on a known job folder,
// one lookup per folder however many files it holds, parallel chunks, and a
// time budget that answers "partial" instead of dying.
import { resolveJobFolders } from '../api/drive-files.js';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// A Drive: Pot/JobA/Photos/{a1,a2}, Pot/JobA/plan.pdf, Pot/JobB/EP/Annotated/v1.pdf, Leads/Deep/1/2/3/x
const TREE = { Photos: ['JobA'], JobA: ['Pot'], JobB: ['Pot'], EP: ['JobB'], Annotated: ['EP'], Pot: ['Root'], Root: [], Deep: ['Leads'], Leads: ['Root'], d1: ['Deep'], d2: ['d1'], d3: ['d2'], d4: ['d3'] };
const files = [
  { id: 'a1', name: 'a1.jpg', parents: ['Photos'], modifiedTime: '2026-09-01T00:00:00Z' },
  { id: 'a2', name: 'a2.jpg', parents: ['Photos'], modifiedTime: '2026-09-02T00:00:00Z' },
  { id: 'plan', name: 'plan.pdf', parents: ['JobA'], modifiedTime: '2026-09-03T00:00:00Z' },
  { id: 'v1', name: 'v1.pdf', parents: ['Annotated'], modifiedTime: '2026-09-04T00:00:00Z' },
  { id: 'x', name: 'x.pdf', parents: ['d4'], modifiedTime: '2026-09-05T00:00:00Z' },
];
const known = new Set(['JobA', 'JobB']);

// 1 · correctness + lookup economy
{
  const cache = new Map(); let lookups = 0;
  const parentOf = async id => { lookups++; await new Promise(r => setTimeout(r, 5)); const p = TREE[id] ?? []; cache.set(id, p); return p; };
  const r = await resolveJobFolders(files, known, parentOf, { cache, budgetMs: 5000 });
  const by = Object.fromEntries(r.files.map(f => [f.id, f.jobFolder]));
  check(by.plan === 'JobA', 'a file straight in the job folder resolves with no lookup', by.plan);
  check(by.a1 === 'JobA' && by.a2 === 'JobA', 'two photos in Job A/Photos both resolve to Job A');
  check(by.v1 === 'JobB', 'Annotated Plans two levels down resolves to Job B');
  check(by.x === null, 'a file under no job folder resolves to nothing');
  check(!r.partial, 'the answer is complete');
  // Photos once, Annotated once, EP once; the deep chain d4,d3,d2,d1,Deep = 5. JobA/JobB never (known → stop).
  check(lookups === 8, 'each folder is looked up ONCE, and a known job folder is never climbed past', `${lookups} lookups`);
  check(!Object.keys(Object.fromEntries(cache)).includes('JobA'), 'the job folder itself is never fetched');
}
// 2 · the budget
{
  const cache = new Map();
  const parentOf = async id => { await new Promise(r => setTimeout(r, 60)); const p = TREE[id] ?? []; cache.set(id, p); return p; };
  const t0 = Date.now();
  const r = await resolveJobFolders(files, known, parentOf, { cache, budgetMs: 50, chunk: 1 });
  const dt = Date.now() - t0;
  check(r.partial === true, 'out of time answers partial', `${dt}ms`);
  check(r.files.length === files.length, 'and still returns every file', String(r.files.length));
  check(r.files.find(f => f.id === 'plan').jobFolder === 'JobA', 'with what it could settle without lookups');
  check(dt < 400, 'well inside the platform limit', `${dt}ms`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
