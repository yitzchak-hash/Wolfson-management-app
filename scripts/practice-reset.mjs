#!/usr/bin/env node
// THE PRACTICE RESET (owner, 2026-11-04): wipes EVERY document in the practice
// database (`wolfson-practice`; the lock in practice/firestore.mjs refuses
// any other project) and fills it again with the made-up world.
//
//   node scripts/practice-reset.mjs --yes [--world=<file.json>]
//
// Without --yes it only lists what would be wiped.

import { pathToFileURL } from 'node:url';
import { PRACTICE_PROJECT, assertPractice, listCollections, wipeCollection } from './practice/firestore.mjs';
import { seed } from './practice-seed.mjs';
import { WORKSPACE_COLLECTIONS, GLOBAL_COLLECTIONS } from '../lib/fullBackup.js';

/**
 * Listing collections needs a Google sign-in; the practice web key alone is
 * refused (403). Without one, the reset wipes the collections it KNOWS: every
 * collection the full backup covers, for every practice workspace, plus every
 * collection the seed writes. Still only ever the practice project.
 */
async function collectionsToWipe() {
  try {
    return await listCollections();
  } catch (e) {
    if (!String(e.message).includes(' 403 ')) throw e;
    const { counts } = await seed({ dry: true, quiet: true });
    const workspaces = ['wolfson', 'general', 'netiv', 'practice-heights'];
    const known = [
      ...GLOBAL_COLLECTIONS,
      ...workspaces.flatMap(ws => WORKSPACE_COLLECTIONS.map(b => (ws === 'wolfson' ? b : `${ws}_${b}`))),
      ...Object.keys(counts),
    ];
    console.log('  (no Google sign-in: listing collections is refused, wiping the known list instead)');
    return [...new Set(known)].sort();
  }
}

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
assertPractice(process.env.PRACTICE_PROJECT ?? PRACTICE_PROJECT);

async function reset() {
  const cols = await collectionsToWipe();
  console.log(`practice project ${PRACTICE_PROJECT}: ${cols.length} collections`);
  if (!args.yes) { console.log(cols.join(', ')); console.log('add --yes to wipe them and seed again'); return; }
  for (const c of cols) {
    const n = await wipeCollection(c);
    console.log(`  wiped ${c}: ${n}`);
  }
  await seed({ worldOut: typeof args.world === 'string' ? args.world : undefined });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  reset().catch(e => { console.error(e.message); process.exit(1); });
}
