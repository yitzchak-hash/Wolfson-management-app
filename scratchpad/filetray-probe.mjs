// Probe: the File Tray widget (drop on the PC → shows everywhere, preview,
// download, size refusal) and the TV refresh that keeps full screen.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  // Seed only when absent — the init script re-runs on every navigation and
  // an unconditional write wipes what the app itself saved (the standing trap).
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [], apartments: [],
    canvasElements: [
      { id: 'CE-tray', type: 'widget', widget: 'file-tray', x: 320, y: 200, w: 300, h: 260,
        text: '', color: '#ffffff', data: {} },
    ],
  }));
});

// ── The tray on the office board ──
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

check(await page.locator('[data-file-tray]').count() === 1, 'the File Tray renders on the board');
check(await page.locator('[data-tray-drop]').count() === 1, 'with its drop zone at the desk');

// A small text file lands (no Drive backend here → data URL).
await page.locator('[data-tray-input]').setInputFiles({
  name: 'measurements.txt', mimeType: 'text/plain', buffer: Buffer.from('salon 4.2 x 3.8'),
});
await page.waitForTimeout(900);
const stored = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.find(e => e.id === 'CE-tray').data);
check((stored.files ?? []).length === 1 && stored.files[0].url.startsWith('data:'),
  'the file rides the widget as a small data URL');
check(stored.files[0].by === 'Probe', `stamped with who sent it (${stored.files[0].by})`);
const row = await page.locator('[data-tray-file]').first().innerText();
check(/new/i.test(row), 'a fresh arrival is marked new');

// A PDF gets the eye, and the eye opens the in-place preview.
await page.locator('[data-tray-input]').setInputFiles({
  name: 'revised plan.pdf', mimeType: 'application/pdf', buffer: PDF,
});
await page.waitForTimeout(900);
await page.locator('[data-tray-preview]').first().click();
await page.waitForTimeout(700);
check(await page.locator('[data-tray-overlay]').count() === 1, 'the PDF previews in place, over everything');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('[data-tray-overlay]').count() === 0, 'Escape closes the preview');

// Too big without Drive → refused out loud, not silently truncated.
await page.locator('[data-tray-input]').setInputFiles({
  name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(900_000, 7),
});
await page.waitForTimeout(900);
const after = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.find(e => e.id === 'CE-tray').data.files.length);
check(after === 2, 'an oversized file is refused (still 2 in the tray)');
check(/too big/i.test(await page.locator('[data-file-tray]').innerText()), 'and the tray says so');

// Download hands the file over.
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.locator('[data-tray-download]').last().click(),
]);
check(!!dl, 'the download button hands the file over');

// ── The same tray on the TV, read-only but alive ──
const tv = await ctx.newPage();
await tv.goto('http://localhost:5173/tv');
await tv.waitForTimeout(3500);
check(await tv.locator('[data-file-tray]').count() >= 1, 'the tray shows on the TV');
check(await tv.locator('[data-tray-drop]').count() === 0, 'the TV has no upload zone — it receives');
check(await tv.locator('[data-tray-download]').count() >= 1, 'but its download buttons are live');

// ── The refresh keeps full screen ──
await tv.evaluate(() => { window.__stayed = true; });
await tv.locator('[data-tv-refresh]').click();
await tv.waitForTimeout(1200);
const stayed = await tv.evaluate(() => !!window.__stayed);
check(stayed, 'refresh with no new build stays on the page (no reload)');
check(await tv.locator('[data-refresh-note]').count() === 1, 'and says the data was refreshed');

// After a REAL reload, the one-tap restore overlay shows and clears on a tap.
await tv.evaluate(() => sessionStorage.setItem('tv_refullscreen', '1'));
await tv.reload();
await tv.waitForTimeout(2500);
check(await tv.locator('[data-refullscreen]').count() === 1, 'after a reload, the back-to-full-screen tap overlay shows');
await tv.mouse.click(600, 500);
await tv.waitForTimeout(400);
check(await tv.locator('[data-refullscreen]').count() === 0, 'one tap clears it');

await page.screenshot({ path: `${SCRATCH}/filetray.png` });
await tv.screenshot({ path: `${SCRATCH}/filetray-tv.png` });
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
