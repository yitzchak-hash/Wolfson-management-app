import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, RefreshCw, ArrowUpRight } from 'lucide-react';
import { useStore, loadProjectSnapshot } from '../data/store';
import { isFirebaseConfigured } from '../data/firebase';
import { fetchActivityFor, fetchedActivity, isFetchingActivity, useActivityCenterVersion } from '../data/activityCenter';
import {
  ACTIVITY_FAMILIES, ACTIVITY_UI, ActivityFamily, ActivityGroup, ActivityLang, ActivitySentence, ScopedLog,
  describeGroup, describeLog, familyOf, foldActivity, kindOf, newestFirst, placeName,
} from '../data/activityWords';
import { rememberReturn } from '../data/unitTravel';
import { Apartment, projectColor, projectShortName } from '../types';
import { ActivityAvatar, FamilyIcon, clockRange, dayKey, dayLabel } from '../components/ui/ActivityBits';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';
import { format } from 'date-fns';

/** How many rows draw before "Show more" — a busy month is thousands of records. */
const PAGE = 120;

/** A row of filter chips: wraps on a desktop, scrolls sideways on a phone. */
const CHIP_ROW = 'flex gap-2 min-w-0 flex-nowrap md:flex-wrap overflow-x-auto md:overflow-visible no-bar edge-fade [&>*]:flex-shrink-0';

interface Place {
  name: string;
  /** Present only when the record still exists somewhere it can be opened. */
  open?: () => void;
  openTitle?: string;
}

/**
 * One row of the log: who · what · where · when, consolidated runs folded
 * shut with a "Show all" that opens them. The whole row is the door to the
 * apartment it happened in; the expand button is its own press.
 *
 * Module level — a component declared in the page's render would be a new
 * type every render and remount every row on each tick.
 */
