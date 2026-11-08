#!/usr/bin/env node
// THE FLAT'S MONEY COPY, practice (owner's D19, connection map 5.5-5.7, S37).
//
// The CRM-side job that writes a READ-ONLY copy of each flat's OWN upgrade
// orders onto the practice flat (`crmMoney`), the way S12 put the CRM's keys
// on the flats. The owner's answers (2026-11-08):
//   1. an ordered upgrade marks the flat "Upgraded" by itself, ONCE per order
//      (`crmMoney.upgradeSetFor`), so the hand buttons can still fix a mistake
//      and the next copy never undoes the fix;
//   3. only the flat's own order, no project price list;
//   4. copied on every change, plus a nightly check that fixes anything missed.
// And the Finance seam: once Finance publishes a balance per job (S05 job
// numbers + the S07 money view), the same run copies it (`financeBalance`);
// until that view exists it writes nothing and the window says "Not connected
// yet".
//
//   node scripts/practice-crm-money.mjs                 every flat
//   node scripts/practice-crm-money.mjs --unit=A1-1     one flat: what the CRM
//                                                       calls on a change
//   node scripts/practice-crm-money.mjs --check         the nightly check:
//                                                       writes only the flats
//                                                       whose copy is wrong
//   add --dry to any of them to send nothing
//
// Reads the CRM through Supabase's READ-ONLY query door (SUPABASE_ACCESS_TOKEN),
// writes ONLY the practice database (scripts/practice/firestore.mjs refuses
// any other project), and only these fields of flats that already exist
// (patchDocs: an updateMask, never a whole document, never a new one).
// Nobody books money in Wolfson: the app strips both mirrors from its writes.
//
// Run it after scripts/practice-seed.mjs (the seed writes whole flats, which
// clears the copy).

import { PRACTICE_PROJECT, assertPractice, patchDocs, getFields } from './practice/firestore.mjs';

assertPractice(process.env.PRACTICE_PROJECT ?? PRACTICE_PROJECT);
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const dry = !!args.dry;
const check = !!args.check;
const onlyUnit = typeof args.unit === 'string' ? args.unit : null;

const CRM_PROJECT_REF = 'wsugwpaztmxxoarpjjfs';
/**
 * The CRM's practice projects and the practice workspace each one is. A unit's
 * label is the flat's id in that workspace (A1-1, B1-6, H1-33): the practice
 * CRM's units were loaded from the same made-up world.
 */
const PROJECT_TO_WORKSPACE = {
  'Wolfson Residence (practice)': 'wolfson',
  'Netiv Neve Shamir (practice)': 'netiv',
  'Practice Heights (practice)': 'practice-heights',
};
const colOf = ws => (ws === 'wolfson' ? 'apartments' : `${ws}_apartments`);
/**
 * Where Finance's balances will be (slice S07). Looked up by shape, not
 * assumed: any view in the `finance` schema with a job number and a balance in
 * agorot (billed_agorot / paid_agorot if there). When none exists the Finance
 * half of this run is skipped.
 */
const FINANCE_SCHEMA = 'finance';

