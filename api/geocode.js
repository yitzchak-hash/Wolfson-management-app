/**
 * Turn a typed address into a coordinate.
 *
 * This has to go through the server rather than straight from the browser for
 * one reason: OpenStreetMap's geocoder requires a request to identify itself
 * with a real User-Agent, and a browser will not let a page set that header.
 * Requests from the page are therefore refused, or rate-limited to nothing, in
 * a way that looks from the app like the address is simply not findable.
 *
 * There is no key and no secret here, so unlike the Drive routes this one does
 * not demand `x-api-key` — locking it would only mean the map stops working on
 * any deployment where the key has not been set, in exchange for guarding a
 * public lookup anybody can make themselves.
 *
 * Two caches, for two different reasons:
 *  - the in-memory one stops the same address being looked up twice while a
 *    board with forty jobs on it settles;
 *  - the caller stores its own results permanently, so a warm board makes no
 *    requests at all.
 */

import Anthropic from '@anthropic-ai/sdk';

const CACHE = new Map();
const CACHE_MAX = 500;

/**
 * THE TRANSLATOR lives in this file too — POST /api/geocode with a
 * `translate` body. Vercel's Hobby plan allows 12 serverless functions and
 * every file under /api is one (see CLAUDE.md), so a new route has to fold
 * into an existing file; this one was already the shared "small lookups"
 * route (geocoding, the health report).
 *
 * Unlike the geocoder, the translate branch IS key-guarded: every call spends
 * the owner's Anthropic credit, so a request must carry the app's shared
 * `x-api-key`. With neither ANTHROPIC_API_KEY nor OPENAI_API_KEY set it answers 501
 * and the app quietly shows originals — a missing key must never read as a
 * broken message thread.
 */
const TR_CACHE = new Map();
const TR_CACHE_MAX = 3000;
const TR_MAX_ITEMS = 40;
const TR_MAX_CHARS = 2500;
const LANG_NAMES = { en: 'English', he: 'Hebrew', ru: 'Russian' };

let anthropic = null;
function client() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

/**
 * THE TRANSCRIBER — POST /api/geocode with a `transcribe` body: every voice
 * memo, whoever recorded it, comes with its words (owner, 2026-09-03). Same
 * folding reason as the translator, same key guard, and the same honest
 * answer without its key: 501, and the memo plays as it always did.
 *
 * The audio reaches the server one of two ways — a Drive file id (the memo
 * was uploaded through the app's backend; the service account reads it back,
 * the drive-fetch route's idiom) or the bytes themselves, base64, for a memo
 * kept locally as a data URL (capped small by LOCAL_MEMO_LIMIT). OpenAI's
 * gpt-4o-transcribe detects the language itself, so Russian, Hebrew and
 * English all come back as written.
 */
const TS_CACHE = new Map();
const TS_CACHE_MAX = 800;
const TS_MAX_BYTES = 12 * 1024 * 1024;

async function driveBytes(fileId) {
  const { google } = await import('googleapis');
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(json), scopes: ['https://www.googleapis.com/auth/drive'] });
  const drive = google.drive({ version: 'v3', auth });
  const meta = await drive.files.get({ fileId, fields: 'mimeType,name,size', supportsAllDrives: true });
  if (Number(meta.data.size || 0) > TS_MAX_BYTES) throw new Error('recording too large to transcribe');
  const r = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  return { bytes: Buffer.from(r.data), mime: meta.data.mimeType || 'audio/webm', name: meta.data.name || 'memo.webm' };
}

