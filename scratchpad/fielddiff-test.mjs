// Offline proof of fieldDiff.ts (run: npx tsx scratchpad/fielddiff-test.mjs)
import { diffRecord, mergeIdList } from '../src/data/fieldDiff.ts';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const J = JSON.stringify;
const paths = ops => ops.map(o => o.kind[0] + ':' + o.path.join('.')).sort();

check(diffRecord({ a: 1, b: { c: 1 } }, { a: 1, b: { c: 1 } }).length === 0, 'no change → nothing to write');
check(J(paths(diffRecord({ a: 1, m: { x: 'todo', y: 'done' } }, { a: 1, m: { x: 'done', y: 'done' } }))) === J(['s:m.x']), 'one tick → one path');
check(J(paths(diffRecord({ m: { x: 1, y: 2 } }, { m: { x: 1 } }))) === J(['d:m.y']), 'removed key → delete that key only');
check(J(paths(diffRecord({ m: { x: 1 } }, {}))) === J(['d:m']), 'removed field → delete field');
check(J(paths(diffRecord({ bs: { wolfson: { a: 1, b: 2 }, general: { c: 3 } } }, { bs: { wolfson: { a: 1, b: 9 }, general: { c: 3 } } }))) === J(['s:bs.wolfson.b']),
  'board setting → only that workspace, that key');
check(J(paths(diffRecord({ x: 1, _updatedAt: 'a' }, { x: 1, _updatedAt: 'b' }))) === J([]), '_updatedAt ignored');
check(J(paths(diffRecord({ l: [1, 2] }, { l: [1, 3] }))) === J(['s:l']), 'plain list → set list');
const p1 = { id: 'p1', x: 1 }, p2 = { id: 'p2', x: 2 }, p3 = { id: 'p3', x: 3 }, p9 = { id: 'p9', x: 9 };
check(J(paths(diffRecord({ data: { pins: [p1] } }, { data: { pins: [p1, p2] } }))) === J(['i:data.pins']), 'pins → id-list op');
check(J(paths(diffRecord({ data: { pins: [] } }, { data: { pins: [p2] } }))) === J(['i:data.pins']), 'empty pins → id-list op (new-browser case)');
check(J(paths(diffRecord({ data: {} }, { data: { pins: [p2] } }))) === J(['i:data.pins']), 'missing pins → id-list op');

check(J(paths(diffRecord({ bs: { wolfson: { a: 1 } } }, { bs: { wolfson: { a: 1 }, netiv: { sticky: true } } }))) === J(['s:bs.netiv.sticky']),
  'a map this computer never had → only the added key (the cloud\'s other keys stay)');
check(J(paths(diffRecord({}, { stageMarks: { g1: 'done' } }))) === J(['s:stageMarks.g1']), 'first mark on a record → that mark only');
check(J(paths(diffRecord({ m: null }, { m: { a: 1 } }))) === J(['s:m']), 'null → map is a real replacement');

// merge: stale computer had [p1], cloud has [p1,p3,p9]; I add p2 → keep p3,p9
check(J(mergeIdList([p1], [p1, p2], [p1, p3, p9]).map(r => r.id)) === J(['p1', 'p2', 'p3', 'p9']), 'stale add keeps others\' pins');
check(J(mergeIdList([], [p2], [p1, p3]).map(r => r.id)) === J(['p2', 'p1', 'p3']), 'empty-copy add keeps cloud pins');
check(J(mergeIdList([p1, p3], [p3], [p1, p3, p9]).map(r => r.id)) === J(['p3', 'p9']), 'remove only what I removed');
const p1b = { id: 'p1', x: 100 };
check(J(mergeIdList([p1, p3], [p1, p3], [p1b, p3])) === J([p1b, p3]), 'untouched record keeps cloud version');
check(J(mergeIdList([p1, p3], [{ id: 'p1', x: 5 }, p3], [p1, p3, p9])) === J([{ id: 'p1', x: 5 }, p3, p9]), 'my edit wins on the record I edited');
check(J(mergeIdList([p1, p3], [p1, p3], [p3]).map(r => r.id)) === J(['p3']), 'untouched record someone removed stays removed');
check(J(mergeIdList([p1, p3], [p3, p1], [p1, p3]).map(r => r.id)) === J(['p3', 'p1']), 'reorder kept');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
