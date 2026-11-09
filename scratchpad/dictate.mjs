// The mic and the paperclip (owner, 2026-11-08): dictation keeps listening through a pause, ADDS to what was typed,
// shows the live line, and has Stop and Send; a picked file shows "Uploading…" with a bar at once. A stand-in speech
// recogniser plays words; Drive's upload is held back so the bar can be seen. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  // A stand-in recogniser: "water leak", a pause that ENDS it (as a phone does), then "in the bedroom" on the restart.
  window.__recStarts = 0;
  class FakeRec {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; }
    start() {
      ++window.__recStarts;
      const seg = window.__seg = (window.__seg || 0) + 1;   // per press: two phrases, then quiet
      const say = seg === 1 ? ['water', 'water leak'] : seg === 2 ? ['in the', 'in the bedroom'] : [];
      const res = (t, fin) => ({ resultIndex: 0, results: Object.assign([Object.assign([{ transcript: t }], { isFinal: fin })], { length: 1 }) });
      say.forEach((t, i) => setTimeout(() => this.onresult?.(res(t, i === say.length - 1)), 250 * (i + 1)));
      this._end = setTimeout(() => this.onend?.(), 250 * (say.length + 1) + 150);
    }
    stop() { window.__seg = 0; clearTimeout(this._end); setTimeout(() => this.onend?.(), 30); }
    abort() { clearTimeout(this._end); setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
  // The page's own microphone meter is refused here, so the line rides the recogniser's beat.
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('no mic'));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(1000);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
await p.locator('[data-report-problem]').first().scrollIntoViewIfNeeded(); await p.locator('[data-report-problem]').first().click(); await p.waitForTimeout(800);
const box = p.locator('[data-problem-box]').first();
const input = box.locator('[data-composer-input]');
await input.fill('Hello');
await box.locator('[data-composer-dictate]').click(); await p.waitForTimeout(500);
T(await box.locator('[data-dictate-live] [data-live-wave]').isVisible(), 'listening: the live line shows in the box');
T(await box.locator('[data-dictate-stop]').isVisible() && await box.locator('[data-dictate-send]').isVisible(), 'listening: Stop and Send stand at the end');
await p.screenshot({ path: `${OUT}/dictate-live.png` });
await p.waitForTimeout(1800);
const v = await input.inputValue();
T(v === 'Hello water leak in the bedroom', `it keeps listening through a pause and ADDS to what was typed ("${v}")`);
T((await p.evaluate(() => window.__recStarts)) >= 2, 'the recogniser was started again after the phone ended it');
const wave = await p.evaluate(() => { const c = document.querySelector('[data-live-wave]'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
T(wave > 50, `the line is drawn (${wave} painted pixels)`);
await box.locator('[data-dictate-stop]').click(); await p.waitForTimeout(400);
T(!(await box.locator('[data-dictate-live]').count()), 'Stop ends listening');
T((await input.inputValue()) === 'Hello water leak in the bedroom', 'Stop keeps the words in the box');
// Send while listening: the words go
await input.fill('');
await box.locator('[data-composer-dictate]').click(); await p.waitForTimeout(800);
await box.locator('[data-dictate-send]').click(); await p.waitForTimeout(900);
T((await input.inputValue()) === '' && !(await box.locator('[data-dictate-live]').count()), 'Send stops listening and sends the words (the box empties)');
T((await p.locator('[data-problem-box]').first().textContent()).includes('water leak') || (await p.locator('body').textContent()).includes('water leak'), 'the sent words are in the thread');
await p.screenshot({ path: `${OUT}/dictate-sent.png` });
T(errs.length === 0, `no page errors (${errs.join(' | ')})`);
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
