// The server's push branch, offline: 401 without the key, 501 without VAPID
// keys, and with keys a real signed send — to a local push "service" that
// answers 201 for one phone and 410 for another, so `gone` is proven.
import https from 'node:https';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';

// web-push refuses a plain-http endpoint (a real push service is always TLS),
// so the local "push service" is HTTPS behind a throwaway self-signed cert.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushtest-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj /CN=127.0.0.1 2>/dev/null`);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const srv = https.createServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, (req, res) => {
  const code = req.url.includes('dead') ? 410 : 201;
  req.resume(); req.on('end', () => { res.statusCode = code; res.end(); });
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;

process.env.API_KEY = 'testkey';
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
const { default: handler } = await import('../api/geocode.js');

function call(body, headers = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); }, end() { resolve({ code: this.code }); } };
    handler({ method: 'POST', headers, query: {}, body: { push: body } }, res);
  });
}

const sub = (tag) => {
  // A real P-256 key pair the way a browser mints one, so the encryption step runs for real.
  const keys = webpush.generateVAPIDKeys();
  return { endpoint: `https://127.0.0.1:${port}/${tag}`, keys: { p256dh: keys.publicKey, auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
};

let r = await call({ subs: [sub('a')], title: 'x' }, {});
check(r.code === 401, 'no key → 401', String(r.code));
r = await call({ subs: [sub('a')], title: 'x' }, { 'x-api-key': 'testkey' });
check(r.code === 501, 'no VAPID keys → 501 (honest, never a silent nothing)', String(r.code));

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
const live = sub('live'), dead = sub('dead');
r = await call({ subs: [live, dead], title: 'New task', body: 'Fit registers', url: 'https://x/c/tok?task=1', tag: 'tzviair-1' }, { 'x-api-key': 'testkey' });
check(r.code === 200, 'with keys → 200', String(r.code));
check(r.body?.sent === 1, 'the live phone counts as sent', JSON.stringify(r.body));
check(Array.isArray(r.body?.gone) && r.body.gone[0] === dead.endpoint, 'the 410 phone is reported gone', JSON.stringify(r.body?.gone));

srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
