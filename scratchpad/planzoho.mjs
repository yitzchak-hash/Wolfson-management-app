/**
 * Turn the Zoho "past year" deals export into the app's own import template,
 * applying the owner's routing rules (2026-08-19), and write an approval page.
 *
 *   node scratchpad/planzoho.mjs <path-to-zoho-export.csv>
 *
 * Writes into scratchpad/: tzviair-import.csv (the filled template),
 * import-plan.json (machine readable) and import-approval.html (for the owner).
 *
 * NOTHING here touches the app or the cloud. It is a preparation step only.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scratchpad/planzoho.mjs <csv>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'scratchpad');

// ── CSV ─────────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── the owner's routing, verbatim from his message ──────────────────────────
// key = the CRM stage, lower-cased.  stage = the app stage name to set (null =
// leave the job with no stage).  group = the board group ('' = open board).
const ROUTES = {
  // ── finished work · Done group, stage "Job completed" ──
  'job completed':                { stage: 'Job completed',  group: 'Done' },
  'collecting remaining balance': { stage: 'Job completed',  group: 'Done' },
  'collecting extras':            { stage: 'Job completed',  group: 'Done' },
  'maintenance scheduled':        { stage: 'Job completed',  group: 'Done' },
  'waiting for warranty from provider': { stage: 'Job completed', group: 'Done' },
  'requesting warranty from provider':  { stage: 'Job completed', group: 'Done' },
  'installed w/balance':          { stage: 'Job completed',  group: 'Done' },
  // ── waiting to start · Ready to Start group, stage "Ready to start" ──
  'hibernating':                  { stage: 'Ready to start', group: 'Ready to Start' },
  'collecting deposit/key':       { stage: 'Ready to start', group: 'Ready to Start' },
  'pre-job checklist':            { stage: 'Ready to start', group: 'Ready to Start' },
  'schedule job & get key':       { stage: 'Ready to start', group: 'Ready to Start' },
  // ── on site now · their own groups, each with its own stage ──
  'being installed':              { stage: 'AC installation',       group: 'Currently in AC' },
  'installation of geves':        { stage: 'Installation of Geves', group: 'Currently in Geves' },
  // ── parked · Archive, no stage ──
  'plans ready':                  { stage: null, group: 'Archive' },
  'plans redone':                 { stage: null, group: 'Archive' },
  'plans drawn':                  { stage: null, group: 'Archive' },
  'marking plans - tzvi':         { stage: null, group: 'Archive' },
  'plan waiting for client approval': { stage: null, group: 'Archive' },
  'waiting for tzvi approval':    { stage: null, group: 'Archive' },
  'waiting for client to esign':  { stage: null, group: 'Archive' },
  'waiting for supplier price':   { stage: null, group: 'Archive' },
  'issuing invoice':              { stage: null, group: 'Archive' },
  'add items':                    { stage: null, group: 'Archive' },
  'paid deposit':                 { stage: null, group: 'Archive' },
  'babysitting':                  { stage: null, group: 'Archive' },
  'creating proposal':            { stage: null, group: 'Archive' },
  'collecting information':       { stage: null, group: 'Archive' },
  // ── dropped, but kept · Trash, no stage ──
  'receiving plans':              { stage: null, group: 'Trash' },
  'closed lost':                  { stage: null, group: 'Trash' },
  'not':                          { stage: null, group: 'Trash' },
};
/** Nothing is refused any more — every CRM stage has a home. */
const REFUSED = {};

