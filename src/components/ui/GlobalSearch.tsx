import React, { useState, useEffect, useRef } from 'react';
import {
  Search, X, Building2, ClipboardList, FileText, MessageSquare,
  HardHat, Layers, FolderOpen, StickyNote, PenLine, Crosshair, Clock, Mic, MapPin, Paperclip, Sparkles,
} from 'lucide-react';
import { useSpeechToText } from '../../data/voiceSearch';
import { usePlannerDrag } from '../../data/plannerDrop';
import { useStore, loadProjectSnapshot } from '../../data/store';
import {
  aptLabel, FocusIntent, Apartment, ContractorAssignment, StageNote, ContractorNote,
  CanvasElement, PlanAnnotation, PlanPin, OfficeNoteFile, Contractor, Stage, MainUiStrings,
} from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import {
  workspaceIndex, globalIndex, searchIndex, parseQuery, wsMatches, queryIsEnough,
  SearchHit, WhyField, WorkspaceSources,
} from '../../data/searchIndex';
import { readRecent, writeRecent, rememberQuery, notePick, clearPicks, pickKey } from '../../data/searchMemory';
import { aiSearchAvailable, aiSearchTerms } from '../../data/searchAi';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  /** Unique across workspaces: `${projectId}:${docId}`. */
  id: string;
  /** The index's own key (`kind:recordId`) — what the learned picks are stored under. */
  docId: string;
  type: 'apartment' | 'task' | 'note' | 'contractor_note'
      | 'contractor' | 'stage' | 'board' | 'group' | 'markup' | 'pin' | 'file';
  title: string;
  subtitle: string;
  /** Where the query was found, when the title alone would not explain the row. */
  why?: { label: string; text: string; term: string };
  /**
   * What this result IS, rather than where a route happens to live.
   *
   * Every result carries one. A stage used to carry `/settings`, which is where
   * a stage is renamed and not where it is seen — so choosing it answered a
   * question nobody had asked.
   */
  focus: FocusIntent;
  /**
   * Which workspace this lives in.
   *
   * The search reads every workspace, so a result has to carry its own or
   * choosing it would look the thing up in whichever one happens to be open
   * and find nothing.
   */
  projectId: string;
  /**
   * Does this thing have a PLACE you can be shown?
   *
   * A job, a group, a note or a widget sits somewhere; a worker and a stage do
   * not, so offering to fly to them would be a button that lands nowhere.
   */
  onBoard?: boolean;
  /** Lower is better; the index decided it (tier first, everything else inside the tier). */
  rank: number;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

/** The matched term, bolded inside the "found in" text. */
function Marked({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold text-gray-600">{text.slice(at, at + term.length)}</b>
      {text.slice(at + term.length)}
    </>
  );
}

/**
 * One result row — its own component (module-level, the documented trap) so it
 * can hold a `usePlannerDrag` of its own: a JOB found in the search can be
 * dragged straight out of the results — onto a notebook square to plan it, or
 * onto the open board, where landing takes it OUT of whatever group held it
 * (the board placer's standing rule). The dialog dims and stands out of
 * hit-testing while the drag is live, so the board underneath can answer.
 */
