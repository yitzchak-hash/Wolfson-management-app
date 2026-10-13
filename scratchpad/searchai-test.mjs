// The server's searchAi branch, offline: both providers stubbed at HTTP so the
// prompt, the request and the parsing run for real.
//   node scratchpad/searchai-test.mjs
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
process.env.API_KEY = 'testkey';
delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
let answer = '{"terms":[]}', lastAnthropic = null, lastOpenAi = null, calls = 0;
globalThis.fetch = async (url, init) => {
  const u = String(url instanceof Request ? url.url : url);
  calls++;
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    lastAnthropic = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: lastAnthropic.model,
      content: [{ type: 'text', text: answer }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json', 'request-id': 'r' } });
  }
  if (u.startsWith('https://api.openai.com/v1/chat/completions')) {
    lastOpenAi = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('unexpected ' + u);
};
const { default: handler } = await import('../api/geocode.js');
const call = (searchAi, headers = { 'x-api-key': 'testkey' }) => new Promise(resolve => {
  const res = { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(o) { resolve({ code: this.code, body: o }); }, end() { resolve({ code: this.code }); } };
  handler({ method: 'POST', headers, query: {}, body: { searchAi } }, res);
});
let r = await call({ q: 'itzhak' }, {});
check(r.code === 401, 'no app key → 401');
r = await call({ q: 'itzhak' });
check(r.code === 501, 'no model key → 501 (the button stands down)');
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
answer = '```json\n{"terms":["Yitzchak","יצחק","itzhak","Isaac","a","b","c","d","e","f"]}\n```';
r = await call({ q: 'itzhak' });
check(r.code === 200, 'answers 200 with the key', JSON.stringify(r.body));
check(lastAnthropic?.model === 'claude-opus-5-5', 'asks Opus 5.5 by default', lastAnthropic?.model);
check(lastAnthropic?.thinking?.type === 'disabled', 'no thinking — a rewrite, not a reasoning task');
check(/transliter|English letters/i.test(lastAnthropic?.system ?? '') && /JSON only/.test(lastAnthropic?.system ?? ''), 'the prompt asks for spellings and JSON');
check(lastAnthropic?.messages?.[0]?.content === 'itzhak', 'only the typed words are sent');
check(!r.body.terms.includes('itzhak') && r.body.terms.length === 8, 'the query itself is dropped, at most 8', JSON.stringify(r.body.terms));
const before = calls;
r = await call({ q: 'ITZHAK' });
check(r.body.cached && calls === before, 'a repeat is answered from the cache');
delete process.env.ANTHROPIC_API_KEY; process.env.OPENAI_API_KEY = 'sk-o';
answer = '{"terms":["Zvi","צבי"]}';
r = await call({ q: 'tzvi' });
check(r.code === 200 && lastOpenAi?.model === 'gpt-4o-mini' && r.body.terms.length === 2, 'OpenAI carries it when it is the only key', JSON.stringify(r.body));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