async function transcribe(req, res, body) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: 'Transcription is not configured (OPENAI_API_KEY missing)' });
  }
  const fileId = body.driveFileId ? String(body.driveFileId) : '';
  const cacheKey = fileId ? `d:${fileId}` : '';
  if (cacheKey && TS_CACHE.has(cacheKey)) return res.status(200).json({ text: TS_CACHE.get(cacheKey), cached: true });
  try {
    let audio;
    if (fileId) audio = await driveBytes(fileId);
    else if (body.audio) {
      const bytes = Buffer.from(String(body.audio), 'base64');
      if (bytes.length > TS_MAX_BYTES) return res.status(413).json({ error: 'recording too large' });
      audio = { bytes, mime: String(body.mime || 'audio/webm'), name: String(body.filename || 'memo.webm') };
    } else return res.status(400).json({ error: 'Nothing to transcribe' });

    const form = new FormData();
    form.append('file', new Blob([audio.bytes], { type: audio.mime }), audio.name);
    form.append('model', process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe');
    form.append('response_format', 'json');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: `transcriber returned ${r.status}`, detail: detail.slice(0, 300) });
    }
    const data = await r.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (cacheKey) {
      if (TS_CACHE.size >= TS_CACHE_MAX) TS_CACHE.delete(TS_CACHE.keys().next().value);
      TS_CACHE.set(cacheKey, text);
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

async function translate(req, res, body) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ONE key is enough (owner, 2026-09-06): the transcription model only
  // writes down what was said, in the language it was said in — OpenAI's
  // own translation endpoint goes to English only — so turning a message
  // into the READER's language is a second call, and the same OpenAI key
  // makes it through a chat model. An Anthropic key, when present, is used
  // first; without either the branch answers 501 and the client stands down.
  const viaAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!viaAnthropic && !process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: 'Translation is not configured (OPENAI_API_KEY or ANTHROPIC_API_KEY missing)' });
  }
  const target = String(body.target || '');
  if (!LANG_NAMES[target]) return res.status(400).json({ error: 'Unknown target language' });
  const items = Array.isArray(body.items) ? body.items.slice(0, TR_MAX_ITEMS) : [];
  const clean = items
    .map(it => ({ id: String(it?.id ?? ''), text: String(it?.text ?? '').slice(0, TR_MAX_CHARS) }))
    .filter(it => it.id && it.text.trim());
  if (clean.length === 0) return res.status(400).json({ error: 'Nothing to translate' });

  const out = {};
  const ask = [];
  for (const it of clean) {
    const hit = TR_CACHE.get(`${target}\u0000${it.text}`);
    if (hit !== undefined) out[it.id] = hit; else ask.push(it);
  }

  if (ask.length) {
    try {
      const system =
        `You translate short workplace messages between an HVAC installation office and its site workers. ` +
        `Translate every item's text into ${LANG_NAMES[target]}. Keep the meaning and tone; keep numbers, ` +
        `apartment numbers, names, addresses, dates, times, URLs and units exactly as written. Do not add, ` +
        `explain or summarise. If an item is already in ${LANG_NAMES[target]}, return it unchanged. ` +
        `Answer with JSON only, exactly this shape and nothing else: {"items":[{"id":"…","text":"…"}]}`;
      let text = '';
      if (viaAnthropic) {
        const resp = await client().messages.create({
          model: process.env.TRANSLATE_MODEL || 'claude-opus-5',
          max_tokens: 8000,
          // A translation is not a reasoning task; thinking would only add latency.
          thinking: { type: 'disabled' },
          system,
          messages: [{ role: 'user', content: JSON.stringify({ items: ask }) }],
        });
        for (const block of resp.content) if (block.type === 'text') text += block.text;
      } else {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.TRANSLATE_MODEL_OPENAI || 'gpt-4o-mini',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: JSON.stringify({ items: ask }) },
            ],
          }),
        });
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const data = await r.json();
        text = data?.choices?.[0]?.message?.content ?? '';
      }
      const json = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(json);
      const got = Array.isArray(parsed?.items) ? parsed.items : [];
      for (const g of got) {
        const src = ask.find(a => a.id === String(g?.id));
        if (!src || typeof g?.text !== 'string') continue;
        out[src.id] = g.text;
        if (TR_CACHE.size >= TR_CACHE_MAX) TR_CACHE.delete(TR_CACHE.keys().next().value);
        TR_CACHE.set(`${target}\u0000${src.text}`, g.text);
      }
    } catch (e) {
      return res.status(502).json({ error: String(e?.message || e) });
    }
  }
  return res.status(200).json({ items: clean.map(it => ({ id: it.id, text: out[it.id] ?? null })) });
}