async function crm(sql) {
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) throw new Error('SUPABASE_ACCESS_TOKEN is not set (read-only access to the CRM).');
  const r = await fetch(`https://api.supabase.com/v1/projects/${CRM_PROJECT_REF}/database/query/read-only`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`CRM read refused: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const num = v => (v == null ? null : Number(v));
const names = Object.keys(PROJECT_TO_WORKSPACE).map(q).join(',');
const unitFilter = onlyUnit ? ` and u.label = ${q(onlyUnit)}` : '';

const units = await crm(`
  select p.name project, u.label, u.status
  from crm.units u join crm.projects p on p.id = u.project_id
  where p.name in (${names})${unitFilter}`);
const orders = await crm(`
  select ov.project_name project, ov.unit_label label, ov.number, ov.state,
         ov.value_before_vat_agorot, ov.value_vat_agorot, ov.value_agorot, ov.won_at
  from crm.opportunities_v ov join crm.units u on u.id = ov.unit_id
  where ov.type_key = 'upgrade' and ov.customer_id = u.owner_customer_id and ov.project_name in (${names})${unitFilter}
  order by ov.created_at desc`);

// What each flat holds now: needed so "Upgraded" is set once per order, and
// so the nightly check writes only what is wrong.
const wanted = {};   // col → [{ id, project, label, status, orders }]
for (const u of units) {
  const ws = PROJECT_TO_WORKSPACE[u.project];
  if (!ws) continue;
  const mine = orders.filter(o => o.project === u.project && o.label === u.label).map(o => ({
    number: String(o.number), state: o.state,
    valueBeforeVatAgorot: num(o.value_before_vat_agorot), vatAgorot: num(o.value_vat_agorot),
    valueAgorot: num(o.value_agorot), wonAt: o.won_at ?? null,
  }));
  (wanted[colOf(ws)] ??= []).push({ id: u.label, status: u.status ?? null, orders: mine });
}

const now = new Date().toISOString();
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const byCol = {};
const report = { flats: 0, written: 0, upgraded: [], fixed: [] };
for (const [col, list] of Object.entries(wanted)) {
  const have = await getFields(col, list.map(x => x.id), ['crmMoney', 'classification']);
  for (const w of list) {
    const cur = have.get(w.id);
    if (!cur) continue;   // no such flat in practice: never created from here
    report.flats++;
    const prev = cur.crmMoney ?? {};
    const won = w.orders.find(o => o.state === 'won');
    const fields = {};
    // 1. Upgraded by itself, once per ordered upgrade.
    let upgradeSetFor = prev.upgradeSetFor ?? null;
    if (won && upgradeSetFor !== won.number) {
      upgradeSetFor = won.number;
      if (cur.classification !== 'shinui') { fields.classification = 'shinui'; report.upgraded.push(w.id); }
    }
    const crmMoney = { orders: w.orders, upgradeSetFor, unitStatus: w.status, mirroredAt: now };
    const changed = !same(prev.orders, crmMoney.orders) || !same(prev.upgradeSetFor, upgradeSetFor) || !same(prev.unitStatus, w.status);
    // The nightly check writes only a copy that is wrong; a normal run refreshes all.
    if (changed || !check) fields.crmMoney = crmMoney;
    if (check && changed) report.fixed.push(w.id);
    if (Object.keys(fields).length) (byCol[col] ??= []).push({ id: w.id, fields });
  }
}

// ── the Finance seam ─────────────────────────────────────────────────────────
const financeViews = await crm(`
  select c.table_name, string_agg(c.column_name, ',') cols
  from information_schema.columns c
  where c.table_schema = ${q(FINANCE_SCHEMA)}
  group by c.table_name
  having bool_or(c.column_name = 'job_no') and bool_or(c.column_name = 'balance_agorot')`);
let financeNote = 'Finance: no balance view yet, the flats keep "Not connected yet".';
if (financeViews.length) {
  const v = financeViews[0];
  const has = c => v.cols.split(',').includes(c);
  const rows = await crm(`select job_no, balance_agorot${has('billed_agorot') ? ', billed_agorot' : ''}${has('paid_agorot') ? ', paid_agorot' : ''} from ${FINANCE_SCHEMA}.${v.table_name}`);
  const byJob = new Map(rows.map(r => [String(r.job_no), r]));
  // A flat's job number is on the flat (S12). The practice world is built the
  // same every time (fixed seed), so the flats' numbers are read from it.
  const { seed } = await import('./practice-seed.mjs');
  const { world } = await seed({ dry: true, quiet: true });
  let n = 0;
  for (const f of world.flats ?? []) {
    if (onlyUnit && f.id !== onlyUnit) continue;
    const r = f.jobNo && byJob.get(String(f.jobNo));
    if (!r) continue;
    const list = (byCol[f.collection] ??= []);
    let item = list.find(x => x.id === f.id);
    if (!item) { item = { id: f.id, fields: {} }; list.push(item); }
    item.fields.financeBalance = {
      balanceAgorot: num(r.balance_agorot), billedAgorot: num(r.billed_agorot), paidAgorot: num(r.paid_agorot),
      jobNo: String(f.jobNo), asOf: now,
    };
    n++;
  }
  financeNote = `Finance: ${FINANCE_SCHEMA}.${v.table_name}, ${n} flat balances.`;
}

for (const list of Object.values(byCol)) report.written += list.length;
console.log(`target project: ${PRACTICE_PROJECT}${onlyUnit ? ` · flat ${onlyUnit}` : ''}${check ? ' · nightly check' : ''}`);
console.log(`  ${report.flats} flats looked at, ${report.written} to write`);
if (report.upgraded.length) console.log(`  marked Upgraded by the CRM's order: ${report.upgraded.join(', ')}`);
if (check) console.log(`  copies that were wrong and are fixed: ${report.fixed.length ? report.fixed.join(', ') : 'none'}`);
console.log(`  ${financeNote}`);
if (dry) { console.log('dry run, nothing sent'); process.exit(0); }
for (const [col, list] of Object.entries(byCol)) await patchDocs(col, list);
console.log('money copy done');
