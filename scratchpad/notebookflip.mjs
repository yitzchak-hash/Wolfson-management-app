// The notebook reads like a calendar again: oldest week on top, the notebook
// OPENS scrolled to the current week, the month is big and bold in the label
// cell ("AUG 23"), the ‹ Today › cluster is gone, each week carries tiny
// up/down scrollers, and the put-away eyes grew.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  // An eight-week run whose LAST week is the current one (the container clock
  // sits in the week of 2026-08-23) — long enough that the scroller really
  // scrolls, which a short run cannot prove anything about.
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [],
    apartments: [],
    canvasElements: [{
      id: 'CE-main', type: 'widget', widget: 'rota', x: 100, y: 160, w: 900, h: 460,
      text: '', color: '#ffffff',
      data: { people: ['c:C-jo'], firstWeek: '2026-07-05', weekCount: 8, span: 5, cells: {} },
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const main = page.locator('[data-node-id="CE-main"]');

// ── The month is big and bold in the label cell ─────────────────────────────
const label = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const aug = [...el.querySelectorAll('span')]
    .find(s => (s.textContent || '').trim() === 'AUG' && !s.children.length);
  if (!aug) return null;
  const cs = getComputedStyle(aug);
  return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) };
});
check(!!label && label.size >= 12 && label.weight >= 800,
  'the month reads AUG — big and bold in the label cell', JSON.stringify(label));

// ── The ‹ Today › cluster is gone from the header ───────────────────────────
const headerBits = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  return {
    today: !!el.querySelector('button[title="This week"]'),
    monthArrows: !!el.querySelector('button[title="The month before"]'),
  };
});
check(!headerBits.today && !headerBits.monthArrows,
  'the ‹ Today › cluster is gone', JSON.stringify(headerBits));

// ── It OPENED on the current week ───────────────────────────────────────────
// The current week is the run's LAST, so "on top" means the scroller went as
// far down as it goes — a calendar's last week cannot sit above its own end.
const opened = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const scroller = el.querySelector('.planner-scroll');
  const labels = [...el.querySelectorAll('span')]
    .filter(s => /^(JUL|AUG) \d+$/.test((s.textContent || '').trim()))
    .map(s => ({ label: s.textContent.trim(), y: s.getBoundingClientRect().top }));
  const box = scroller.getBoundingClientRect();
  const visible = labels.filter(l => l.y >= box.top - 4 && l.y <= box.bottom);
  return {
    scrollTop: scroller.scrollTop,
    max: scroller.scrollHeight - scroller.clientHeight,
    currentVisible: visible.some(l => l.label === 'AUG 23'),
  };
});
check(opened.scrollTop > 100 && opened.max - opened.scrollTop < 40 && opened.currentVisible,
  'the notebook opened scrolled to the current week', JSON.stringify(opened));

// ── The tiny scrollers scroll — up shows the week above ─────────────────────
check(await main.locator('[data-week-up]').count() >= 1
  && await main.locator('[data-week-down]').count() >= 1,
  'each week carries its up/down scrollers');
// The AUG 2 week's own up arrow: the week above it (JUL 26) is early enough
// in the run to land flush at the top, so the assertion can be exact.
await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const label = [...el.querySelectorAll('span')]
    .find(s => (s.textContent || '').trim() === 'AUG 2' && s.querySelector('span'));
  label.closest('.group\\/wk').querySelector('[data-week-up]').click();
});
await page.waitForTimeout(700);
const afterUp = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const scroller = el.querySelector('.planner-scroll');
  const labels = [...el.querySelectorAll('span')]
    .filter(s => /^(JUL|AUG) \d+$/.test((s.textContent || '').trim()))
    .map(s => ({ label: s.textContent.trim(), y: s.getBoundingClientRect().top }));
  const box = scroller.getBoundingClientRect();
  return labels.filter(l => l.y >= box.top - 4 && l.y <= box.bottom)[0]?.label ?? null;
});
check(afterUp === 'JUL 26', 'the up scroller brings the week above to the top', afterUp);

// ── The put-away eye grew ───────────────────────────────────────────────────
await page.locator('[data-node-id="CE-main"] .group\\/wk').first().hover();
await page.waitForTimeout(300);
const eye = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const btn = el.querySelector('button[title^="Put this week away"] svg');
  return btn ? btn.getBoundingClientRect().width : 0;
});
check(eye >= 13, 'the put-away eye is finger-sized now', `${eye}px`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
