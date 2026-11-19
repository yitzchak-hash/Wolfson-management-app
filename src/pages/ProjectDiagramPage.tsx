import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { StandardPlanButton } from '../components/building/StandardPlan';
import { WOLFSON_PLAN, type BuildingPlan } from '../components/building/buildingPlan';
import { NETIV_PLAN, NETIV_PLAN_B1 } from '../components/building/netivPlan';
import { haptic } from '../data/haptics';
import { Search, X, CheckSquare, Printer, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { redeemReturn, holdTicketThroughBack } from '../data/unitTravel';
import { readPlace, savePlace, type ProjectPlace } from '../data/projectPlace';
import { Tooltip } from '../components/ui/Tooltip';
import { useStore, trackUndo, cloudReady as cloudReadyNow } from '../data/store';
import { Apartment, BuildingId, isCountableApartment } from '../types';
import { setMark, isWorkStage } from '../data/stageMarks';
import { problemStates } from '../data/problems';
import { BuildingDiagram, SaleFilter, DiagramLook } from '../components/diagram/BuildingDiagram';
import BuildingView from '../components/building/BuildingView';
import BuildingTrio from '../components/building/BuildingTrio';
import { WOLFSON_LOWER } from '../components/building/wolfsonPlan';
/** The typical floor's walls, doors, windows and furniture, off the architects' plan (owner liked it, 2026-11-03). */
const WOLFSON_INTERIOR = '/building/wolfson-typical.png';
/**
 * Which buildings have a building view, and with whose plan (owner, 2026-11-08: Netiv "works exactly the same way"):
 * Wolfson's towers A1–A3, Netiv's B1 and B2. Any other building keeps the board alone.
 */
function planFor(projectId: string, buildingId: string): BuildingPlan | null {
  if (/^A\d/.test(buildingId)) return WOLFSON_PLAN;
  // Netiv's two buildings are mirror images (the AC engineer's sheets, 2026-11-17): each has its own plan.
  if (projectId === 'netiv' && buildingId === 'B1') return NETIV_PLAN_B1;
  if (projectId === 'netiv' && buildingId === 'B2') return NETIV_PLAN;
  return null;
}
import { buildFloorRows, rowLabelText } from '../data/floorRows';
import { StageLegend, StageFilterMenu } from '../components/diagram/StageLegend';
import { buildingShort } from '../data/aptSale';
import { StageBar } from '../components/diagram/StageBar';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { ProblemForm } from '../components/apartment/ProblemForm';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';

type ClassFilter = SaleFilter;

/**
 * Matches Tailwind's md breakpoint — the same line the sidebar/MobileNav swap
 * on, so "phone" here always agrees with what the chrome is doing.
 */
function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

/**
 * Below 900px the diagram shows ONE building at a time behind big tabs, with
 * the stage bar in place of the desktop toolbar (owner's decisions 4–5,
 * sealed 2026-08-30). Matches the `diag` Tailwind screen, and — the standing
 * rule — a SUBSCRIBED matchMedia test, never a value cached at mount: a
 * folding phone crosses this line with the page open. Deliberately not the
 * drawer's 800px plan line; on a sideways Fold (829) the plan sits beside
 * the details while this page shows one building. That is correct.
 */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return on;
}
const useNarrow = () => useMedia('(max-width: 899px)');
/**
 * The opened Fold and an upright iPad (600–899 wide) keep the narrow page, but have the room for ALL the buildings
 * side by side in the Building view (owner, 2026-11-17: "I'm missing that all buildings option … I used to have it,
 * especially on a Galaxy Fold"). A real phone (under 600) stays one building at a time.
 */
const useRoomForAll = () => useMedia('(min-width: 600px)');

/** The flat named in the address the app was OPENED on (…/project?p=<project>&apt=<id>) — asked once, then gone. */
let landingAsk: { p: string; apt: string } | null = (() => {
  try {
    if (window.location.pathname !== '/project') return null;
    const q = new URLSearchParams(window.location.search);
    const apt = q.get('apt');
    return apt ? { apt, p: q.get('p') || '' } : null;
  } catch { return null; }
})();

const EMPTY_LIST: string[] = [];

