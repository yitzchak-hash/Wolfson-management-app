// Offline proof of the flat's money (D19). Run: npx tsx scratchpad/flatmoney-test.mjs
import { shekels, tileOrder, sortedOrders, balanceWords, hasMoneyPart, priceName } from '../src/data/flatMoney.ts';
import { withoutCrmOwned } from '../src/data/crmLink.ts';
import { DEFAULT_MAIN_UI_STRINGS as EN, HEBREW_MAIN_UI_STRINGS as HE } from '../src/types/index.ts';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

check(shekels(495600) === '₪4,956', 'agorot → whole shekels', shekels(495600));
check(shekels(76750) === '₪767.50', 'agorot → shekels with agorot', shekels(76750));
check(shekels(null) === '', 'no value → empty');
check(shekels(-10000) === '-₪100', 'negative', shekels(-10000));

const won = { number: '1', state: 'won', valueAgorot: 100 };
const open = { number: '2', state: 'open', valueAgorot: null };
const lost = { number: '3', state: 'lost', valueAgorot: 5 };
check(sortedOrders([lost, open, won]).map(o => o.number).join() === '1,2,3', 'won, then open, then lost');
check(tileOrder({ crmMoney: { orders: [open, won], prices: [], mirroredAt: '' } })?.number === '1', 'tile shows the won order');
check(tileOrder({ crmMoney: { orders: [lost], prices: [], mirroredAt: '' } }) === null, 'a lost order puts nothing on the tile');
check(tileOrder({}) === null, 'no mirror → nothing on the tile');

check(balanceWords({}, EN) === null, 'no Finance balance → not connected (null)');
check(balanceWords({ financeBalance: { balanceAgorot: 250000, asOf: '' } }, EN) === '₪2,500 still owed', 'owes');
check(balanceWords({ financeBalance: { balanceAgorot: 0, asOf: '' } }, EN) === 'Paid in full', 'settled');
check(balanceWords({ financeBalance: { balanceAgorot: -5000, asOf: '' } }, HE) === 'זיכוי של ₪50', 'credit in Hebrew');

check(hasMoneyPart({ jobNo: '9001' }) && !hasMoneyPart({}) && hasMoneyPart({ financeBalance: { balanceAgorot: 1, asOf: '' } }), 'money part shows on CRM flats only');
check(priceName({ id: 'x', names: { en: 'A', he: 'א' }, priceAgorot: 1 }, true) === 'א' && priceName({ id: 'x', names: { he: 'א' }, priceAgorot: 1 }, false) === 'א', 'price name by language, falls back');

// Nobody books money in Wolfson: the mirrors never pass through a Wolfson write.
const out = withoutCrmOwned({}, { crmMoney: { orders: [] }, financeBalance: { balanceAgorot: 1 }, notes: 'x' });
check(!('crmMoney' in out) && !('financeBalance' in out) && out.notes === 'x', 'Wolfson writes lose the two mirrors, keep the rest');

for (const k of Object.keys(EN).filter(k => k.startsWith('money'))) check(typeof HE[k] === 'string' && HE[k] !== EN[k], `Hebrew word for ${k}`);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
