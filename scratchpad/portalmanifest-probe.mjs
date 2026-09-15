// A shortcut made from a worker's link must open that link: while the portal
// is mounted the page's manifest names the worker's own address as start_url,
// scope and id; on the office pages the office manifest stands.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser, {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await applySeed(ctx, blob, {});
const page = await ctx.newPage();
let pass = 0, fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); ok ? pass++ : fail++; };
const readManifest = () => page.evaluate(async () => {
  const l = document.querySelector('link[rel="manifest"]');
  const href = l?.getAttribute('href') ?? '';
  const r = await fetch(href);
  return { href, title: document.title, json: await r.json() };
});

await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(2500);
const m = await readManifest();
check(m.href.startsWith('blob:'), `portal manifest is made on the spot (${m.href.slice(0, 30)}…)`);
check(m.json.start_url === `http://localhost:5173/c/${PORTAL_TOKEN}`, `start_url is the worker's link: ${m.json.start_url}`);
check(m.json.scope === m.json.start_url && m.json.id === m.json.start_url, 'scope and id are the link too (a separate app from the office)');
check(/Moshe/.test(m.json.name) && /Moshe/.test(m.title), `named after the worker: ${m.json.name} / ${m.title}`);
check(m.json.display === 'standalone' && m.json.icons?.[0]?.src?.startsWith('http://localhost:5173/'), 'standalone, icon absolute');

// the office pages keep the office manifest
await page.goto('http://localhost:5173/login');
await page.waitForTimeout(1500);
const o = await readManifest();
check(o.href === '/site.webmanifest' && o.json.start_url === '/', `office page: ${o.href} → start_url ${o.json.start_url}`);
check(/Job Management/.test(o.title), `office title back: ${o.title}`);

// and a client-side hop back into the portal swaps it again
await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(2000);
const m2 = await readManifest();
check(m2.json.start_url.endsWith(`/c/${PORTAL_TOKEN}`), 'second visit: the worker\'s manifest again');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
