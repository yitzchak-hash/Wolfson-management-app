import React, { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Loader2, FileUp } from 'lucide-react';
import { useStore, RESCUE_PREFIX, type MarksRescue } from '../../data/store';
import { fsGetAll, fsBatchSet, isFirebaseConfigured, projectCollection } from '../../data/firebase';
import type { Apartment, StageMark } from '../../types';

/**
 * "Bring back stage ticks" (owner, 2026-10-29 — "we don't see any colors on
 * the Wolfson page"). One computer's start-up repair wrote empty progress over
 * every Wolfson flat in the cloud. Any computer that still holds the real
 * ticks — its own saved copy of a workspace it has not opened since, or the
 * rescue copy kept just before the cloud replaced its own (store.ts,
 * `keepMarksRescue`) — can put them back from here.
 *
 * Nothing is overwritten: for each flat the cloud's own ticks win stage by
 * stage, and this computer's copy only fills what the cloud is missing.
 */
const PROJECTS = ['wolfson', 'netiv'];

type Found = { pid: string; apts: Array<Pick<Apartment, 'id' | 'stageMarks' | 'currentStageId'>> };

function readLocal(pid: string): Found['apts'] {
  const out = new Map<string, Found['apts'][number]>();
  try {
    const key = pid === 'wolfson' ? 'wolfson_app_data' : `${pid}_app_data`;
    const snap = JSON.parse(localStorage.getItem(key) || '{}') as { apartments?: Apartment[] };
    for (const a of snap.apartments ?? []) {
      if (a.stageMarks && Object.keys(a.stageMarks).length) out.set(a.id, { id: a.id, stageMarks: a.stageMarks, currentStageId: a.currentStageId });
    }
  } catch { /* unreadable copy — nothing from it */ }
  try {
    const r = JSON.parse(localStorage.getItem(RESCUE_PREFIX + pid) || 'null') as MarksRescue | null;
    for (const a of r?.apts ?? []) if (!out.has(a.id)) out.set(a.id, a);
  } catch { /* ignore */ }
  return [...out.values()];
}

/** What each flat gets: the cloud's ticks, with this computer's filling the gaps. */
function plan(local: Found['apts'], cloud: Apartment[]) {
  const byId = new Map(cloud.map(a => [a.id, a]));
  const patches: Array<{ id: string; data: Partial<Apartment> }> = [];
  for (const l of local) {
    const c = byId.get(l.id);
    if (!c) continue;
    const have = (c.stageMarks ?? {}) as Record<string, StageMark>;
    const add = Object.entries(l.stageMarks ?? {}).filter(([k]) => !(k in have));
    if (!add.length && (c.currentStageId || !l.currentStageId)) continue;
    patches.push({ id: l.id, data: {
      stageMarks: { ...Object.fromEntries(add), ...have },
      ...(c.currentStageId ? {} : l.currentStageId ? { currentStageId: l.currentStageId } : {}),
      bubbles: true,
    } });
  }
  return patches;
}

