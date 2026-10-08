// Notebook Card Options — inline the app's compiled CSS (html/body rules
// stripped — they would repaint the drafting desk) into the template.
// The planbar-sketch / notebook-strips manner.
//
//   npx vite build && node scratchpad/build-notebook-cards.mjs
//
// It also checks every class the template uses exists in the compiled CSS or
// in the page's own <style>: Tailwind purges what the app never uses, and a
// class missing from the build draws nothing, silently.
import fs from 'node:fs';

const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
if (!cssFile) { console.error('no dist/assets/*.css — run `npx vite build` first'); process.exit(1); }
let css = fs.readFileSync(`dist/assets/${cssFile}`, 'utf8');
css = css.replace(/(^|})\s*(html|body|html,body)[^{}]*\{[^{}]*\}/g, '$1');

const tpl = fs.readFileSync('scratchpad/notebook-cards-plan.template.html', 'utf8');
if (!tpl.includes('/*__APP_CSS__*/')) { console.error('template lost its /*__APP_CSS__*/ marker'); process.exit(1); }

// ── class check ──
const own = (tpl.match(/<style>(?![\s\S]*?__APP_CSS__)[\s\S]*?<\/style>/g) || []).join('\n');
const sheet = css + '\n' + own;
const used = new Set();
for (const m of tpl.matchAll(/class="([^"]+)"/g)) {
  // JS-built class strings leave fragments (`' + cls + '`); real class names start lower-case.
  for (const c of m[1].split(/\s+/)) if (/^[a-z][\w:.\/[\]%#-]*$/.test(c) && c !== 'cls') used.add(c);
}
const cssEsc = c => c.replace(/([:./[\]%#()])/g, '\\$1');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const missing = [...used].filter(c => !new RegExp(reEsc('.' + cssEsc(c)) + '(?![\\w-])').test(sheet));
if (missing.length) console.warn('classes not found in any stylesheet:', missing.join(' '));

const out = tpl.replace('/*__APP_CSS__*/', css);
fs.writeFileSync('scratchpad/notebook-cards-plan.html', out);
console.log('built scratchpad/notebook-cards-plan.html', (fs.statSync('scratchpad/notebook-cards-plan.html').size / 1024).toFixed(0), 'KB');
