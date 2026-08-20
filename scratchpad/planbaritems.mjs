// Split the captured bar into its individual controls.
//
// Done in a real browser rather than by regex: the predicates that FIND each
// control (an icon-only Full screen button has no title and no text — it is
// found by the icon lucide actually renders) are the same ones the capture
// used, and they only work against a live DOM.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const cap = JSON.parse(readFileSync('scratchpad/planbar-capture.json', 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage();
await page.setContent(`<style>${cap.css}</style><div id="root">${cap.now}</div>`);

const items = await page.evaluate(() => {
  const root = document.querySelector('#root > div');
  const byText = re => [...root.querySelectorAll('button')]
    .find(x => re.test((x.textContent ?? '').replace(/\s+/g, ' ').trim())
      || re.test(x.getAttribute('title') ?? ''));

  const found = [
    ['folder',   'Folder picker',        byText(/Engineered Plans|Choose a folder/)],
    ['plans',    'Plans',                byText(/^Plans$/)],
    ['markup',   'Mark up',              byText(/^Mark up$/)],
    ['layers',   'Layers',               byText(/^Layers ?\d*$/)],
    ['pin',      'Pin',                  byText(/Pin/)],
    ['versions', 'Saved versions',       byText(/Saved versions/)],
    ['download', 'Download',             byText(/^Download$/)],
    ['print',    'Print',                [...root.querySelectorAll('button')]
                    .filter(x => /^Print$/.test((x.textContent ?? '').trim())).pop()],
    ['path',     'Copy folder path',     byText(/path|AutoCAD|Explorer|Finder/i)],
    // No title, no text — an icon inside a Tooltip wrapper.
    ['full',     'Full screen',          root.querySelector('.lucide-maximize-2')?.closest('button')],
  ];

  const chips = [...root.querySelectorAll('span')].find(x => x.className.includes('edge-fade'));
  const name = [...root.querySelectorAll('div')].find(x =>
    /Frielich/.test(x.textContent ?? '') && x.children.length === 0);

  const out = [];
  for (const [key, label, el] of found) {
    if (!el) { out.push({ key, label, html: null }); continue; }
    out.push({ key, label, html: el.outerHTML });
  }
  if (chips) out.push({ key: 'chips', label: 'Plan bubbles', html: chips.outerHTML, wide: true });
  if (name) out.push({ key: 'name', label: 'Plan name', html: name.outerHTML });
  return out;
});

const missing = items.filter(i => !i.html).map(i => i.key);
console.log('items:', items.map(i => i.key).join(', '));
console.log('missing:', missing.length ? missing.join(', ') : 'none');
writeFileSync('scratchpad/planbar-items.json',
  JSON.stringify({ css: cap.css, items: items.filter(i => i.html) }));
console.log(`written — ${items.filter(i => i.html).length} controls`);
await b.close();
