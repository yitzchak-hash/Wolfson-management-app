// The server's planRead branch, offline (owner, 2026-10-05: "If there's no
// phone number and there's no address, it should be empty"). Both model
// providers are stubbed at the HTTP layer — OpenAI's chat endpoint and
// Anthropic's messages endpoint — so the prompt, the request and the parsing
// of the answer all run for real:
//  · the prompt forbids invention, makes null a real answer and asks for a box;
//  · {value, box} answers come back as values plus fraction boxes; the old
//    bare-string shape still parses; percentages are scaled; pixels and
//    slivers are not boxes;
//  · sample numbers, the office's numbers and the office's addresses are
//    refused; "null"/"N/A" written as text is nothing;
//  · on a SCAN (no text layer to check against) a value without a box is
//    dropped — but never on a crop, where the user's box is the location.
//   node scratchpad/planread-test.mjs
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

process.env.API_KEY = 'testkey';
process.env.OPENAI_API_KEY = 'sk-test';
delete process.env.ANTHROPIC_API_KEY;

let answer = '{}';
let lastOpenAi = null, lastAnthropic = null;
const refuse = new Set();   // models the stubbed account cannot use
let asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url instanceof Request ? url.url : url);
  if (u.startsWith('https://api.openai.com/v1/chat/completions')) {
    lastOpenAi = JSON.parse(init.body);
    asked.push(lastOpenAi.model);
    if (refuse.has(lastOpenAi.model)) {
      return new Response(JSON.stringify({ error: { message: `The model ${lastOpenAi.model} does not exist`, code: 'model_not_found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    lastAnthropic = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: lastAnthropic.model,
      content: [{ type: 'text', text: answer }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'request-id': 'req_test' } });
  }
  return realFetch(url, init);
};

const { default: handler } = await import('../api/geocode.js');
const IMG = 'data:image/jpeg;base64,' + Buffer.from('a picture of a plan').toString('base64');
function call(planRead, headers = { 'x-api-key': 'testkey' }) {
  return new Promise(resolve => {
    const res = {
      headers: {}, code: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o }); },
      end() { resolve({ code: this.code }); },
    };
    handler({ method: 'POST', headers, query: {}, body: { planRead } }, res);
  });
}
const ask = async (ans, extra = {}) => { answer = typeof ans === 'string' ? ans : JSON.stringify(ans); return (await call({ image: IMG, want: 'both', crop: false, ...extra })).body; };

// ── Guards ──────────────────────────────────────────────────────────────────
let r = await call({ image: IMG, want: 'both' }, {});
check(r.code === 401, 'no app key → 401', String(r.code));
delete process.env.OPENAI_API_KEY;
r = await call({ image: IMG, want: 'both' });
check(r.code === 501, 'no model key → 501 (the browser stands the reader down)', String(r.code));
process.env.OPENAI_API_KEY = 'sk-test';

// ── The prompt ──────────────────────────────────────────────────────────────
await ask({ address: null, phone: null, family: null });
const prompt = lastOpenAi?.messages?.[0]?.content?.find(c => c.type === 'text')?.text ?? '';
check(/NEVER invent/.test(prompt) && /return null/.test(prompt) && /054-1234567/.test(prompt),
  'the prompt forbids invention, makes null a real answer and names the classic sample number');
check(/"box"/.test(prompt) && /\[left, top, right, bottom\]/.test(prompt), 'the prompt asks for a box per value, as fractions');
check(/Nachal Kidron/.test(prompt) && /Azrieli Sarona/.test(prompt) && /02-628-8282/.test(prompt),
  'the prompt names the office lines to ignore');
check(/דירה 12/.test(prompt) && /NOT an address/.test(prompt), 'the prompt says a flat or floor number is not an address');

// ── Answers ─────────────────────────────────────────────────────────────────
let b = await ask({ address: null, phone: null, family: null });
check(b.address === '' && b.phone === '' && b.family === '' && b.addressBox === null && b.phoneBox === null,
  'null answers are nothing — no values, no boxes', JSON.stringify(b));

