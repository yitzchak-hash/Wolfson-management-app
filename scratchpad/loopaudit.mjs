// THE LOOP AUDIT — the class of bug behind the pinch-time React #185.
//
// A render loop is born from two ingredients meeting: an effect whose deps
// go unstable (an array or object rebuilt every render), and a setState
// inside it that always looks "new" (an object literal, never damped). The
// Building-progress miniature carried both and burnt a CPU core while idle.
//
// This audit is STATIC and offline, and it enforces two rules mechanically:
//
//  RULE 1 — every setState reachable from a ResizeObserver callback that
//  writes an OBJECT literal must be the damped functional form
//  (`set(prev => …unchanged? prev : next)`). A scalar write self-damps via
//  Object.is, so scalars pass. No exceptions, no excuse list: the damped
//  form costs two lines and removes the whole class.
//
//  RULE 2 — a useEffect/useLayoutEffect that CALLS a setState must not
//  carry a dep that is an array/object rebuilt bare in the component body
//  (.filter/.map/.slice/spread/Object.keys… outside a useMemo). Findings
//  are listed with file and line; each must be FIXED or EXCUSED below with
//  a reason (the backupaudit manner — a stale excuse fails the audit).
//
// Heuristic, deliberately: it reads source text, not an AST. It errs
// toward flagging, and the excuse list is where a human's one-time review
// is recorded. Run it after touching any measuring component.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * RULE 2 findings reviewed by hand and excused, key `file:identifier`.
 * An excuse whose site no longer matches fails the audit as stale.
 */
const EXCUSED = {
  // The effect keyed on `h` (buildings list) also writes state, but `h`
  // is byBuilding — memoised since the #185 fix. Guarded by the memo test
  // below; nothing to excuse here today. (Kept as the format example.)
};

let fails = 0;
const fail = (msg) => { console.log('FAIL ' + msg); fails++; };
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) files.push(p);
  }
})('src');

// ── RULE 1: damped ResizeObserver writes ───────────────────────────────────
// For each `new ResizeObserver(cb)`, resolve cb to ITS OWN balanced body
// (inline, or the same-file function it names) and inspect every set*(…)
// call inside it. Balanced, not a fixed slab: a slab over-reads into the
// component's other handlers and blames them for the observer's sins.
const balancedFrom = (src, openIdx, openCh, closeCh) => {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh && --depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx, openIdx + 2400);
};
let roSites = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const roRe = /new ResizeObserver\s*\(/g;
  let m;
  while ((m = roRe.exec(src))) {
    roSites++;
    const argStart = m.index + m[0].length;
    const arg = /^\s*([A-Za-z_$][\w$]*)\s*\)/.exec(src.slice(argStart, argStart + 60));
    let body;
    if (arg) {
      // Named callback: from its declaration through the balanced close of
      // its first brace — INCLUDING the declaration text, because a braceless
      // arrow (`const read = () => setBox({…})`) puts the setState BEFORE the
      // first brace and a body-only slab would silently skip it.
      const def = new RegExp(`(?:const|function)\\s+${arg[1]}\\b[^{]*\\{`).exec(src);
      body = def
        ? src.slice(def.index, def.index + def[0].length - 1)
          + balancedFrom(src, def.index + def[0].length - 1, '{', '}')
        : '';
    } else {
      // Inline callback: the whole ResizeObserver(...) call, balanced parens.
      body = balancedFrom(src, m.index + m[0].length - 1, '(', ')');
    }
    // A setState that opens an OBJECT literal directly is an undamped object
    // write. The damped form opens a function instead; a scalar self-damps.
    const setRe = /\bset[A-Z]\w*\s*\(\s*\{/g;
    let s;
    while ((s = setRe.exec(body))) {
      fail(`${f}: ResizeObserver path writes a raw object literal — use the damped ` +
        `functional form (set(prev => unchanged ? prev : next)). Near: ` +
        body.slice(Math.max(0, s.index - 40), s.index + 60).replace(/\s+/g, ' '));
    }
  }
}
console.log(`rule 1 · ${roSites} ResizeObserver sites checked`);

// ── RULE 2: no effect-with-setState keyed on a bare-rebuilt array ──────────
// Per file: identifiers assigned from array-producing expressions WITHOUT
// useMemo, intersected with dep arrays of effects that contain a setState.
let effectSites = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // const X = <something>.filter(/map(/slice(  or  [...  or Object.keys(...)
  // — but not `const X = useMemo(`.
  const bare = new Set();
  const declRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{0,200})/g;
  let d;
  while ((d = declRe.exec(src))) {
    const [, name, expr] = d;
    if (/^useMemo\b|^React\.useMemo\b|^useCallback\b|^useRef\b|^useState\b/.test(expr.trim())) continue;
    // A chain that ENDS in a scalar (.length, .some, .includes, a reduce to a
    // number) is a value React's Object.is dep-compare handles — not an
    // identity trap, however it was built.
    if (/\.(length|some\(|every\(|includes\(|indexOf\(|reduce\(|join\()/.test(expr)) continue;
    if (/\.(filter|map|slice|concat|sort|flatMap)\s*\(|^\[\s*\.\.\.|\bObject\.(keys|values|entries)\s*\(/.test(expr)) {
      bare.add(name);
    }
  }
  if (!bare.size) continue;
  // Effects: take each `useEffect(` and read ~2600 chars — enough to cover
  // the body and its dep array for the app's measuring effects.
  const effRe = /use(?:Layout)?Effect\s*\(/g;
  let e;
  while ((e = effRe.exec(src))) {
    const slab = src.slice(e.index, e.index + 2600);
    // The dep array is the LAST `}, [ … ])` in the slab's first effect —
    // find the first `}, [` after the body opens.
    const dep = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(slab);
    if (!dep) continue;
    if (!/\bset[A-Z]\w*\s*\(/.test(slab.slice(0, dep.index))) continue;
    effectSites++;
    for (const name of dep[1].split(',').map(x => x.trim()).filter(Boolean)) {
      // A dotted dep whose tail is `.length` is a scalar — never an identity.
      if (/\.length$/.test(name)) continue;
      const id = name.replace(/\..*$/, '');
      if (!bare.has(id)) continue;
      const key = `${f}:${id}`;
      if (EXCUSED[key]) { delete EXCUSED[key]; continue; }
      const line = src.slice(0, e.index).split('\n').length;
      fail(`${f}:${line}: effect calls setState and depends on '${id}', which is ` +
        `rebuilt bare every render (no useMemo) — the #185 recipe. Memoise it ` +
        `or excuse it in loopaudit.mjs with a reason.`);
    }
  }
}
for (const key of Object.keys(EXCUSED)) {
  fail(`stale excuse: ${key} no longer matches anything — remove it`);
}
console.log(`rule 2 · ${effectSites} setState-bearing effects checked`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
