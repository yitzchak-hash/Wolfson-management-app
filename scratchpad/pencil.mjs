// Can a bare FINGER draw on a phone?
//
// Palm rejection ignores touches once a pen has been seen. On a phone there is
// no pen, so a finger must always pass — get that wrong and the markup studio
// is simply dead on a phone, silently, with no error to notice.
// The module takes `now` as a parameter, so these are explicit timelines rather
// than a race against the wall clock.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:5173/');
const out = await p.evaluate(async () => {
  const m = await import('/src/data/pencil.ts');
  const finger = { pointerType: 'touch', pressure: 0.5 };
  const pen = { pointerType: 'pen', pressure: 0.6 };
  const r = [];

  // 1. A phone with no stylus: every finger must draw, at any time.
  m.notePointer(finger, 1000);
  r.push(['finger draws when no pen has ever been seen', m.isPalm(finger, 1000) === false]);
  m.notePointer(finger, 60000);
  r.push(['finger still draws much later', m.isPalm(finger, 60000) === false]);

  // 2. A tablet with a stylus: a finger landing right after the pen is a palm.
  m.notePointer(pen, 100000);
  r.push(['finger rejected while the pen is active', m.isPalm(finger, 100050) === true]);

  // 3. ...but the rejection expires, or the tablet stops taking touch for good.
  r.push(['finger accepted again after the pen window',
          m.isPalm(finger, 100000 + m.PEN_WINDOW + 50) === false]);

  // 4. The pen itself is never a palm.
  r.push(['the pen is never rejected', m.isPalm(pen, 100050) === false]);
  return r;
});
let bad = 0;
for (const [name, ok] of out) { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); }
console.log(bad === 0 ? '\nfinger drawing is not blocked on a phone' : `\n${bad} FAILED`);
await b.close();
