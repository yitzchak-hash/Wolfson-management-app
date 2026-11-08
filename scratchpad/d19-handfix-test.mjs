// D19: a hand fix ("Standard") on a flat the CRM marked Upgraded is never undone
// by the next copy or the nightly check. PRACTICE database only.
// Run: node scratchpad/d19-handfix-test.mjs
import { execFileSync } from 'node:child_process';
import { patchDocs, getFields } from '../scripts/practice/firestore.mjs';

const read = async () => (await getFields('apartments', ['A1-1'], ['classification', 'crmMoney'])).get('A1-1');
const before = await read();
await patchDocs('apartments', [{ id: 'A1-1', fields: { classification: 'standard' } }]);
for (const extra of [['--check'], [], ['--unit=A1-1']]) {
  execFileSync('node', ['scripts/practice-crm-money.mjs', ...extra], { stdio: 'ignore' });
}
const after = await read();
const ok = after.classification === 'standard' && after.crmMoney.upgradeSetFor === before.crmMoney.upgradeSetFor;
console.log(`${ok ? 'PASS' : 'FAIL'} hand fix kept through check, full copy and one-flat copy (now ${after.classification}, set for ${after.crmMoney.upgradeSetFor})`);
await patchDocs('apartments', [{ id: 'A1-1', fields: { classification: before.classification } }]);
console.log(`restored A1-1 to ${before.classification}`);
process.exit(ok ? 0 : 1);
