/**
 * Settings → App, PRACTICE BUILD ONLY: load / remove the shared test world
 * (docs/test-world/world.json). Folded away; the live board never shows it.
 */
import { useEffect, useState } from 'react';
import { PRACTICE } from '../../data/practice';
import { useStore } from '../../data/store';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string };

export default function TestWorldCard() {
  const currentUser = useStore(s => s.currentUser);
  const [busy, setBusy] = useState(false);
  const [clear, setClear] = useState(true);
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const [lines, setLines] = useState<Msg[]>([]);
  const say = (m: Msg) => setLines(l => [...l, m]);

  const refresh = async () => {
    try {
      const { testWorldStatus } = await import('../../data/testWorldRun');
      setLoaded((await testWorldStatus()).loaded);
    } catch (e) { setLoaded(null); say({ kind: 'err', text: String((e as Error).message) }); }
  };
  useEffect(() => { if (PRACTICE) void refresh(); }, []);
  if (!PRACTICE) return null;

  const run = async (what: 'load' | 'remove') => {
    const ask = what === 'load'
      ? `Load the test world into the PRACTICE board?${clear ? '\n\nThe old made-up practice records are cleared first (a copy is kept; "Remove test world" puts them back).' : ''}`
      : 'Remove the test world from the PRACTICE board, and put back what it cleared?';
    if (!window.confirm(ask)) return;
    setBusy(true); setLines([]);
    try {
      const mod = await import('../../data/testWorldRun');
      const progress = (text: string) => say({ kind: 'info', text });
      if (what === 'load') {
        const r = await mod.loadTestWorld({ clear, by: currentUser?.name ?? 'office' }, progress);
        if (r.cleared) {
          say({ kind: 'ok', text: `Cleared: ${Object.values(r.cleared.deleted).reduce((a, b) => a + b, 0)} records, ${Object.values(r.cleared.changed).reduce((a, b) => a + b, 0)} flats/notebook emptied.` });
          if (r.cleared.keptReal.length) say({ kind: 'err', text: `Kept (looks real): ${r.cleared.keptReal.map(k => `${k.col}/${k.id} (${k.why})`).join('; ')}` });
        }
        say({ kind: 'ok', text: `Loaded: ${Object.entries(r.written).map(([k, v]) => `${v} ${k}`).join(', ')}.` });
        say({ kind: 'info', text: `Staff: ${Object.entries(r.slots).map(([k, v]) => `${k} = ${v}`).join(', ')}` });
      } else {
        const r = await mod.removeTestWorld(progress);
        say({ kind: 'ok', text: `Removed ${Object.values(r.deleted).reduce((a, b) => a + b, 0)} test records and ${r.towers} test tower workspaces; put back ${r.restored} cleared records.` });
        if (r.madeOnTest.length) say({ kind: 'info', text: `Also removed, made on test records while testing: ${r.madeOnTest.slice(0, 30).join(', ')}${r.madeOnTest.length > 30 ? ` and ${r.madeOnTest.length - 30} more` : ''}` });
      }
      say({ kind: 'info', text: 'Reloading in 3 seconds so every screen reads the new data …' });
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
      say({ kind: 'err', text: String((e as Error).message) });
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <details className="bg-white border border-amber-300 rounded-xl p-5" data-testid="test-world-card">
      <summary className="font-semibold text-gray-800 cursor-pointer select-none">Test world (practice only)</summary>
      <p className="text-sm text-gray-600 mt-3">
        The same made-up world as the CRM and Finance: two "Test towers" workspaces (10 towers), the private jobs on the Job Board, their tasks,
        problems, inspections and a few placeholder photos. Practice database only.
      </p>
      <p className="text-sm mt-2">Now: <b>{loaded === null ? '…' : loaded ? 'loaded' : 'not loaded'}</b></p>
      <label className="flex items-center gap-2 text-sm mt-3">
        <input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} disabled={busy} />
        Clear the old made-up practice records first (kept, and put back on remove)
      </label>
      <div className="flex gap-3 mt-3">
        <button type="button" disabled={busy || loaded === true} onClick={() => run('load')}
          className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold disabled:opacity-40">Load test world</button>
        <button type="button" disabled={busy || loaded === false} onClick={() => run('remove')}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold disabled:opacity-40">Remove test world</button>
      </div>
      {lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" data-testid="test-world-log">
          {lines.map((l, i) => <li key={i} className={l.kind === 'err' ? 'text-red-700' : l.kind === 'ok' ? 'text-green-700' : 'text-gray-600'}>{l.text}</li>)}
        </ul>
      )}
    </details>
  );
}