function GroupRow({
  group, words, family, place, building, ws, lang, expanded, onToggle, entries, dim,
}: {
  group: ActivityGroup<ScopedLog>;
  words: ActivitySentence;
  family: ActivityFamily;
  place: Place | null;
  building?: string;
  ws?: { name: string; color: string };
  lang: ActivityLang;
  expanded: boolean;
  onToggle: () => void;
  entries: Array<{ id: string; text: string; detail?: string; time: string }>;
  dim: boolean;
}) {
  const ui = ACTIVITY_UI[lang];
  const n = group.logs.length;
  const time = clockRange(group.newest, group.oldest);
  const pressable = !!place?.open;
  return (
    <div
      data-activity-row={group.id}
      data-activity-kind={group.kind}
      data-activity-count={n}
      data-activity-ws={group.logs[0].ws ?? ''}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      title={pressable ? place!.openTitle : undefined}
      onClick={pressable ? () => place!.open!() : undefined}
      onKeyDown={pressable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place!.open!(); } }) : undefined}
      className={`flex gap-3 px-3 sm:px-4 py-3 transition-colors ${pressable ? 'cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50' : ''}`}
    >
      <ActivityAvatar name={words.who} size={34} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className={`flex-1 min-w-0 text-sm leading-snug ${dim ? 'text-gray-500' : 'text-gray-700'}`} data-activity-sentence>
            <b className={`font-semibold ${dim ? 'text-gray-600' : 'text-gray-900'}`}>{words.who}</b>{' '}
            <span>{words.text}</span>
          </p>
          <span dir="ltr" className="flex-shrink-0 text-xs tabular-nums text-gray-400 mt-0.5" data-activity-time>{time}</span>
        </div>
        {words.detail && (
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 break-words" data-activity-detail>{words.detail}</p>
        )}
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap text-xs min-w-0">
          {place && (
            <span
              className={`inline-flex items-center gap-1 min-w-0 max-w-full font-semibold ${pressable ? 'text-[#2b7fb0]' : 'text-gray-500'}`}
              data-activity-place
            >
              <span className="truncate">{place.name}</span>
              {pressable && <ArrowUpRight size={12} className="flex-shrink-0 opacity-70" />}
            </span>
          )}
          {building && (
            <span className="px-1.5 py-px rounded bg-gray-100 text-gray-500 font-medium" data-activity-building>{building}</span>
          )}
          {ws && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full font-semibold"
              style={{ backgroundColor: `${ws.color}17`, color: ws.color }}
              data-activity-ws-chip
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ws.color }} />
              {ws.name}
            </span>
          )}
          {n > 1 && (
            <button
              type="button"
              data-activity-expand
              onClick={e => { e.stopPropagation(); onToggle(); }}
              onKeyDown={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 font-medium"
            >
              <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? ui.hide : ui.showAll(n)}
            </button>
          )}
        </div>
        {expanded && n > 1 && (
          <ul className="mt-2 border-s-2 border-gray-100 ps-3 space-y-1" data-activity-entries>
            {entries.map(e => (
              <li key={e.id} className="text-xs text-gray-600 flex items-baseline gap-2 min-w-0" data-activity-entry>
                <span dir="ltr" className="tabular-nums text-gray-400 flex-shrink-0">{e.time}</span>
                <span className="min-w-0 truncate">{e.text}</span>
                {e.detail && <span className="min-w-0 truncate text-gray-400">{e.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <FamilyIcon family={family} />
    </div>
  );
}

/**
 * THE ACTIVITY LOG — in plain words, consolidated, and (on the Job Board) for
 * every workspace at once.
 *
 * The owner, 2026-10-05: the log was "not clear enough — I have to read so
 * much to understand what the hell happened", and the Job Board's showed none
 * of the day's site work because that work happened in Wolfson. Now:
 *  - every record is worded by `activityWords` — no field names, no type
 *    codes, no timestamps, no camera file names;
 *  - neighbouring records by the same person on the same apartment of the
 *    same kind within half an hour are ONE row ("Igor uploaded 5 photos"),
 *    which opens up to show each;
 *  - rows sit under day headings, newest first;
 *  - on the JOB BOARD the page is the activity centre: the other workspaces'
 *    records are fetched when the page opens (never at app load — reads cost
 *    money) and merged in, each wearing its workspace. The other workspaces'
 *    own Activity pages stay their own.
 *  - pressing a row opens the apartment: here, over the list, when it belongs
 *    to this workspace; otherwise the app travels there (switch first, intent
 *    after — the settled order) holding a return ticket, so closing the
 *    window brings you straight back to this list.
 */
export function ActivityLogPage() {
  const activityLogs = useStore(st => st.activityLogs);
  const apartments = useStore(st => st.apartments);
  const stages = useStore(st => st.stages);
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const currentUser = useStore(st => st.currentUser);
  const s = useStore(st => st.mainUiStrings);
  const snapTick = useStore(st => st.snapshotTick);
  const setCurrentProject = useStore(st => st.setCurrentProject);
  const setPendingFocus = useStore(st => st.setPendingFocus);
  const navigate = useNavigate();
  const lang: ActivityLang = s.isRtl ? 'he' : 'en';
  const ui = ACTIVITY_UI[lang];
  const center = currentProjectId === 'general';
  const cloudVer = useActivityCenterVersion();

  const others = useMemo(
    () => (center ? projects.filter(p => p.id !== currentProjectId) : []),
    [center, projects, currentProjectId],
  );
  const othersKey = others.map(p => p.id).join(',');

  // The other workspaces' records — fetched when the page OPENS, once a session.
  useEffect(() => {
    if (!center || !isFirebaseConfigured || !othersKey) return;
    fetchActivityFor(othersKey.split(','));
  }, [center, othersKey]);

  /**
   * Each other workspace: its records and its rooms (to name a unit and know
   * it can open). The records are the cloud's answer AND what this machine
   * last saw, together — the cloud's is fetched once a session, so on its
   * own it would miss what you did over there a minute ago (travel to
   * Wolfson, tick a stage, come back); the local copy is written the moment
   * you leave a workspace. The merge below drops the duplicates by id.
   */
  const foreign = useMemo(() => others.map(p => {
    const snap = loadProjectSnapshot(p.id);
    const cloud = fetchedActivity(p.id)?.logs ?? [];
    return {
      pid: p.id,
      logs: [...cloud, ...snap.activityLogs],
      apts: new Map(snap.apartments.map(a => [a.id, a])),
      known: snap.apartments.length > 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [others, snapTick, cloudVer]);

  const ownApts = useMemo(() => new Map(apartments.map(a => [a.id, a])), [apartments]);

  const all: ScopedLog[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ScopedLog[] = [];
    const add = (l: ScopedLog) => { if (l && l.id && !seen.has(l.id)) { seen.add(l.id); out.push(l); } };
    for (const l of activityLogs) add({ ...l, ws: currentProjectId });
    for (const f of foreign) for (const l of f.logs) add({ ...l, ws: f.pid });
    return newestFirst(out);
  }, [activityLogs, foreign, currentProjectId]);

  // ── Filters ──
  const [wsFilter, setWsFilter] = useState<string>('all');
  const [family, setFamily] = useState<ActivityFamily | 'all'>('all');
  const [person, setPerson] = useState<string>('all');
  const [building, setBuilding] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // By NAME: "Who: Igor" means Igor, whether he wrote as a worker on his
  // phone or as a user at the office — two ids, one person to choose.
  const personKey = (l: ScopedLog) => ((l.userName || '').trim().toLowerCase() || (l.userId || '').trim());
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of all) {
      const k = personKey(l);
      if (k && !m.has(k)) m.set(k, (l.userName || '').trim() || s.unknownUser);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all, s.unknownUser]);

  const inWs = (l: ScopedLog) => wsFilter === 'all' || l.ws === wsFilter;
  // Buildings belong to ONE workspace — in the centre the row appears once a
  // workspace is chosen, or A1, A3 and B1 would sit side by side as if they
  // were one project's.
  const buildingIds = useMemo(() => {
    if (center && wsFilter === 'all') return [];
    const ids = new Set<string>();
    for (const l of all) if (inWs(l) && l.buildingId && l.buildingId !== 'G') ids.add(l.buildingId);
    return [...ids].sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, wsFilter, center]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return all.filter(l => {
      if (!inWs(l)) return false;
      if (person !== 'all' && personKey(l) !== person) return false;
      if (building !== 'all' && l.buildingId !== building) return false;
      if (family !== 'all' && familyOf(kindOf(l)) !== family) return false;
      const t = Date.parse(l.createdAt);
      if (t < from || t > to) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, wsFilter, person, building, family, dateFrom, dateTo]);

  const groups = useMemo(() => foldActivity(filtered), [filtered]);
  const shown = groups.slice(0, limit);

  const hasFilters = wsFilter !== 'all' || family !== 'all' || person !== 'all' || building !== 'all' || !!dateFrom || !!dateTo;
  function clearFilters() {
    setWsFilter('all'); setFamily('all'); setPerson('all'); setBuilding('all'); setDateFrom(''); setDateTo('');
  }
  useEffect(() => { setLimit(PAGE); }, [wsFilter, family, person, building, dateFrom, dateTo]);

  // ── Opening the apartment ──
  const [openAptId, setOpenAptId] = useState<string | null>(null);
  const [addTaskApt, setAddTaskApt] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  // Stable: the toast's timer restarts whenever its onClose changes identity.
  const closeToast = useCallback(() => setToast(null), []);
  const openApt = openAptId ? apartments.find(a => a.id === openAptId) ?? null : null;

  const openPlace = useCallback((ws: string, aptId: string) => {
    if (ws === currentProjectId) { setOpenAptId(aptId); return; }
    // Another workspace: travel there and open it, holding a ticket home.
    rememberReturn(currentProjectId, '/activity', aptId);
    setCurrentProject(ws);
    setPendingFocus({ kind: 'apartment', id: aptId });
    navigate(ws === 'general' ? '/jobs' : '/project');
  }, [currentProjectId, setCurrentProject, setPendingFocus, navigate]);

  const wordsCtx = useMemo(() => ({ lang, stages }), [lang, stages]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const placeFor = (g: ActivityGroup<ScopedLog>): Place | null => {
    const l = g.logs[0];
    if (!l.apartmentId) return null;
    const ws = l.ws ?? currentProjectId;
    const own = ws === currentProjectId;
    const f = own ? null : foreign.find(x => x.pid === ws);
    const apt = own ? ownApts.get(l.apartmentId) : f?.apts.get(l.apartmentId);
    const name = placeName(l, apt, lang);
    // A record whose unit is gone keeps its name — the history is the point —
    // but pressing it would open nothing, so it stays plain text. A workspace
    // this machine has never seen cannot say either way, so it may travel.
    const canOpen = own ? !!apt : (!!apt || !f?.known);
    const job = l.buildingId === 'G';
    const wsName = projectShortName(projectById.get(ws), lang === 'he', ws);
    return {
      name,
      open: canOpen ? () => openPlace(ws, l.apartmentId) : undefined,
      openTitle: own ? (job ? ui.openJob : ui.openApartment) : ui.opensIn(wsName),
    };
  };

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── The centre's status line ──
  const fetching = center && isFirebaseConfigured && others.some(p => isFetchingActivity(p.id));
  const fetchedAt = center && isFirebaseConfigured
    ? Math.min(...others.map(p => fetchedActivity(p.id)?.at ?? Infinity))
    : Infinity;

  let lastDay = '';
  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <Activity size={24} className="text-[#1e3a5f] mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{s.activityLogPage}</h1>
          {center && (
            <p className="text-sm text-gray-500 mt-0.5" data-activity-center>
              <b className="font-semibold text-gray-600">{ui.everyWorkspace}</b> · {ui.centerHint}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
          <span data-activity-total>{ui.rows(groups.length)}</span>
          {center && isFirebaseConfigured && (
            <button
              type="button"
              data-activity-refresh
              onClick={() => fetchActivityFor(others.map(p => p.id), true)}
              title={ui.refresh}
              aria-label={ui.refresh}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-[#1e3a5f] hover:border-gray-300"
            >
              <RefreshCw size={15} className={fetching ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-4 flex flex-col gap-3">
        {center && (
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
            <span className="text-xs font-medium text-gray-500 flex-shrink-0">{ui.workspace}</span>
            {/* On a phone the chips scroll sideways rather than wrapping into
                a wall of filters above the log; the container gives, never
                the chips. */}
            <div className={CHIP_ROW} data-activity-ws-filter>
            {[{ id: 'all', name: s.all, color: '#1e3a5f' },
              { id: currentProjectId, name: projectShortName(projectById.get(currentProjectId), lang === 'he', currentProjectId), color: projectColor(projects, currentProjectId) },
              ...others.map(p => ({ id: p.id, name: projectShortName(p, lang === 'he', p.id), color: projectColor(projects, p.id) }))]
              .map(o => (
                <button
                  key={o.id}
                  type="button"
                  data-ws-pick={o.id}
                  onClick={() => { setWsFilter(o.id); setBuilding('all'); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                  style={wsFilter === o.id
                    ? { backgroundColor: o.color, borderColor: o.color, color: '#fff' }
                    : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#4b5563' }}
                >
                  {o.id !== 'all' && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: wsFilter === o.id ? '#fff' : o.color }} />}
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
          <span className="text-xs font-medium text-gray-500 flex-shrink-0">{ui.what}</span>
          <div className={CHIP_ROW} data-activity-family-filter>
          {(['all', ...ACTIVITY_FAMILIES] as const).map(f => (
            <button
              key={f}
              type="button"
              data-family-pick={f}
              onClick={() => setFamily(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                family === f ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {f === 'all' ? s.all : ui.families[f]}
            </button>
          ))}
          </div>
        </div>

        <div className="flex gap-3 items-end flex-wrap">
          <label className="flex flex-col gap-1 min-w-0 w-full sm:w-auto">
            <span className="text-xs font-medium text-gray-500">{ui.who}</span>
            <select
              data-activity-person
              value={person}
              onChange={e => setPerson(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 w-full sm:w-auto sm:max-w-[14rem]"
            >
              <option value="all">{ui.everyone}</option>
              {people.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>

          {buildingIds.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">{s.buildingPrefix}</span>
              <div className="flex gap-1 flex-wrap">
                {['all', ...buildingIds].map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBuilding(b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      building === b ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  >
                    {b === 'all' ? s.all : b}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">{s.fromDate}</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 w-[9.5rem] sm:w-auto" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">{s.toDate}</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 w-[9.5rem] sm:w-auto" />
          </label>

          {hasFilters && (
            <button type="button" onClick={clearFilters} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 underline">
              {s.clearFilters}
            </button>
          )}
        </div>

        {center && (
          <p className="text-[11px] text-gray-400" data-activity-source>
            {!isFirebaseConfigured ? ui.localOnly
              : fetching ? ui.fetching
              : Number.isFinite(fetchedAt) ? ui.asOf(format(new Date(fetchedAt), 'HH:mm')) : ''}
          </p>
        )}
      </div>

      {/* The log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-activity-list>
        {shown.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Activity size={32} className="mx-auto mb-3 opacity-40" />
            <p>{s.noLogsMatch}</p>
          </div>
        ) : (
          shown.map(g => {
            const day = dayKey(g.newest);
            const heading = day !== lastDay ? dayLabel(g.newest, lang) : '';
            lastDay = day;
            const words = describeGroup(g.logs, wordsCtx);
            const fam = familyOf(g.kind);
            const l0 = g.logs[0];
            const wsId = l0.ws ?? currentProjectId;
            const p = projectById.get(wsId);
            const expanded = open.has(g.id);
            // Opened up, each record keeps only its own small detail — a
            // document's name, a note's words — never a camera's file name.
            const entries = expanded ? g.logs.map(l => {
              const one = describeLog(l, wordsCtx);
              return { id: l.id, text: one.text, detail: one.detail, time: format(new Date(l.createdAt), 'HH:mm') };
            }) : [];
            return (
              <React.Fragment key={g.id}>
                {heading && (
                  <div className="px-3 sm:px-4 py-1.5 bg-slate-50 border-y border-gray-100 first:border-t-0 text-[11px] font-bold uppercase tracking-wider text-slate-500" data-activity-day>
                    {heading}
                  </div>
                )}
                <div className="border-b border-gray-100 last:border-b-0">
                  <GroupRow
                    group={g}
                    words={words}
                    family={fam}
                    place={placeFor(g)}
                    building={l0.buildingId && l0.buildingId !== 'G' ? l0.buildingId : undefined}
                    ws={center ? { name: projectShortName(p, lang === 'he', wsId), color: projectColor(projects, wsId) } : undefined}
                    lang={lang}
                    expanded={expanded}
                    onToggle={() => toggle(g.id)}
                    entries={entries}
                    dim={g.kind === 'opened'}
                  />
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {groups.length > shown.length && (
        <div className="flex justify-center mt-3">
          <button
            type="button"
            data-activity-more
            onClick={() => setLimit(n => n + PAGE)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-gray-300"
          >
            {ui.showMore}
          </button>
        </div>
      )}

      {openApt && currentUser && (
        <ApartmentDetailDrawer
          apartment={openApt}
          onClose={() => setOpenAptId(null)}
          currentUser={currentUser}
          onToast={(msg, type) => setToast({ msg, type: type ?? 'success' })}
          onRequestAddTask={apt => { setOpenAptId(null); setAddTaskApt(apt); }}
        />
      )}
      {addTaskApt && currentUser && (
        <QuickAddTaskPanel
          apartment={addTaskApt}
          onClose={() => setAddTaskApt(null)}
          currentUser={currentUser}
          onToast={msg => setToast({ msg, type: 'success' })}
        />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={closeToast} />}
    </div>
  );
}