/**
 * THE PLAN READER — POST /api/geocode with a `planRead` body (owner,
 * 2026-09-07: "I want to add an AI API key for the feature that pulls out the
 * client address and phone number, so AI can do it").
 *
 * Takes ONE picture — the plan's first page rendered in the browser, or the
 * crop under a box somebody drew — and asks a vision model for the customer's
 * address, phone and family name as printed in the title block. Key-guarded
 * like the translator (every call spends credit); runs on ANTHROPIC_API_KEY
 * when present, else OPENAI_API_KEY (the same key that transcribes and
 * translates — one key for all three); 501 with neither, and the app keeps
 * its local text-layer reader.
 *
 * NEVER INVENTED (owner, 2026-10-05). On A1-12 — a sheet that prints no
 * customer address and no customer phone — the model answered an address
 * from nowhere and the classic sample number 054-1234567, and the app showed
 * them. So the model is told in so many words that "not printed" is a real
 * and common answer, it must point at every value it returns (a box, as
 * fractions of the picture), and this route refuses sample numbers and the
 * office's own lines outright. The browser then checks every value against
 * the sheet's own text — or, on a scan, against the ink under the box — and
 * offers nothing it cannot show on the sheet (src/data/planAddress.ts).
 */
const OWN_NUMBERS = ['02-628-8282', '026288282', '03-720-8000', '037208000'];
const OFFICE_LINES = 'Beit Shemesh 02-628-8282, 9 Nachal Kidron RBSA; Tel Aviv 03-720-8000, Azrieli Sarona Tower, 121 Derech Menachem Begin';

/** A printed number reduced to bare local digits — +972-54… and 054… compare equal. */
function localDigits(s) {
  let d = String(s).replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4).replace(/^0/, '');
  else if (d.startsWith('972')) d = '0' + d.slice(3).replace(/^0/, '');
  return d.replace(/\D/g, '');
}
/**
 * A SAMPLE number, never a customer's — 054-1234567, 123-4567, 050-0000000:
 * seven digits climbing or falling by one (a whole subscriber part), or six of
 * the same digit, or too short to be a phone at all. The SAME rule as
 * isPlaceholderPhone in src/data/planAddress.ts — change one, change both.
 */
function placeholderPhone(raw) {
  const d = localDigits(raw);
  if (d.length < 7) return true;
  if (/(\d)\1{5,}/.test(d)) return true;
  let up = 1, down = 1;
  for (let i = 1; i < d.length; i++) {
    const a = +d[i - 1], b = +d[i];
    up = b === a + 1 ? up + 1 : 1;
    down = b === a - 1 ? down + 1 : 1;
    if (up >= 7 || down >= 7) return true;
  }
  return false;
}
/** The office's own address lines — the same list as isOfficeAddress in src/data/planAddress.ts. */
const OFFICE_ADDRESS = [
  /\bazrieli\b/i, /עזריאלי/,
  /\bsarona\b/i, /שרונה/,
  /menachem\s+begin\D{0,8}\b121\b|\b121\b\D{0,16}menachem\s+begin/i,
  /מנחם\s+בגין\D{0,8}121|121\D{0,16}מנחם\s+בגין/,
];
/** Streets the office shares with customers: only its own number (or none) is the office. */
const OFFICE_STREETS = [
  { street: /\bna(?:ch|kh|h)al\s*kidron\b|נחל\s*קדרון/i, num: '9' },
  { street: /\bderech\s+menachem\s+begin\b|דרך\s+מנחם\s+בגין/i, num: '121' },
];
const officeAddress = s => OFFICE_ADDRESS.some(re => re.test(s))
  || OFFICE_STREETS.some(({ street, num }) => {
    if (!street.test(s)) return false;
    const nums = String(s).match(/\d+/g) || [];
    return nums.length === 0 || nums.includes(num);
  });
/** What a model writes when it means "nothing" — never a value. */
const NOTHING = /^(null|none|nil|n\/?a|unknown|not (printed|found|available|shown|visible)|empty|-+|—|אין|לא נמצא|לא מופיע)$/i;

/**
 * A box from the model: [left, top, right, bottom] or {x0,y0,x1,y1} /
 * {left,top,right,bottom} / {x,y,w,h}, as fractions of the picture —
 * percentages are accepted and scaled. Ordered, inside the picture, and not
 * a sliver, or null.
 */
