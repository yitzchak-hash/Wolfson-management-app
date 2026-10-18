// Translation follows the TEXT, never the screen (owner, 2026-10-18: "If he
// types in Russian even though he's on the English UI, then it should just
// translate"). A worker whose portal is set to ENGLISH types and speaks
// Russian:
//  - the office reads his Russian translated into its own language;
//  - he reads his own Russian exactly as he wrote it (message and memo);
//  - the dictation mic learns his speaking language from what he types, its
//    chip ([data-dictate-lang]) shows it and switches it, and it is kept;
//  - a memo's transcription request forces no language.
//
// Needs a dev server with VITE_DRIVE_API_KEY=testkey (APP, default 5178).
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5178';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const today = new Date().toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// A tiny "recording" — the bytes do not matter, the transcriber is stubbed.
const MEMO = 'data:audio/webm;base64,' + Buffer.from('fake-webm-bytes-for-the-probe').toString('base64');

function seed(ctx) {
  return ctx.addInitScript(({ today, MEMO }) => {
    // The browser's speech recognition, stubbed: records the language asked for.
    window.__recLangs = [];
    class FakeRec {
      start() {
        window.__recLangs.push(this.lang);
        setTimeout(() => {
          const r = [{ transcript: 'тест' }]; r.isFinal = true;
          this.onresult?.({ results: [r] }); this.onend?.();
        }, 60);
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    window.webkitSpeechRecognition = FakeRec;
    window.SpeechRecognition = FakeRec;
    localStorage.setItem('active_project', localStorage.getItem('active_project') || 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const max = { id: 'C-mx', name: 'Max', email: '', category: 'ac', token: 'tok-mx', active: true,
      photosOptional: true, createdAt: '2026-01-01', lang: 'en' };
    const job = { id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Testfam', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null,
      stageDates: {}, canvasX: 300, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' };
    const note = (id, text, authorType, authorName, at, extra = {}) => ({
      id, assignmentId: 'T-1', apartmentId: 'G-1', contractorId: 'C-mx', text, authorType, authorName, createdAt: at, ...extra });
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: [], contractors: [max],
      apartments: [job],
      contractorAssignments: [{
        id: 'T-1', contractorId: 'C-mx', apartmentId: 'G-1', buildingId: 'G',
        taskDescription: 'Hang the unit in the bedroom', stageId: null, dueDate: today,
        priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther',
      }],
      contractorNotes: [
        note('N-off', 'Please finish by Friday', 'office', 'Esther', '2026-09-01T09:00:00.000Z'),
        note('N-ru', 'Готово, установил блок в спальне', 'contractor', 'Max', '2026-09-01T10:00:00.000Z'),
        note('N-memo', '', 'contractor', 'Max', '2026-09-01T11:00:00.000Z',
          { attachmentDataUrl: MEMO, attachmentFilename: 'voice-memo.webm', attachmentMimeType: 'audio/webm' }),
      ],
      contractorPhotos: [], canvasElements: [],
    }));
  }, { today, MEMO });
}

let translateCalls = [];
let transcribeBodies = [];
async function stub(ctx) {
  await ctx.route('**/api/geocode', async route => {
    const body = route.request().postDataJSON();
    if (body?.translate) {
      translateCalls.push({ target: body.translate.target, texts: body.translate.items.map(i => i.text) });
      return route.fulfill({ json: { items: body.translate.items.map(it => ({ id: it.id, text: `[${body.translate.target}] ${it.text}` })) } });
    }
    if (body?.transcribe) {
      transcribeBodies.push(body.transcribe);
      return route.fulfill({ json: { text: 'Сделал проводку в спальне' } });
    }
    return route.fulfill({ json: { found: false } });
  });
  await ctx.route('**/api/drive-files', r => r.fulfill({ json: { files: [] } }));
  await ctx.route('**/api/share', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
}

async function openTask(page) {
  await page.locator('button', { hasText: /^All$/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Hang the unit")').first().click();
  await page.waitForTimeout(1500);
  // The composer opens on "Send to the office".
  const send = page.locator('[data-send-office]').first();
  if (await send.count()) { await send.click(); await page.waitForTimeout(400); }
}

// ── 1 · the worker, English screen, Russian hands ───────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx); await stub(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/tok-mx`);
  await page.waitForTimeout(3000);
  await page.locator('text=My Tasks').first().waitFor({ timeout: 20000 }).catch(() => {});
  check((await page.locator('text=My Tasks').count()) >= 1, 'the portal opens in English, as he set it',
    (await page.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | '));
  await openTask(page);

  const own = page.locator('[data-thread-text]', { hasText: 'Готово' }).first();
  check(await own.count() === 1 && await own.locator('[data-translate-toggle]').count() === 0
    && !(await own.innerText()).includes('[en]'), 'his own Russian message is left exactly as he wrote it', await own.innerText().catch(() => ''));
  const memoWords = page.locator('[data-memo-transcript]').first();
  await memoWords.waitFor({ timeout: 6000 }).catch(() => {});
  const mw = await memoWords.innerText().catch(() => '');
  check(mw.includes('Сделал проводку') && !mw.includes('[en]'), 'his own memo\'s words read in Russian, untranslated', mw);
  check(transcribeBodies.length >= 1, 'the memo was sent to be transcribed', String(transcribeBodies.length));
  check(transcribeBodies.every(t => !('language' in t) && !('lang' in t) && !('prompt' in t)),
    'the transcription request forces no language', JSON.stringify(transcribeBodies.map(t => Object.keys(t))));
  check(!translateCalls.some(c => c.texts.some(t => /Готово|Сделал/.test(t))),
    'nothing he wrote was sent to be translated for him', JSON.stringify(translateCalls));
  const off = page.locator('[data-thread-text]', { hasText: 'Please finish' }).first();
  check(await off.locator('[data-translate-toggle]').count() === 0, 'the office\'s English reads as English on his English screen');

  // The dictation chip.
  const box = page.locator('[data-thread-composer] [data-composer-input]').first();
  const chip = page.locator('[data-thread-composer] [data-dictate-lang]').first();
  check(await chip.count() === 1, 'a language chip sits beside the dictation mic');
  check(await chip.getAttribute('data-dictate-lang') === 'en', 'before he types, it is the screen\'s language', await chip.getAttribute('data-dictate-lang'));
  await box.click();
  await box.pressSequentially('привет офис', { delay: 15 });
  await page.waitForTimeout(200);
  check(await chip.getAttribute('data-dictate-lang') === 'ru' && (await chip.innerText()).trim() === 'RU',
    'typing Russian once turns the chip to RU', await chip.getAttribute('data-dictate-lang'));
  await page.locator('[data-thread-composer] [data-composer-dictate]').first().click();
  await page.waitForTimeout(300);
  let langs = await page.evaluate(() => window.__recLangs);
  check(langs.at(-1) === 'ru-RU', 'the mic now listens in Russian on the English screen', JSON.stringify(langs));
  await chip.click();
  await page.waitForTimeout(150);
  check(await chip.getAttribute('data-dictate-lang') === 'en', 'one press switches it (RU → EN)');
  await page.locator('[data-thread-composer] [data-composer-dictate]').first().click();
  await page.waitForTimeout(300);
  langs = await page.evaluate(() => window.__recLangs);
  check(langs.at(-1) === 'en-US', 'and the mic follows the chip', JSON.stringify(langs));
  await chip.click(); await page.waitForTimeout(100);
  await chip.click(); await page.waitForTimeout(100);
  check(await chip.getAttribute('data-dictate-lang') === 'ru', 'EN → עב → RU around the cycle');
  check(await page.evaluate(() => localStorage.getItem('speak_lang_c:C-mx')) === 'ru', 'kept for HIM on this device');

  // Send a Russian message — he reads it as he wrote it.
  await box.fill('');
  await box.pressSequentially('Завтра приду в восемь', { delay: 10 });
  await page.locator('[data-thread-composer] [data-composer-send]').first().click();
  await page.waitForTimeout(800);
  const sent = page.locator('[data-thread-text]', { hasText: 'Завтра' }).first();
  check(await sent.count() === 1 && await sent.locator('[data-translate-toggle]').count() === 0,
    'the Russian he just sent shows untouched on his English screen');

  // Remembered across a reload.
  await page.reload();
  await page.waitForTimeout(2500);
  await openTask(page);
  check(await page.locator('[data-thread-composer] [data-dictate-lang]').first().getAttribute('data-dictate-lang') === 'ru',
    'after a reload the chip still says RU');
  await ctx.close();
}

// ── 2 · the office reads his Russian in English ─────────────────────────────
{
  translateCalls = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx); await stub(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(2800);
  await page.locator('[data-node-id="G-1"]').dblclick();
  await page.waitForTimeout(1200);
  await page.locator('button', { hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(1800);
  const ru = page.locator('[data-thread-text]', { hasText: /Готово/ }).first();
  check((await ru.innerText()).includes('[en] Готово') && await ru.locator('[data-translate-toggle]').count() === 1,
    'the office reads the worker\'s Russian in English, though his screen is English too', await ru.innerText());
  const mw = await page.locator('[data-memo-transcript]').first().innerText().catch(() => '');
  check(mw.includes('[en] Сделал проводку'), 'and his memo\'s words in English', mw);
  check(translateCalls.every(c => c.target === 'en'), 'every request asks for the OFFICE\'s language', JSON.stringify(translateCalls.map(c => c.target)));
  const off = page.locator('[data-thread-text]', { hasText: 'Please finish' }).first();
  check(await off.locator('[data-translate-toggle]').count() === 0, 'the office\'s own English is left alone');
  check(await page.locator('[data-thread-composer] [data-dictate-lang]').first().getAttribute('data-dictate-lang').catch(() => null) !== 'ru',
    'the office\'s chip is the office user\'s own, not the worker\'s');
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
