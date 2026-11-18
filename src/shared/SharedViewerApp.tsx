/**
 * THE SHARED VIEW — /s/<token> (owner, 2026-11-18: "this link has to be super secure").
 *
 * A separate little app, loaded INSTEAD of the office app (main.tsx decides by the address): no store, no Firebase,
 * no login, no sync. Everything it shows is the server's allowlisted projection of ONE project (lib/sharedView.js),
 * and the only thing it can write is its own plan pins, through the same server.
 *
 * It draws the office's own board (BuildingDiagram) and building views (BuildingView / BuildingTrio) — they read
 * their data through data/viewState.ts, which this file feeds from a small read-only store — and its own apartment
 * window (SharedApartmentWindow) with Details, Plan, Stages and Photos only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Search, X, RefreshCw, Loader2, Eye } from 'lucide-react';
import {
  DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS, isCountableApartment,
  type MainUiStrings, type Apartment, type BuildingId,
} from '../types';
import { provideViewState, type ViewState } from '../data/viewState';
import { setDriveMediaResolver } from '../data/driveThumb';
import { BuildingDiagram, DiagramLook, type SaleFilter } from '../components/diagram/BuildingDiagram';
import BuildingView from '../components/building/BuildingView';
import BuildingTrio from '../components/building/BuildingTrio';
import { WOLFSON_PLAN, type BuildingPlan } from '../components/building/buildingPlan';
import { NETIV_PLAN, NETIV_PLAN_B1 } from '../components/building/netivPlan';
import { WOLFSON_LOWER } from '../components/building/wolfsonPlan';
import { StageFilterMenu } from '../components/diagram/StageLegend';
import { StageBar } from '../components/diagram/StageBar';
import { buildFloorRows, rowLabelText } from '../data/floorRows';
import { buildingShort } from '../data/aptSale';
import { makeApi, SharedError, type SharedApi, type SharedViewData, type SharedApartment, type ViewerPin, type Failure } from './sharedApi';
import { SharedApartmentWindow } from './SharedApartmentWindow';

type Lang = 'en' | 'he';
const stringsFor = (lang: Lang): MainUiStrings => (lang === 'he'
  ? { ...DEFAULT_MAIN_UI_STRINGS, ...HEBREW_MAIN_UI_STRINGS, isRtl: true } as MainUiStrings
  : { ...DEFAULT_MAIN_UI_STRINGS, isRtl: false } as MainUiStrings);
const firstLang: Lang = typeof navigator !== 'undefined' && /^he\b/i.test(navigator.language ?? '') ? 'he' : 'en';

/** The read-only store the board reads through data/viewState.ts. No setBoardSetting: nothing on the board writes. */
const useViewer = create<ViewState>(() => ({
  mainUiStrings: stringsFor(firstLang), currentProjectId: '', stages: [], boardSettings: {}, uiLang: firstLang,
  buildings: [], contractorPhotos: [],
}));
provideViewState(<T,>(selector: (s: ViewState) => T): T => useViewer(selector));

const WOLFSON_INTERIOR = '/building/wolfson-typical.png';
/** Which buildings have a building view, and with whose plan — the office page's own rule. */
function planFor(projectId: string, buildingId: string): BuildingPlan | null {
  if (/^A\d/.test(buildingId)) return WOLFSON_PLAN;
  if (projectId === 'netiv' && buildingId === 'B1') return NETIV_PLAN_B1;
  if (projectId === 'netiv' && buildingId === 'B2') return NETIV_PLAN;
  return null;
}
function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f(); m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

