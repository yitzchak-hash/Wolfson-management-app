/**
 * WHO DID WHAT — the work that was finished, as sentences, newest first.
 *
 * The owner, standing on the Job Board (recording 2026-10-08): "another
 * widget here that basically says very simply, in the order that it was
 * done: 'Igor finished Drilling in apartment this and that' — and then I
 * should be able to click on the apartment, it should be like a link …
 * I want to see exactly what was done, with pictures under it."
 *
 * Every workspace at once: the open one live from the store, every other
 * from its snapshot (kept current by the foreign sync, which carries tasks
 * and photos), re-read on `snapshotTick`. The sentences are built by the
 * pure `workDone()`; this file only draws them. The derivation is memoised
 * on its inputs and a five-minute clock — never per frame — and the list
 * DRAWS thirty lines at a time (the Active-jobs freeze lesson: widgets are
 * never culled, so a long list is paid for on every scroll).
 *
 * Each apartment in a sentence is a link: in the open workspace it opens the
 * job window (`openJob`), in another one it travels there (`openUnit`) —
 * which is what the board, the dashboard and the wall each provide. The
 * pictures under a line open the app's one viewer with all of them.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { he as heLocale } from 'date-fns/locale';
import { ListChecks } from 'lucide-react';
import type { CanvasElement, Contractor, ContractorPhoto, MainUiStrings, Stage } from '../../types';
import { getStageName, personColor, projectShortName } from '../../types';
import { WidgetCtx, Frame, d, isSampleCtx } from '../../data/widgets';
import { useStore, loadProjectSnapshot } from '../../data/store';
import {
  workDone, byDay, placesByBuilding, sampleWork, localDay, SAMPLE_WORK_STAGES,
  WorkLine, WorkSource,
} from '../../data/workDone';
import { SiteShot, shotKindOf } from '../../data/sitePhotos';
import { photoSrcOf } from '../../data/photoSrc';
import { ShotTile, useShotViewer } from './ShotTiles';

/** How many sentences the list DRAWS at a time; the rest are one press away. */
const LINE_CAP = 30;
/** How many thumbnails sit under one sentence; the rest open from the "+N". */
const PHOTO_CAP = 8;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * One parse per workspace per snapshot bump, shared by every copy of the
 * widget — a snapshot is a JSON.parse of a whole workspace. Keyed by the tick
 * AND the open workspace: switching makes the old one foreign, and its
 * snapshot was written by `persist()` without a bump.
 */
const snapCache = new Map<string, { stamp: string; src: WorkSource | null }>();
function snapshotSource(pid: string, stamp: string): WorkSource | null {
  const hit = snapCache.get(pid);
  if (hit && hit.stamp === stamp) return hit.src;
  const snap = loadProjectSnapshot(pid);
  const src = snap.assignments.some(a => a.completedAt)
    ? { projectId: pid, apartments: snap.apartments, assignments: snap.assignments, photos: snap.photos }
    : null;
  snapCache.set(pid, { stamp, src });
  return src;
}

interface Labels { [pid: string]: { label: string; color: string } }

