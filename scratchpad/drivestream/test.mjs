// Offline test of /api/drive-fetch's streaming GET (Range → 206) against a fake Drive.
// Run: node --import ./scratchpad/drivestream/register.mjs scratchpad/drivestream/test.mjs
import { PassThrough } from 'node:stream';
process.env.API_KEY = 'K'; process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{}';
const mod = await import(new URL('../../api/drive-fetch.js', import.meta.url).href);
function fakeRes() {
  const r = new PassThrough(); const chunks = []; r.on('data', c => chunks.push(c));
  r.statusCode = 200; r.headers = {}; r.headersSent = false;
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.statusCode = c; return r; };
  r.json = o => { r.body = o; r.headersSent = true; r.end(); return r; };
  const end0 = r.end.bind(r); r.end = (...a) => { r.headersSent = true; return end0(...a); };
  r.done = new Promise(res => r.on('finish', () => res(Buffer.concat(chunks))));
  return r;
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
{ const res = fakeRes(); await mod.default({ method: 'GET', query: { id: 'F', k: 'K' }, headers: { range: 'bytes=100-199' }, url: '/api/drive-fetch?id=F&k=K' }, res); const body = await res.done;
  ok(res.statusCode === 206, 'range → 206'); ok(res.headers['content-range'] === 'bytes 100-199/1000', 'content-range passed'); ok(body.length === 100, 'body 100 bytes ' + body.length); ok(res.headers['accept-ranges'] === 'bytes', 'accept-ranges'); ok(res.headers['content-type'] === 'video/mp4', 'type'); }
{ const res = fakeRes(); await mod.default({ method: 'GET', query: { id: 'F', k: 'K' }, headers: {}, url: '/x' }, res); const body = await res.done;
  ok(res.statusCode === 200, 'no range → 200'); ok(body.length === 1000, 'full body'); ok(res.headers['content-length'] === '1000', 'length'); }
{ const res = fakeRes(); await mod.default({ method: 'GET', query: { id: 'F', k: 'nope' }, headers: {}, url: '/x' }, res); await res.done;
  ok(res.statusCode === 401, 'wrong key → 401'); }
{ const res = fakeRes(); await mod.default({ method: 'GET', headers: {}, url: '/api/drive-fetch?id=F&k=K' }, res); const body = await res.done;
  ok(res.statusCode === 200 && body.length === 1000, 'query parsed from url when req.query absent'); }
{ const res = fakeRes(); await mod.default({ method: 'POST', body: { fileId: 'F' }, headers: { 'x-api-key': 'K' }, url: '/x' }, res); const body = await res.done;
  ok(body.length === 1000, 'POST path unchanged'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