b = await ask({
  address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] },
  phone: { value: '052-748-3916', box: [0.8, 0.2, 0.9, 0.23] },
  family: 'Peretz',
});
check(b.address === 'הגפן 7, אפרת' && b.phone === '052-748-3916' && b.family === 'Peretz', 'values come back as printed');
check(JSON.stringify(b.addressBox) === JSON.stringify({ x0: 0.81, y0: 0.16, x1: 0.92, y1: 0.2 })
  && JSON.stringify(b.phoneBox) === JSON.stringify({ x0: 0.8, y0: 0.2, x1: 0.9, y1: 0.23 }),
  'each value comes back with its box', JSON.stringify([b.addressBox, b.phoneBox]));

b = await ask({ address: { value: 'הגפן 7, אפרת', box: [81, 16, 92, 20] }, phone: null });
check(JSON.stringify(b.addressBox) === JSON.stringify({ x0: 0.81, y0: 0.16, x1: 0.92, y1: 0.2 }), 'a box in percentages is scaled', JSON.stringify(b.addressBox));
b = await ask({ address: { value: 'הגפן 7, אפרת', box: { x: 0.81, y: 0.16, w: 0.11, h: 0.04 } } });
check(!!b.addressBox && Math.abs(b.addressBox.x1 - 0.92) < 1e-6 && Math.abs(b.addressBox.y1 - 0.2) < 1e-6, 'a box as x/y/w/h is understood', JSON.stringify(b.addressBox));
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.92, 0.2, 0.81, 0.16] } });
check(!!b.addressBox && b.addressBox.x0 === 0.81 && b.addressBox.y1 === 0.2, 'a box given corner-reversed is put in order', JSON.stringify(b.addressBox));
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [1300, 200, 1480, 240] } });
check(b.address === 'הגפן 7, אפרת' && b.addressBox === null, 'pixels are not a box (the picture\'s size is not known here)', JSON.stringify(b.addressBox));
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.5, 0.5, 0.5005, 0.6] } });
check(b.addressBox === null, 'a sliver is not a box');

b = await ask({ address: 'הגפן 7, אפרת', phone: '052-748-3916', family: '' });
check(b.address === 'הגפן 7, אפרת' && b.phone === '052-748-3916' && b.addressBox === null,
  'the old bare-string answer still parses (no boxes)');
b = await ask({ address: 'הגפן 7, אפרת', phone: '052-748-3916', addressBox: [0.81, 0.16, 0.92, 0.2] });
check(!!b.addressBox && b.addressBox.x0 === 0.81, 'a box placed BESIDE the value (the response shape mirrored) is read too');
b = await ask('```json\n{"address":{"value":"הגפן 7, אפרת","box":[0.81,0.16,0.92,0.2]},"phone":null,"family":null}\n```');
check(b.address === 'הגפן 7, אפרת', 'a code-fenced answer is read');
b = await ask({ address: 'null', phone: 'N/A', family: 'unknown' });
check(b.address === '' && b.phone === '' && b.family === '', '"null", "N/A", "unknown" written as text are nothing', JSON.stringify(b));

// ── Refusals ────────────────────────────────────────────────────────────────
for (const p of ['054-1234567', '050-0000000', '123-4567', '+972-54-123-4567', '052-765-4321']) {
  b = await ask({ phone: { value: p, box: [0.8, 0.2, 0.9, 0.23] } });
  check(b.phone === '' && b.phoneBox === null, `the sample number ${p} is refused, box and all`);
}
for (const p of ['02-628-8282', '(02) 6288282', '+972-3-720-8000']) {
  b = await ask({ phone: { value: p, box: [0.8, 0.2, 0.9, 0.23] } });
  check(b.phone === '', `the office number ${p} is refused`);
}
for (const a of ['9 Nachal Kidron, Beit Shemesh', 'Azrieli Sarona Tower, Tel Aviv', '121 Derech Menachem Begin', 'נחל קדרון 9, בית שמש']) {
  b = await ask({ address: { value: a, box: [0.1, 0.9, 0.3, 0.93] } });
  check(b.address === '' && b.addressBox === null, `the office address "${a}" is refused`);
}
b = await ask({ phone: { value: '054-566-4688', box: [0.8, 0.2, 0.9, 0.23] } });
check(b.phone === '054-566-4688', 'a real mobile is kept');
b = await ask({ phone: { value: '050-312-3456', box: [0.8, 0.2, 0.9, 0.23] } });
check(b.phone === '050-312-3456', 'a real number holding a run of six is kept (only a whole run of seven is a sample)');
b = await ask({ address: { value: 'נחל קדרון 14, בית שמש', box: [0.1, 0.9, 0.3, 0.93] } });
check(b.address === 'נחל קדרון 14, בית שמש', 'a customer on the office\'s street, at another number, is kept');