export function WhoDidWhatWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const s = useStore(st => st.mainUiStrings);
  const tick = useStore(st => st.snapshotTick);
  const pid = useStore(st => st.currentProjectId);
  const projects = useStore(st => st.projects);
  const storeStages = useStore(st => st.stages);
  const storeContractors = useStore(st => st.contractors);
  const liveApts = useStore(st => st.apartments);
  const liveAsg = useStore(st => st.contractorAssignments);
  const livePhotos = useStore(st => st.contractorPhotos);
  const sample = isSampleCtx(c) || !!d(el).sample;
  const he = !!s.isRtl;

  const days = Math.max(1, Math.min(90, Number(d(el).days) || 7));
  const showPhotos = String(d(el).photos ?? '1') !== '0';
  const onlyWho = (d(el).contractorId as string) || '';

  // The window's edge and "Today"/"Yesterday" move with the clock — a slow
  // tick, so the derivation re-runs a few times an hour, never per frame.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5 * 60_000); return () => clearInterval(t); }, []);

  const sampleSet = useMemo(() => (sample ? sampleWork(c.contractors, now) : null), [sample, c.contractors, now]);

  // The open workspace, live — a close shows the moment its record lands.
  const live = useMemo<WorkSource | null>(() => (sample ? null
    : { projectId: pid, apartments: liveApts, assignments: liveAsg, photos: livePhotos }),
  [sample, pid, liveApts, liveAsg, livePhotos]);

  // Every other workspace, from its snapshot, re-read on the tick alone.
  const foreign = useMemo<WorkSource[]>(() => {
    if (sample) return [];
    const stamp = `${tick}|${pid}`;
    const out: WorkSource[] = [];
    for (const p of projects) {
      if (p.id === pid) continue;
      const src = snapshotSource(p.id, stamp);
      if (src) out.push(src);
    }
    return out;
  }, [sample, tick, projects, pid]);

  const labels = useMemo<Labels>(() => {
    if (sampleSet) return sampleSet.labels;
    const out: Labels = {};
    for (const p of projects) out[p.id] = { label: projectShortName(p, he, p.id), color: p.color ?? '#1e3a5f' };
    return out;
  }, [sampleSet, projects, he]);

  const stages: Stage[] = sample ? SAMPLE_WORK_STAGES : storeStages;
  const contractors: Contractor[] = sampleSet ? sampleSet.contractors : storeContractors;

  const lines = useMemo(() => {
    const sources = sampleSet ? sampleSet.sources : [...(live ? [live] : []), ...foreign];
    return workDone(sources, { now, days, contractorId: onlyWho || undefined, stages, contractors, unknown: s.unknownUser });
  }, [sampleSet, live, foreign, now, days, onlyWho, stages, contractors, s.unknownUser]);

  // The pictures of every line, as the tiles' own records — once per change.
  const shotsByLine = useMemo(() => {
    const out = new Map<string, SiteShot[]>();
    if (!showPhotos) return out;
    for (const l of lines) {
      const lab = labels[l.projectId] ?? { label: '', color: '#64748b' };
      const placeTitle = new Map(l.places.map(p => [p.aptId, p.title]));
      const list: SiteShot[] = [];
      for (const p of l.photos) {
        const shot = toShot(p, l, lab.label, lab.color, placeTitle.get(p.apartmentId) ?? '');
        if (shot) list.push(shot);
      }
      if (list.length) out.set(l.key, list);
    }
    return out;
  }, [lines, labels, showPhotos]);

  const stageById = useMemo(() => new Map(stages.map(st => [st.id, st])), [stages]);
  const viewer = useShotViewer();
  const [cap, setCap] = useState(LINE_CAP);
  const shown = useMemo(() => lines.slice(0, cap), [lines, cap]);
  const daysShown = useMemo(() => byDay(shown), [shown]);

  // The summary: how many places and how many people. The places number
  // opens its list when every place is in the open workspace — the host's
  // list can only show the open workspace's jobs, and a number that opens
  // half its list is worse than one that opens nothing.
  const summary = useMemo(() => {
    const places = new Map<string, { pid: string; id: string }>();
    const people = new Set<string>();
    for (const l of lines) {
      people.add(l.contractorId);
      for (const p of l.places) if (!p.aptId.startsWith('ws:')) places.set(`${l.projectId}|${p.aptId}`, { pid: l.projectId, id: p.aptId });
    }
    const all = [...places.values()];
    const local = all.every(x => x.pid === pid);
    return { places: all.length, people: people.size, ids: local ? all.map(x => x.id) : null };
  }, [lines, pid]);

  const windowWords = s.wdwWindow.replace('{n}', String(days));
  const title = (d(el).title as string) || `${s.wdwTitle} · ${windowWords}`;
  const whoName = onlyWho ? (contractors.find(x => x.id === onlyWho)?.name ?? '') : '';

  const today = localDay(now);
  const yesterday = localDay(now - 86_400_000);
  const dayLabel = (day: string) => {
    if (day === today) return s.today;
    if (day === yesterday) return s.wdwYesterday;
    const x = new Date(`${day}T12:00:00`);
    return isNaN(x.getTime()) ? day : format(x, he ? 'EEEE d MMM' : 'EEE d MMM', he ? { locale: heLocale } : undefined);
  };

  const canOpen = (projectId: string) => !sample && (projectId === pid || !!c.openUnit);
  const { openJob, openUnit } = c;
  const openPlace = useCallback((projectId: string, aptId: string) => {
    if (projectId === pid) openJob(aptId);
    else openUnit?.(projectId, aptId);
  }, [pid, openJob, openUnit]);

  return (
    <Frame title={title} icon={ListChecks} tone="#0f766e">
      <div className="h-full flex flex-col min-h-0" dir={he ? 'rtl' : 'ltr'} data-who-did-what>
        {lines.length > 0 && (
          <div className="flex items-baseline gap-1.5 flex-shrink-0 mb-0.5 text-[9.5px] text-slate-400" data-wdw-summary>
            {summary.ids && c.showList && !sample
              ? <button type="button" data-no-drag data-el-action data-wdw-count onPointerDown={stop}
                  onClick={e => { e.stopPropagation(); c.showList!(title, summary.ids!); }}
                  className="text-[15px] font-black leading-none text-slate-800 hover:text-[#1e3a5f] hover:underline">{summary.places}</button>
              : <span className="text-[15px] font-black leading-none text-slate-800" data-wdw-count>{summary.places}</span>}
            <span>{s.wdwPlaces} · <b className="text-slate-600">{summary.people}</b> {s.wdwWorkers}</span>
            {whoName && <span className="ms-auto font-bold text-slate-600 truncate" data-wdw-only>{whoName}</span>}
          </div>
        )}
        <div className="flex-1 min-h-0">
          {lines.length === 0 && (
            <span className="text-[10.5px] text-gray-400" data-wdw-empty>
              {whoName
                ? s.wdwEmptyWho.replace('{who}', whoName).replace('{n}', String(days))
                : s.wdwEmpty.replace('{n}', String(days))}
            </span>
          )}
          {daysShown.map(g => (
            <div key={g.day} data-wdw-day={g.day}>
              <div className="sticky top-0 z-[1] bg-white/95 text-[9px] font-extrabold uppercase tracking-wide text-slate-400 pt-1 pb-0.5"
                data-wdw-day-label>{dayLabel(g.day)}</div>
              {g.lines.map(l => (
                <Sentence key={l.key} line={l} s={s} he={he} stageById={stageById}
                  label={labels[l.projectId]} shots={shotsByLine.get(l.key)}
                  linkable={canOpen(l.projectId)} onPlace={openPlace}
                  onShot={viewer.open} />
              ))}
            </div>
          ))}
          {lines.length > shown.length && (
            <button type="button" data-no-drag data-el-action data-wdw-more onPointerDown={stop}
              onClick={e => { e.stopPropagation(); setCap(n => n + LINE_CAP); }}
              className="w-full mt-1 py-1 rounded-md text-[9.5px] font-bold text-[#1e3a5f] bg-slate-100 hover:bg-slate-200">
              {s.wdwShowMore.replace('{n}', String(Math.min(LINE_CAP, lines.length - shown.length)))}
            </button>
          )}
        </div>
      </div>
      {viewer.node}
    </Frame>
  );
}

