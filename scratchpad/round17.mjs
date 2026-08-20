// The group's canvas controls, the TikTok reel, and the plan file filter.
//
// The plan-bar layout is checked by `planlayers.mjs`, which already builds a
// real PDF and opens the drawer's pane; this covers the three that do not need
// one, plus the file-type rule, which is pure and worth testing offline
// because a list of extensions is exactly the kind of thing that rots quietly.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    // Enough jobs that the group's grid is WIDER than its window — with six
    // the content fitted, there was nothing to pan to, and "the drag did
    // nothing" was true of the harness rather than of the app.
    stages: [], apartments: Array.from({ length: 16 }, (_, i) => ({
      id: `G-t${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Group job ${i}`, address: 'Somewhere 1',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, boardBin: 'CE-bin-g', binnedAt: '2026-01-01',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      { id: 'CE-bin-g', type: 'bin', x: 260, y: 140, w: 178, h: 92, text: 'A group', color: '#64748b' },
      // A note far to the right INSIDE the group. Sixteen tiles lay out four
      // across — 928px, which still fits a 1080px window — so the surface had
      // nothing to scroll and the drag genuinely had nowhere to go.
      { id: 'CE-gwide', type: 'note', x: 1700, y: 40, w: 200, h: 140,
        text: 'far', color: '#dbeafe', board: 'CE-bin-g' },
      // A TikTok reel in a deliberately WIDE box, so a frame stretched to the
      // box and a frame fitted to the video are obviously different shapes.
      { id: 'CE-tok', type: 'widget', widget: 'tiktok',
        x: 620, y: 140, w: 520, h: 300, text: '', color: '#ffffff',
        data: { links: 'https://www.tiktok.com/@someone/video/6718335390845095173' } },
    ],
  }));
});
// The container has no internet; the embed must not hold the page up.
await ctx.route('**://www.tiktok.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' }));

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3400);

// ── 1. Only files that open become chips ──────────────────────────────────
// Pure, so it is asked directly. A .dwg commonly arrives from Drive as
// `image/vnd.dwg`, which is what sailed through the old `image/*` test.
{
  const out = await page.evaluate(async () => {
    const m = await import('/src/data/driveApi.ts');
    const f = (name, mimeType) => ({ name, mimeType });
    return {
      pdf: m.isViewableFile(f('Frielich.pdf', 'application/pdf')),
      png: m.isViewableFile(f('riser.png', 'image/png')),
      jpg: m.isViewableFile(f('site photo.JPG', 'image/jpeg')),
      // The one from the screenshot.
      dwgAsImage: m.isViewableFile(f('Frielich לאדריכלית.dwg', 'image/vnd.dwg')),
      dwgAsBlob: m.isViewableFile(f('plan.dwg', 'application/octet-stream')),
      dxf: m.isViewableFile(f('plan.dxf', 'application/dxf')),
      zip: m.isViewableFile(f('everything.zip', 'application/zip')),
      // Images a browser cannot draw are not files that open.
      heic: m.isViewableFile(f('IMG_2201.heic', 'image/heic')),
      tiff: m.isViewableFile(f('scan.tif', 'image/tiff')),
      // No extension at all: the mime is all there is.
      bareImage: m.isViewableFile(f('screenshot', 'image/png')),
      bareDwg: m.isViewableFile(f('drawing', 'image/vnd.dwg')),
    };
  });
  console.log('       file rule:', JSON.stringify(out));
  check(out.pdf && out.png && out.jpg, 'PDFs and real pictures are offered');
  check(!out.dwgAsImage, 'a .dwg wearing an image mime is NOT offered');
  check(!out.dwgAsBlob && !out.dxf && !out.zip, 'nor is any other CAD or archive file');
  check(!out.heic && !out.tiff, 'nor an image a browser cannot draw');
  check(out.bareImage && !out.bareDwg, 'and with no extension, the mime decides');
}

