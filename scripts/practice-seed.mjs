#!/usr/bin/env node
// THE PRACTICE SEED (owner, 2026-11-04): fills the PRACTICE database
// (`wolfson-practice`, never the office's real one) with one made-up world
// across every feature: workspaces, buildings and flats with their stages,
// the Job Board's jobs and groups, tasks, messages, stage notes, the weekly
// notebook, time off, the time clock, plans' pins and markups, dashboards.
//
//   node scripts/practice-seed.mjs [--world=<file.json>] [--dry]
//
// --world  also writes the same world as plain JSON (for the CRM loader).
// --dry    builds and writes the JSON, sends nothing.
//
// It ADDS and OVERWRITES its own documents; to start clean run
// scripts/practice-reset.mjs, which wipes the practice database first.
// Credentials: see scripts/practice/firestore.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRACTICE_PROJECT, assertPractice, writeDocs } from './practice/firestore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

assertPractice(process.env.PRACTICE_PROJECT ?? PRACTICE_PROJECT);

/** The CRM's 50 job numbers: read-only from Supabase when a token is there, else the saved list. */
async function crmJobNumbers() {
  const saved = JSON.parse(fs.readFileSync(path.join(here, 'practice/crm-job-numbers.json'), 'utf8')).jobNumbers;
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) return saved;
  try {
    const r = await fetch('https://api.supabase.com/v1/projects/wsugwpaztmxxoarpjjfs/database/query/read-only', {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: "select job_no from crm.imported_records where entity='opportunity' order by job_no" }),
    });
    const rows = await r.json();
    // Rows without a number are skipped: String(null) once made 10 jobs all called "null".
    const nums = Array.isArray(rows) ? [...new Set(rows.map(x => (x.job_no == null ? '' : String(x.job_no).trim())).filter(Boolean))] : [];
    if (nums.length) return nums;
  } catch { /* the saved list stands in */ }
  return saved;
}

/** The world builder is TypeScript that imports the app's own modules; bundled here, run, thrown away. */
async function loadBuilder() {
  const { rolldown } = await import(pathToFileURL(path.join(root, 'node_modules/rolldown/dist/index.mjs')).href);
  const b = await rolldown({ input: path.join(here, 'practice/world.ts'), platform: 'node', logLevel: 'silent' });
  const { output } = await b.generate({ format: 'esm' });
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'practice-world-')), 'world.mjs');
  fs.writeFileSync(tmp, output[0].code);
  return import(pathToFileURL(tmp).href);
}

export async function seed({ worldOut, dry, quiet } = {}) {
  const jobNumbers = await crmJobNumbers();
  const { buildWorld } = await loadBuilder();
  const { world, docs } = buildWorld({ crmJobNumbers: jobNumbers });

  if (worldOut) {
    fs.writeFileSync(worldOut, JSON.stringify(world, null, 1));
    console.log(`world written: ${worldOut}`);
  }
  const counts = Object.fromEntries(Object.entries(docs).map(([c, l]) => [c, l.length]).sort());
  if (quiet && dry) return { world, counts };
  console.log(`target project: ${PRACTICE_PROJECT}`);
  console.log(JSON.stringify(counts, null, 1));
  if (dry) { console.log('dry run, nothing sent'); return { world, counts }; }

  for (const [col, list] of Object.entries(docs)) {
    process.stdout.write(`  ${col} … `);
    await writeDocs(col, list);
    process.stdout.write(`${list.length}\n`);
  }
  console.log('seed done');
  return { world, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed({ worldOut: typeof args.world === 'string' ? args.world : undefined, dry: !!args.dry })
    .catch(e => { console.error(e.message); process.exit(1); });
}