function parseBox(b) {
  if (!b) return null;
  let v = null;
  if (Array.isArray(b) && b.length === 4) v = b.map(Number);
  else if (typeof b === 'object') {
    if ('x0' in b) v = [b.x0, b.y0, b.x1, b.y1].map(Number);
    else if ('left' in b) v = [b.left, b.top, b.right, b.bottom].map(Number);
    else if ('x' in b && ('w' in b || 'width' in b)) {
      const w = Number(b.w ?? b.width), h = Number(b.h ?? b.height);
      v = [Number(b.x), Number(b.y), Number(b.x) + w, Number(b.y) + h];
    }
  }
  if (!v || !v.every(Number.isFinite)) return null;
  const top = Math.max(...v);
  if (top > 1.0001) {
    if (top > 100.01) return null;   // pixels: the picture's size is not known here
    v = v.map(n => n / 100);
  }
  let [x0, y0, x1, y1] = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
  if (x0 < -0.01 || y0 < -0.01 || x1 > 1.01 || y1 > 1.01) return null;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return null;
  const r = n => Math.round(n * 10000) / 10000;
  return { x0: r(x0), y0: r(y0), x1: r(x1), y1: r(y1) };
}
/** One answered field — the new {value, box} shape, or the old bare string. */
function fieldOf(raw) {
  if (raw == null) return { value: '', box: null };
  if (typeof raw === 'string' || typeof raw === 'number') return { value: String(raw), box: null };
  if (typeof raw === 'object') {
    return { value: String(raw.value ?? raw.text ?? ''), box: parseBox(raw.box ?? raw.bbox ?? raw.rect ?? null) };
  }
  return { value: '', box: null };
}

