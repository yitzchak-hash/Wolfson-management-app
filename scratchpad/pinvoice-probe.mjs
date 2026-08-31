// Probe: workers add plan pins from the portal, and pins carry a voice memo
// player, file attachments (paperclip + slightly bigger mic, bottom right),
// and the delete-only-your-own rule.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A tiny silent wav as a data URL — stands in for a stored voice memo.
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([today, wav]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  const contractors = [
    { id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    users: [], contractors,
    apartments: [{
      id: 'W-1', buildingId: 'A1', apartmentNumber: '37', floor: 10, displayName: 'Cohen',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01',
      plansPdfLink: 'https://drive.google.com/file/d/FAKEPLAN12345/view',
    }],
    contractorAssignments: [{
      id: 'T-1', apartmentId: 'W-1', buildingId: 'A1', contractorId: 'C-a',
      taskDescription: 'Fix the duct', dueDate: today, completedAt: null,
      createdAt: '2026-08-01T09:00:00Z', priority: 'normal',
    }],
    planPins: [
      { id: 'PIN-office', apartmentId: 'W-1', xPct: 30, yPct: 30, text: 'Office item',
        createdAt: '2026-08-01T09:00:00Z', createdBy: 'Office',
        audioUrl: wav, audioSeconds: 3 },
    ],
  }));
}, [day(0), WAV]);

const page = await ctx.newPage();
// The plan iframe points at drive.google.com — dead in this container; give it
// an empty page so nothing hangs.
await page.route('**://drive.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
await page.goto('http://localhost:5173/c/t1');
await page.waitForTimeout(2500);

// Open the task sheet (press the All pill first — the standing date-filter trap).
await page.evaluate(() => {
  const all = [...document.querySelectorAll('button')].find(b => /^(All|הכל|הכול)$/.test((b.textContent || '').trim()));
  all?.click();
});
await page.waitForTimeout(400);
await page.getByText('Fix the duct').first().click();
await page.waitForTimeout(1200);

// Expand the plan (tap-to-expand), which mounts the overlay.
const planBox = page.locator('iframe[title="Engineering Plans"]');
check(await planBox.count() === 1, 'the task sheet shows the plan block');
await page.evaluate(() => {
  const f = document.querySelector('iframe[title="Engineering Plans"]');
  f?.parentElement?.click();
});
await page.waitForTimeout(600);

// The worker has an Add Pin control now.
const pinBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /(^| )(Pin|נעץ)( |$)/.test((x.textContent || '').trim()) && x.closest('div'));
  if (!b) return null;
  b.click();
  return true;
});
check(!!pinBtn, 'the worker sees an Add Pin button on the plan');
await page.waitForTimeout(300);
// Tap the plan to drop the pin.
const frame = await page.locator('iframe[title="Engineering Plans"]').boundingBox();
await page.mouse.click(frame.x + frame.width * 0.6, frame.y + frame.height * 0.55);
await page.waitForTimeout(700);
const pins = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? []));
const mine = pins.find(p => p.id !== 'PIN-office');
check(!!mine, 'tapping the plan dropped a pin');
check(mine?.createdBy === 'Motti', `the pin is attributed to the worker (${mine?.createdBy})`);

// The bubble opened on the new pin: paperclip + a BIGGER mic, bottom right.
check(await page.locator('[data-pin-attach]').count() === 1, 'the bubble carries the paperclip');
check(await page.locator('[data-pin-mic] button').count() === 1, 'and the microphone beside it');
const sizes = await page.evaluate(() => {
  const clip = document.querySelector('[data-pin-attach]')?.getBoundingClientRect();
  const mic = document.querySelector('[data-pin-mic] button')?.getBoundingClientRect();
  return clip && mic ? { clip: clip.width, mic: mic.width } : null;
});
check(!!sizes && sizes.mic > sizes.clip && sizes.mic - sizes.clip < 12,
  `the mic is a little bigger than the clip (${sizes?.clip} vs ${sizes?.mic})`);

// The worker's own pin can be deleted…
check(await page.evaluate(() =>
  !![...document.querySelectorAll('button')].find(b => b.title === 'Remove this pin')),
'the worker may delete their own pin');

// Attach a small file through the paperclip's input.
await page.locator('[data-pin-file-input]').setInputFiles({
  name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('check the duct size here'),
});
await page.waitForTimeout(900);
const pinsAfter = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? []));
const mineAfter = pinsAfter.find(p => p.id === mine.id);
check((mineAfter?.files ?? []).length === 1 && mineAfter.files[0].url.startsWith('data:'),
  'the attached file rides the pin as a small data URL (no backend here)');
check(await page.locator('[data-pin-files]').count() === 1, 'and draws as a chip in the bubble');

// Open the OFFICE pin: the memo plays, and there is NO delete for the worker.
await page.evaluate(() => {
  const pin = [...document.querySelectorAll('button')].find(b => /Office item/.test(b.title || ''));
  pin?.click();
});
await page.waitForTimeout(600);
const officeBubble = await page.evaluate(() => {
  const hasAudioPlayer = !![...document.querySelectorAll('button')].find(b => /^(Play|Pause)/.test(b.title || ''))
    || !!document.querySelector('audio');
  const del = !![...document.querySelectorAll('button')].find(b => b.title === 'Remove this pin');
  return { hasAudioPlayer, del };
});
check(officeBubble.hasAudioPlayer, "the office pin's voice memo draws as a player");
check(!officeBubble.del, 'the worker cannot delete the office pin');

await page.screenshot({ path: `${SCRATCH}/pinvoice.png` });
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