/** A tile's record for one picture under a line. */
function toShot(p: ContractorPhoto, l: WorkLine, projectLabel: string, projectColor: string, jobName: string): SiteShot | null {
  const kind = shotKindOf(p);
  if (!kind) return null;
  const playable = p.storageUrl || p.dataUrl || '';
  // A film that plays from its own address draws its own first frame — its
  // address is not a picture, and an <img> given it is a broken square. Only
  // a Drive film (no playable address) wears Drive's thumbnail of it.
  const thumb = kind === 'video' && playable ? '' : photoSrcOf(p, 240);
  if (!thumb && !playable) return null;
  return {
    id: p.id, photo: p, kind, projectId: l.projectId, projectLabel, projectColor,
    jobId: p.apartmentId, jobName, who: l.who, at: p.uploadedAt ?? '', thumb, playable,
  };
}

const hhmm = (iso: string) => {
  const x = new Date(iso);
  return isNaN(x.getTime()) ? '' : `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`;
};

/** One sentence: who · what · where (each place a link) · the workspace · when · the pictures. */
const Sentence = React.memo(function Sentence({ line: l, s, he, stageById, label, shots, linkable, onPlace, onShot }: {
  line: WorkLine;
  s: MainUiStrings;
  he: boolean;
  stageById: Map<string, Stage>;
  label?: { label: string; color: string };
  shots?: SiteShot[];
  linkable: boolean;
  onPlace: (projectId: string, aptId: string) => void;
  onShot: (list: SiteShot[], i: number) => void;
}) {
  const verb = l.kind === 'done' ? s.wdwFinished
    : l.kind === 'half' ? s.wdwWorkedOn
    : l.kind === 'problem' ? s.wdwFixedProblem
    : l.words.length ? s.wdwFinished : s.wdwWorked;
  const stagesNamed = l.stageIds.map(id => stageById.get(id)).filter((x): x is Stage => !!x);
  const groups = placesByBuilding(l.places.filter(p => p.label));
  const inGap = /[־-]$/.test(s.wdwIn) ? '' : ' ';
  const t1 = hhmm(l.first), t2 = hhmm(l.last);
  const when = t1 && t2 && t1 !== t2 ? `${t1}–${t2}` : t2;
  const initial = (l.who || '?').trim().charAt(0).toUpperCase() || '?';
  const colour = personColor(l.who || '?');

  return (
    <div className="py-1 border-b border-slate-100 last:border-b-0" data-wdw-line={l.key} data-wdw-kind={l.kind}
      data-wdw-line-ws={l.projectId} data-wdw-line-who={l.contractorId}>
      <div className="flex items-start gap-1.5">
        <span className="mt-[1px] flex-shrink-0 rounded-full text-white font-black grid place-items-center"
          style={{ width: 16, height: 16, fontSize: 8.5, background: colour }}>{initial}</span>
        <div className="min-w-0 flex-1 text-[11px] leading-snug text-slate-700" data-wdw-sentence>
          <b className="text-slate-900" data-wdw-who>{l.who}</b>{' '}
          <span>{verb}</span>{' '}
          {stagesNamed.length > 0 && (
            <b className="text-slate-900" data-wdw-what>
              {stagesNamed.map((st, i) => (
                <React.Fragment key={st.id}>
                  {i > 0 && ' + '}
                  <span className="inline-block rounded-full align-middle me-0.5"
                    style={{ width: 6, height: 6, background: st.color || '#94a3b8' }} />
                  {getStageName(st, he)}
                </React.Fragment>
              ))}
            </b>
          )}
          {l.kind === 'task' && l.words.length > 0 && (
            <b className="text-slate-900" data-wdw-what>“{l.words.join(' · ')}”</b>
          )}
          {l.kind === 'half' && <span className="text-amber-600 font-semibold" data-wdw-half> ({s.wdwNotFinished})</span>}
          {groups.length > 0 && (
            <>
              {' '}{s.wdwIn}{inGap}
              {groups.map((g, gi) => (
                <span key={g.buildingId || `g${gi}`} data-wdw-building={g.buildingId}>
                  {gi > 0 && <span className="text-slate-300"> · </span>}
                  {g.places.map((p, i) => (
                    <React.Fragment key={p.aptId}>
                      {i > 0 && ', '}
                      {linkable && !p.aptId.startsWith('ws:')
                        ? <button type="button" data-no-drag data-el-action data-wdw-place={p.aptId} data-wdw-place-ws={l.projectId}
                            onPointerDown={stop}
                            onClick={e => { e.stopPropagation(); onPlace(l.projectId, p.aptId); }}
                            title={`${p.title}${label?.label ? ` · ${label.label}` : ''}`}
                            className="font-bold text-[#1e6a9e] underline decoration-dotted underline-offset-2 hover:text-[#1e3a5f] hover:decoration-solid">
                            {p.label}
                          </button>
                        : <b className="text-slate-800" data-wdw-place={p.aptId} title={p.title}>{p.label}</b>}
                    </React.Fragment>
                  ))}
                  {g.buildingId && <span className="text-slate-400 text-[10px]"> · {g.buildingId}</span>}
                </span>
              ))}
            </>
          )}
          {l.kind === 'problem' && l.words.length > 0 && (
            <div className="text-[10px] italic text-slate-500 truncate" data-wdw-words>{l.words.join(' · ')}</div>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-0.5 ps-1">
          {label?.label && (
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 text-[8.5px] font-bold leading-[14px]"
              style={{ background: `${label.color}1f`, color: label.color }} data-wdw-ws-chip>
              <span className="inline-block rounded-full" style={{ width: 5, height: 5, background: label.color }} />
              {label.label}
            </span>
          )}
          {/* A time range reads left to right in either language — under RTL the
              bidi order would print "9:00–8:48". */}
          {when && <span dir="ltr" className="text-[9px] text-slate-400 tabular-nums" data-wdw-time>{when}</span>}
        </div>
      </div>
      {shots && shots.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 ps-[22px]" data-wdw-photos>
          {shots.slice(0, PHOTO_CAP).map((sh, i) => (
            <ShotTile key={sh.id} shot={sh} caption={false} size={0.8}
              onOpen={() => onShot(shots, i)} style={{ width: 44, height: 44 }} className="flex-shrink-0" />
          ))}
          {shots.length > PHOTO_CAP && (
            <button type="button" data-no-drag data-el-action data-wdw-more-photos onPointerDown={stop}
              onClick={e => { e.stopPropagation(); onShot(shots, PHOTO_CAP); }}
              title={s.wdwMorePhotos.replace('{n}', String(shots.length))}
              className="flex-shrink-0 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black"
              style={{ width: 44, height: 44 }}>+{shots.length - PHOTO_CAP}</button>
          )}
        </div>
      )}
    </div>
  );
});