export function MarksRescueCard() {
  const isRtl = useStore(s => s.mainUiStrings.isRtl);
  const [found, setFound] = useState<Array<{ pid: string; patches: ReturnType<typeof plan> }>>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let live = true;
    (async () => {
      const out: Array<{ pid: string; patches: ReturnType<typeof plan> }> = [];
      for (const pid of PROJECTS) {
        const local = readLocal(pid);
        if (local.length < 3) continue;
        const cloud = await fsGetAll(projectCollection(pid, 'apartments')) as unknown as Apartment[];
        if (!cloud.length) continue; // no answer from the cloud — never judge from nothing
        const patches = plan(local, cloud);
        if (patches.length) out.push({ pid, patches });
      }
      if (live) setFound(out);
    })();
    return () => { live = false; };
  }, []);

  const total = found.reduce((n, f) => n + f.patches.length, 0);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * A backup file (Settings → Backup, the JSON in Drive's Backups folder): its
   * apartments are matched to whichever workspace in the cloud shares their
   * ids, and only the ticks the cloud is missing are offered — the same rule.
   */
  const fromFile = async (file: File) => {
    setFileNote(null); setDone(null);
    try {
      const d = JSON.parse(await file.text()) as { apartments?: Apartment[]; exportedAt?: string };
      const local = (d.apartments ?? []).filter(a => a.stageMarks && Object.keys(a.stageMarks).length)
        .map(a => ({ id: a.id, stageMarks: a.stageMarks, currentStageId: a.currentStageId }));
      const out: Array<{ pid: string; patches: ReturnType<typeof plan> }> = [];
      for (const pid of PROJECTS) {
        const cloud = await fsGetAll(projectCollection(pid, 'apartments')) as unknown as Apartment[];
        if (!cloud.length) continue;
        const patches = plan(local, cloud);
        if (patches.length) out.push({ pid, patches });
      }
      setFound(out);
      const n = out.reduce((k, f) => k + f.patches.length, 0);
      const when = d.exportedAt ? new Date(d.exportedAt).toLocaleString(isRtl ? 'he-IL' : 'en-GB') : '';
      setFileNote(n
        ? (isRtl ? `בגיבוי מ-${when}: סימונים של ${n} דירות שחסרים בענן.` : `Backup from ${when}: ticks for ${n} apartments the cloud is missing.`)
        : (isRtl ? `בגיבוי מ-${when} אין סימונים שחסרים בענן.` : `The backup from ${when} has no ticks the cloud is missing.`));
    } catch {
      setFileNote(isRtl ? 'הקובץ הזה אינו גיבוי שאפשר לקרוא.' : 'That file is not a backup this app can read.');
    }
  };
  const pickFile = (
    <>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-marks-rescue-file
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
      <button type="button" data-marks-rescue-pick onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
        <FileUp size={14} />
        {isRtl ? 'מקובץ גיבוי…' : 'From a backup file…'}
      </button>
    </>
  );

  if (!total && done == null) {
    return (
      <div data-marks-rescue="idle" className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3">
        <LifeBuoy size={18} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 flex-1 min-w-0">{isRtl ? 'החזרת סימוני שלבים' : 'Bring back stage ticks'}</span>
        {pickFile}
        {fileNote && <div className="w-full text-[13px] text-gray-600" data-marks-rescue-note>{fileNote}</div>}
      </div>
    );
  }

  const restore = async () => {
    setBusy(true);
    let n = 0;
    for (const f of found) {
      await fsBatchSet(projectCollection(f.pid, 'apartments'), f.patches.map(p => ({ id: p.id, data: { ...p.data, updatedAt: new Date().toISOString() } })));
      n += f.patches.length;
      // The open workspace shows them at once; another one reads them on arrival.
      const st = useStore.getState();
      if (st.currentProjectId === f.pid) {
        const byId = new Map(f.patches.map(p => [p.id, p.data]));
        useStore.setState({ apartments: st.apartments.map(a => byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a) });
      }
    }
    setBusy(false); setDone(n); setFound([]);
  };

  return (
    <div data-marks-rescue className="bg-amber-50 border border-amber-300 rounded-xl p-3 md:p-4 mb-4 flex items-start gap-3">
      <LifeBuoy size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        {done != null ? (
          <div className="text-sm font-semibold text-emerald-800" data-marks-rescue-done={done}>
            {isRtl ? `התקדמות של ${done} דירות הוחזרה.` : `Progress brought back for ${done} apartments.`}
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold text-gray-900">
              {fileNote
                ? (isRtl ? 'קובץ הגיבוי מחזיק התקדמות שאבדה בענן' : 'The backup file holds progress the cloud lost')
                : (isRtl ? 'המחשב הזה שמר התקדמות שאבדה בענן' : 'This computer kept progress the cloud lost')}
            </div>
            <div className="text-[13px] text-gray-700 mt-0.5" data-marks-rescue-count={total}>
              {fileNote ?? (isRtl ? `סימוני שלבים של ${total} דירות.` : `Stage ticks for ${total} apartments.`)}
            </div>
            <button type="button" data-marks-rescue-go disabled={busy} onClick={restore}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#1e3a5f] text-white hover:bg-[#162d4a] disabled:opacity-60">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {isRtl ? 'להחזיר' : 'Bring them back'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