export default function SharedViewerApp({ token }: { token: string | null }) {
  const api = useMemo(() => (token ? makeApi(token) : null), [token]);
  const [data, setData] = useState<SharedViewData | null>(null);
  const [pins, setPins] = useState<ViewerPin[]>([]);
  const [fail, setFail] = useState<Failure | null>(token ? null : 'gone');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>(firstLang);

  // Nothing about this address may travel to another site, and no search engine may keep it.
  useEffect(() => {
    const add = (name: string, content: string) => {
      const m = document.createElement('meta'); m.name = name; m.content = content; document.head.appendChild(m);
    };
    add('referrer', 'no-referrer');
    add('robots', 'noindex, nofollow');
  }, []);

  // Pictures and films are opened through the server, by sealed ref — never Drive's own address.
  useEffect(() => {
    if (!api) return;
    setDriveMediaResolver({ thumb: (ref, px) => api.fileUrl(ref, px), open: ref => api.fileUrl(ref) });
    const asked = new Set<string>();
    useViewer.setState({
      loadPhotosFor: aptId => {
        if (asked.has(aptId)) return;
        asked.add(aptId);
        api.media(aptId).then(list => useViewer.setState(st => ({
          contractorPhotos: [...st.contractorPhotos.filter(p => p.apartmentId !== aptId), ...list],
        }))).catch(() => asked.delete(aptId));
      },
    });
  }, [api]);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const d = await api.data();
      setData(d);
      setPins(d.pins);
      setFail(null);
      document.title = `${d.project.name} — TzviAir`;
      useViewer.setState({
        currentProjectId: d.project.id,
        stages: d.stages,
        boardSettings: { [d.project.id]: d.board },
        buildings: d.buildings.map((b, i) => ({ id: b.id, name: b.name, displayOrder: i + 1 })),
      });
    } catch (e) {
      setFail(e instanceof SharedError ? e.kind : 'offline');
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { useViewer.setState({ uiLang: lang, mainUiStrings: stringsFor(lang) }); }, [lang]);

  const s = stringsFor(lang);
  const W = (en: string, he: string) => (lang === 'he' ? he : en);

  if (fail && !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 p-6" dir={s.isRtl ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm text-center space-y-3">
          <img src="/tzviair-logo.png" alt="TzviAir" className="h-10 mx-auto" />
          <h1 className="text-lg font-bold text-gray-900">
            {fail === 'gone' ? W('This link is not active', 'הקישור הזה אינו פעיל')
              : fail === 'busy' ? W('Too many requests', 'יותר מדי בקשות') : W('Could not connect', 'אין חיבור')}
          </h1>
          <p className="text-sm text-gray-600">
            {fail === 'gone' ? W('Ask the person who sent it for a new link.', 'בקשו קישור חדש ממי ששלח אותו.')
              : W('Wait a minute and try again.', 'חכו דקה ונסו שוב.')}
          </p>
          {fail !== 'gone' && (
            <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold">
              {W('Try again', 'לנסות שוב')}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!data || !api) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 text-gray-400"><Loader2 className="animate-spin" /></div>;
  }
  return (
    <ProjectView data={data} api={api} pins={pins} setPins={setPins} s={s} W={W}
      lang={lang} setLang={setLang} loading={loading} onRefresh={() => void load()} />
  );
}