export function ProjectDiagramPage() {
  const { apartments, stages, buildings, currentUser, bulkUpdateApartments, updateApartment, setApartmentMarks, contractorAssignments, contractors, mainUiStrings: s, pendingOpenAptId, setPendingOpenAptId, pendingFocus, setPendingFocus, currentProjectId, projects, setCurrentProject } = useStore();
  const tipusim = useStore(st => st.boardSettings[st.currentProjectId]?.tipusim ?? EMPTY_LIST);
  const [tipusFilter, setTipusFilter] = useState('');
  const problemMap = useMemo(() => problemStates(contractorAssignments), [contractorAssignments]);
  const navigate = useNavigate();

  const isPhone = usePhone();
  const isNarrow = useNarrow();
  const roomForAll = useRoomForAll();
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * WHERE HE STOOD in this project — the building tab, Board or Building, the floor — is remembered on this screen
   * (owner, 2026-11-19: "when I go in and out, to come back to the same floor and the same place where I was").
   * Kept per project, so it is read again the moment the project changes; see projectPlace.ts.
   */
  const [placeState, setPlaceState] = useState(() => ({ pid: currentProjectId, ...readPlace(currentProjectId) }));
  const place = placeState.pid === currentProjectId ? placeState : { pid: currentProjectId, ...readPlace(currentProjectId) };
  if (place !== placeState) setPlaceState(place);
  const keepPlace = useCallback((patch: ProjectPlace) => {
    const pid = useStore.getState().currentProjectId;
    setPlaceState(s => {
      const base = s.pid === pid ? s : { pid, ...readPlace(pid) };
      // Nothing new: the SAME object back, or a floor told on every render would re-render the page for ever.
      if (base === s && (Object.keys(patch) as (keyof ProjectPlace)[]).every(k => s[k] === patch[k])) return s;
      return { ...base, ...patch };
    });
    const had = readPlace(pid);
    if ((Object.keys(patch) as (keyof ProjectPlace)[]).some(k => had[k] !== patch[k])) savePlace(pid, patch);
  }, []);
  const pickedBuilding = (place.building ?? 'all') as BuildingId | 'all';
  const setSelectedBuilding = useCallback((b: BuildingId | 'all') => keepPlace({ building: b }), [keepPlace]);
  // A building picked in ONE project means nothing in another (owner's picture, 2026-11-17: after switching from
  // Wolfson to Netiv the view drew Wolfson's tower "1" with no flats and no tab lit). Then it is All again.
  const selectedBuilding: BuildingId | 'all' = pickedBuilding !== 'all' && buildings.some(b => b.id === pickedBuilding) ? pickedBuilding : 'all';
  /** Board or the see-through building (owner, recording 2026-11-02), for one Wolfson building. */
  // The Building view is what opens first, on every device (owner, 2026-11-05: "everywhere it should be the building
  // view as the default. Also on the computer"). A workspace with no Building view shows its board as before.
  const view: 'board' | 'building' = place.view ?? 'building';
  const setView = useCallback((v: 'board' | 'building') => keepPlace({ view: v }), [keepPlace]);
  const keepFloor = useCallback((k: string) => keepPlace({ floorKey: k }), [keepPlace]);
  /** On All, the floor whose row is open big in its own window. */
  const [floorWin, setFloorWin] = useState<{ b: BuildingId; key: string; label: string } | null>(null);
  const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const showShinuiBadge = true;
  const [selectedApt, setSelectedApt] = useState<Apartment | null>(null);
  const [addTaskApt, setAddTaskApt] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [namingApt, setNamingApt] = useState<Apartment | null>(null);
  const [namingInput, setNamingInput] = useState('');

  /**
   * THE APARTMENT IN THE ADDRESS (owner, 2026-11-19: "a lot of times I just want to share the URL so people can go
   * into a specific apartment"). An open window's address carries ?p=<project>&apt=<id>; closing it takes them off.
   * Opening such an address switches to that project if needed and opens the window once the flat is there. Only
   * for people logged in; outsiders use a Shared link.
   *
   * The address is written by the window's own history entry (see "THE PHONE'S BACK CLOSES THE APARTMENT WINDOW"
   * below) — one writer, through the router, so the two never disagree. And only the address the APP WAS OPENED ON
   * may ask (`landingAsk`): an old entry reached by Back must never switch the project (owner, 2026-11-19: "it
   * never supposed to change project … till physically I change").
   */
  const urlAsk = useRef<{ p: string; apt: string } | null>(landingAsk);
  useEffect(() => { landingAsk = null; }, []);
  /** The address's flat was found and its window is on its way up — the address is left alone until it is. */
  const askOpening = useRef(false);
  useEffect(() => {
    const ask = urlAsk.current;
    if (!ask) return;
    if (ask.p && ask.p !== currentProjectId && projects.some(pr => pr.id === ask.p)) { setCurrentProject(ask.p); return; }
    const apt = apartments.find(a => a.id === ask.apt);
    if (apt) { urlAsk.current = null; askOpening.current = true; setSelectedApt(apt); }
    else if (apartments.length && cloudReadyNow()) urlAsk.current = null;   // a flat that no longer exists: let it go
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartments, currentProjectId]);

  // Open a specific apartment drawer — navigated here from the dashboard, or
  // asked for WHILE standing here (the header's pending list): the effect
  // watches the value, not just the mount, or a request made on this page
  // was silently ignored.
  useEffect(() => {
    if (pendingOpenAptId) {
      const apt = apartments.find(a => a.id === pendingOpenAptId);
      if (apt) setSelectedApt(apt);
      setPendingOpenAptId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenAptId]);

  /**
   * "Show me this", arriving from search.
   *
   * A stage becomes the diagram's own stage filter, which is what somebody who
   * searched for a stage wanted to see — the units at it, laid out — rather
   * than the row that renames it. A job or a note opens its drawer.
   */
  useEffect(() => {
    const f = pendingFocus;
    if (!f) return;

    /**
     * ONLY consume what this page can actually show.
     *
     * Clearing the intent first and checking the kind afterwards looks tidier
     * and is wrong: this page is mounted when the search runs, so it ran first
     * and swallowed a worker intent on its way to the task list — which then
     * arrived with nothing to do and simply showed an unfiltered list. An
     * intent nobody here handles is left alone for the page that can.
     */
    if (f.kind === 'stage') {
      setPendingFocus(null);
      setActiveStageIds([f.id]);
      setSelectedBuilding('all');
      setClassFilter('all');
      setTipusFilter('');
      setSearchQuery('');
      return;
    }
    const id = f.kind === 'apartment' ? f.id
      : f.kind === 'task' || f.kind === 'markup' ? f.apartmentId
      : null;
    if (!id) return;
    /**
     * Consume it only once it can actually be SHOWN.
     *
     * Arriving from another workspace — the Building Progress widget's cells
     * do exactly this — the page can mount a moment before its own
     * apartments have replaced the last workspace's. Clearing the intent
     * first and looking the unit up afterwards threw the request away in
     * that window, and the unit simply never opened. The effect re-runs when
     * the apartments land, so waiting costs nothing.
     */
    const apt = apartments.find(a => a.id === id);
    if (!apt) return;
    setPendingFocus(null);
    /**
     * `reveal` means SHOW me where it is, and stop there.
     *
     * The search's row opens the unit; its crosshair asks the other question —
     * whereabouts is it — so the cell is scrolled to and pulsed and the
     * diagram is left on screen rather than a drawer over it. It used to be
     * offered only on the Job Board, so on a building workspace the button
     * simply was not there.
     */
    if (f.kind === 'apartment' && f.reveal) {
      // Clear whatever is filtering the board, or the cell being revealed can
      // be one of the ones currently hidden.
      setActiveStageIds([]);
      setClassFilter('all');
      setTipusFilter('');
      setSearchQuery('');
      setRevealId(apt.id);
      setView('board');   // the cell is shown on the board, which no longer opens first
      return;
    }
    setSelectedApt(apt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus, apartments]);

  /**
   * The unit the search asked to be SHOWN, pulsed for a few seconds.
   *
   * Cleared on a timer rather than on the next click: a highlight that stays
   * until you happen to press something is a highlight you stop trusting.
   */
  const [revealId, setRevealId] = useState<string | null>(null);
  useEffect(() => {
    if (!revealId) return;
    const el = document.querySelector(`[data-apt-id="${revealId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setRevealId(null), 4000);
    return () => clearTimeout(t);
  }, [revealId]);

  // Bulk update state
  const [bulkMode, setBulkMode] = useState(false);
  // Bulk Update picks tiles on the board — it brings the board up (the Building view opens first now).
  useEffect(() => { if (bulkMode) setView('board'); }, [bulkMode]);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkStageId, setBulkStageId] = useState('');
  /** The stage dropdown was TOUCHED — only then does Apply write a stage (a tipus-only update must not reset stages to Not started). */
  const [bulkStageSet, setBulkStageSet] = useState(false);
  const [bulkTipus, setBulkTipus] = useState('');
  const [bulkTipusOpen, setBulkTipusOpen] = useState(false);
  /** Door 3 of the set model (locked answer 15): add or remove ONE stage across every picked apartment. */
  const [bulkSetOp, setBulkSetOp] = useState<{ op: 'add' | 'remove'; stageId: string } | null>(null);
  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [bulkProblemOpen, setBulkProblemOpen] = useState(false);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);

  // Only this workspace's stages — a shared list showed General's stages here.
  const sortedStages = [...stages].filter(st => st.active && (currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId)).sort((a, b) => a.order - b.order);

  // Print header shows the project actually being viewed, not a hardcoded name
  const printProject = projects.find(p => p.id === currentProjectId);

  // Map aptId → "ContractorName · N" task summary for display in cell
  const aptTaskData = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      const pending = contractorAssignments.filter(a => a.apartmentId === apt.id && !a.completedAt);
      if (!pending.length) return;
      const firstContractor = contractors.find(c => c.id === pending[0].contractorId);
      const label = firstContractor
        ? `${firstContractor.name}${pending.length > 1 ? ` · ${pending.length}` : ''}`
        : `${pending.length} task${pending.length !== 1 ? 's' : ''}`;
      m.set(apt.id, label);
    });
    return m;
  }, [contractorAssignments, contractors, apartments]);

  // Map aptId → true if apartment has tasks and ALL are completed
  const aptCompletedData = useMemo(() => {
    const m = new Map<string, boolean>();
    apartments.forEach(apt => {
      const tasks = contractorAssignments.filter(a => a.apartmentId === apt.id);
      if (!tasks.length) return;
      if (tasks.every(a => !!a.completedAt)) m.set(apt.id, true);
    });
    return m;
  }, [contractorAssignments, apartments]);

  // Map aptId → next stage name
  const nextStageLabels = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      const idx = sortedStages.findIndex(s => s.id === apt.currentStageId);
      const next = idx >= 0 && idx < sortedStages.length - 1 ? sortedStages[idx + 1] : idx === -1 && sortedStages.length > 0 ? sortedStages[0] : null;
      if (next) m.set(apt.id, next.name);
    });
    return m;
  }, [apartments, sortedStages]);

  /**
   * Below 900px the diagram shows ONE building — 'all' resolves to the first.
   * The stored selection is left alone, so going back to a wide window
   * restores the all-buildings view exactly as it was. `phone` on the
   * diagram itself stays on the REAL phone test: taller rows and bigger
   * type is a different question from how many buildings are on screen.
   */
  const phoneBuilding: BuildingId | 'all' =
    selectedBuilding === 'all' ? (buildings[0]?.id ?? 'all') : selectedBuilding;
  const effectiveBuilding = isNarrow ? phoneBuilding : selectedBuilding;
  /** The building the Building view draws: on a narrow screen, the tab that is chosen (All resolves to the first). */
  const bvBuilding = isNarrow ? phoneBuilding : selectedBuilding;
  // A phone held upright has the Building view too (owner, video 2026-11-04 on the Fold: "only on landscape view we
  // have the building button").
  const canBuildingView = bvBuilding !== 'all' && !!planFor(currentProjectId, bvBuilding);
  const showBuilding = canBuildingView && view === 'building';
  /** The switch shows on All too (owner, 2026-11-03: he looked for it there twice); Building on All opens the first building. */
  const firstWolfson = buildings.find(b => !!planFor(currentProjectId, b.id))?.id;
  /** The plan the building view draws with — Wolfson's or Netiv's. */
  const bvPlan = (canBuildingView ? planFor(currentProjectId, bvBuilding) : null)
    ?? (firstWolfson ? planFor(currentProjectId, firstWolfson) : null) ?? WOLFSON_PLAN;
  const isWolfsonPlan = bvPlan.id === 'wolfson';
  const showSwitch = !isNarrow && !!firstWolfson;
  const showNarrowSwitch = isNarrow && canBuildingView;
  /** On All, Building shows the three side by side, moving together. */
  const showTrio = (!isNarrow || roomForAll) && view === 'building' && selectedBuilding === 'all' && !!firstWolfson;
    const boardSet = useStore(st => st.boardSettings[st.currentProjectId]);
  const lowerLevels = useMemo(() => WOLFSON_LOWER.map(l => (l.key === 'spa' ? { ...l, label: s.bvSpa } : l)), [s.bvSpa]);
  /** The board's own floor numbers, so the building view and the board say the same floor. */
  const floorLabelsOf = useCallback((b: BuildingId) => {
    const rows = buildFloorRows(b, apartments.filter(a => a.buildingId === b), boardSet?.floorHeights?.[b], boardSet?.buildingLayout?.[b]);
    return Object.fromEntries(rows.map(r => [r.floor, rowLabelText(r, s.lobby, s.groundCommercial)])) as Record<number, string>;
  }, [apartments, boardSet, s.lobby, s.groundCommercial]);
  const buildingFloorLabels = useMemo(() => (showBuilding ? floorLabelsOf(bvBuilding as BuildingId) : undefined),
    [showBuilding, bvBuilding, floorLabelsOf]);
  const trioBuildings = useMemo(() => (showTrio
    ? buildings.filter(b => !!planFor(currentProjectId, b.id))
      // In the buildings' own order — Netiv too: Building 1 on the left, Building 2 on the right (owner, 2026-11-17)
      .map(b => ({ id: b.id, title: buildingShort(b.id), apartments: apartments.filter(a => a.buildingId === b.id), floorLabels: floorLabelsOf(b.id), plan: planFor(currentProjectId, b.id) ?? undefined }))
    : []), [showTrio, buildings, apartments, floorLabelsOf]);
  const lookValue = useMemo(() => ({
    big: !isNarrow && selectedBuilding !== 'all',
    onFloorClick: !isNarrow && selectedBuilding === 'all' && !bulkMode
      ? (b: BuildingId, key: string, label: string) => setFloorWin({ b, key, label }) : undefined,
  }), [isNarrow, selectedBuilding, bulkMode]);
  // Chips beyond the stage legend that the phone Filters button should count.
  const phoneFilterCount = activeStageIds.length + (classFilter !== 'all' ? 1 : 0) + (tipusFilter ? 1 : 0);

  function toggleStage(id: string) {
    setActiveStageIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function clearFilters() {
    setTipusFilter('');
    setActiveStageIds([]);
    setClassFilter('all');
    setSearchQuery('');
    setSelectedBuilding('all');
  }

  // Picking a building is where you look, not a filter (owner, video 2026-11-03: "when I filter a building … this pops up … unnecessary").
  const hasFilters = activeStageIds.length > 0 || classFilter !== 'all' || !!tipusFilter || searchQuery;

  function exitBulkMode() {
    setBulkMode(false);
    setBulkSelected(new Set());
    setBulkStageId('');
    setBulkStageSet(false);
    setBulkTipus('');
    setBulkTipusOpen(false);
    setBulkDropdownOpen(false);
  }

  const handleAptClick = useCallback((apt: Apartment) => {
    if (bulkMode) {
      setBulkSelected(prev => {
        const next = new Set(prev);
        next.has(apt.id) ? next.delete(apt.id) : next.add(apt.id);
        return next;
      });
    } else {
      // The tick inside the tap itself — an iPhone drops the drawer's own tick, which comes a moment later.
      haptic('tick');
      setAddTaskApt(null);
      setSelectedApt(apt);
    }
  }, [bulkMode]);

  const handleAddTask = useCallback((apt: Apartment) => {
    setSelectedApt(null);
    setAddTaskApt(apt);
  }, []);

  const handleNameUnnamed = useCallback((apt: Apartment) => {
    setNamingApt(apt);
    setNamingInput('');
  }, []);

  function handleSaveName() {
    if (!namingApt || !currentUser || !namingInput.trim()) return;
    trackUndo(null, () => updateApartment(namingApt.id, { displayName: namingInput.trim(), isUnnamed: false }, currentUser));
    setNamingApt(null);
    setNamingInput('');
  }

  function handleBulkApply() {
    if (!currentUser || bulkSelected.size === 0) return;
    const ids = Array.from(bulkSelected);
    const changes: Partial<Apartment> = {};
    if (bulkStageSet) changes.currentStageId = bulkStageId || null;
    if (bulkTipus) changes.tipus = bulkTipus === '__none' ? undefined : bulkTipus;
    if (!Object.keys(changes).length && !bulkSetOp) return;
    // The whole bulk update is ONE undo step.
    trackUndo(null, () => {
      if (Object.keys(changes).length) bulkUpdateApartments(ids, changes, currentUser);
      // Add / remove a stage: one mark per apartment, through the one writer.
      if (bulkSetOp) {
        for (const id of ids) {
          const apt = apartments.find(a => a.id === id);
          if (!apt) continue;
          setApartmentMarks(id, setMark(apt.stageMarks, bulkSetOp.stageId, bulkSetOp.op === 'add' ? 'todo' : 'off'), currentUser);
        }
      }
    });
    const parts: string[] = [];
    if (bulkSetOp) parts.push(`${bulkSetOp.op === 'add' ? s.setBulkAddStage : s.setBulkRemoveStage}: ${sortedStages.find(x => x.id === bulkSetOp.stageId)?.name ?? ''}`);
    if (bulkStageSet) parts.push(sortedStages.find(s => s.id === bulkStageId)?.name ?? 'Not Started');
    if (bulkTipus) parts.push(`${s.tipusLabel}: ${bulkTipus === '__none' ? s.tipusNone : bulkTipus}`);
    showToast(`${ids.length} apartment${ids.length !== 1 ? 's' : ''} updated → ${parts.join(' · ')}`);
    exitBulkMode();
  }

  function handlePrint() {
    window.print();
  }

  // Refresh selected apt when store updates
  const liveApt = selectedApt
    ? apartments.find(a => a.id === selectedApt.id) ?? selectedApt
    : null;

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  /** The apartment window closes — by its X, by the phone's Back, by anything. */
  const leavingHome = useRef(false);
  function closeDrawer() {
    if (!selectedApt) return;
    const id = selectedApt.id;
    setSelectedApt(null);
    // A glance that travelled here holds a return ticket — closing
    // the SAME unit it opened goes straight back where you stood.
    const back = redeemReturn(id);
    if (back && back.projectId !== currentProjectId) {
      leavingHome.current = true;
      setCurrentProject(back.projectId);
      navigate(back.path);
    }
  }
  /**
   * THE PHONE'S BACK CLOSES THE APARTMENT WINDOW (owner, 2026-11-19: "sometimes I go out and then it takes me to a
   * different project … or back to all three buildings"). The window had no place in the browser's history, so
   * Back on a phone did not close it: it left the page for wherever the history happened to point — another page,
   * another project. An open window now owns ONE history entry, marked `apt` and carrying the window's own
   * address (?p=<project>&apt=<id>, the one he shares); Back removes that entry and the window closes, and closing
   * it by the X takes the entry away again. The page under the window keeps the plain address.
   */
  const location = useLocation();
  const locState = (location.state ?? null) as { apt?: string } | null;
  const aptEntry = locState?.apt ?? null;
  const ownEntry = useRef(false);
  const openId = selectedApt?.id ?? null;
  const urlApt = useMemo(() => new URLSearchParams(location.search).get('apt'), [location.search]);
  useEffect(() => {
    if (!openId && (urlAsk.current || askOpening.current)) return;   // the address's own flat is still on its way in
    if (openId) askOpening.current = false;
    const q = new URLSearchParams(location.search); q.delete('p'); q.delete('apt');
    const plain = location.pathname + (q.toString() ? `?${q}` : '') + location.hash;
    const named = (id: string) => { const w = new URLSearchParams(q); w.set('p', currentProjectId); w.set('apt', id); return `${location.pathname}?${w}${location.hash}`; };
    if (openId && aptEntry === openId) {
      ownEntry.current = true; holdTicketThroughBack(true);
      if (urlApt !== openId) navigate(named(openId), { replace: true, state: locState });
      return;
    }
    if (openId && !aptEntry) {
      if (ownEntry.current) {                       // Back took the entry away: close the window
        ownEntry.current = false; holdTicketThroughBack(false);
        closeDrawer();
        return;
      }
      // Arrived by a shared address: the page UNDER the window is the plain one, then the window's entry goes on top.
      if (urlApt) { navigate(plain, { replace: true, state: locState }); return; }
      navigate(named(openId), { state: { ...(locState ?? {}), apt: openId } });
      return;
    }
    if (openId && aptEntry) { navigate(named(openId), { replace: true, state: { ...(locState ?? {}), apt: openId } }); return; }
    if (aptEntry) {                                 // closed, and the entry is still there
      holdTicketThroughBack(false);
      if (leavingHome.current) return;              // on its way to another page already
      if (ownEntry.current) { ownEntry.current = false; navigate(-1); }
      else { const { apt: _gone, ...rest } = locState ?? {}; navigate(plain, { replace: true, state: rest }); }   // an old entry of a window that is gone
      return;
    }
    if (urlApt) navigate(plain, { replace: true, state: locState });   // nothing open: the address names no flat
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, aptEntry, urlApt, location.key]);
  useEffect(() => () => holdTicketThroughBack(false), []);
  useEffect(() => { leavingHome.current = false; }, [currentProjectId]);

  // Only real units count — blank placeholder slots are not apartments
  const countable = apartments.filter(isCountableApartment);
  const noStage = countable.filter(a => !a.currentStageId).length;
  const total = countable.length;

  /**
   * The redirect guard sits AFTER every hook — the same rule GeneralJobsPage
   * documents. It used to sit above three useCallbacks, which never bit while
   * a workspace switch always unmounted this page in the same commit; the
   * browser-back workspace restore (workspaceHistory.ts) switches the store
   * synchronously WHILE this page is mounted, so an early return now changes
   * the hook count between renders and crashes the whole app. Do not move it
   * back up.
   */
  if (currentProjectId === 'general') return <Navigate to="/jobs" replace />;

  return (
    <>
      {/* Print-only header — hidden on screen */}
      <div className="hidden print:block print:mb-4">
        <div className="flex items-center gap-4 mb-3">
          <img src="/tzviair-logo.png" alt="TzviAir" style={{ height: '40px' }} />
          {printProject?.logoPath && (
            <img
              src={printProject.logoPath}
              alt={printProject.name}
              style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
            />
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {printProject ? `${printProject.name} — ${s.buildingDiagramLabel}` : s.buildingDiagramLabel}
            </h1>
            <p className="text-xs text-gray-500">Printed {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border border-gray-300 rounded p-3 bg-gray-50">
          {sortedStages.map(s => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-xs">{s.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-gray-300" />
            <span className="text-xs">{s.notStartedOption}</span>
          </div>
        </div>
      </div>

      <div className="short-scroll flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible">
        {/*
          Narrow bar — everything below the diag (900px) line, phones and
          tablets alike. One building at a time behind big tabs, and the
          whole filter block folded into a single Filters button — the
          diagram used to start a full screen of chips further down. Kept in
          CSS (the diag screen), not inline display from React, so it keeps
          working while React is deciding.
        */}
        <div className="diag:hidden bg-white border-b border-gray-200 px-2.5 pt-1.5 pb-1.5 flex-shrink-0 print:hidden flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={s.searchApt}
                className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-gray-50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setFiltersOpen(true)}
              className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${
                phoneFilterCount > 0 || bulkMode
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-gray-100 border-gray-200 text-gray-600'
              }`}
            >
              <SlidersHorizontal size={14} />
              {s.filtersSection}
              {phoneFilterCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#4aa8d8] text-white text-[11px] font-black flex items-center justify-center">
                  {phoneFilterCount}
                </span>
              )}
            </button>
          </div>
          {/*
            Building tabs sit UNDER the search, are half their old height, and
            carry the unit count on their own line in grey — it used to eat a
            full row of its own between the bar and the diagram.
          */}
          <div className="flex items-center gap-1.5">
            {/* All the buildings side by side, in the Building view — only where there is the room (the opened Fold) */}
            {roomForAll && !!firstWolfson && buildings.length > 1 && (
              <button
                data-narrow-all
                onClick={() => { setSelectedBuilding('all'); setView('building'); }}
                className={`flex-1 min-w-[44px] py-1 rounded-md text-[13px] font-bold transition-all ${
                  showTrio ? 'bg-[#1e3a5f] text-white shadow-sm' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {s.all}
              </button>
            )}
            {buildings.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBuilding(b.id)}
                className={`flex-1 min-w-[44px] py-1 rounded-md text-[13px] font-bold transition-all ${
                  effectiveBuilding === b.id && !showTrio
                    ? 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {buildingShort(b.id)}
              </button>
            ))}
            {showNarrowSwitch && (
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5 flex-shrink-0" data-view-switch data-view-switch-narrow>
                {(['board', 'building'] as const).map(v => {
                  const on = (v === 'building') === showBuilding;
                  return (
                    <button key={v} type="button" data-view={v} aria-pressed={on} onClick={() => setView(v)}
                      className={`px-2.5 py-1 rounded text-[12px] font-bold transition-all ${on ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-600'}`}>
                      {v === 'board' ? s.viewBoard : s.viewBuilding}
                    </button>
                  );
                })}
              </div>
            )}
            <span className="flex-shrink-0 pl-1 text-[11px] leading-tight text-gray-400 tabular-nums text-right">
              {bulkMode
                ? `${bulkSelected.size} ${s.bulkSelected}`
                : `${total} ${s.bulkUnits}`}
            </span>
          </div>
        </div>

        {/* The stage bar — the narrow diagram's picture of the whole project,
            in place of the desktop toolbar's bubbles and the bare-number
            strip (decision 5). */}
        <div className={`diag:hidden print:hidden ${showBuilding ? 'hidden' : ''}`}>
          <StageBar
            stages={sortedStages}
            apartments={apartments}
            activeStageIds={bulkMode ? [] : activeStageIds}
            onToggle={bulkMode ? () => {} : toggleStage}
            s={s}
          />
        </div>

        {/* Top bar — untouched at 900px and up; hidden on print */}
        <div className="hidden diag:block bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Building selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {/* In the order the buildings stand on screen: 1 · 2 · 3 (owner, 2026-11-17: "flip it to be all 1, 2, 3";
                  Netiv the same, Building 1 first). */}
              {(['all', ...buildings.map(b => b.id)]).map(b => (
                <button
                  key={b}
                  onClick={() => setSelectedBuilding(b)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedBuilding === b
                      ? 'bg-[#1e3a5f] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {b === 'all' ? s.all : buildingShort(b)}
                </button>
              ))}
            </div>

            {/* Board · Building — only with ONE Wolfson building chosen. */}
            {showSwitch && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" data-view-switch>
                {(['board', 'building'] as const).map(v => {
                  const on = (v === 'building') === (showBuilding || showTrio);
                  return (
                    <button key={v} type="button" data-view={v} aria-pressed={on}
                      onClick={() => {
                        setView(v);
                        if (v === 'building' && selectedBuilding !== 'all' && !canBuildingView && firstWolfson) setSelectedBuilding(firstWolfson);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${on ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                      {v === 'board' ? s.viewBoard : s.viewBuilding}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sale filter — Sold · Not sold · Upgraded · Not upgraded, one at a
                time (owner, recording 2026-10-28). It replaced All · Standard ·
                Changes and the separate Changes switch. */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" data-sale-filter>
              {(['all', 'sold', 'unsold', 'shinui', 'standard'] as const).map(c => (
                <button
                  key={c}
                  data-sale={c}
                  onClick={() => setClassFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    classFilter === c
                      ? c === 'shinui' ? 'bg-amber-500 text-white shadow-sm' : 'bg-[#1e3a5f] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {c === 'all' ? s.all : c === 'sold' ? s.soldWord : c === 'unsold' ? s.notSoldWord : c === 'shinui' ? s.upgradedWord : s.notUpgradedWord}
                </button>
              ))}
            </div>

            {/* Tipus filter — only when the workspace keeps a list. */}
            {tipusim.length > 0 && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" data-tipus-filter>
                {['', ...tipusim].map(t => (
                  <button
                    key={t || '__all'}
                    onClick={() => setTipusFilter(t)}
                    className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      tipusFilter === t ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {t || s.tipusLabel}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={s.searchApt}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl w-36 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-gray-50"
              />
            </div>

            {/* The stages, folded into one small drop-down. */}
            <StageFilterMenu
              stages={sortedStages}
              activeStageIds={bulkMode ? [] : activeStageIds}
              onToggle={bulkMode ? () => {} : toggleStage}
              onClear={() => setActiveStageIds([])}
              anyLabel={s.stageFilterAny}
              someLabel={s.stageFilterSome}
              clearLabel={s.clearFilters}
            />

            {/* Bulk update toggle */}
            <Tooltip text={bulkMode ? s.exitBulkModeTooltip : s.enterBulkModeTooltip}>
              <button
                onClick={() => { if (bulkMode) exitBulkMode(); else setBulkMode(true); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  bulkMode ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <CheckSquare size={14} />
                Bulk Update
              </button>
            </Tooltip>

            {/* Print */}
            <Tooltip text={s.printDiagramTooltip}>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
              >
                <Printer size={14} />
                Print
              </button>
            </Tooltip>

            {hasFilters && !bulkMode && (
              <Tooltip text={s.clearFiltersTooltip}>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1.5"
                >
                  <X size={12} />
                  Clear
                </button>
              </Tooltip>
            )}

            {/* Quick stats */}
            {/* Under 1536px the two counts stack into two small lines, so they stay beside Print instead of
                dropping to a line of their own (owner's picture, Fold, 2026-11-08). */}
            <div data-quick-stats className="ml-auto flex flex-col 2xl:flex-row 2xl:items-center 2xl:gap-3 text-[11px] 2xl:text-xs leading-tight text-gray-500 whitespace-nowrap">
              {bulkMode ? (
                <span className="text-[#1e3a5f] font-semibold">
                  {bulkSelected.size} {s.bulkSelected}
                </span>
              ) : (
                <>
                  <span><strong className="text-gray-800">{total}</strong> {s.bulkUnits}</span>
                  <span><strong className="text-gray-500">{noStage}</strong> {s.bulkNotStarted}</span>
                </>
              )}
            </div>
          </div>

        </div>

        {/* The coloured stage-count strip that stood here is gone (owner,
            video 2026-11-03: "get rid of this whole bar … unnecessary"). */}

        {/* Main diagram */}
        <div className="short-scroll-body flex-1 overflow-auto scrollbar-thin bg-gray-100 print:overflow-visible print:bg-white">
          {showTrio ? (
            <div className="h-full p-4" style={{ minHeight: 380 }} data-building-view-wrap>
              <BuildingTrio key={currentProjectId} floorKey={place.floorKey} onFloorKey={keepFloor} buildings={trioBuildings} stages={stages} onOpen={handleAptClick} plan={bvPlan}
                planSlot={(b, f) => <StandardPlanButton buildingId={b.id} buildingTitle={b.title} floorKey={f.key} floorLabel={f.label} />} interiorSrc={isWolfsonPlan ? WOLFSON_INTERIOR : undefined} lower={isWolfsonPlan ? lowerLevels : []} customButtons={boardSet?.customButtons}
                words={{ floor: s.floorWindowTitle, notSold: s.notSoldWord, notStarted: s.notStartedOption.replace(/[—–]/g, '').trim(), upgraded: s.upgradedWord, open: s.bvOpen, floorsHint: s.bvHint, joinedWith: s.bvJoined, yes: s.customYes, no: s.customNo, unknown: s.customUnknown }} />
            </div>
          ) : showBuilding ? (
            <div className="h-full p-4" style={{ minHeight: 380 }} data-building-view-wrap>
              <BuildingView
                key={currentProjectId} floorKey={place.floorKey} onFloorKey={keepFloor}
                apartments={apartments.filter(a => a.buildingId === bvBuilding)}
                stages={stages}
                onOpen={handleAptClick}
                floorLabels={buildingFloorLabels}
                interiorSrc={isWolfsonPlan ? WOLFSON_INTERIOR : undefined}
                plan={bvPlan}
                title={buildingShort(bvBuilding as BuildingId)}
                planSlot={f => <StandardPlanButton bubble buildingId={bvBuilding} buildingTitle={buildingShort(bvBuilding)} floorKey={f.key} floorLabel={f.label} />}
                lower={isWolfsonPlan ? lowerLevels : undefined} customButtons={boardSet?.customButtons}
                tower={Math.max(0, buildings.filter(b => !!planFor(currentProjectId, b.id)).findIndex(b => b.id === bvBuilding))}
                words={{ floor: s.floorWindowTitle, notSold: s.notSoldWord, notStarted: s.notStartedOption.replace(/[—–]/g, '').trim(), upgraded: s.upgradedWord, open: s.bvOpen, floorsHint: s.bvHint, joinedWith: s.bvJoined, yes: s.customYes, no: s.customNo, unknown: s.customUnknown }}
              />
            </div>
          ) : (
          <DiagramLook.Provider value={lookValue}>
          <BuildingDiagram
            apartments={apartments}
            stages={stages}
            activeStageIds={activeStageIds}
            classFilter={classFilter}
            tipusFilter={tipusFilter}
            problemStates={problemMap}
            searchQuery={searchQuery}
            selectedBuilding={effectiveBuilding}
            phone={isPhone}
            onApartmentClick={handleAptClick}
            highlightedApartmentIds={revealId ? new Set([revealId]) : undefined}
            showShinuiBadge={showShinuiBadge}
            bulkMode={bulkMode}
            bulkSelected={bulkSelected}
            aptTaskData={aptTaskData}
            nextStageLabels={nextStageLabels}
            onAddTask={bulkMode ? undefined : handleAddTask}
            aptCompletedData={aptCompletedData}
            onNameUnnamed={bulkMode ? undefined : handleNameUnnamed}
          />
          </DiagramLook.Provider>
          )}
        </div>

        {/* On All, a floor opened big in its own window (owner, recording
            2026-11-02: "a small window … just the row in bigger format
            spanning across"). The same tiles, the same presses. */}
        {floorWin && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 print:hidden"
            style={{ background: 'rgba(15,23,42,.35)' }} data-floor-window={`${floorWin.b}-${floorWin.key}`}
            onMouseDown={e => { if (e.target === e.currentTarget) setFloorWin(null); }}
            onKeyDown={e => { if (e.key === 'Escape') setFloorWin(null); }}>
            <div role="dialog" aria-label={`${buildingShort(floorWin.b)} · ${s.floorWindowTitle} ${floorWin.label}`}
              className="bg-white rounded-xl border border-gray-200 w-full overflow-hidden flex flex-col"
              style={{ maxWidth: 1500, maxHeight: '90vh', boxShadow: '0 20px 50px rgba(15,23,42,.25)' }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200">
                <span className="w-1.5 h-6 rounded-full bg-[#1e3a5f]" />
                <h2 className="m-0 text-lg font-semibold text-gray-900">
                  {buildingShort(floorWin.b)} · {s.floorWindowTitle} {floorWin.label}
                </h2>
                <button type="button" autoFocus data-floor-window-close aria-label="Close"
                  onClick={() => setFloorWin(null)}
                  className="ms-auto p-2 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
              </div>
              <div className="overflow-auto bg-gray-100">
                <DiagramLook.Provider value={{ big: true, onlyRow: floorWin.key }}>
                  <BuildingDiagram
                    apartments={apartments.filter(a => a.buildingId === floorWin.b)}
                    stages={stages}
                    activeStageIds={activeStageIds}
                    classFilter={classFilter}
                    tipusFilter={tipusFilter}
                    problemStates={problemMap}
                    searchQuery={searchQuery}
                    selectedBuilding={floorWin.b}
                    onApartmentClick={apt => { setFloorWin(null); handleAptClick(apt); }}
                    showShinuiBadge={showShinuiBadge}
                    aptTaskData={aptTaskData}
                    nextStageLabels={nextStageLabels}
                    onAddTask={handleAddTask}
                    aptCompletedData={aptCompletedData}
                  />
                </DiagramLook.Provider>
              </div>
            </div>
          </div>
        )}

        {/* Detail drawer — hidden on print */}
        {!bulkMode && liveApt && currentUser && (
          <ApartmentDetailDrawer
            apartment={liveApt}
            onClose={closeDrawer}
            currentUser={currentUser}
            onToast={showToast}
            onRequestAddTask={(apt) => { setSelectedApt(null); setAddTaskApt(apt); }}
          />
        )}

        {/* Quick-add task panel */}
        {!bulkMode && addTaskApt && currentUser && (
          <QuickAddTaskPanel
            apartment={addTaskApt}
            onClose={() => {
              const id = addTaskApt.id;
              setAddTaskApt(null);
              // The drawer's Add Task hands over WITHOUT redeeming a return
              // ticket, so a unit reached from another workspace goes home
              // when the task panel closes — after the task, not before it.
              const back = redeemReturn(id);
              if (back && back.projectId !== currentProjectId) {
                setCurrentProject(back.projectId);
                navigate(back.path);
              }
            }}
            currentUser={currentUser}
            onToast={msg => showToast(msg)}
          />
        )}

        {/* Bulk action bar — hidden on print */}
        {bulkMode && (
          <div
            className="fixed bottom-0 left-0 md:left-16 right-0 bg-[#1e3a5f] text-white px-5 py-3 shadow-2xl flex items-center gap-4 flex-wrap z-40 print:hidden"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <span className="font-semibold text-sm">
              {bulkSelected.size} apartment{bulkSelected.size !== 1 ? 's' : ''} selected
            </span>

            {/* Stage picker */}
            <div className="relative">
              <button
                onClick={() => setBulkDropdownOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-lg text-sm font-medium hover:bg-white/25 transition-all min-w-40"
              >
                {bulkStageId ? (
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sortedStages.find(s => s.id === bulkStageId)?.color }} />
                    {sortedStages.find(s => s.id === bulkStageId)?.name}
                  </span>
                ) : bulkStageSet ? (
                  <span>{s.notStartedOption}</span>
                ) : (
                  <span className="text-white/70">{s.selectStagePlaceholder}</span>
                )}
                <ChevronDown size={14} className="ml-auto" />
              </button>
              {bulkDropdownOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-48 z-50">
                  <button
                    onClick={() => { setBulkStageId(''); setBulkStageSet(true); setBulkDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    {s.notStartedOption}
                  </button>
                  {sortedStages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setBulkStageId(s.id); setBulkStageSet(true); setBulkDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tipus — set on every picked apartment in one press (owner, 2026-09-06). */}
            {tipusim.length > 0 && (
              <div className="relative">
                <button
                  data-bulk-tipus
                  onClick={() => setBulkTipusOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-lg text-sm font-medium hover:bg-white/25 transition-all"
                >
                  {bulkTipus ? <span>{s.tipusLabel}: {bulkTipus === '__none' ? s.tipusNone : bulkTipus}</span>
                    : <span className="text-white/70">{s.tipusLabel}</span>}
                  <ChevronDown size={14} className="ml-auto" />
                </button>
                {bulkTipusOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-40 z-50">
                    <button onClick={() => { setBulkTipus('__none'); setBulkTipusOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">{s.tipusNone}</button>
                    {tipusim.map(t => (
                      <button key={t} data-bulk-tipus-pick={t} onClick={() => { setBulkTipus(t); setBulkTipusOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 font-bold">{t}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add or remove a STAGE on every picked apartment (the set model). */}
            <div className="relative">
              <button
                data-bulk-set
                onClick={() => setBulkSetOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-lg text-sm font-medium hover:bg-white/25 transition-all"
              >
                {bulkSetOp
                  ? <span>{bulkSetOp.op === 'add' ? '+' : '×'} {sortedStages.find(x => x.id === bulkSetOp.stageId)?.name}</span>
                  : <span className="text-white/70">{s.setBulkAddStage} / {s.setBulkRemoveStage}</span>}
                <ChevronDown size={14} className="ml-auto" />
              </button>
              {bulkSetOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-56 z-50 max-h-[60vh] overflow-y-auto">
                  {sortedStages.filter(isWorkStage).map(st => (
                    <div key={st.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="flex-1 truncate">{st.name}</span>
                      <button data-bulk-set-add={st.id} onClick={() => { setBulkSetOp({ op: 'add', stageId: st.id }); setBulkSetOpen(false); }}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">+ {s.add}</button>
                      <button data-bulk-set-remove={st.id} onClick={() => { setBulkSetOp({ op: 'remove', stageId: st.id }); setBulkSetOpen(false); }}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600">× {s.setNotNeededAct}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Report a problem on every picked apartment — the single form, then one line per unit. */}
            <button
              data-bulk-problem
              onClick={() => setBulkProblemOpen(true)}
              disabled={bulkSelected.size === 0}
              className="px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-40 flex items-center gap-1.5 text-white"
              style={{ backgroundColor: '#dc2626' }}
            >
              ⚠ {s.reportProblem}
            </button>

            <button
              data-bulk-apply
              onClick={handleBulkApply}
              disabled={bulkSelected.size === 0 || (!bulkStageSet && !bulkTipus && !bulkSetOp)}
              className="px-4 py-2 bg-[#4aa8d8] rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#3897c7] transition-colors"
            >
              {s.applyTo} {bulkSelected.size > 0 ? bulkSelected.size : '…'}
            </button>

            <button onClick={exitBulkMode} className="ml-auto px-3 py-2 text-white/70 hover:text-white text-sm">
              {s.cancel}
            </button>
          </div>
        )}

        {bulkProblemOpen && currentUser && (
          <ProblemForm
            apartments={apartments.filter(a => bulkSelected.has(a.id))}
            currentUser={currentUser}
            onClose={() => setBulkProblemOpen(false)}
            onSaved={n => { showToast(`${s.problemLabel} × ${n}`); exitBulkMode(); }}
          />
        )}
        {toast && (
          <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>

      {/*
        The phone Filters sheet. Everything the desktop top bar spreads across
        the page lives here behind one button: type, the stage legend, the
        Changes badge toggle, bulk update and print. Closes on backdrop tap,
        the X, Done, and Escape — a sheet that only closes one way is a wall.
      */}
      {filtersOpen && (
        <div
          className="diag:hidden fixed inset-0 z-50 print:hidden"
          onClick={() => setFiltersOpen(false)}
          onKeyDown={e => { if (e.key === 'Escape') setFiltersOpen(false); }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-900">{s.filtersSection}</span>
              <span className="text-xs text-gray-500 flex-1">
                <strong className="text-gray-800">{total}</strong> {s.bulkUnits} · <strong>{noStage}</strong> {s.bulkNotStarted}
              </span>
              <button onClick={() => setFiltersOpen(false)} className="p-2 -m-1 rounded-lg text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Sold · Not sold · Upgraded · Not upgraded */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap" data-sale-filter>
              {(['all', 'sold', 'unsold', 'shinui', 'standard'] as const).map(c => (
                <button
                  key={c}
                  data-sale={c}
                  onClick={() => setClassFilter(c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    classFilter === c
                      ? c === 'shinui' ? 'bg-amber-500 text-white shadow-sm' : 'bg-[#1e3a5f] text-white shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  {c === 'all' ? s.all : c === 'sold' ? s.soldWord : c === 'unsold' ? s.notSoldWord : c === 'shinui' ? s.upgradedWord : s.notUpgradedWord}
                </button>
              ))}
            </div>

            {tipusim.length > 0 && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
                {['', ...tipusim].map(t => (
                  <button key={t || '__all'} onClick={() => setTipusFilter(t)}
                    className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                      tipusFilter === t ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-600'}`}>
                    {t || s.tipusLabel}
                  </button>
                ))}
              </div>
            )}

            {/* Stage legend — same component, same behaviour as the desktop bar */}
            <StageLegend
              stages={sortedStages}
              activeStageIds={bulkMode ? [] : activeStageIds}
              onToggle={bulkMode ? () => {} : toggleStage}
            />

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (bulkMode) exitBulkMode(); else setBulkMode(true);
                  setFiltersOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  bulkMode ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-gray-100 border-gray-200 text-gray-600'
                }`}
              >
                <CheckSquare size={14} />
                Bulk Update
              </button>
              <button
                onClick={() => { setFiltersOpen(false); setTimeout(handlePrint, 150); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600"
              >
                <Printer size={14} />
                Print
              </button>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-red-500 px-2 py-2 ml-auto"
                >
                  <X size={12} />
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={() => setFiltersOpen(false)}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {s.doneBtn}
            </button>
          </div>
        </div>
      )}

      {/* Naming dialog for unnamed ground/lobby/basement slots */}
      {namingApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setNamingApt(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-bold text-gray-900">Name this space</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {namingApt.buildingId} · Floor {namingApt.floor === 0 ? 'Ground' : namingApt.floor === 1 ? '1 (Lobby)' : namingApt.floor}
              </p>
            </div>
            <input
              autoFocus
              type="text"
              value={namingInput}
              onChange={e => setNamingInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setNamingApt(null); }}
              placeholder="e.g. Parking 3, Storage B…"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 w-full"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setNamingApt(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {s.cancel}
              </button>
              <button
                onClick={handleSaveName}
                disabled={!namingInput.trim()}
                className="px-4 py-2 text-sm font-semibold bg-[#1e3a5f] text-white rounded-xl disabled:opacity-40 hover:bg-[#1e3a5f]/90 transition-colors"
              >
                {s.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