function planPrompt(want, crop, detail) {
  return `You read the title block of an HVAC installation plan from Israel (Hebrew and/or English). `
    + (crop
      ? `The picture is a small CROP the user drew around ONE thing. Return ONLY what is written inside it — nothing inferred, nothing from around it. `
      : `The picture is the whole first page. Find the CUSTOMER's details in the title block (usually a column on the right or a strip at the bottom). `)
    + `Copy every value EXACTLY as printed, character for character: Hebrew stays Hebrew, English stays English, digits exactly as they appear. `
    + `NEVER invent, guess, complete or correct anything, and never return a sample or placeholder value such as 054-1234567 or 050-0000000. `
    + `If the customer's address or phone number is not literally printed on the page, return null for it — on many sheets null is the right answer. `
    + `The ADDRESS is the street address of the customer's property (street, house number, city). A building, floor, apartment, plot or unit number on its own (בניין 1, קומה 3, דירה 12) is NOT an address. `
    + `TzviAir's own office details are never the customer's — ignore them wherever they appear: ${OFFICE_LINES}. `
    + `The PHONE is the customer's phone number — never a fax, and never the office numbers ${OWN_NUMBERS.join(', ')}. `
    + (want === 'address' ? `The user wants the ADDRESS. ` : want === 'phone' ? `The user wants the PHONE number. ` : '')
    + `For every value you return, give "box": the tightest rectangle around that printed value, as fractions of the picture, [left, top, right, bottom], where 0,0 is the top-left corner and 1,1 the bottom-right. `
    + (detail ? `A SECOND picture follows: the title-block part of the SAME page (${detail}), enlarged so the small print is readable — read the values from it, but give every box as fractions of the FIRST picture (the whole page). ` : '')
    + `Answer with JSON only, exactly this shape: {"address":{"value":"…","box":[l,t,r,b]} or null,"phone":{"value":"…","box":[l,t,r,b]} or null,"family":"…" or null}. No labels, no trailing punctuation.`;
}
async function planRead(req, res, body) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const viaAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!viaAnthropic && !process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: 'Plan reading is not configured (OPENAI_API_KEY or ANTHROPIC_API_KEY missing)' });
  }
  const image = String(body.image || '');
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return res.status(400).json({ error: 'image must be a PNG/JPEG/WebP data URL' });
  if (m[2].length > 6_000_000) return res.status(413).json({ error: 'image too large' });
  const want = ['address', 'phone', 'both'].includes(body.want) ? body.want : 'both';
  const crop = !!body.crop;
  // The title block, enlarged (owner, 2026-10-08: "the address should usually
  // come from the right side of the sheet") — a whole A1 page squeezed into
  // one picture leaves its small print a few pixels tall.
  const dm = body.detail ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.detail)) : null;
  if (dm && dm[2].length > 6_000_000) return res.status(413).json({ error: 'detail image too large' });
  const detailWhere = dm ? (body.detailWhere === 'bottom' ? 'the bottom strip of the page' : 'the right-hand column of the page') : '';
  // A scan has no text layer the browser can check a value against, so there
  // the box IS the proof: a value the model cannot point at is not returned.
  const scan = !!body.scan && !crop;
  const prompt = planPrompt(want, crop, detailWhere);
  try {
    let text = '';
    if (viaAnthropic) {
      // Owner, 2026-10-08: "It should be AI using Opus 5.5 on high thinking."
      // Reading a Hebrew title block exactly is worth the thinking; the
      // budget is adaptive and the effort high.
      const resp = await client().messages.create({
        model: process.env.PLAN_READ_MODEL || 'claude-opus-5-5',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          ...(dm ? [{ type: 'image', source: { type: 'base64', media_type: dm[1], data: dm[2] } }] : []),
          { type: 'text', text: prompt },
        ] }],
      });
      for (const block of resp.content) if (block.type === 'text') text += block.text;
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Without an Anthropic key: the full vision model, never the mini —
          // the mini could not read a Hebrew title block (the 2026-10-08 sheet).
          model: process.env.PLAN_READ_MODEL_OPENAI || 'gpt-4o',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
            ...(dm ? [{ type: 'image_url', image_url: { url: String(body.detail), detail: 'high' } }] : []),
          ] }],
        }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      text = data?.choices?.[0]?.message?.content ?? '';
    }
    const json = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(json) || {};
    const clean = v => {
      const s = String(v ?? '').replace(/\s+/g, ' ').replace(/^[\s:：\-–—+·,;]+|[\s:：\-–—+·,;]+$/g, '').trim();
      return NOTHING.test(s) ? '' : s;
    };
    const a = fieldOf(parsed.address);
    const p = fieldOf(parsed.phone);
    // A model that mirrors the RESPONSE shape puts the boxes beside the values.
    if (!a.box) a.box = parseBox(parsed.addressBox);
    if (!p.box) p.box = parseBox(parsed.phoneBox);
    let address = clean(a.value);
    let phone = clean(p.value);
    if (address && officeAddress(address)) address = '';
    if (phone && (OWN_NUMBERS.some(n => localDigits(n) === localDigits(phone)) || placeholderPhone(phone))) phone = '';
    if (scan) {
      if (!a.box) address = '';
      if (!p.box) phone = '';
    }
    return res.status(200).json({
      address,
      phone,
      family: clean(fieldOf(parsed.family).value),
      addressBox: address ? a.box : null,
      phoneBox: phone ? p.box : null,
    });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

/**
 * One request per second, queued.
 *
 * The published usage policy is an absolute maximum of one request a second,
 * and exceeding it gets an address — or an IP — blocked rather than throttled.
 * Serialising here means a board that asks for forty addresses at once takes
 * forty seconds and always succeeds, instead of taking two seconds and being
 * refused halfway through.
 */
let chain = Promise.resolve();
/**
 * THE WORKER'S PHONE RINGS — POST /api/geocode with a `push` body (owner,
 * 2026-09-16), folded in here for the same reason as the translator: the
 * 12-function ceiling. The office's browser sends the phones' subscriptions
 * (read from Firestore's `pushSubs`) and the words; this signs each message
 * with the VAPID private key — which only the server holds — and hands it to
 * the push service. Key-guarded like the translator: anybody with the address
 * could otherwise ring every phone. `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
 * in Vercel turn it on (`npx web-push generate-vapid-keys`; the public half
 * also goes in the bundle as VITE_VAPID_PUBLIC_KEY); `VAPID_SUBJECT` is the
 * contact the push services may use, a URL or a mailto — the site's own
 * address by default. Answers `{ sent, gone }`: `gone` lists endpoints the
 * service refused for good (404/410), so the client can forget them.
 */