function ProjectView({ data, api, pins, setPins, s, W, lang, setLang, loading, onRefresh }: {
  data: SharedViewData; api: SharedApi; pins: ViewerPin[]; setPins: (p: ViewerPin[]) => void; s: MainUiStrings;
  W: (en: string, he: string) => string; lang: Lang; setLang: (l: Lang) => void; loading: boolean; onRefresh: () => void;
}) {
  const pid = data.project.id;
  const apartments = data.apartments as Apartment[];
  const buildings = data.buildings;
  const stages = data.stages;
  const board = data.board;
  const isPhone = useMedia('(max-width: 767px)');
  const isNarrow = useMedia('(max-width: 899px)');
  const roomForAll = useMedia('(min-width: 600px)');
  const [picked, setPicked] = useState<BuildingId | 'all'>('all');
  const selectedBuilding: BuildingId | 'all' = picked !== 'all' && buildings.some(b => b.id === picked) ? picked : 'all';
  const [view, setView] = useState<'board' | 'building'>('building');
  const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<SaleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [floorWin, setFloorWin] = useState<{ b: BuildingId; key: string; label: string } | null>(null);

  const sortedStages = useMemo(() => [...stages].filter(st => st.active).sort((a, b) => a.order - b.order), [stages]);
  const phoneBuilding: BuildingId | 'all' = selectedBuilding === 'all' ? (buildings[0]?.id ?? 'all') : selectedBuilding;
  const effectiveBuilding = isNarrow ? phoneBuilding : selectedBuilding;
  const bvBuilding = isNarrow ? phoneBuilding : selectedBuilding;
  const canBuildingView = bvBuilding !== 'all' && !!planFor(pid, bvBuilding);
  const showBuilding = canBuildingView && view === 'building';
  const firstPlanned = buildings.find(b => !!planFor(pid, b.id))?.id;
  const bvPlan = (canBuildingView ? planFor(pid, bvBuilding) : null) ?? (firstPlanned ? planFor(pid, firstPlanned) : null) ?? WOLFSON_PLAN;
  const isWolfsonPlan = bvPlan.id === 'wolfson';
  const showTrio = (!isNarrow || roomForAll) && view === 'building' && selectedBuilding === 'all' && !!firstPlanned;
  const showSwitch = !!firstPlanned && (!isNarrow || canBuildingView);
  const lowerLevels = useMemo(() => WOLFSON_LOWER.map(l => (l.key === 'spa' ? { ...l, label: s.bvSpa } : l)), [s.bvSpa]);
  const floorLabelsOf = useCallback((b: BuildingId) => {
    const rows = buildFloorRows(b, apartments.filter(a => a.buildingId === b), board.floorHeights?.[b], board.buildingLayout?.[b]);
    return Object.fromEntries(rows.map(r => [r.floor, rowLabelText(r, s.lobby, s.groundCommercial)])) as Record<number, string>;
  }, [apartments, board, s.lobby, s.groundCommercial]);
  const trioBuildings = useMemo(() => (showTrio
    ? buildings.filter(b => !!planFor(pid, b.id)).map(b => ({
      id: b.id, title: buildingShort(b.id), apartments: apartments.filter(a => a.buildingId === b.id),
      floorLabels: floorLabelsOf(b.id), plan: planFor(pid, b.id) ?? undefined,
    }))
    : []), [showTrio, buildings, apartments, floorLabelsOf, pid]);
  const words = {
    floor: s.floorWindowTitle, notSold: s.notSoldWord, notStarted: s.notStartedOption.replace(/[—–]/g, '').trim(), upgraded: s.upgradedWord,
    open: s.bvOpen, floorsHint: s.bvHint, joinedWith: s.bvJoined, yes: s.customYes, no: s.customNo, unknown: s.customUnknown,
  };
  const lookValue = useMemo(() => ({
    big: !isNarrow && selectedBuilding !== 'all',
    onFloorClick: !isNarrow && selectedBuilding === 'all' ? (b: BuildingId, key: string, label: string) => setFloorWin({ b, key, label }) : undefined,
  }), [isNarrow, selectedBuilding]);
  const toggleStage = (id: string) => setActiveStageIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const open = useCallback((apt: Apartment) => { setFloorWin(null); setOpenId(apt.id); }, []);
  const total = apartments.filter(isCountableApartment).length;
  const openApt = openId ? (data.apartments.find(a => a.id === openId) as SharedApartment | undefined) : undefined;

  const pill = (on: boolean) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${on ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`;

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-100" dir={s.isRtl ? 'rtl' : 'ltr'} data-shared-view>
      <header className="flex items-center gap-3 px-3 py-2 text-white flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
        <img src="/tzviair-logo.png" alt="TzviAir" className="h-8 w-auto rounded bg-white p-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{data.project.name}</div>
          <div className="text-[11.5px] text-white/75 truncate flex items-center gap-1">
            <Eye size={12} className="flex-shrink-0" /> {W('View only', 'צפייה בלבד')}{data.link.name ? ` · ${data.link.name}` : ''}
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="p-2 rounded-lg hover:bg-white/10" title={W('Refresh', 'רענון')}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
        <button type="button" onClick={() => setLang(lang === 'he' ? 'en' : 'he')} className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">
          {lang === 'he' ? 'EN' : 'עב'}
        </button>
      </header>

      <div className="bg-white border-b border-gray-200 px-2.5 md:px-5 py-2 flex-shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
            {(['all', ...buildings.map(b => b.id)] as const).map(b => (
              <button key={b} type="button" onClick={() => { setPicked(b); if (b === 'all' && isNarrow && roomForAll) setView('building'); }}
                className={pill(b === 'all' ? selectedBuilding === 'all' && (!isNarrow || showTrio) : effectiveBuilding === b && !showTrio)}>
                {b === 'all' ? s.all : buildingShort(b)}
              </button>
            ))}
          </div>
          {showSwitch && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" data-view-switch>
              {(['board', 'building'] as const).map(v => (
                <button key={v} type="button" onClick={() => setView(v)} className={pill((v === 'building') === (showBuilding || showTrio))}>
                  {v === 'board' ? s.viewBoard : s.viewBuilding}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={s.searchApt}
              className="w-full ps-8 pe-7 py-1.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X size={13} /></button>}
          </div>
          <span className="ms-auto text-xs text-gray-500 whitespace-nowrap"><strong className="text-gray-800">{total}</strong> {s.bulkUnits}</span>
        </div>
        {!showBuilding && !showTrio && (
          <div className="hidden diag:flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {(['all', 'sold', 'unsold', 'shinui', 'standard'] as const).map(c => (
                <button key={c} type="button" onClick={() => setClassFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${classFilter === c ? (c === 'shinui' ? 'bg-amber-500 text-white' : 'bg-[#1e3a5f] text-white') : 'text-gray-600'}`}>
                  {c === 'all' ? s.all : c === 'sold' ? s.soldWord : c === 'unsold' ? s.notSoldWord : c === 'shinui' ? s.upgradedWord : s.notUpgradedWord}
                </button>
              ))}
            </div>
            <StageFilterMenu stages={sortedStages} activeStageIds={activeStageIds} onToggle={toggleStage} onClear={() => setActiveStageIds([])}
              anyLabel={s.stageFilterAny} someLabel={s.stageFilterSome} clearLabel={s.clearFilters} />
          </div>
        )}
      </div>
      {!showBuilding && !showTrio && (
        <div className="diag:hidden">
          <StageBar stages={sortedStages} apartments={apartments} activeStageIds={activeStageIds} onToggle={toggleStage} s={s} />
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {showTrio ? (
          <div className="h-full p-4" style={{ minHeight: 380 }}>
            <BuildingTrio buildings={trioBuildings} stages={stages} onOpen={open} plan={bvPlan}
              interiorSrc={isWolfsonPlan ? WOLFSON_INTERIOR : undefined} lower={isWolfsonPlan ? lowerLevels : []}
              customButtons={board.customButtons} words={words} />
          </div>
        ) : showBuilding ? (
          <div className="h-full p-4" style={{ minHeight: 380 }}>
            <BuildingView apartments={apartments.filter(a => a.buildingId === bvBuilding)} stages={stages} onOpen={open}
              floorLabels={floorLabelsOf(bvBuilding as BuildingId)} interiorSrc={isWolfsonPlan ? WOLFSON_INTERIOR : undefined}
              plan={bvPlan} title={buildingShort(bvBuilding as BuildingId)} lower={isWolfsonPlan ? lowerLevels : undefined}
              customButtons={board.customButtons}
              tower={Math.max(0, buildings.filter(b => !!planFor(pid, b.id)).findIndex(b => b.id === bvBuilding))}
              words={words} />
          </div>
        ) : (
          <DiagramLook.Provider value={lookValue}>
            <BuildingDiagram apartments={apartments} stages={stages} activeStageIds={activeStageIds} classFilter={classFilter}
              searchQuery={searchQuery} selectedBuilding={effectiveBuilding} phone={isPhone} onApartmentClick={open}
              showShinuiBadge />
          </DiagramLook.Provider>
        )}
      </main>

      {floorWin && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.35)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setFloorWin(null); }}>
          <div role="dialog" className="bg-white rounded-xl border border-gray-200 w-full overflow-hidden flex flex-col" style={{ maxWidth: 1500, maxHeight: '90vh' }}>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200">
              <h2 className="m-0 text-lg font-semibold text-gray-900">{buildingShort(floorWin.b)} · {s.floorWindowTitle} {floorWin.label}</h2>
              <button type="button" onClick={() => setFloorWin(null)} className="ms-auto p-2 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="overflow-auto bg-gray-100">
              <DiagramLook.Provider value={{ big: true, onlyRow: floorWin.key }}>
                <BuildingDiagram apartments={apartments.filter(a => a.buildingId === floorWin.b)} stages={stages} activeStageIds={activeStageIds}
                  classFilter={classFilter} searchQuery={searchQuery} selectedBuilding={floorWin.b} onApartmentClick={open} showShinuiBadge />
              </DiagramLook.Provider>
            </div>
          </div>
        </div>
      )}

      {openApt && (
        <SharedApartmentWindow apartment={openApt} apartments={data.apartments} api={api} stages={stages} board={board}
          pins={pins} onPinsChange={setPins} ui={s} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
