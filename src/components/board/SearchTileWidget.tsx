import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { Mic, Search, X } from 'lucide-react';
import { Apartment, CanvasElement, aptLabel, binLabelOf, getStageName } from '../../types';
import { d, WidgetCtx } from '../../data/widgets';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { queryVariants, skeleton } from '../../data/translit';
import { useSpeechToText } from '../../data/voiceSearch';

/**
 * The big search button — the owner's ask, in his words: "just a big
 * magnifying glass button… a big square that I press on and a window pops up
 * that lets me smartly search just like Google Drive… we'll also be able to
 * talk in the search."
 *
 * The TILE is nothing but the company's mark and a huge magnifying glass —
 * a button, not a widget with an input squeezed into it (that one already
 * exists as "Find a job"; this is the walk-up-and-press style for the
 * touchscreen and the wall). Pressing it opens a WINDOW with one big input:
 *  - the search is the app's own forgiving one (`queryVariants`/`skeleton` —
 *    Hebrew against English, a wrong keyboard layout, a near miss), across
 *    EVERY workspace: the open one live, the others from their snapshots on
 *    this machine;
 *  - the microphone speaks the query in (`useSpeechToText`) — interim words
 *    land as they are said, so the list narrows while you talk;
 *  - a row opens the job: `openJob` here, `openUnit` for another workspace —
 *    both of which the board AND the wall provide, so the same tile works on
 *    the office touchscreen and on the TV.
 *
 * Wiring rules, all paid for elsewhere:
 *  - the window PORTALS to document.body — a `position: fixed` panel inside
 *    the board's transformed world anchors to the transform, not the screen;
 *  - the portal SEALS its pointer events (the portal-in-a-node trap: a press
 *    on a row would otherwise reach the node's own pointerdown, which
 *    captures the pointer and the row never sees its click);
 *  - Escape closes on CAPTURE and stops, so the board's own Escape ladder
 *    underneath never hears it;
 *  - Trash never appears; other groups appear, labeled — the board search's
 *    standing visibility rule.
 */
export function SearchTileWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const sample = !!data.sample;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-no-drag data-el-action data-search-tile
        onClick={() => { if (!sample) setOpen(true); }}
        title={c.isRtl ? 'חיפוש' : 'Search'}
        className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-xl
                   active:scale-95 transition-transform select-none"
        style={{ backgroundColor: '#ffffff' }}
      >
        <img src="/tzviair-logo.png" alt="TzviAir" className="h-9 object-contain" draggable={false} />
        <span
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: 92, height: 92,
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2c5a8f 60%, #4aa8d8 130%)',
            boxShadow: '0 6px 18px rgba(30,58,95,.35), inset 0 1px 0 rgba(255,255,255,.15)',
          }}
        >
          <Search size={52} strokeWidth={2.4} color="#ffffff" />
        </span>
        <span className="font-black tracking-wide" style={{ color: '#1e3a5f', fontSize: 15 }}>
          {String(data.title || (c.isRtl ? 'חיפוש' : 'Search'))}
        </span>
      </button>
      {open && <SearchWindow c={c} onClose={() => setOpen(false)} />}
    </>
  );
}

interface Hit {
  key: string;
  job: Apartment;
  projectId?: string;          // absent = the open workspace
  workspace?: string;
  stageName?: string;
  stageColor?: string;
  binLabel?: string;
  score: number;
}

/**
 * MODULE LEVEL (the declared-in-render trap) and mounted only while open, so
 * the snapshots are parsed once per opening rather than living on every tile.
 */