// ── 2. A group's canvas drags like the board's ────────────────────────────
{
  const bin = await page.$('[data-node-id="CE-bin-g"]');
  check(!!bin, 'the group is on the board');
  if (bin) {
    const bb = await bin.boundingBox();
    await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(1100);

    const scroller = '.bin-window-in .absolute.inset-0.overflow-auto';
    const scrollNow = () => page.evaluate(sel => {
      const el = document.querySelector(sel);
      return el ? { x: Math.round(el.scrollLeft), y: Math.round(el.scrollTop), max: el.scrollWidth - el.clientWidth } : null;
    }, scroller);

    const start = await scrollNow();
    check(!!start && start.max > 100, 'the group has somewhere to pan to', JSON.stringify(start));

    /**
     * An empty patch of surface — found by ASKING, not by guessing a corner.
     *
     * The first version took the scroller's bottom-right, which is where the
     * group's overview panel sits: the press landed on the chrome and the test
     * reported a working drag as broken. `elementFromPoint` settles it.
     */
    const spot = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      for (let fy = 0.9; fy > 0.25; fy -= 0.06) {
        for (let fx = 0.15; fx < 0.9; fx += 0.06) {
          const x = r.x + r.width * fx, y = r.y + r.height * fy;
          const at = document.elementFromPoint(x, y);
          if (at && at.dataset && at.dataset.binSurface) return { x, y };
        }
      }
      return null;
    }, scroller);
    check(!!spot, 'there is empty surface to press on');
    if (!spot) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }

    // A PLAIN LEFT DRAG. This is the whole point: it used to do nothing.
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x - 220, spot.y - 40, { steps: 12 });
    await page.waitForTimeout(150);
    const during = await scrollNow();
    await page.mouse.up();
    await page.waitForTimeout(300);

    console.log('       group scroll:', JSON.stringify({ start, during }));
    check(during.x > start.x + 40, 'a plain left-drag on empty surface moves the board',
      `${start.x} → ${during.x}`);

    // Nothing was dragged instead of the board.
    const moved = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('general_app_data'));
      return (d.apartments ?? []).filter(a => a.binX !== undefined).length;
    });
    check(moved === 0, 'and no job was dragged by mistake', `${moved} moved`);

    // Ctrl still lassoes rather than panning.
    const before = await scrollNow();
    await page.keyboard.down('Control');
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x - 150, spot.y - 60, { steps: 8 });
    await page.waitForTimeout(120);
    const lassoOn = await page.evaluate(() =>
      !!document.querySelector('.bin-window-in [style*="rgba(74, 168, 216"]'));
    const midScroll = await scrollNow();
    await page.mouse.up();
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    check(lassoOn, 'Ctrl+drag still draws a selection box');
    check(midScroll.x === before.x, 'and does not move the board while it does',
      `${before.x} → ${midScroll.x}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

// ── 3. The reel fits its box, and play asks the player to start ───────────
{
  const shape = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-tok"]');
    const f = n?.querySelector('iframe');
    if (!f) return null;
    const fr = f.getBoundingClientRect();
    const holder = f.parentElement.getBoundingClientRect();
    return {
      fw: Math.round(fr.width), fh: Math.round(fr.height),
      bw: Math.round(holder.width), bh: Math.round(holder.height),
      src: f.getAttribute('src') ?? '',
    };
  });
  console.log('       reel:', JSON.stringify(shape));
  check(!!shape, 'the reel drew a player');
  if (shape) {
    check(shape.bw > shape.bh, 'its box is wider than it is tall', `${shape.bw}x${shape.bh}`);
    const ratio = shape.fw / shape.fh;
    check(Math.abs(ratio - 9 / 16) < 0.03,
      'but the video itself is 9:16, fitted to the box', `${ratio.toFixed(3)}`);
    check(shape.fh <= shape.bh + 1 && shape.fw <= shape.bw + 1,
      'and it fits inside rather than overflowing', `${shape.fw}x${shape.fh} in ${shape.bw}x${shape.bh}`);
    check(/autoplay=0/.test(shape.src), 'it does not start on its own by default', shape.src);
  }

  // Pressing play re-mounts the frame asking for autoplay — the only lever
  // there is on a third-party player.
  const play = await page.$('[data-node-id="CE-tok"] button[title="Play this one"]');
  check(!!play, 'there is a play button for the video itself');
  if (play) {
    await play.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() =>
      document.querySelector('[data-node-id="CE-tok"] iframe')?.getAttribute('src') ?? '');
    check(/autoplay=1/.test(after), 'and pressing it asks the player to play', after);
  }

  // The setting is offered in the pencil.
  const fields = await page.evaluate(async () => {
    const m = await import('/src/data/widgetFields.ts');
    return (m.WIDGET_FIELDS.tiktok ?? []).map(f => f.key);
  });
  console.log('       tiktok settings:', JSON.stringify(fields));
  check(fields.includes('autoplay'), 'autoplay is a setting');
  check(fields.includes('fill'), 'and so is how it fits the box');
}

await page.screenshot({ path: 'scratchpad/round17.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
