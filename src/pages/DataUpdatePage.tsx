import { useMemo, useState } from 'react';
import { useStore, useCloudReady } from '../data/store';
import type { Apartment } from '../types';
import { extractFolderId } from '../data/driveApi';
import { NETIV_SHEET, NETIV_TIPUSIM, driveFolderUrl, zohoDealUrl } from '../data/netivSheetMap';
import { WOLFSON_ZOHO } from '../data/wolfsonZohoMap';

/**
 * DATA UPDATE — the review screen for one-time record changes (owner, 2026-11-18: "unstar the plans … the tipusim
 * … make sure all the Drive links are updated in Netiv, and the Zoho links in Netiv and Wolfson").
 *
 * The live database is changed ONLY from here, ONLY through the app's normal saving (updateApartment → fsPatch, just
 * the fields shown), ONLY for the rows the owner leaves ticked, and ONLY after the before-values were downloaded as
 * a backup file. It refuses to run before the workspace's records have arrived from the cloud (cloudSyncedProject).
 * Works on the project that is open: Netiv shows all four lists, Wolfson only the Zoho list.
 */

type Kind = 'unstar' | 'tipus' | 'drive' | 'zoho';
interface Row {
  key: string;
  kind: Kind;
  apt: Apartment;
  before: string;
  after: string;
  /** The record already holds a DIFFERENT value — shown, but not ticked until the owner ticks it. */
  differs: boolean;
  changes: Partial<Apartment>;
}

const KIND_TITLE: Record<Kind, string> = {
  unstar: 'Plans to approve again (unstar)',
  tipus: 'Tipus (apartment type)',
  drive: 'Google Drive customer folder',
  zoho: 'Zoho deal link',
};
const KIND_NOTE: Record<Kind, string> = {
  unstar: 'The plan on screen stays the same. Workers stop seeing it until someone opens the flat and approves it (the star).',
  tipus: 'From the Netiv sheet\'s Type column.',
  drive: 'From the sheet\'s "Customer folder" link.',
  zoho: 'From the sheet\'s "Open in Zoho" link (Netiv) or the "W Residence" deals in Zoho (Wolfson).',
};

const aptKey = (a: Apartment) => `${a.buildingId}-${String(a.apartmentNumber).trim()}`;
const zohoIdOf = (url?: string) => (url?.match(/Potentials\/(\d+)/)?.[1] ?? null);

function buildRows(pid: string, apartments: Apartment[]): Row[] {
  const byKey = new Map(apartments.map(a => [aptKey(a), a]));
  const rows: Row[] = [];
  if (pid === 'netiv') {
    for (const a of apartments) {
      if (a.plansPdfLink && !a.planApprovalPending) {
        rows.push({ key: `unstar:${a.id}`, kind: 'unstar', apt: a, before: '★ approved', after: '☆ waiting for approval',
          differs: false, changes: { planApprovalPending: true } });
      }
    }
    for (const r of NETIV_SHEET) {
      const a = byKey.get(r.id);
      if (!a) continue;
      if (r.tipus && a.tipus !== r.tipus) {
        rows.push({ key: `tipus:${a.id}`, kind: 'tipus', apt: a, before: a.tipus || '—', after: r.tipus,
          differs: !!a.tipus, changes: { tipus: r.tipus } });
      }
      if (r.folder) {
        const cur = a.driveLink ? extractFolderId(a.driveLink) : null;
        if (cur !== r.folder) {
          rows.push({ key: `drive:${a.id}`, kind: 'drive', apt: a, before: cur ? `folder …${cur.slice(-6)}` : '—',
            after: `folder …${r.folder.slice(-6)}`, differs: !!cur, changes: { driveLink: driveFolderUrl(r.folder) } });
        }
      }
      if (r.zoho) {
        const cur = zohoIdOf(a.zohoLink);
        if (cur !== r.zoho) {
          rows.push({ key: `zoho:${a.id}`, kind: 'zoho', apt: a, before: cur ? `deal …${cur.slice(-6)}` : (a.zohoLink ? 'other link' : '—'),
            after: `deal …${r.zoho.slice(-6)}`, differs: !!a.zohoLink, changes: { zohoLink: zohoDealUrl(r.zoho) } });
        }
      }
    }
  } else if (pid === 'wolfson') {
    for (const [k, deal] of Object.entries(WOLFSON_ZOHO)) {
      const a = byKey.get(k);
      if (!a) continue;
      const cur = zohoIdOf(a.zohoLink);
      if (cur !== deal) {
        rows.push({ key: `zoho:${a.id}`, kind: 'zoho', apt: a, before: cur ? `deal …${cur.slice(-6)}` : (a.zohoLink ? 'other link' : '—'),
          after: `deal …${deal.slice(-6)}`, differs: !!a.zohoLink, changes: { zohoLink: zohoDealUrl(deal) } });
      }
    }
  }
  return rows;
}