function SearchWindow({ c, onClose }: { c: WidgetCtx; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isRtl = !!c.isRtl;
  const t = (en: string, he: string) => (isRtl ? he : en);

  // The open workspace INCLUDING its bins (the notebook's own lesson: c.jobs
  // excludes them, and a finished job must still be findable — labeled).
  const apartments = useStore(s => s.apartments);
  const canvasElements = useStore(s => s.canvasElements);
  const stages = useStore(s => s.stages);
  const projects = useStore(s => s.projects);
  const currentProjectId = useStore(s => s.currentProjectId);
  const snapTick = useStore(s => s.snapshotTick);

  const { listening, toggle, supported } = useSpeechToText(
    isRtl ? 'he-IL' : 'en-US', text => setQuery(text));

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Escape closes this window and ONLY this window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Every other workspace, from what this machine last saw of it.
  const snaps = useMemo(() => {
    const got: { pid: string; name: string; snap: ReturnType<typeof loadProjectSnapshot> }[] = [];
    projects.forEach(p => {
      if (p.id !== currentProjectId) got.push({ pid: p.id, name: p.name, snap: loadProjectSnapshot(p.id) });
    });
    return got;
    // snapTick: a snapshot hydrating from the cloud mid-search must re-read.
  }, [projects, currentProjectId, snapTick]);

  /**
   * The POOL: every findable job across every workspace, with the text it
   * can be found by. Built from the data, not the query, so typing does not
   * re-walk three workspaces per letter.
   */
  const pool = useMemo(() => {
    const stageNameOf = (job: Apartment, sts: typeof stages) => {
      const st = sts.find(x => x.id === job.currentStageId);
      return st ? { name: getStageName(st, isRtl), color: st.color } : {};
    };
    const groupLabel = (job: Apartment, els: CanvasElement[]) => {
      if (!job.boardBin || job.boardBin === 'trash') return undefined;
      const el = els.find(e => e.id === job.boardBin || e.binKind === job.boardBin);
      if (el) return binLabelOf(el);
      return job.boardBin.charAt(0).toUpperCase() + job.boardBin.slice(1);
    };
    const taskMap = (as: { apartmentId: string; taskDescription?: string }[]) => {
      const m = new Map<string, string>();
      for (const a of as) {
        if (!a.taskDescription) continue;
        m.set(a.apartmentId, `${m.get(a.apartmentId) ?? ''} ${a.taskDescription}`);
      }
      return m;
    };
    const out: (Hit & { hay: string; label: string })[] = [];
    const walk = (
      jobs: Apartment[], sts: typeof stages, els: CanvasElement[],
      taskTexts: Map<string, string>, pid?: string, ws?: string,
    ) => {
      for (const job of jobs) {
        if (job.isUnnamed || job.boardBin === 'trash') continue;   // Trash never appears.
        const label = aptLabel(job) || job.address?.trim() || '';
        if (!label) continue;
        const st = stageNameOf(job, sts);
        out.push({
          key: `${pid ?? 'here'}:${job.id}`, job, projectId: pid, workspace: ws,
          stageName: st.name, stageColor: st.color, binLabel: groupLabel(job, els),
          score: 0, label,
          hay: `${label} ${job.address ?? ''} ${job.phone ?? ''} ${job.generalNotes ?? ''} ${taskTexts.get(job.id) ?? ''}`,
        });
      }
    };
    walk(apartments, stages, canvasElements, taskMap(c.assignments));
    for (const { pid, name, snap } of snaps) {
      walk(snap.apartments ?? [], snap.stages ?? stages, snap.canvasElements ?? [],
        taskMap(snap.assignments ?? []), pid, name);
    }
    return out;
  }, [apartments, stages, canvasElements, c.assignments, snaps, isRtl]);

  /**
   * The fuzzy net is over the NAME alone. Run over the whole hay it matched
   * task words against half the query ("coen" ≈ "condenser") and buried the
   * real Cohen under strangers; address, phone, notes and task text are
   * still found by the substring and skeleton tiers.
   */
  const fuse = useMemo(
    () => new Fuse(pool, { keys: ['label'], threshold: 0.4, ignoreLocation: true, includeScore: true }),
    [pool]);

  /**
   * Three tiers, GlobalSearch's own manner: a real substring first, then a
   * FUZZY hit (Fuse at ~0.4 — "coen" finds Cohen), then the skeleton /
   * transliteration net (Hebrew against English, the wrong keyboard). The
   * open workspace outranks the others inside each tier.
   */
  const results = useMemo<Hit[]>(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const v = queryVariants(q);
    const ql = q.toLowerCase();
    const best = new Map<string, Hit>();
    const offer = (h: Hit, score: number) => {
      const have = best.get(h.key);
      if (!have || score < have.score) best.set(h.key, { ...h, score });
    };
    for (const row of pool) {
      const low = row.hay.toLowerCase();
      if (v.plain.some(p => low.includes(p.toLowerCase()))) {
        const name = row.label.toLowerCase();
        offer(row, (name.startsWith(ql) ? 0 : name.includes(ql) ? 5 : 10) + (row.projectId ? 2 : 0));
        continue;
      }
      if (v.skeletons.length) {
        const sk = skeleton(row.hay);
        if (v.skeletons.some(k => sk.includes(k))) offer(row, 30 + (row.projectId ? 2 : 0));
      }
    }
    for (const p of v.plain) {
      for (const m of fuse.search(p)) {
        offer(m.item, 20 + (m.score ?? 0.4) * 8 + (m.item.projectId ? 2 : 0));
      }
    }
    return [...best.values()].sort((a, b) => a.score - b.score).slice(0, 30);
  }, [query, pool, fuse]);

  const openHit = (h: Hit) => {
    onClose();
    if (h.projectId && c.openUnit) { c.openUnit(h.projectId, h.job.id); return; }
    c.openJob(h.job.id);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      data-search-window
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[9vh] px-4"
      onPointerDown={stop} onPointerUp={stop} onPointerMove={stop}
      onClick={stop} onDoubleClick={stop} onContextMenu={stop}
    >
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 640, maxHeight: '74vh' }}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 flex-shrink-0">
          <Search size={20} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) openHit(results[0]); }}
            data-enter-own
            placeholder={t('Search everything — a name, an address, half a word…',
                           'חיפוש בכל מקום — שם, כתובת, חצי מילה…')}
            className="flex-1 min-w-0 text-[16px] focus:outline-none text-gray-900 placeholder:text-gray-400"
          />
          {supported && (
            <button
              data-search-mic
              onClick={toggle}
              title={listening ? t('Stop listening', 'הפסק להאזין') : t('Speak the search', 'דברו במקום להקליד')}
              className="p-2 rounded-full flex-shrink-0 transition-colors"
              style={listening
                ? { backgroundColor: '#dc2626', color: '#fff', boxShadow: '0 0 0 5px rgba(220,38,38,.2)' }
                : { color: '#1e3a5f', backgroundColor: '#eef2f7' }}
            >
              <Mic size={17} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {listening && !query.trim() && (
            <div className="px-4 py-3 text-[13px] font-semibold" style={{ color: '#dc2626' }}>
              {t('Listening — say a name or an address…', 'מאזין — אמרו שם או כתובת…')}
            </div>
          )}
          {results.map(h => (
            <button
              key={h.key}
              data-search-hit
              onClick={() => openHit(h)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-start hover:bg-slate-50
                         border-b border-gray-50 transition-colors"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: h.stageColor ?? '#cbd5e1' }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-bold text-slate-800 truncate">
                  {aptLabel(h.job) || h.job.address}
                </span>
                <span className="block text-[11.5px] text-slate-400 truncate">
                  {[h.workspace, h.binLabel, h.stageName, h.job.address].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-gray-400">
              {t('Nothing matches that.', 'אין תוצאות.')}
            </div>
          )}
          {query.trim().length < 2 && !listening && (
            <div className="px-4 py-10 text-center text-[13px] text-gray-400">
              {t('Type — or press the microphone and just say it.',
                 'הקלידו — או לחצו על המיקרופון ופשוט אמרו.')}
            </div>
          )}
        </div>

        {snaps.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[10.5px] text-gray-400 flex-shrink-0">
            {t('Other workspaces show what this computer last saw of them.',
               'סביבות עבודה אחרות מציגות את מה שהמחשב הזה ראה לאחרונה.')}
          </div>
        )}
      </div>
    </div>,
    document.body);
}