// ── Scans: the box is the proof ─────────────────────────────────────────────
b = await ask({ address: 'הגפן 7, אפרת', phone: { value: '052-748-3916', box: [0.8, 0.2, 0.9, 0.23] } }, { scan: true });
check(b.address === '' && b.phone === '052-748-3916', 'on a scan, a value without a box is dropped; one with a box is kept', JSON.stringify(b));
b = await ask({ address: 'הגפן 7, אפרת' }, { scan: true, crop: true });
check(b.address === 'הגפן 7, אפרת', 'a CROP is never held to that — the user\'s box is the location');

// ── The Anthropic branch, the same rules ────────────────────────────────────
// ── The OpenAI key, a stronger model with reasoning (owner, 2026-10-08) ─────
asked = [];
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null });
check(asked[0] === 'gpt-6.1-sol' && lastOpenAi?.reasoning_effort === 'high' && !('temperature' in lastOpenAi),
  'the strongest reasoning model is asked first, at high effort, with no temperature', JSON.stringify({ asked, effort: lastOpenAi?.reasoning_effort }));
check(b.address === 'הגפן 7, אפרת' && b.model === 'gpt-6.1-sol', 'and its answer comes back, naming the model', b.model);
check(lastOpenAi?.messages?.[0]?.content?.some(c => c.type === 'image_url'), 'the picture goes with it');
refuse.add('gpt-6.1-sol'); asked = [];
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null });
check(asked.join(',') === 'gpt-6.1-sol,gpt-6-sol' && b.model === 'gpt-6-sol', 'a model the key cannot use falls to the next', asked.join(','));
asked = [];
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null });
check(asked[0] === 'gpt-6-sol', 'and the next call starts where it answered — no wasted round trip', asked.join(','));
refuse.add('gpt-6-sol'); refuse.add('gpt-5.5'); asked = [];
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null });
check(b.model === 'gpt-4o' && lastOpenAi?.temperature === 0 && !('reasoning_effort' in lastOpenAi),
  'with no reasoning model at all the old reader is the floor — never dark', JSON.stringify({ asked, model: b.model }));
refuse.add('gpt-4o');
r = await call({ image: IMG, want: 'both' });
check(r.code === 502 && /gpt-4o/.test(r.body?.error || ''), 'every model refused → an honest 502 naming the last', r.body?.error);
refuse.clear();
process.env.PLAN_READ_MODEL_OPENAI = 'gpt-7-test'; asked = [];
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null });
check(asked[0] === 'gpt-7-test' && b.model === 'gpt-7-test', 'PLAN_READ_MODEL_OPENAI picks the model outright', asked.join(','));
delete process.env.PLAN_READ_MODEL_OPENAI;
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
b = await ask({ address: { value: 'נחלת יצחק 12, בית שמש' }, phone: { value: '054-1234567' } }, { scan: true });
const aPrompt = lastAnthropic?.messages?.[0]?.content?.find(c => c.type === 'text')?.text ?? '';
check(!!lastAnthropic && /NEVER invent/.test(aPrompt) && /"box"/.test(aPrompt), 'the Anthropic branch sends the same prompt');
check(lastAnthropic?.messages?.[0]?.content?.[0]?.type === 'image', 'and the picture with it');
check(b.address === '' && b.phone === '', 'and the same refusals (no box on a scan; a sample number)', JSON.stringify(b));
b = await ask({ address: { value: 'הגפן 7, אפרת', box: [0.81, 0.16, 0.92, 0.2] }, phone: null, family: null });
check(b.address === 'הגפן 7, אפרת' && !!b.addressBox, 'and a real boxed value comes back through it');

globalThis.fetch = realFetch;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