function downloadBackup(pid: string, rows: Row[]) {
  const records = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const rec = records.get(r.apt.id) ?? { id: r.apt.id };
    for (const f of Object.keys(r.changes)) rec[f] = (r.apt as unknown as Record<string, unknown>)[f] ?? null;
    records.set(r.apt.id, rec);
  }
  const body = JSON.stringify({ project: pid, takenAt: new Date().toISOString(), before: [...records.values()] }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${pid}-before-data-update-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function DataUpdatePage() {
  const pid = useStore(st => st.currentProjectId);
  const apartments = useStore(st => st.apartments);
  const user = useStore(st => st.currentUser);
  const updateApartment = useStore(st => st.updateApartment);
  const tipusim = useStore(st => st.boardSettings[st.currentProjectId]?.tipusim);
  const setBoardSetting = useStore(st => st.setBoardSetting);
  const ready = useCloudReady();
  const rows = useMemo(() => (ready ? buildRows(pid, apartments) : []), [ready, pid, apartments]);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const isOn = (r: Row) => (r.differs ? ticked.has(r.key) : !unticked.has(r.key));
  const toggle = (r: Row) => {
    if (r.differs) setTicked(s => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; });
    else setUnticked(s => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; });
  };
  const missingTipusim = pid === 'netiv' ? NETIV_TIPUSIM.filter(t => !(tipusim ?? []).includes(t)) : [];
  const chosen = rows.filter(isOn);

  if (!user || user.role !== 'admin') {
    return <div className="p-6 text-sm text-gray-600">Only an office admin can open this page.</div>;
  }

  async function apply() {
    if (!user || busy || (!chosen.length && !missingTipusim.length)) return;
    setBusy(true);
    downloadBackup(pid, chosen);
    if (missingTipusim.length) setBoardSetting('tipusim', [...(tipusim ?? []), ...missingTipusim]);
    const perApt = new Map<string, Partial<Apartment>>();
    for (const r of chosen) perApt.set(r.apt.id, { ...(perApt.get(r.apt.id) ?? {}), ...r.changes });
    for (const [id, changes] of perApt) updateApartment(id, changes, user, { quiet: true });
    setDone(`Saved ${chosen.length} change${chosen.length === 1 ? '' : 's'} on ${perApt.size} flat${perApt.size === 1 ? '' : 's'}`
      + (missingTipusim.length ? ` and added ${missingTipusim.length} types to the list` : '')
      + '. A backup of the old values was downloaded.');
    setUnticked(new Set()); setTicked(new Set());
    setBusy(false);
  }

  const kinds: Kind[] = pid === 'netiv' ? ['unstar', 'tipus', 'drive', 'zoho'] : ['zoho'];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">Data update · {pid === 'netiv' ? 'Netiv' : pid === 'wolfson' ? 'Wolfson' : pid}</h1>
        <p className="text-sm text-gray-600">Every change below is shown before it is saved. Untick anything you don't want.
          Rows marked <b>differs</b> already have another value and are only saved if you tick them.
          Pressing Save first downloads a backup of the old values.</p>
      </header>

      {pid !== 'netiv' && pid !== 'wolfson' && (
        <p className="text-sm text-gray-700">Open Netiv or Wolfson to see its updates.</p>
      )}
      {!ready && <p className="text-sm text-amber-700">Waiting for the records to arrive from the cloud…</p>}
      {done && <p className="rounded-md bg-emerald-50 text-emerald-800 text-sm px-3 py-2" data-update-done>{done}</p>}

      {ready && pid === 'netiv' && missingTipusim.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="font-semibold text-gray-900">Netiv type list</h2>
          <p className="text-sm text-gray-600">These types are added to the list in Settings: {missingTipusim.join(', ')}</p>
        </section>
      )}

      {ready && kinds.map(k => {
        const list = rows.filter(r => r.kind === k);
        return (
          <section key={k} className="rounded-lg border border-gray-200 bg-white" data-update-kind={k}>
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{KIND_TITLE[k]} <span className="text-gray-500 font-normal">· {list.filter(isOn).length} of {list.length} ticked</span></h2>
              <p className="text-xs text-gray-500">{KIND_NOTE[k]}</p>
            </div>
            {list.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">Nothing to change. Everything already matches.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 w-10"></th><th className="px-2 py-2">Flat</th><th className="px-2 py-2">Now</th><th className="px-2 py-2">After</th><th className="px-2 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.key} className="border-t border-gray-100">
                        <td className="px-4 py-1.5"><input type="checkbox" aria-label={`Change ${aptKey(r.apt)}`} checked={isOn(r)} onChange={() => toggle(r)} /></td>
                        <td className="px-2 py-1.5 font-medium tabular-nums">{r.apt.buildingId} · {r.apt.apartmentNumber}</td>
                        <td className="px-2 py-1.5 text-gray-500">{r.before}</td>
                        <td className="px-2 py-1.5">{r.after}</td>
                        <td className="px-2 py-1.5">{r.differs && <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">differs</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {ready && (pid === 'netiv' || pid === 'wolfson') && (
        <div className="sticky bottom-0 bg-white/95 border-t border-gray-200 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-700">{chosen.length} change{chosen.length === 1 ? '' : 's'} ticked</span>
          <button type="button" onClick={apply} disabled={busy || (!chosen.length && !missingTipusim.length)}
            className="rounded-md bg-[#1e3a5f] text-white text-sm font-semibold px-4 py-2 disabled:opacity-40">
            Download backup and save
          </button>
        </div>
      )}
    </div>
  );
}