// ── field rules ─────────────────────────────────────────────────────────────
/** His rule: the family name is what comes before the first comma. */
function familyFromDeal(deal) {
  const d = (deal || '').trim();
  const comma = d.indexOf(',');
  if (comma > 0) return d.slice(0, comma).trim();
  const dash = d.indexOf(' -');
  if (dash > 0) return d.slice(0, dash).trim();
  return d;
}
/** The whole customer name — surname and first name — for when a surname collides. */
function fullNameFromDeal(deal) {
  const d = (deal || '').trim();
  const dash = d.indexOf(' - ');
  return (dash > 0 ? d.slice(0, dash) : d).trim();
}
/** What the deal is FOR: everything after the customer's name. */
function jobKindFromDeal(deal) {
  const d = (deal || '').trim();
  const i = d.indexOf(' - ');
  return i > 0 ? d.slice(i + 3).trim() : '';
}
/** Israeli numbers lose their leading zero in the export; American ones must not gain one. */
function normalizePhone(raw) {
  const p = (raw || '').trim();
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p[0] === '0' || p[0] === '1') return p;
  const digits = p.replace(/\D/g, '');
  if (digits.length > 0 && digits.length <= 9) return '0' + p;
  return p;
}
function folderId(url) {
  const m = (url || '').match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

// ── walk the export ─────────────────────────────────────────────────────────
const raw = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const rows = parseCsv(raw);
const hi = rows.findIndex(r => r.some(c => c.trim() === 'Deal Name'));
if (hi === -1) { console.error('no "Deal Name" header found'); process.exit(1); }
const H = rows[hi].map(c => c.trim());
const ix = n => H.indexOf(n);
const iDeal = ix('Deal Name'), iAcct = ix('Account'), iDrive = ix('Drive URL');
const iPhone1 = ix('Contact Main Phone'), iPhone2 = ix('Main Number'), iStage = ix('Stage');

const data = rows.slice(hi + 1).filter(r => r.length > 1 && r.some(c => c.trim()));

const planned = [];
const refused = [];      // stages he explicitly told me to leave out
const unrouted = [];     // stages he has not ruled on
const problems = [];     // rows that cannot become a job at all
const seenFolder = new Map();
const seenDealName = new Map();

for (const r of data) {
  const deal = (r[iDeal] || '').trim();
  const account = (r[iAcct] || '').trim();
  const drive = (r[iDrive] || '').trim();
  const crmStage = (r[iStage] || '').trim();
  const phone = normalizePhone((r[iPhone1] || '').trim() || (r[iPhone2] || '').trim());
  const key = crmStage.toLowerCase();
  const label = deal || account || '(no name)';

  if (REFUSED[key]) { refused.push({ label, crmStage, reason: REFUSED[key], drive }); continue; }
  const route = ROUTES[key];
  if (!route) { unrouted.push({ label, crmStage, drive, phone }); continue; }

  const family = familyFromDeal(deal);
  if (!family && !drive) { problems.push({ label, crmStage, reason: 'no name and no Drive folder' }); continue; }

  const fid = folderId(drive);
  if (drive && !fid) { problems.push({ label, crmStage, reason: 'Drive cell is not a folder link' }); continue; }

  const warnings = [];
  if (fid) {
    const first = seenFolder.get(fid);
    if (first) warnings.push(`same Drive folder as "${first}"`);
    else seenFolder.set(fid, deal);
  } else warnings.push('no Drive link');
  const dupName = seenDealName.get(deal.toLowerCase());
  if (dupName) warnings.push('the same deal name appears earlier in the file');
  else seenDealName.set(deal.toLowerCase(), deal);
  if (/wolfson|netiv|neve shamir/i.test(deal + ' ' + account))
    warnings.push('name mentions another workspace — check it is not their job');

  const kind = jobKindFromDeal(deal);
  const notes = [deal, account && account !== deal ? `Account: ${account}` : '', `From the CRM as "${crmStage}"`]
    .filter(Boolean).join('\n');

  planned.push({
    family, fullName: fullNameFromDeal(deal), deal, kind, account,
    driveUrl: drive, folderId: fid, phone, crmStage,
    stage: route.stage, group: route.group, notes, warnings,
  });
}

// surname collisions — worth telling him about before 600 tiles land
const bySurname = new Map();
for (const p of planned) {
  const k = p.family.toLowerCase();
  if (!bySurname.has(k)) bySurname.set(k, new Set());
  bySurname.get(k).add(p.fullName);
}
const collisions = [...bySurname.entries()].filter(([, s]) => s.size > 1);
for (const p of planned) {
  if ((bySurname.get(p.family.toLowerCase()) ?? new Set()).size > 1)
    p.warnings.push('another job shares this surname');
}

// counts
const byRoute = new Map();
for (const p of planned) {
  const k = `${p.crmStage}`;
  if (!byRoute.has(k)) byRoute.set(k, { crmStage: p.crmStage, stage: p.stage, group: p.group, n: 0 });
  byRoute.get(k).n++;
}
const byUnrouted = new Map();
for (const u of unrouted) byUnrouted.set(u.crmStage, (byUnrouted.get(u.crmStage) || 0) + 1);
const byRefused = new Map();
for (const u of refused) byRefused.set(u.crmStage, (byRefused.get(u.crmStage) || 0) + 1);

// ── the filled template the app's wizard reads ──────────────────────────────
const esc = v => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const TEMPLATE_COLUMNS = ['Drive folder link', 'Family name', 'Address', 'Phone', 'Zoho link', 'Stage', 'Group', 'General notes'];
const csv = [TEMPLATE_COLUMNS.join(',')]
  .concat(planned.map(p => [p.driveUrl, p.family, '', p.phone, '', p.stage ?? '', p.group, p.notes].map(esc).join(',')))
  .join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'tzviair-import.csv'), csv);
fs.writeFileSync(path.join(OUT, 'import-plan.json'), JSON.stringify({
  source: path.basename(SRC), rowsRead: data.length,
  planned, refused, unrouted, problems,
  counts: {
    planned: planned.length, refused: refused.length, unrouted: unrouted.length, problems: problems.length,
    byRoute: [...byRoute.values()], byUnrouted: [...byUnrouted], byRefused: [...byRefused],
  },
  collisions: collisions.map(([k, s]) => [k, [...s]]),
}, null, 2));

console.log('rows read      ', data.length);
console.log('to create      ', planned.length);
console.log('you said skip  ', refused.length);
console.log('no rule yet    ', unrouted.length);
console.log('cannot import  ', problems.length);
console.log('with no Drive  ', planned.filter(p => !p.folderId).length);
console.log('with a phone   ', planned.filter(p => p.phone).length);
console.log('surname clashes', collisions.length);
console.log('\nrouted:');
for (const r of [...byRoute.values()].sort((a, b) => b.n - a.n))
  console.log(String(r.n).padStart(5), r.crmStage, '→', r.group || 'open board', r.stage ? `· stage "${r.stage}"` : '· no stage');
console.log('\nno rule yet:');
for (const [k, v] of [...byUnrouted].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
