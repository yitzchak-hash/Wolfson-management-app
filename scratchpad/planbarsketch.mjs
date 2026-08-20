import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (ok, l, x='') => { console.log(`${ok?'PASS':'FAIL'} ${l}${x?' — '+x:''}`); if(!ok) fails++; };

for (const scheme of ['light','dark']) {
  const ctx = await b.newContext({ viewport:{width:1280,height:1000}, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()); });
  await page.goto('file:///home/user/Wolfson-management-app/scratchpad/planbar-sketch.html');
  await page.waitForTimeout(900);

  const look = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const bar = document.querySelector('.bar');
    return {
      bg: cs.backgroundColor, fg: cs.color, font: cs.fontFamily.split(',')[0],
      chips: document.querySelectorAll('.bar .chip').length,
      barBg: bar ? getComputedStyle(bar).backgroundColor : null,
      spec: (document.getElementById('spec').textContent||'').slice(0,60),
      wide: document.body.scrollWidth <= window.innerWidth + 1,
    };
  });
  console.log(` [${scheme}]`, JSON.stringify(look));
  check(look.chips === 12, `${scheme}: all 12 controls are on the bar`, String(look.chips));
  check(look.barBg === 'rgb(30, 58, 95)', `${scheme}: the bar is the app's navy`, look.barBg);
  check(/Archivo/.test(look.font), `${scheme}: the workbench font loaded`, look.font);
  check(look.bg !== 'rgba(0, 0, 0, 0)', `${scheme}: body paints its own ground`, look.bg);
  check(look.wide, `${scheme}: the page does not scroll sideways`);
  if (scheme === 'dark') {
    check(look.bg === 'rgb(20, 23, 28)', 'dark: the table is dark', look.bg);
    check(look.fg === 'rgb(230, 228, 222)', 'dark: the ink is light', look.fg);
  } else {
    check(look.bg === 'rgb(236, 234, 228)', 'light: the table is paper', look.bg);
  }
  await ctx.close();
}

// ── The actual gesture ────────────────────────────────────────────────
const ctx = await b.newContext({ viewport:{width:1280,height:1000} });
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto('file:///home/user/Wolfson-management-app/scratchpad/planbar-sketch.html');
await page.waitForTimeout(800);

const order = () => page.evaluate(() =>
  [...document.querySelectorAll('.bar .chip')].map(c => c.dataset.id));
const trayIds = () => page.evaluate(() =>
  [...document.querySelectorAll('#tray .chip')].map(c => c.dataset.id));

const before = await order();
console.log('       bar:', before.join(' '));

// Drag the LAST control to the front of the bar.
const box = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.bar .chip')];
  const from = chips[chips.length - 1].getBoundingClientRect();
  const to = chips[0].getBoundingClientRect();
  return { fx: from.x + from.width/2, fy: from.y + from.height/2, tx: to.x + 3, ty: to.y + to.height/2 };
});
await page.mouse.move(box.fx, box.fy);
await page.mouse.down();
await page.mouse.move(box.fx - 30, box.fy, { steps: 5 });
await page.mouse.move(box.tx, box.ty, { steps: 14 });
await page.waitForTimeout(120);
const caretUp = await page.evaluate(() => !!document.querySelector('.bar .caret'));
check(caretUp, 'a red caret shows where it will land');
await page.mouse.up();
await page.waitForTimeout(300);

const after = await order();
console.log('       bar:', after.join(' '));
check(after[0] === before[before.length-1], 'the dragged control moved to the front',
  `${after[0]} vs ${before[before.length-1]}`);
check(after.length === before.length, 'nothing was lost in the move', `${before.length} → ${after.length}`);

// Delete fast: the × parks it.
await page.evaluate(() => document.querySelector('.bar .chip .chip-x').click());
await page.waitForTimeout(300);
const parked = await trayIds();
check(parked.length === 1, 'the × parks it in Off the bar', parked.join(','));
check((await order()).length === before.length - 1, 'and it is off the bar');

// Undo puts it back.
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check((await order()).length === before.length, 'Ctrl+Z puts it back on the bar');
check((await trayIds()).length === 0, 'and the tray is empty again');

// The read-out tracks it.
const spec = await page.evaluate(() => document.getElementById('spec').textContent);
check(/BAR 1/.test(spec) && /LEFT EDGE/.test(spec), 'the read-out names the bars and the edge');
check(/#1e3a5f/.test(spec), 'and gives the colour', spec.split('\n')[0]);

// A second bar, and the edge.
await page.click('#add-bar');
await page.waitForTimeout(250);
check((await page.$$('.bar')).length === 2, 'a second bar can be added');

const e0 = await page.evaluate(() => document.getElementById('left-col').getBoundingClientRect().width);
const eb = await page.evaluate(() => {
  const r = document.getElementById('edge').getBoundingClientRect();
  return { x: r.x + r.width/2, y: r.y + 60 };
});
await page.mouse.move(eb.x, eb.y);
await page.mouse.down();
await page.mouse.move(eb.x - 120, eb.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250);
const e1 = await page.evaluate(() => document.getElementById('left-col').getBoundingClientRect().width);
check(Math.abs(e1 - e0) > 60, 'the left edge really drags', `${Math.round(e0)} → ${Math.round(e1)}`);

await page.screenshot({ path: 'scratchpad/planbar-sketch.png', fullPage: true });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
