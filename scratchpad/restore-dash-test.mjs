// A restore and a workspace made in settings (map C20): its collections are
// named "<dashed id>_apartments", and a job the restore removes there must land
// on THAT workspace's deletion list (else a computer re-uploads it). The other
// workspaces keep working, and a malformed prefix is never taken for one.
// Stand-in cloud (a fake Firestore REST list), no emulator. Run: node scratchpad/restore-dash-test.mjs
import { normalizeBackup, planRestore } from '../lib/fullRestore.js';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const J = v => JSON.stringify(v);
const env = { FIRESTORE_REST_BASE: 'http://x/v1/projects/p/databases/(default)/documents', VITE_FIREBASE_API_KEY: 'k' };

// What the cloud holds now: every collection has the backup's job plus one added since.
const cloud = {
  'apartments': ['W1', 'W-NEW'],
  'netiv_apartments': ['N1', 'N-NEW'],
  'my-new-site_apartments': ['M1', 'M-NEW'],
  'my-new-site_canvasElements': ['C1', 'C-NEW'],
  'a_b_apartments': ['X1', 'X-NEW'],
};
const fetchImpl = async url => {
  const name = decodeURIComponent(url.match(/documents\/([^?]+)/)[1]);
  return new Response(J({ documents: (cloud[name] ?? []).map(id => ({ name: `x/${name}/${id}` })) }), { status: 200 });
};
const one = id => [{ id, fields: { id: { stringValue: id } } }];
const backup = normalizeBackup({
  kind: 'tzviair-full-backup', exportedAt: '2026-11-01T00:00:00Z', workspaces: ['wolfson', 'netiv', 'my-new-site'],
  collections: {
    'apartments': one('W1'), 'netiv_apartments': one('N1'),
    'my-new-site_apartments': one('M1'), 'my-new-site_canvasElements': one('C1'),
    'a_b_apartments': one('X1'),
  },
});
const plan = await planRestore({ backup, env, fetchImpl });
check(J(plan.removedByWs['my-new-site']?.sort()) === J(['C-NEW', 'M-NEW']), 'a dashed workspace\'s removed jobs go on its own deletion list', J(plan.removedByWs));
check(J(plan.removedByWs.wolfson) === J(['W-NEW']) && J(plan.removedByWs.netiv) === J(['N-NEW']), 'Wolfson and Netiv still go on theirs');
check(!plan.removedByWs.a_b && !plan.removedByWs.a && !plan.removedByWs['a_b'], 'an underscored name is never taken for a workspace', J(Object.keys(plan.removedByWs)));
check(plan.byCollection['my-new-site_apartments']?.remove === 1 && plan.byCollection['my-new-site_apartments']?.put === 1, 'the dashed workspace is restored like any other');

// An old one-workspace file still trims nothing it should not (prefix stripped right).
const old = normalizeBackup({ apartments: [{ id: 'A', buildingId: 'B1' }], activityLogs: [{ id: 'L' }] });
check(old.workspaces[0] === 'netiv' && old.scope.includes('netiv_activityLogs'), 'an old Netiv file maps to netiv_ collections', J(old.scope));
check(old.trimmed.has('netiv_activityLogs') && !old.trimmed.has('netiv_apartments'), 'its capped activity log is still marked trimmed', J([...old.trimmed]));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
