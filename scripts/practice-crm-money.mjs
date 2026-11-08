#!/usr/bin/env node
// THE FLAT'S MONEY MIRROR, practice (owner's D19, connection map 5.5-5.7, S37).
//
// The CRM-side job that writes a READ-ONLY copy of the CRM's upgrade orders
// and its project's upgrade price list onto each practice flat (`crmMoney`),
// the same way S12 put the CRM's keys on the flats. And the Finance seam: once
// Finance publishes a balance per job (S05 job numbers + the S07 money view),
// the same run copies it onto the flat (`financeBalance`); until that view
// exists it writes nothing and the flat's window says "Not connected yet".
//
//   node scripts/practice-crm-money.mjs [--dry]
//
// Reads the CRM through Supabase's READ-ONLY query door (SUPABASE_ACCESS_TOKEN),
// writes ONLY the practice database (scripts/practice/firestore.mjs refuses
// any other project), and only the two mirror fields of flats that already
// exist (patchDocs: an updateMask, never a whole document, never a new one).
// Nobody books money in Wolfson: the app strips both fields from its own writes.
//
// Run it after scripts/practice-seed.mjs (the seed writes whole flats, which
// clears the mirror) and whenever the CRM's practice upgrades change.

import { PRACTICE_PROJECT, assertPractice, patchDocs } from './practice/firestore.mjs';

assertPractice(process.env.PRACTICE_PROJECT ?? PRACTICE_PROJECT);
const dry = process.argv.includes('--dry');

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
 * agorot. When none exists the Finance half of this run is skipped.
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

const num = v => (v == null ? null : Number(v));
const names = Object.keys(PROJECT_TO_WORKSPACE).map(n => `'${n.replace(/'/g, "''")}'`).join(',');

const units = await crm(`
  select p.name project, u.label, u.status
  from crm.units u join crm.projects p on p.id = u.project_id
  where p.name in (${names})`);
const orders = await crm(`
  select ov.project_name project, ov.unit_label label, ov.number, ov.state,
         ov.value_before_vat_agorot, ov.value_vat_agorot, ov.value_agorot, ov.won_at, ov.created_at
  from crm.opportunities_v ov join crm.units u on u.id = ov.unit_id
  where ov.type_key = 'upgrade' and ov.customer_id = u.owner_customer_id and ov.project_name in (${names})
  order by ov.created_at desc`);
const prices = await crm(`
  select p.name project, up.id, up.names, up.price_agorot, up.vat_percent, up.price_with_vat_agorot
  from crm.upgrade_prices up join crm.projects p on p.id = up.project_id
  where up.active and p.name in (${names})
  order by up.sort, up.created_at`);

const now = new Date().toISOString();
const byCol = {};
for (const u of units) {
  const ws = PROJECT_TO_WORKSPACE[u.project];
  if (!ws) continue;
  const mine = orders.filter(o => o.project === u.project && o.label === u.label);
  const crmMoney = {
    orders: mine.map(o => ({
      number: String(o.number), state: o.state,
      valueBeforeVatAgorot: num(o.value_before_vat_agorot), vatAgorot: num(o.value_vat_agorot),
      valueAgorot: num(o.value_agorot), wonAt: o.won_at ?? null,
    })),
    prices: prices.filter(p => p.project === u.project).map(p => ({
      id: p.id, names: p.names ?? {}, priceAgorot: num(p.price_agorot),
      vatPercent: num(p.vat_percent), priceWithVatAgorot: num(p.price_with_vat_agorot),
    })),
    unitStatus: u.status ?? null,
    mirroredAt: now,
  };
  (byCol[colOf(ws)] ??= []).push({ id: u.label, fields: { crmMoney } });
}

// ── the Finance seam ─────────────────────────────────────────────────────────
const financeViews = await crm(`
  select c.table_name, string_agg(c.column_name, ',') cols
  from information_schema.columns c
  where c.table_schema = '${FINANCE_SCHEMA}'
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
  const flats = world.flats ?? [];
  let n = 0;
  for (const f of flats) {
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

console.log(`target project: ${PRACTICE_PROJECT}`);
for (const [col, list] of Object.entries(byCol)) {
  const withOrders = list.filter(x => x.fields.crmMoney?.orders.length).length;
  console.log(`  ${col}: ${list.length} flats, ${withOrders} with an upgrade order`);
}
console.log(`  ${financeNote}`);
if (dry) { console.log('dry run, nothing sent'); process.exit(0); }
for (const [col, list] of Object.entries(byCol)) await patchDocs(col, list);
console.log('money mirror done');
