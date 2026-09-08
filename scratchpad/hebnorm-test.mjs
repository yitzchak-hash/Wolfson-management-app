// The ONE Hebrew normaliser (src/data/hebrewNormalize.ts), offline, worked
// pairs: names the office really types both ways must land on one sound key.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' - ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const H = await server.ssrLoadModule('/src/data/hebrewNormalize.ts');
const T = await server.ssrLoadModule('/src/data/translit.ts');
const S = await server.ssrLoadModule('/src/data/hebrewSearch.ts');
const same = (a, b) => { const A = H.soundKeys(a), B = H.soundKeys(b); return A.some(k => B.includes(k)); };
const pairs = [['Artzi', 'ארצי'], ['Arzi', 'ארצי'], ['Cohen', 'כהן'], ['Yosef', 'יוסף'], ['Shapira', 'שפירא'],
  ['Levi', 'לוי'], ['Weinstein', 'וינשטיין'], ['Katz', 'כץ'], ['Tzvika', 'צביקה'], ['Chaim', 'חיים'], ['David', 'דוד']];
for (const [en, he] of pairs) check(same(en, he), `${en} sounds like ${he}`, `${H.soundKeys(en)} vs ${H.soundKeys(he)}`);
check(H.normalizeText('כהן') === H.normalizeText('כהנ'), 'final letters fold');
check(H.normalizeText('שָׁלוֹם') === H.normalizeText('שלום'), 'niqqud stripped', H.normalizeText('שָׁלוֹם'));
check(H.normalizeText('לוי־כהן') === H.normalizeText('לוי-כהן'), 'maqaf becomes a hyphen');
check(JSON.stringify(H.tokenize('Cohen, David - 5555 - Ramat Gan')) === JSON.stringify(['cohen', 'david', '5555', 'ramat', 'gan']), 'folder title tokenizes', H.tokenize('Cohen, David - 5555 - Ramat Gan').join('|'));
check(H.digitsOf('050-123 4567') === '0501234567', 'digits run together');
check(T.skeleton('Yosef') === S.soundKey('Yosef') && T.skeleton('יוסף') === S.soundKey('יוסף'), 'translit and hebrewSearch agree (one rule)');
check(T.layoutSwap('akuo') === 'שלום', 'wrong-layout swap', T.layoutSwap('akuo'));
check(H.skeletonTokens('Cohen 5555 ארצי').length === 2 && !H.skeletonTokens('12').length, 'skeleton tokens skip digits');
await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