function ResultRow({ result, icon, label, onSelect, onReveal, onHeld, onDropped }: {
  result: SearchResult;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  onReveal: () => void;
  onHeld: (held: boolean) => void;
  onDropped: () => void;
}) {
  const isJob = result.focus.kind === 'apartment';
  const drag = usePlannerDrag(result.focus.kind === 'apartment' ? result.focus.id : '', {
    enabled: isJob,
    projectId: result.projectId,
    label: result.title,
    onToast: onDropped,
  });
  const heldRef = useRef(false);
  useEffect(() => {
    if (heldRef.current === drag.held) return;
    heldRef.current = drag.held;
    onHeld(drag.held);
  }, [drag.held, onHeld]);
  return (
    // A ROW, not a button — "Show on board" sits inside it, and a button
    // inside a button is invalid markup browsers flatten.
    <div
      role="button"
      tabIndex={-1}
      onClick={onSelect}
      {...drag.handlers}
      style={drag.style}
      data-search-row
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors
                 text-left cursor-pointer group/row"
    >
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{result.title}</div>
        <div className="text-xs text-gray-400 truncate">{result.subtitle}</div>
        {result.why && (
          // WHY it matched — the folder title, the phone, a memo's words — so
          // a row whose title does not contain the query explains itself.
          <div data-search-why className="text-[11px] text-gray-400 truncate mt-0.5">
            <span className="text-gray-300">{result.why.label}: </span>
            <Marked text={result.why.text} term={result.why.term} />
          </div>
        )}
      </div>
      {result.onBoard && (
        <button
          onClick={e => { e.stopPropagation(); onReveal(); }}
          title="Show it on the board"
          className="flex-shrink-0 p-1.5 -my-0.5 rounded-lg text-gray-300
                     hover:text-[#1e3a5f] hover:bg-[#4aa8d8]/12 transition-colors"
        >
          <Crosshair size={14} />
        </button>
      )}
      <span className="text-[10px] text-gray-300 flex-shrink-0 pt-0.5">{label}</span>
    </div>
  );
}

/** The "found in" label for each field the index can point at. */
function whyLabelOf(field: WhyField, s: MainUiStrings): string {
  switch (field) {
    case 'folder': case 'family': case 'first': case 'city': case 'num': return s.searchWhyFolder;
    case 'address': return s.searchWhyAddress;
    case 'phone': return s.searchWhyPhone;
    case 'notes': return s.searchWhyNotes;
    case 'words': return s.searchWhyMemo;
    case 'files': return s.searchWhyFile;
    case 'who': return s.searchWhyWorker;
    case 'link': return s.searchWhyLink;
    case 'unit': return s.searchWhyUnit;
    case 'tipus': return s.searchWhyTipus;
  }
}

/** How long a keystroke waits before the search runs — one render per pause, not per letter. */
const DEBOUNCE_MS = 60;

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const {
    apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
    canvasElements, planAnnotations, planPins, officeNoteFiles, projects, currentProjectId,
    setPendingFocus, setCurrentProject,
  } = useStore();
  const s = useStore(state => state.mainUiStrings);
  const [query, setQuery] = useState('');
  /** A row is being dragged out of the dialog — dim it and free the board. */
  const [dragLive, setDragLive] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  /**
   * The AI's other spellings for THIS query — run through the same index.
   * Keyed by the query they answer, so typing on simply ignores them.
   */
  const [ai, setAi] = useState<{ q: string; terms: string[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  /** The question the AI was asked and did not answer — said out loud, never a silent reset. */
  const [aiFailedFor, setAiFailedFor] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  /**
   * Every OTHER workspace's data, read from its own cache.
   *
   * Loaded once when the dialog opens, not per keystroke: each one is a
   * JSON.parse of a whole workspace, and doing that three times per letter
   * typed would make the search stutter on a board of a thousand jobs.
   *
   * Only the open workspace is live. The others are whatever `persist()` last
   * wrote on THIS machine, which the footer says out loud rather than leaving
   * somebody to wonder why a job they know exists is not listed.
   */
  const [snaps, setSnaps] = useState<Record<string, ReturnType<typeof loadProjectSnapshot>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  // Talking instead of typing — the same microphone the search tile carries.
  const { listening, toggle: toggleVoice, supported: voiceOk } = useSpeechToText(
    s.isRtl ? 'he-IL' : 'en-US', text => setQuery(text));

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setRecent(readRecent());
      const got: Record<string, ReturnType<typeof loadProjectSnapshot>> = {};
      projects.forEach(p => { if (p.id !== currentProjectId) got[p.id] = loadProjectSnapshot(p.id); });
      setSnaps(got);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, projects, currentProjectId]);

  // A workspace snapshot that arrived from the cloud after the dialog opened
  // is folded in — its own effect, so refreshing the snaps can never clear
  // what somebody is mid-way through typing.
  const snapTick = useStore(state => state.snapshotTick);
  useEffect(() => {
    if (!open) return;
    const got: Record<string, ReturnType<typeof loadProjectSnapshot>> = {};
    projects.forEach(p => { if (p.id !== currentProjectId) got[p.id] = loadProjectSnapshot(p.id); });
    setSnaps(got);
  }, [snapTick]);

  useEffect(() => {
    if (!queryIsEnough(query)) { setResults([]); return; }

    /**
     * The search is the app's ONE index (`data/searchIndex.ts`) — the same
     * fields, the same tiers and the same Hebrew rule as the search tile, the
     * job list, the group windows and the Find-a-job widget. Per workspace:
     * the open one from the live store, the rest from the snapshot each last
     * wrote on this machine. The index is kept between keystrokes and only
     * the records that changed are re-read, so a thousand-job board answers
     * a letter in a few milliseconds.
     */
    const timer = setTimeout(() => {
      const { filters } = parseQuery(query);
      const found: SearchResult[] = [];
      const widgetNameOf = (id: string) => WIDGET_BY_ID.get(id)?.name;

      // `qq` is the query or one of the AI's other spellings; `shift` puts the
      // AI's finds below everything the typed words found themselves.
      let qq = query, shift = 0, aiTerm = '';
      const searchOne = (pid: string, workspace: string, W: WorkspaceSources, bias: number) => {
        const index = workspaceIndex(pid, W);
        const hits = searchIndex(index, qq, { projectId: pid, bias, limit: 30, perKind: 6 });
        const onBoard = pid === 'general';
        const aptsById = new Map(W.apartments.map(a => [a.id, a]));
        /**
         * Where a unit is, in words somebody recognises: the workspace, then
         * the building when there is one, then the group it is filed in.
         * "G" is a storage detail and "Apt" is wrong for a job.
         */
        const whereIs = (a?: Apartment, binLabel?: string): string => {
          if (!a) return workspace;
          const bits = [workspace];
          if (!onBoard && a.buildingId) bits.push(`Building ${a.buildingId}`);
          if (binLabel) bits.push(`In ${binLabel}`);
          return bits.filter(Boolean).join(' · ');
        };
        const why = (h: SearchHit) => h.why
          ? { label: whyLabelOf(h.why.field, s), text: h.why.text, term: h.why.term }
          : undefined;
        const push = (h: SearchHit, r: Omit<SearchResult, 'id' | 'docId' | 'projectId' | 'rank' | 'why'>) =>
          found.push({
            ...r, id: `${pid}:${h.docId}`, docId: h.docId, projectId: pid, rank: h.rank + shift,
            why: aiTerm ? { label: s.searchWhyAi ?? 'AI found it as', text: aiTerm, term: aiTerm } : why(h),
          });

        for (const h of hits) {
          switch (h.kind) {
            case 'job': {
              const a = h.rec as Apartment;
              const extra = (a.generalNotes ?? '').trim()
                ? a.generalNotes.split('\n')[0].slice(0, 60)
                : (!onBoard && a.floor ? `Floor ${a.floor}` : '');
              push(h, {
                type: 'apartment',
                title: aptLabel(a) || (onBoard ? 'Job' : 'Unit'),
                subtitle: [whereIs(a, h.binLabel), extra].filter(Boolean).join(' · '),
                focus: { kind: 'apartment', id: a.id },
                onBoard: true,
              });
              break;
            }
            case 'task': {
              const t = h.rec as ContractorAssignment;
              const apt = aptsById.get(t.apartmentId);
              const worker = contractors.find(c => c.id === t.contractorId);
              push(h, {
                type: 'task',
                title: t.taskDescription.slice(0, 60),
                subtitle: [apt ? aptLabel(apt) : (t.general ? workspace : ''), worker?.name, whereIs(apt, h.binLabel)].filter(Boolean).join(' · '),
                focus: apt ? { kind: 'task', id: t.id, apartmentId: t.apartmentId } : { kind: 'contractor', id: t.contractorId },
                onBoard: !!apt,
              });
              break;
            }
            case 'snote': {
              const n = h.rec as StageNote;
              const apt = aptsById.get(n.apartmentId);
              const stage = stages.find(st => st.id === n.stageId);
              const text = n.entries?.length ? n.entries[n.entries.length - 1].text : n.noteText;
              push(h, {
                type: 'note',
                title: (text || n.noteText || '').slice(0, 60),
                subtitle: [aptLabel(apt), stage?.name, whereIs(apt, h.binLabel)].filter(Boolean).join(' · '),
                focus: { kind: 'apartment', id: n.apartmentId },
                onBoard: true,
              });
              break;
            }
            case 'msg': {
              const n = h.rec as ContractorNote;
              const apt = aptsById.get(n.apartmentId);
              push(h, {
                type: 'contractor_note',
                title: (n.text || n.attachmentFilename || '').slice(0, 60),
                subtitle: [aptLabel(apt), n.authorName, whereIs(apt, h.binLabel)].filter(Boolean).join(' · '),
                focus: { kind: 'apartment', id: n.apartmentId },
                onBoard: true,
              });
              break;
            }
            case 'group': {
              const el = h.rec as CanvasElement;
              const n = W.apartments.filter(a => a.boardBin === (el.binKind ?? el.id)).length;
              push(h, {
                type: 'group',
                title: h.binLabel ?? el.text,
                subtitle: `Group on the job board · ${n} ${n === 1 ? 'job' : 'jobs'}`,
                focus: { kind: 'group', id: el.id },
                onBoard: true,
              });
              break;
            }
            case 'node': {
              const el = h.rec as CanvasElement;
              const kind = el.widget ? (widgetNameOf(el.widget) ?? 'Widget') : el.type;
              const text = `${el.text ?? ''} ${el.docName ?? ''}`.trim();
              push(h, {
                type: 'board',
                title: text.slice(0, 60) || kind,
                subtitle: `${kind} on the job board${h.binLabel ? ` · in ${h.binLabel}` : ''}`,
                focus: { kind: 'node', id: el.id },
                onBoard: true,
              });
              break;
            }
            case 'markup': {
              const m = h.rec as PlanAnnotation;
              const apt = aptsById.get(m.apartmentId);
              push(h, {
                type: 'markup',
                title: `${m.planName ?? 'Plan'} — version ${m.version}`,
                subtitle: `${apt ? aptLabel(apt) : 'Job'} · marked up by ${m.createdBy || 'the office'}`,
                focus: { kind: 'markup', apartmentId: m.apartmentId },
              });
              break;
            }
            case 'pin': {
              const p = h.rec as PlanPin;
              const apt = aptsById.get(p.apartmentId);
              push(h, {
                type: 'pin',
                title: (p.text || p.audioTranscript || '').slice(0, 60),
                subtitle: [aptLabel(apt), p.createdBy, whereIs(apt, h.binLabel)].filter(Boolean).join(' · '),
                focus: { kind: 'apartment', id: p.apartmentId },
                onBoard: true,
              });
              break;
            }
            case 'file': {
              const f = h.rec as OfficeNoteFile;
              const apt = aptsById.get(f.apartmentId);
              push(h, {
                type: 'file',
                title: f.filename.slice(0, 60),
                subtitle: [aptLabel(apt), f.uploadedByName, whereIs(apt, h.binLabel)].filter(Boolean).join(' · '),
                focus: { kind: 'apartment', id: f.apartmentId },
                onBoard: true,
              });
              break;
            }
            default:
              break;
          }
        }
      };

      /**
       * Every workspace, the open one from the live store and the rest from
       * their own caches. The open one carries no bias so what is in front of
       * you ranks above what is not, all else equal. A `ws:` word keeps only
       * the workspaces it names.
       */
      const runAll = () => {
      for (const p of projects) {
        if (!wsMatches(filters, p)) continue;
        const live = p.id === currentProjectId;
        const W: WorkspaceSources | undefined = live
          ? { apartments, assignments: contractorAssignments, stageNotes, contractorNotes, canvasElements,
              planAnnotations, planPins, officeNoteFiles, contractors, stages, widgetNameOf }
          : snaps[p.id] && { ...snaps[p.id], contractors, stages, widgetNameOf };
        if (!W) continue;                       // a workspace with nothing cached here
        searchOne(p.id, p.name, W, live ? 0 : 2);
      }

      /**
       * Workers and stages are GLOBAL — bare collections shared by every
       * workspace — so they are searched ONCE, not once per workspace, or the
       * same worker would come back three times.
       */
      const aptsOf = (pid: string) =>
        (pid === currentProjectId ? apartments : snaps[pid]?.apartments) ?? [];
      const g = globalIndex(contractors, stages);
      for (const h of searchIndex(g, qq, { projectId: currentProjectId, limit: 8, perKind: 4 })) {
        if (h.kind === 'worker') {
          const c = h.rec as Contractor;
          const open = contractorAssignments.filter(a => a.contractorId === c.id && !a.completedAt).length;
          found.push({
            id: `${currentProjectId}:${h.docId}`, docId: h.docId, type: 'contractor',
            title: c.name,
            subtitle: `${c.category} · ${open} open ${open === 1 ? 'task' : 'tasks'} here`,
            focus: { kind: 'contractor', id: c.id },
            projectId: currentProjectId,
            rank: h.rank + shift,
          });
        } else if (h.kind === 'stage') {
          // A stage carrying `projectId: 'general'` is the Job Board's own;
          // anything else is shared, so it is shown where you are.
          const st = h.rec as Stage;
          const pid = st.projectId === 'general' ? 'general' : currentProjectId;
          const n = aptsOf(pid).filter(a => a.currentStageId === st.id).length;
          const where = projects.find(p => p.id === pid)?.name ?? '';
          found.push({
            id: `${currentProjectId}:${h.docId}`, docId: h.docId, type: 'stage',
            title: st.name,
            subtitle: `${where} · ${n} ${n === 1 ? 'unit' : 'units'} at this stage`,
            focus: { kind: 'stage', id: st.id },
            projectId: pid,
            rank: h.rank + shift,
          });
        }
      }

      };
      runAll();
      if (ai && ai.q === query) {
        for (const t of ai.terms) { qq = t; shift = 1000; aiTerm = t; runAll(); }
      }
      // The same record found twice (the typed words and an AI spelling, or
      // two spellings) is listed once, at its best rank.
      const best = new Map<string, SearchResult>();
      for (const r of found) {
        const was = best.get(r.id);
        if (!was || r.rank < was.rank) best.set(r.id, r);
      }
      const merged = [...best.values()];
      // ONE stable sort over everything — the index already folded the tier,
      // the relevance, the recency and the learned picks into each rank.
      merged.sort((a, b) => a.rank - b.rank);
      setResults(merged.slice(0, 40));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
      canvasElements, planAnnotations, planPins, officeNoteFiles, projects, currentProjectId, snaps, s, ai]);

  /** Remember what was looked for, newest first and never twice. */
  function remember(q: string) {
    setRecent(rememberQuery(q));
  }

  /**
   * Arrive in the result's OWN workspace before asking to be shown the thing.
   *
   * The order matters and is the documented one: `setCurrentProject` clears
   * `pendingFocus` as part of arriving somewhere new, so the intent is handed
   * over AFTER the switch. The other way round it is thrown away and the row
   * appears to do nothing.
   */
  function goTo(result: SearchResult, focus: FocusIntent) {
    onClose();
    remember(query);
    // The learning half: what was chosen, for what was typed. Next time the
    // same few letters go in, this result is the first answer.
    notePick(pickKey(result.projectId, result.docId), parseQuery(query).text);
    if (result.projectId !== currentProjectId) setCurrentProject(result.projectId);
    setPendingFocus(focus);
    const jobBoard = result.projectId === 'general';
    switch (focus.kind) {
      case 'contractor':
        navigate('/tasks'); break;
      case 'group':
      case 'node':
        navigate('/jobs'); break;
      default:
        // Apartments, tasks, notes, stages and markups all live on whichever
        // surface that workspace uses to show its jobs.
        navigate(jobBoard ? '/jobs' : '/project');
    }
  }

  /**
   * Show me where it is, and stop there.
   *
   * The row takes you to the thing AND opens it, which is usually what you
   * wanted. This answers the other question — whereabouts does it actually sit
   * — by travelling there and pulsing, leaving the board or the diagram on
   * screen instead of a drawer over it.
   */
  function handleReveal(result: SearchResult) {
    goTo(result, result.focus.kind === 'apartment'
      ? { ...result.focus, reveal: true }
      : result.focus);
  }

  function handleSelect(result: SearchResult) {
    goTo(result, result.focus);
  }

  const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
    apartment: <Building2 size={14} className="text-[#1e3a5f]" />,
    task: <ClipboardList size={14} className="text-amber-500" />,
    note: <FileText size={14} className="text-blue-500" />,
    contractor_note: <MessageSquare size={14} className="text-green-500" />,
    contractor: <HardHat size={14} className="text-orange-500" />,
    stage: <Layers size={14} className="text-violet-500" />,
    group: <FolderOpen size={14} className="text-fuchsia-600" />,
    board: <StickyNote size={14} className="text-teal-600" />,
    markup: <PenLine size={14} className="text-rose-500" />,
    pin: <MapPin size={14} className="text-red-500" />,
    file: <Paperclip size={14} className="text-slate-500" />,
  };

  const TYPE_LABEL: Record<SearchResult['type'], string> = {
    apartment: s.searchTypeApartment, task: s.searchTypeTask, note: s.searchTypeNote,
    contractor_note: s.searchTypeContractorNote,
    contractor: s.searchTypeContractor, stage: s.searchTypeStage, group: s.searchTypeGroup,
    board: s.searchTypeBoard, markup: s.searchTypeMarkup, pin: s.searchTypePin, file: s.searchTypeFile,
  };

  /**
   * The list in LAYERS (owner, recording 2026-10-15: "first show the jobs, then
   * task names… it's busy — layer it"). The ranking still decides the order
   * INSIDE a layer; the layers themselves always come jobs → tasks → notes →
   * the board → people and stages, each under its own heading with a count.
   */
  const he = !!s.isRtl;
  const LAYERS: { key: string; label: string; types: SearchResult['type'][] }[] = [
    { key: 'jobs', label: he ? 'עבודות' : 'Jobs', types: ['apartment'] },
    { key: 'tasks', label: he ? 'משימות' : 'Tasks', types: ['task'] },
    { key: 'notes', label: he ? 'הערות, הודעות וקבצים' : 'Notes, messages and files', types: ['note', 'contractor_note', 'pin', 'file', 'markup'] },
    { key: 'board', label: he ? 'על הלוח' : 'On the board', types: ['group', 'board'] },
    { key: 'people', label: he ? 'עובדים ושלבים' : 'Workers and stages', types: ['contractor', 'stage'] },
  ];
  const layers = LAYERS
    .map(l => ({ ...l, items: results.filter(r => l.types.includes(r.type)) }))
    .filter(l => l.items.length);

  if (!open) return null;

  return (
    // pointer-events-none on the wrapper, auto on the parts: while a row is
    // being DRAGGED the backdrop goes invisible and the panel dims, so the
    // board underneath is visible and — crucially — reachable by the board
    // placer's own elementFromPoint hit test.
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-20 px-4 pointer-events-none">
      <div className={`fixed inset-0 bg-black/40 pointer-events-auto ${dragLive ? 'invisible' : ''}`}
        onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden
                       pointer-events-auto transition-opacity ${dragLive ? 'opacity-25' : ''}`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') remember(query); }}
            data-enter-own
            placeholder={s.searchPlaceholder}
            className="flex-1 text-sm focus:outline-none text-gray-900 placeholder:text-gray-400"
          />
          {voiceOk && (
            <button
              data-search-mic
              onClick={toggleVoice}
              title={listening ? 'Stop listening' : 'Speak the search'}
              className="p-1.5 rounded-full flex-shrink-0 transition-colors"
              style={listening
                ? { backgroundColor: '#dc2626', color: '#fff', boxShadow: '0 0 0 4px rgba(220,38,38,.2)' }
                : { color: '#1e3a5f', backgroundColor: '#eef2f7' }}
            >
              <Mic size={14} />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* The AI fallback: only once the box holds a real question, and only
            on a machine whose server has the key. One press; the answer is
            folded into the same list, marked "AI found it as …". */}
        {queryIsEnough(query) && (aiBusy || aiSearchAvailable()) && !(ai && ai.q === query) && (
          <button
            type="button"
            data-search-ai
            disabled={aiBusy}
            onClick={async () => {
              const q = query;
              setAiBusy(true);
              const terms = await aiSearchTerms(q, s.isRtl ? 'he' : 'en');
              setAiBusy(false);
              if (terms) { setAi({ q, terms }); setAiFailedFor(''); }
              else setAiFailedFor(q);
              inputRef.current?.focus();
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold border-b border-gray-100 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-70"
          >
            <Sparkles size={14} className={aiBusy ? 'animate-pulse' : ''} />
            {aiBusy ? (s.searchAiBusy ?? 'Asking the AI…') : (s.searchAiBtn ?? 'Search with AI')}
          </button>
        )}
        {aiFailedFor === query && !aiBusy && aiSearchAvailable() && (
          <div data-search-ai-failed className="px-4 py-1.5 text-[11px] text-red-700 bg-red-50 border-b border-gray-100">
            {s.searchAiFailed ?? 'The AI did not answer just now — press again to retry.'}
          </div>
        )}
        {ai && ai.q === query && (
          <div data-search-ai-terms className="px-4 py-1.5 text-[11px] text-violet-700 bg-violet-50/60 border-b border-gray-100 truncate">
            {ai.terms.length
              ? `✨ ${ai.terms.join(' · ')}`
              : (s.searchAiNone ?? 'The AI found no other spellings.')}
          </div>
        )}
        {results.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto" data-search-layers>
            {layers.map(layer => (
              <div key={layer.key} data-search-layer={layer.key}>
                <div className="sticky top-0 z-[1] flex items-center gap-2 px-4 py-1 bg-gray-50/95 backdrop-blur border-y border-gray-100 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                  {layer.label}
                  <span className="text-gray-400 font-semibold tabular-nums" data-search-layer-count>{layer.items.length}</span>
                </div>
                <div className="divide-y divide-gray-100">
            {layer.items.map(result => (
              <ResultRow
                key={result.id}
                result={result}
                icon={TYPE_ICON[result.type]}
                label={TYPE_LABEL[result.type]}
                onSelect={() => handleSelect(result)}
                onReveal={() => handleReveal(result)}
                onHeld={setDragLive}
                onDropped={() => {
                  // The drop landed (a notebook square, or the board — where
                  // it also leaves its group). Remember the pick and get out
                  // of the way so the result is visible where it landed.
                  notePick(pickKey(result.projectId, result.docId), parseQuery(query).text);
                  setDragLive(false);
                  onClose();
                }}
              />
            ))}
                </div>
              </div>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">{s.searchNoResults} "{query}"</div>
        ) : recent.length > 0 ? (
          /* What you looked for lately. Kept on this machine only — what you
             searched for is about the hunt you were on at this desk. */
          <div className="py-1">
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {s.searchRecentTitle}
              </span>
              <span className="flex items-center gap-3">
                <button
                  data-search-clear-picks
                  onClick={clearPicks}
                  title={s.searchClearPicks}
                  className="text-[10.5px] text-gray-400 hover:text-gray-600"
                >
                  {s.searchClearPicks}
                </button>
                <button
                  onClick={() => { writeRecent([]); setRecent([]); }}
                  className="text-[10.5px] text-gray-400 hover:text-gray-600"
                >
                  {s.searchClear}
                </button>
              </span>
            </div>
            {recent.map(r => (
              <button
                key={r}
                onClick={() => { setQuery(r); inputRef.current?.focus(); }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-start"
              >
                <Clock size={13} className="text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-600 truncate">{r}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">{s.searchStartTyping}</div>
        )}

        {/* Only the open workspace is live; the rest are whatever this machine
            last saw. Said out loud, because otherwise a job somebody knows
            exists is simply missing with no explanation. And the filter words,
            because a word nobody is told about is a word nobody types. */}
        <div className="px-4 py-1.5 border-t border-gray-100 text-[10.5px] text-gray-400 space-y-0.5">
          {projects.length > 1 && <div>{s.searchFooter}</div>}
          <div data-search-hint className="text-gray-300">{s.searchHint}</div>
        </div>
      </div>
    </div>
  );
}