async function push(req, res, body) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return res.status(501).json({ error: 'Push is not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing)' });
  }
  const subs = Array.isArray(body.subs) ? body.subs.filter(s => s && s.endpoint && s.keys).slice(0, 30) : [];
  if (!subs.length) return res.status(200).json({ sent: 0, gone: [] });
  let webpush;
  try {
    webpush = (await import('web-push')).default;
  } catch {
    return res.status(501).json({ error: 'web-push is not installed on the server' });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://wolfson-management-app.vercel.app', pub, priv);
  const payload = JSON.stringify({
    title: String(body.title || 'TzviAir').slice(0, 80),
    body: String(body.body || '').slice(0, 240),
    url: String(body.url || '/').slice(0, 500),
    tag: body.tag ? String(body.tag).slice(0, 80) : undefined,
  });
  const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload, { TTL: 6 * 3600, urgency: 'high' })));
  const gone = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { sent++; return; }
    const code = r.reason && r.reason.statusCode;
    if (code === 404 || code === 410) gone.push(subs[i].endpoint);
  });
  return res.status(200).json({ sent, gone });
}

function queued(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => new Promise(r => setTimeout(r, 1100)),
    () => new Promise(r => setTimeout(r, 1100)),
  );
  return run;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  /**
   * The old /api/health diagnostic lives here now, as GET /api/geocode?health=1.
   * Vercel's Hobby plan allows at most 12 serverless functions per deployment,
   * and the 13th file under /api silently turned EVERY deployment red while
   * local builds stayed green — so health.js (which nothing in the app calls)
   * gave up its slot. It reports only booleans, never secret values, and this
   * route is already the unauthenticated one.
   */
  if (req.query && req.query.health) {
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    let serviceAccountValid = false;
    let clientEmail = null;
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson);
        serviceAccountValid = !!parsed.private_key && !!parsed.client_email;
        clientEmail = parsed.client_email ?? null;
      } catch { serviceAccountValid = false; }
    }
    return res.status(200).json({
      ok: true,
      hasServiceAccount: !!saJson,
      serviceAccountValid,
      clientEmail,
      hasApiKey: !!process.env.API_KEY,
      hasAiKey: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
      // Which model reads plans — Opus when an Anthropic key is set (owner's ask).
      planReader: process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
      hasPushKeys: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      allowedOrigin: process.env.ALLOWED_ORIGIN || '(not set — defaults to *)',
      vercelEnv: process.env.VERCEL_ENV || '(not set)',
      nodeEnv: process.env.NODE_ENV || '(not set)',
      vercelRegion: process.env.VERCEL_REGION || '(not set)',
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.translate) return translate(req, res, body.translate);
  if (body.transcribe) return transcribe(req, res, body.transcribe);
  if (body.planRead) return planRead(req, res, body.planRead);
  if (body.push) return push(req, res, body.push);
  const raw = String(body.address || '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing address' });

  // Israel is assumed unless the address names somewhere else. Without it
  // "3 Herzl" finds a Herzl street on another continent, which is worse than
  // finding nothing because it looks like an answer.
  const country = String(body.country || 'Israel');
  const q = /israel|ישראל/i.test(raw) ? raw : `${raw}, ${country}`;
  const key = q.toLowerCase();

  if (CACHE.has(key)) {
    return res.status(200).json({ ...CACHE.get(key), cached: true });
  }

  try {
    const out = await queued(async () => {
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&addressdetails=0`;
      const r = await fetch(url, {
        headers: {
          // The identifying agent this whole route exists to be able to send.
          'User-Agent': 'TzviAir-JobBoard/1.0 (internal project management; contact via wolfson-management-app.vercel.app)',
          'Accept-Language': 'he,en',
        },
      });
      if (!r.ok) throw new Error(`geocoder returned ${r.status}`);
      const list = await r.json();
      if (!Array.isArray(list) || list.length === 0) return { found: false };
      const hit = list[0];
      return {
        found: true,
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        label: hit.display_name || q,
      };
    });

    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, out);
    return res.status(200).json(out);
  } catch (e) {
    // A miss and a failure are different things to the caller: a miss is
    // final, a failure is worth trying again later.
    return res.status(502).json({ error: String(e.message || e) });
  }
}
