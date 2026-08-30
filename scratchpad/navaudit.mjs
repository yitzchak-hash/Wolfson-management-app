// THE NAV AUDIT — the dead-buttons fix, held against tomorrow.
//
// Urgent navigation rests on four things an ordinary dependency bump could
// silently break, and every one of them would fail QUIETLY — the app builds,
// runs, and the buttons just go dead again on slow machines:
//
//  1. The `router-urgent-nav` plugin must be wired in vite.config.ts, with
//     the optimizeDeps exclude (so dev goes through the plugin) and the
//     include list (so react-router's CJS sub-deps keep their interop).
//  2. The shim must re-export EVERY export of the installed React — the
//     list is explicit (a star re-export delivers nothing in dev), so a
//     React upgrade that adds an export react-router uses would leave a
//     hole in the namespace and crash at runtime.
//  3. react-router must still import 'react' by that bare name — the
//     plugin intercepts exactly that specifier.
//  4. react-router's runtime dependencies must all be on the optimizeDeps
//     include list — a NEW sub-dep (the `cookie` lesson) breaks dev with
//     "does not provide an export named …".
//
// Offline and instant. Run it after ANY change to react, react-dom,
// react-router or vite versions — and let a failure here send you to
// scratchpad/urgentnav.mjs for the live proof.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

// ── 1. the plugin is wired ─────────────────────────────────────────────────
const cfg = readFileSync('vite.config.ts', 'utf8');
check(/plugins:\s*\[\s*routerUrgentNav\(\)/.test(cfg),
  'vite.config wires routerUrgentNav() first in plugins');
check(/exclude:\s*\[[^\]]*'react-router'/.test(cfg) && /'react-router-dom'/.test(cfg),
  'optimizeDeps.exclude carries react-router and react-router-dom');
check(/react-inline-transition\.js/.test(cfg),
  'the plugin points at the .js shim (a .ts shim breaks tsc on export=)');

// ── 2. the shim covers the installed React completely ──────────────────────
const shim = readFileSync('src/shims/react-inline-transition.js', 'utf8');
const shimNames = new Set(
  [...shim.matchAll(/export const ([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
const reactKeys = Object.keys(require('react'));
const missing = reactKeys.filter(k => !shimNames.has(k));
check(missing.length === 0,
  'the shim re-exports every export of the INSTALLED react',
  missing.length ? 'missing: ' + missing.join(' ') + ' — add them to the shim' : `${reactKeys.length} exports`);
check(/export const startTransition = \(cb\) => \{ cb\(\); \};/.test(shim),
  'the shim\'s startTransition runs its callback inline');
check(/export default/.test(shim), 'the shim keeps a default export');

// ── 3. react-router still imports the name the plugin intercepts ───────────
const rrDist = readFileSync('node_modules/react-router/dist/development/dom-export.mjs', 'utf8');
check(/from ["']react["']/.test(rrDist),
  'react-router\'s ESM dist imports the bare specifier \'react\'');
check(/\.startTransition\(/.test(rrDist)
  || /\.startTransition\(/.test(readFileSync('node_modules/react-router/dist/development/index.mjs', 'utf8'))
  || [...rrDist.matchAll(/from ["'](\.\/[^"']+)["']/g)].some(m => {
       try { return /\.startTransition\(/.test(readFileSync('node_modules/react-router/dist/development/' + m[1], 'utf8')); }
       catch { return false; }
     }),
  'react-router still calls React.startTransition somewhere (else the shim is moot — investigate the upgrade)');

// ── 4. every react-router runtime dep is interop-covered ───────────────────
const rrDeps = Object.keys(require('react-router/package.json').dependencies ?? {});
const uncovered = rrDeps.filter(d => !cfg.includes(`react-router > ${d}`));
check(uncovered.length === 0,
  'optimizeDeps.include covers every react-router dependency',
  uncovered.length ? 'add to include: ' + uncovered.map(d => `'react-router > ${d}'`).join(', ') : rrDeps.join(' '));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
