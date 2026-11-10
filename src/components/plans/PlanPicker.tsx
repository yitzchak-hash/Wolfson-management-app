import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, Search, Folder, Loader2, X, CornerDownRight, Star, Maximize2, ExternalLink,
  FileText, Image as ImageIcon, Clock, Check,
} from 'lucide-react';
import {
  DriveFile, PlanEntry, driveThumbUrl, ensureDriveShared, extractFolderId, isDriveFolder,
  isEngineeredPlansFolder, isViewableFile, listFolderAllViaBackend, newestFirst,
} from '../../data/driveApi';
import { mediaKindOf, typeBadgeOf } from '../../data/mediaKind';
import { usePlanDownload } from '../../data/planCache';
import { useMedia } from '../../data/usePhone';
import { useStore } from '../../data/store';
import { relativeTime } from '../../types';
import { hasQuery, litRuns, PlanMatch, rankPlans } from '../../data/planSearch';

/**
 * THE PLAN FINDER — which plan, out of which folder (owner's design, approved
 * 2026-11-10 with his four answers 1b · 2b · 3b · 4b).
 *
 * The old chooser was a small window of identical grey icons with cut-off
 * names, no dates, the folders hidden behind a dropdown and a search that
 * found nothing after one wrong letter. Now:
 *  - a bigger window, the search box first and already focused;
 *  - the job's folders down the side, ALWAYS visible (their subfolders
 *    indented, each with its file count) — one dropdown on a phone;
 *  - every file as a card with its own picture from Drive, its type, its
 *    whole name and how long ago it changed, newest first;
 *  - the marked-up versions are cards of their own BESIDE their plan (2b), the
 *    Annotated Plans folder's files shown with the plan folder's files;
 *  - EVERY file in the folder is shown (4b); what cannot be marked up (Excel,
 *    Word, a zip) is greyed out with its type and cannot be picked. A DWG
 *    with its converted PDF beside it shows that PDF's picture and opens it —
 *    the converted PDF is the DWG's card, not a second one;
 *  - the search forgives typos, word order and the wrong keyboard layout
 *    (`planSearch.ts`), looks in every folder of THIS job (1b) and stays as
 *    cards (3b), each saying the folder it lives in, the matched words lit.
 *
 * The props are the old chooser's, unchanged in meaning: other screens open it
 * exactly as before.
 */

/** Which of the chips is on. */
type Filter = 'all' | 'pdf' | 'dwg' | 'img' | 'annot';
type Kind = 'pdf' | 'dwg' | 'img' | 'other';

/** One folder's listing: its files and its subfolders. null = Drive refused. */
type Listing = { files: DriveFile[]; folders: DriveFile[] } | null;

interface FolderRow { id: string; name: string; sub?: boolean; parent?: string }

interface Card {
  key: string;
  /** The file as Drive lists it — the DWG itself for a converted drawing. */
  file: DriveFile;
  folder: { id: string; name: string };
  /** Where it lives, in words — "Engineered Plans › Annotated Plans". */
  path: string;
  kind: Kind;
  annotated: boolean;
  /** "3" out of "… annotated version 3.0". */
  version?: string;
  /** What pressing it opens. Absent: greyed out, cannot be marked up. */
  pick?: PlanEntry;
  /** Whose picture the card shows. */
  thumbId?: string;
  /** A DWG whose converted PDF stands beside it. */
  converted?: boolean;
  match?: PlanMatch;
}

/** The last few plans opened from the finder in THIS browser (deviceOnly.ts). */
const RECENT_KEY = 'plan_finder_recent';
interface Recent {
  job: string; id: string; name: string; folderId: string; folderName: string;
  kind: PlanEntry['kind']; isImage?: boolean; at: string;
}
function readRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as Recent[]; } catch { return []; }
}
function noteRecent(r: Recent) {
  try {
    const rest = readRecents().filter(x => !(x.job === r.job && x.id === r.id));
    localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...rest].slice(0, 24)));
  } catch { /* a full or blocked storage only costs the shortcut */ }
}

const WORDS = {
  en: {
    title: 'Plans', search: 'Search plans in this job…', enterFirst: 'Enter opens the first',
    all: 'All', pdf: 'Plans (PDF)', dwg: 'Drawings (DWG)', img: 'Pictures', annot: 'Marked up',
    newest: 'Newest first', az: 'A–Z', best: 'Best match',
    folders: 'Folders', recent: 'Opened recently', newestHead: 'newest first', azHead: 'A–Z',
    found: (n: number) => `${n} found in this job`, nothing: 'Nothing in this job matches that.',
    stillLooking: 'Still looking in the job\'s other folders…',
    empty: 'This folder is empty.', unreachable: 'Drive would not let the app read this folder.',
    noFolders: 'No folders found.', chooseFolder: 'Choose another folder in this job\'s Drive',
    markedUp: 'Marked up', converted: 'converted', cantMark: 'Can\'t be marked up here — open it in Drive',
    newTab: 'new tab', newTabTitle: 'Open in a new tab', close: 'Close', ready: 'ready',
    subsBusy: 'finding subfolders…',
  },
  he: {
    title: 'תוכניות', search: 'חיפוש תוכניות בעבודה הזו…', enterFirst: 'Enter פותח את הראשון',
    all: 'הכול', pdf: 'תוכניות (PDF)', dwg: 'שרטוטים (DWG)', img: 'תמונות', annot: 'עם סימונים',
    newest: 'החדש ראשון', az: 'א–ת', best: 'ההתאמה הטובה',
    folders: 'תיקיות', recent: 'נפתחו לאחרונה', newestHead: 'החדש ראשון', azHead: 'א–ת',
    found: (n: number) => `נמצאו ${n} בעבודה הזו`, nothing: 'שום דבר בעבודה הזו לא מתאים.',
    stillLooking: 'עדיין מחפש בשאר התיקיות של העבודה…',
    empty: 'התיקייה ריקה.', unreachable: 'Drive לא נתן לאפליקציה לקרוא את התיקייה הזו.',
    noFolders: 'לא נמצאו תיקיות.', chooseFolder: 'בחירת תיקייה אחרת ב-Drive של העבודה',
    markedUp: 'עם סימונים', converted: 'הומר', cantMark: 'אי אפשר לסמן על הקובץ הזה כאן — פותחים אותו ב-Drive',
    newTab: 'לשונית חדשה', newTabTitle: 'פתיחה בלשונית חדשה', close: 'סגירה', ready: 'מוכן',
    subsBusy: 'מחפש תת-תיקיות…',
  },
};
type Words = typeof WORDS.en;

/** "2 days ago" — the app's own words in English, the same steps in Hebrew. */
function ago(iso: string | undefined, he: boolean): string {
  if (!iso) return '';
  if (!he) return relativeTime(iso);
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

/** "Levi - roof units.pdf" → "Levi - roof units". */
const stemOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}\s*$/, '');
const extOf = (name: string) => (/\.([A-Za-z0-9]{1,5})\s*$/.exec(name)?.[1] ?? '').toLowerCase();

function kindOf(f: DriveFile): Kind {
  const ext = extOf(f.name);
  if (ext === 'dwg' || ext === 'dxf') return 'dwg';
  const k = mediaKindOf(f.name, f.mimeType);
  if (k === 'pdf') return 'pdf';
  if (k === 'image') return 'img';
  return 'other';
}

/** "3" out of "… — annotated version 3.0.pdf"; "1.3" stays "1.3". */
function versionOf(name: string): string | undefined {
  const m = /annotated\s+version\s+(\d+(?:\.\d+)?)/i.exec(name);
  if (!m) return undefined;
  return m[1].replace(/\.0$/, '');
}

const isAnnotFolder = (name: string) => /annotated/i.test(name);

/** "Levi villa — converted.pdf" → "levi villa" (the DWG it was made from). */
function convertedStem(name: string): string | null {
  const m = /^(.*?)\s*[—–-]\s*converted\.pdf$/i.exec(name.trim());
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * One folder's files as cards. A DWG with its converted PDF beside it becomes
 * ONE card (the DWG's badge, the PDF's picture, opening the PDF).
 */
function folderCards(files: DriveFile[], folder: { id: string; name: string }, path: string, annotated: boolean): Card[] {
  const converted = new Map<string, DriveFile>();
  for (const f of files) {
    const stem = convertedStem(f.name);
    if (stem) converted.set(stem, f);
  }
  const used = new Set<string>();
  const dwgStems = new Set(files.filter(f => kindOf(f) === 'dwg')
    .map(f => f.name.replace(/\.[A-Za-z0-9]{1,5}\s*$/, '').trim().toLowerCase()));
  for (const s of dwgStems) { const pdf = converted.get(s); if (pdf) used.add(pdf.id); }
  const out: Card[] = [];
  for (const f of files) {
    if (used.has(f.id)) continue;      // shown as its DWG's card
    const kind = kindOf(f);
    const card: Card = { key: `${folder.id}-${f.id}`, file: f, folder, path, kind, annotated };
    if (isViewableFile(f)) {
      card.pick = {
        id: f.id, name: f.name, kind: annotated ? 'annotated' : 'original',
        modifiedTime: f.modifiedTime, isImage: kind === 'img',
      };
      card.thumbId = f.id;
      if (annotated) card.version = versionOf(f.name);
    } else if (kind === 'dwg') {
      const pdf = converted.get(f.name.replace(/\.[A-Za-z0-9]{1,5}\s*$/, '').trim().toLowerCase());
      if (pdf) {
        card.converted = true;
        card.thumbId = pdf.id;
        card.pick = { id: pdf.id, name: pdf.name, kind: 'original', modifiedTime: pdf.modifiedTime };
      }
    }
    out.push(card);
  }
  return out;
}

/** Lazy: true once the node has scrolled into (or near) view, and stays true. */
function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The background download's quiet note, as the old tiles carried it. */
function DownloadNote({ fileId, w }: { fileId: string; w: Words }) {
  const pct = usePlanDownload(fileId);
  if (pct == null) return null;
  if (pct >= 100) return <span data-plan-ready className="text-[10px] font-bold text-emerald-600 flex-shrink-0">{w.ready}</span>;
  return (
    <span data-plan-downloading className="flex items-center gap-1 flex-shrink-0 text-[10px] text-slate-400 tabular-nums">
      <span className="w-[28px] h-[3px] rounded-full overflow-hidden bg-slate-200">
        <span className="block h-full rounded-full bg-[#4aa8d8]" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

const BADGE: Record<Kind, string> = {
  pdf: 'bg-red-50 text-red-600 border-red-200',
  dwg: 'bg-blue-50 text-blue-700 border-blue-200',
  img: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  other: 'bg-slate-100 text-slate-500 border-slate-200',
};

/** The name, with the matched words lit. */
function NameText({ name, match }: { name: string; match?: PlanMatch }) {
  if (!match?.hits.length) return <>{name}</>;
  return <>{litRuns(name, match.hits).map((r, i) => r.lit
    ? <mark key={i} className="bg-amber-200/80 text-inherit rounded-sm px-[1px]">{r.text}</mark>
    : <React.Fragment key={i}>{r.text}</React.Fragment>)}</>;
}

/** One file, as a card. */
const PlanCard = React.memo(function PlanCard({
  card, w, he, current, starred, starAuto, selected, showPath, onChoose, onStar, onPreview, onOpenNewTab, onHover,
}: {
  card: Card; w: Words; he: boolean; current: boolean; starred: boolean; starAuto?: boolean; selected: boolean;
  showPath: boolean;
  onChoose?: () => void; onStar?: () => void; onPreview?: () => void; onOpenNewTab?: () => void;
  onHover: () => void;
}) {
  const ui = useStore(s => s.mainUiStrings);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [thumbFailed, setThumbFailed] = useState(false);
  const greyed = !card.pick;
  const thumbId = card.thumbId;
  const showThumb = !!thumbId && inView && !thumbFailed;
  useEffect(() => { if (thumbId && inView) ensureDriveShared(thumbId); }, [thumbId, inView]);
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const badge = typeBadgeOf(card.file.name, card.file.mimeType);
  const date = ago(card.file.modifiedTime, he);
  const glyph = card.kind === 'img'
    ? <ImageIcon size={30} className="text-emerald-600" />
    : card.kind === 'pdf' ? <FileText size={30} className="text-[#1e3a5f]" />
      : <span className={`px-2 py-1 rounded-md text-[12px] font-extrabold tracking-wide border ${BADGE[card.kind]}`}>{badge}</span>;
  return (
    <div
      ref={ref}
      data-plan-row={card.file.id}
      data-card-kind={card.kind}
      data-viewable={greyed ? '0' : '1'}
      data-greyed={greyed ? '1' : undefined}
      data-selected={selected ? '1' : undefined}
      data-current={current ? '1' : undefined}
      role="button"
      aria-disabled={greyed || undefined}
      tabIndex={-1}
      onClick={greyed ? undefined : onChoose}
      onMouseEnter={onHover}
      title={greyed ? `${card.file.name} — ${w.cantMark}` : card.file.name}
      className={`group relative flex flex-col rounded-xl border-2 bg-white overflow-hidden text-start ${
        greyed ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-[#4aa8d8] hover:shadow-sm'} ${
        current ? 'border-[#4aa8d8]' : selected ? 'border-[#1e3a5f]' : 'border-gray-200'} ${
        selected ? 'ring-2 ring-[#4aa8d8]/40' : ''}`}
    >
      <div className={`relative h-[118px] flex items-center justify-center ${greyed ? 'bg-slate-100' : 'bg-[#f8fafc]'}`}>
        {showThumb ? (
          <img data-card-thumb src={driveThumbUrl(thumbId!, 400)} alt="" loading="lazy" draggable={false}
            onError={() => setThumbFailed(true)}
            className={`absolute inset-0 w-full h-full object-contain p-1.5 ${greyed ? 'grayscale' : ''}`} />
        ) : glyph}
        <span data-card-badge={badge}
          className={`absolute top-1.5 start-1.5 px-1.5 py-[1px] rounded text-[10px] font-extrabold tracking-wide border ${BADGE[card.kind]}`}>
          {badge}
        </span>
        {!greyed && onStar && (
          <button type="button"
            data-tile-star={card.file.id}
            data-starred={starred ? '1' : '0'}
            data-star-auto={starred && starAuto ? '1' : undefined}
            onClick={e => { e.stopPropagation(); onStar(); }}
            title={starred ? (starAuto ? ui.planAutoPicked : ui.planIsMain) : ui.planMakeMain}
            className={`absolute top-1 end-1 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border ${
              starred
                ? (starAuto ? 'bg-red-600 border-red-700 text-white opacity-100' : 'bg-amber-400 border-amber-500 text-white opacity-100')
                : 'bg-white/90 border-gray-200 text-slate-500 hover:text-amber-500 opacity-0 group-hover:opacity-100'}`}>
            <Star size={16} fill={starred ? 'currentColor' : 'none'} />
          </button>
        )}
        {!greyed && onPreview && (
          <button type="button"
            data-tile-preview={card.file.id}
            onClick={e => { e.stopPropagation(); onPreview(); }}
            title={ui.planPreviewTitle}
            className="absolute bottom-1 end-1 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border
                       bg-white/90 border-gray-200 text-[#1e3a5f] hover:text-[#4aa8d8] opacity-0 group-hover:opacity-100">
            <Maximize2 size={15} />
          </button>
        )}
      </div>
      <div className="px-2.5 pt-1.5 pb-2 min-w-0 flex-1 flex flex-col border-t border-gray-100">
        {/* The name without its extension (the badge says the type), each line
            in its own direction — a Hebrew name inside an English window
            neither runs backwards nor drags ".pdf" to its far end. */}
        <div data-card-name className="text-[12.5px] font-semibold text-slate-800 leading-snug line-clamp-2 break-words"
          style={{ unicodeBidi: 'plaintext', textAlign: he ? 'right' : 'left' }}>
          <NameText name={stemOf(card.file.name)} match={card.match} />
        </div>
        {showPath && (
          <div data-card-folder className="truncate text-[11px] text-slate-500 mt-0.5">{card.path}</div>
        )}
        <div className="flex items-center gap-1.5 mt-auto pt-1 min-w-0">
          <span data-card-date className="text-[11px] text-slate-500 truncate">
            {date}
            {card.converted && (
              <span data-card-converted className="text-emerald-700">
                {date ? ' · ' : ''}{w.converted} <Check size={11} className="inline -mt-0.5" />
              </span>
            )}
          </span>
          <span className="flex-1" />
          {card.pick && <DownloadNote fileId={card.pick.id} w={w} />}
        </div>
        {(card.annotated || (onOpenNewTab && !greyed)) && (
          <div className="flex items-center gap-1 mt-1">
            {card.annotated && (
              <span data-annot-chip className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">
                {w.markedUp}{card.version ? ` · v${card.version}` : ''}
              </span>
            )}
            <span className="flex-1" />
            {onOpenNewTab && !greyed && (
              <button type="button" data-open-new-tab={card.file.id}
                onClick={e => { e.stopPropagation(); onOpenNewTab(); }}
                title={w.newTabTitle}
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-gray-200 text-[10.5px]
                           font-bold text-[#1e3a5f] hover:border-[#4aa8d8] flex-shrink-0">
                <ExternalLink size={11} /> {w.newTab}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-plan-skeleton className="rounded-xl border-2 border-gray-100 overflow-hidden animate-pulse">
          <div className="h-[118px] bg-slate-200" />
          <div className="px-2.5 py-2 space-y-1.5">
            <div className="h-3 rounded bg-slate-200" style={{ width: `${78 - i * 14}%` }} />
            <div className="h-2.5 rounded bg-slate-100 w-1/3" />
          </div>
        </div>
      ))}
    </>
  );
}

export function PlanPicker({
  driveLink, plansFolderId, plansFolderName = 'Engineered Plans',
  plans, current, onPick, onOpenNewTab, onClose, onStar, starredId, starAuto, onPreview,
}: {
  driveLink?: string;
  plansFolderId?: string | null;
  plansFolderName?: string;
  /** What is already known about the plans folder, so it opens instantly. */
  plans: PlanEntry[];
  current?: string;
  /**
   * `stayOpen` is true when the file was found in ANOTHER folder: the picker
   * stays up on that folder with the file selected, so you can see where it
   * turned out to live. Choosing from the folder you are already in closes it,
   * because you have finished.
   */
  onPick: (p: PlanEntry, folder: { id: string; name: string }, stayOpen?: boolean) => void;
  /** Offered per card when the host runs tabs — opens the plan in a NEW tab. */
  onOpenNewTab?: (p: PlanEntry) => void;
  onClose: () => void;
  /**
   * THE STAR: "make this the contractor's plan". The host writes plansPdfLink;
   * the picker only draws which card wears it (`starredId`, the apartment's
   * plansPdfLink). Without the callback no star is drawn at all.
   */
  onStar?: (p: PlanEntry) => void;
  starredId?: string | null;
  /** The star is the app's latest-activity guess, drawn red until a person stars one. */
  starAuto?: boolean;
  /** The card's expand arrow — open this sheet as a LOOK, never a choice. */
  onPreview?: (p: PlanEntry, folder: { id: string; name: string }) => void;
}) {
  const he = useStore(s => s.mainUiStrings.isRtl);
  const w = he ? WORDS.he : WORDS.en;
  const phone = useMedia('(max-width: 639px)');
  const rootId = driveLink ? extractFolderId(driveLink) : null;
  const jobKey = rootId ?? plansFolderId ?? '';

  /** Every folder listed so far, by id. `undefined` = not listed yet. */
  const [lists, setLists] = useState<Record<string, Listing>>({});
  const [openId, setOpenId] = useState<string | null>(plansFolderId ?? null);
  /** The plans folder as found (the caller's, or the one looked up here). */
  const [plansId, setPlansId] = useState<string | null>(plansFolderId ?? null);
  const [plansName, setPlansName] = useState(plansFolderName);
  const [sweeping, setSweeping] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'new' | 'az'>('new');
  const [sel, setSel] = useState(-1);
  const [recents] = useState(() => readRecents().filter(r => r.job === jobKey).slice(0, 4));
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(new Map<string, Promise<Listing>>());
  const known = useRef(new Map<string, Listing>());

  useEffect(() => { searchRef.current?.focus(); }, []);

  /**
   * List one folder and remember it. One request at a time per folder; a
   * folder already listed answers from memory unless `fresh` asks Drive again.
   */
  const load = useCallback((id: string, fresh = false): Promise<Listing> => {
    const going = inFlight.current.get(id);
    if (going) return going;
    if (!fresh && known.current.has(id)) return Promise.resolve(known.current.get(id)!);
    const p = listFolderAllViaBackend(id).then(rows => {
      const listing: Listing = rows
        ? { files: rows.filter(f => !isDriveFolder(f)), folders: rows.filter(isDriveFolder) }
        : null;
      known.current.set(id, listing);
      setLists(prev => ({ ...prev, [id]: listing }));
      inFlight.current.delete(id);
      return listing;
    });
    inFlight.current.set(id, p);
    return p;
  }, []);

  /**
   * The sweep: the plans folder first (the opening view), then the job folder
   * (the side list), then every top folder and every one of their subfolders
   * — three at a time, gentle on the API — so the folder counts fill in and a
   * search can find a file anywhere in the job.
   */
  useEffect(() => {
    let dead = false;
    (async () => {
      let pid = plansFolderId ?? null;
      if (pid) await load(pid);
      if (dead) return;
      let tops: DriveFile[] = [];
      if (rootId) {
        const root = await load(rootId);
        if (dead) return;
        tops = root?.folders ?? [];
        if (!pid) {
          // Find the plans folder ourselves if the caller has not — an empty
          // chooser on the folder the plans are actually in is worse than none.
          const found = tops.find(f => isEngineeredPlansFolder(f.name))
            ?? tops.find(f => /engineer|plans/i.test(f.name)) ?? tops[0];
          pid = found?.id ?? rootId;
          setPlansId(pid);
          setPlansName(found?.name ?? plansFolderName);
          setOpenId(cur => cur ?? pid);
          await load(pid);
          if (dead) return;
        }
      }
      const level1 = [...tops.map(f => f.id)];
      if (pid && !level1.includes(pid)) level1.unshift(pid);
      // Read each listing from the call's own answer, never from state — a
      // state write is not rendered yet when the next line runs, and reading
      // it there silently skipped subfolders.
      const got = new Map<string, Listing>();
      for (let i = 0; i < level1.length; i += 3) {
        const batch = level1.slice(i, i + 3);
        const res = await Promise.all(batch.map(id => load(id)));
        batch.forEach((id, j) => got.set(id, res[j]));
        if (dead) return;
      }
      const level2 = [...new Set(level1.flatMap(id => got.get(id)?.folders.map(f => f.id) ?? []))]
        .filter(id => !got.has(id));
      for (let i = 0; i < level2.length; i += 3) {
        await Promise.all(level2.slice(i, i + 3).map(id => load(id)));
        if (dead) return;
      }
      if (!dead) setSweeping(false);
    })();
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansFolderId, driveLink]);

  // Escape closes the finder and nothing behind it — the studio and the job
  // window both listen for the key as well.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  /** The side list: the job's folders, each with its subfolders under it. */
  const tree = useMemo<FolderRow[]>(() => {
    const tops: FolderRow[] = (rootId ? lists[rootId]?.folders ?? [] : []).map(f => ({ id: f.id, name: f.name }));
    if (plansId && !tops.some(t => t.id === plansId)) tops.unshift({ id: plansId, name: plansName });
    const out: FolderRow[] = [];
    const seen = new Set<string>();
    for (const t of tops) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      for (const s of lists[t.id]?.folders ?? []) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push({ id: s.id, name: s.name, sub: true, parent: t.id });
      }
    }
    return out;
  }, [lists, rootId, plansId, plansName]);

  const nameOf = useCallback((id: string) => tree.find(r => r.id === id)?.name
    ?? (id === plansId ? plansName : ''), [tree, plansId, plansName]);
  const pathOf = useCallback((id: string) => {
    const row = tree.find(r => r.id === id);
    if (row?.parent) return `${nameOf(row.parent)} › ${row.name}`;
    return row?.name ?? nameOf(id);
  }, [tree, nameOf]);

  /**
   * The cards of one folder's VIEW: its own files, then (2b) the files of its
   * marked-up child folders, as cards of their own. For the plans folder the
   * caller's handed list is kept in until Drive's listing has them — a version
   * stamped seconds ago may not be listed yet.
   */
  const viewCards = useCallback((id: string): Card[] | undefined => {
    const own = lists[id];
    const name = nameOf(id);
    const isPlans = id === plansId;
    if (own === undefined) {
      if (!isPlans || !plans.length) return undefined;
      // Not listed yet: what the caller handed over, at once.
      return plans.map(p => ({
        key: `${id}-${p.id}`, folder: { id, name }, path: name,
        file: { id: p.id, name: p.name, mimeType: p.isImage ? 'image/jpeg' : 'application/pdf', modifiedTime: p.modifiedTime },
        kind: p.isImage ? 'img' as const : 'pdf' as const, annotated: p.kind === 'annotated',
        version: p.kind === 'annotated' ? versionOf(p.name) : undefined,
        pick: p, thumbId: p.id,
      }));
    }
    if (own === null) return [];
    const annotSelf = isAnnotFolder(name);
    const out = folderCards(own.files, { id, name }, pathOf(id), annotSelf);
    for (const sub of own.folders) {
      if (!isAnnotFolder(sub.name)) continue;
      const inner = lists[sub.id];
      if (inner) out.push(...folderCards(inner.files, { id: sub.id, name: sub.name }, pathOf(sub.id), true));
    }
    if (isPlans) {
      const have = new Set(out.map(c => c.file.id).concat(out.map(c => c.pick?.id ?? '')));
      for (const p of plans) {
        if (have.has(p.id)) continue;
        out.push({
          key: `${id}-${p.id}`, folder: { id, name }, path: name,
          file: { id: p.id, name: p.name, mimeType: p.isImage ? 'image/jpeg' : 'application/pdf', modifiedTime: p.modifiedTime },
          kind: p.isImage ? 'img' : 'pdf', annotated: p.kind === 'annotated',
          version: p.kind === 'annotated' ? versionOf(p.name) : undefined, pick: p, thumbId: p.id,
        });
      }
    }
    return out;
  }, [lists, nameOf, pathOf, plansId, plans]);

  const searching = hasQuery(q);

  /** Every card in the job, once, for the search. */
  const allCards = useMemo<Card[]>(() => {
    if (!searching) return [];
    const out: Card[] = [];
    const seen = new Set<string>();
    const ids = new Set<string>([...(plansId ? [plansId] : []), ...tree.map(r => r.id), ...Object.keys(lists)]);
    if (rootId) ids.add(rootId);
    for (const id of ids) {
      const own = lists[id];
      if (!own) continue;
      const name = nameOf(id);
      const cards = folderCards(own.files, { id, name }, id === rootId ? '' : pathOf(id), isAnnotFolder(name));
      for (const c of cards) {
        if (seen.has(c.file.id)) continue;
        seen.add(c.file.id);
        out.push(c);
      }
    }
    // A version the caller knows of but Drive has not listed yet.
    for (const c of viewCards(plansId ?? '') ?? []) if (!seen.has(c.file.id)) { seen.add(c.file.id); out.push(c); }
    return out;
  }, [searching, lists, tree, plansId, rootId, nameOf, pathOf, viewCards]);

  const base: Card[] | undefined = useMemo(() => {
    if (searching) {
      return rankPlans(allCards.map(c => ({ ...c, name: c.file.name, modifiedTime: c.file.modifiedTime })), q)
        .map(r => ({ ...r.file, match: r.match }));
    }
    const v = openId ? viewCards(openId) : undefined;
    if (!v) return undefined;
    if (sort === 'az') {
      return [...v].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }));
    }
    return newestFirst(v.map(c => ({ ...c, modifiedTime: c.file.modifiedTime })));
  }, [searching, allCards, q, openId, viewCards, sort]);

  const counts = useMemo(() => {
    const c = { all: 0, pdf: 0, dwg: 0, img: 0, annot: 0 };
    for (const card of base ?? []) {
      c.all++;
      if (card.kind === 'pdf') c.pdf++;
      if (card.kind === 'dwg') c.dwg++;
      if (card.kind === 'img') c.img++;
      if (card.annotated) c.annot++;
    }
    return c;
  }, [base]);

  const shown = useMemo(() => (base ?? []).filter(c =>
    filter === 'all' ? true
      : filter === 'annot' ? c.annotated
        : c.kind === filter), [base, filter]);

  // A new search or a new view starts the keyboard at the first card while
  // searching ("Enter opens the first"), nowhere otherwise.
  useEffect(() => { setSel(searching ? 0 : -1); }, [q, openId, filter, sort, searching]);

  /** Choose a card — the old chooser's rules for which folder it lands on. */
  function choose(card: Card) {
    if (!card.pick) return;
    const folder = card.folder;
    noteRecent({
      job: jobKey, id: card.pick.id, name: card.pick.name, folderId: folder.id, folderName: folder.name,
      kind: card.pick.kind, isImage: card.pick.isImage, at: new Date().toISOString(),
    });
    // Found in a folder other than the one on screen (its marked-up child
    // counts as on screen): open THAT folder too and stay up on it — being
    // told a file exists and left to find it is the same as not being told.
    const onScreen = folder.id === openId
      || (!!openId && (lists[openId]?.folders ?? []).some(f => f.id === folder.id && isAnnotFolder(f.name)));
    if (!onScreen) {
      setOpenId(folder.id);
      setQ('');
      setFilter('all');
      void load(folder.id);
      onPick(card.pick, folder, true);
      return;
    }
    onPick(card.pick, folder);
  }

  function chooseFolder(id: string) {
    setOpenId(id);
    setQ('');
    setFilter('all');
    // Shown at once from what is known; Drive is asked again quietly, so a
    // file saved a minute ago turns up.
    if (lists[id] !== undefined) {
      void load(id, true);
      for (const f of lists[id]?.folders ?? []) if (isAnnotFolder(f.name)) void load(f.id, true);
    } else {
      void load(id).then(l => { for (const f of l?.folders ?? []) if (isAnnotFolder(f.name)) void load(f.id); });
    }
  }

  function chooseRecent(r: Recent) {
    const p: PlanEntry = { id: r.id, name: r.name, kind: r.kind, isImage: r.isImage };
    noteRecent({ ...r, at: new Date().toISOString() });
    onPick(p, { id: r.folderId, name: r.folderName });
  }

  /** Arrows move, Enter opens. */
  function onKeyDown(e: React.KeyboardEvent) {
    const n = shown.length;
    if (!n) return;
    const inInput = e.target === searchRef.current;
    const cols = (() => {
      const g = gridRef.current;
      if (!g) return 1;
      return Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length);
    })();
    const step = (d: number) => {
      e.preventDefault();
      setSel(s => Math.max(0, Math.min(n - 1, (s < 0 ? (d > 0 ? -1 : 0) : s) + d)));
    };
    if (e.key === 'ArrowDown') return step(sel < 0 ? 1 : cols);
    if (e.key === 'ArrowUp') return step(-cols);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // In the search box with words typed, the arrows move the caret until a
      // card has been reached with Down.
      if (inInput && q && sel < 0) return;
      const fwd = (e.key === 'ArrowRight') !== he;
      return step(fwd ? 1 : -1);
    }
    if (e.key === 'Enter') {
      const at = sel >= 0 ? sel : (searching ? shown.findIndex(c => c.pick) : -1);
      const card = shown[at];
      if (card?.pick) { e.preventDefault(); choose(card); }
    }
  }

  const openListing = openId ? lists[openId] : undefined;
  const openName = openId ? nameOf(openId) || plansName : plansName;
  const loadingView = !searching && base === undefined;
  const chips: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: w.all, n: counts.all },
    { id: 'pdf', label: w.pdf, n: counts.pdf },
    { id: 'dwg', label: w.dwg, n: counts.dwg },
    { id: 'img', label: w.img, n: counts.img },
    { id: 'annot', label: w.annot, n: counts.annot },
  ];
  const fileCount = (id: string) => {
    const l = lists[id];
    return l ? l.files.length : undefined;
  };

  const head = searching
    ? w.found(shown.length)
    : `${openName} · ${sort === 'new' ? w.newestHead : w.azHead}`;

  return (
    <>
      <div className="fixed inset-0 z-[162]" style={{ backgroundColor: 'rgba(9,14,22,.45)' }}
        onClick={onClose} />
      <div data-plan-picker data-plan-finder dir={he ? 'rtl' : 'ltr'}
        onKeyDown={onKeyDown}
        className={`fixed z-[163] bg-white shadow-2xl overflow-hidden flex flex-col ${phone ? '' : 'rounded-2xl'}`}
        style={phone
          ? { inset: 0 }
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(900px, 96vw)', height: 'min(620px, 92vh)' }}>

        {/* The bar: what this is, the folder on screen, the X. */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
          <span className="text-white font-bold text-[14px] flex-shrink-0">{w.title}</span>
          <button data-folder-button type="button" title={w.chooseFolder}
            onClick={() => { if (phone) document.querySelector<HTMLSelectElement>('[data-folder-select]')?.focus(); }}
            className={`flex items-center gap-1.5 min-w-0 text-white/75 text-[12px] ${searching ? 'invisible' : ''}`}>
            <Folder size={13} className="flex-shrink-0 text-[#4aa8d8]" />
            <span className="truncate">{openName}</span>
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} title={w.close} aria-label={w.close}
            className="p-1.5 rounded-lg text-white/80 hover:bg-white/15">
            <X size={16} />
          </button>
        </div>

        {/* The search, first and ready to type. */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 h-11 rounded-xl border-2 border-[#1e3a5f] bg-white">
            <Search size={16} className="text-slate-400 flex-shrink-0" />
            <input
              data-finder-search
              ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
              placeholder={w.search}
              autoComplete="off" spellCheck={false}
              className="flex-1 min-w-0 text-[14px] outline-none text-slate-800 placeholder:text-slate-400 bg-transparent"
            />
            {sweeping && <Loader2 data-finder-sweeping size={14} className="animate-spin text-slate-400 flex-shrink-0" />}
            {searching && !phone && (
              <span className="text-[10.5px] text-slate-400 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
                {w.enterFirst}
              </span>
            )}
            {q && (
              <button type="button" data-finder-clear onClick={() => { setQ(''); searchRef.current?.focus(); }}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 flex-shrink-0" aria-label={w.close}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* The chips, with their counts; the order on the far side. */}
          <div className="flex items-center gap-1.5 mt-2 min-w-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-bar min-w-0 flex-1">
              {chips.filter(c => c.id === 'all' || c.n > 0 || c.id === filter).map(c => (
                <button key={c.id} type="button" data-finder-filter={c.id} data-count={c.n}
                  aria-pressed={filter === c.id}
                  onClick={() => setFilter(c.id)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
                    filter === c.id ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white' : 'bg-white border-gray-200 text-slate-700 hover:border-[#4aa8d8]'}`}>
                  {c.label} <span className={filter === c.id ? 'text-white/70' : 'text-slate-400'}>{c.n}</span>
                </button>
              ))}
            </div>
            <button type="button" data-finder-sort data-sort={searching ? 'best' : sort}
              disabled={searching}
              onClick={() => setSort(s => (s === 'new' ? 'az' : 'new'))}
              className="flex items-center gap-0.5 flex-shrink-0 text-[12px] font-semibold text-[#1e3a5f] disabled:text-slate-500 px-1">
              {searching ? w.best : sort === 'new' ? w.newest : w.az}
              {!searching && <ChevronDown size={13} />}
            </button>
          </div>

          {/* On a phone the folders are one dropdown above the cards. */}
          {phone && (
            <label className="mt-2 flex items-center gap-2 px-3 h-10 rounded-xl border border-gray-200 bg-white">
              <Folder size={14} className="text-[#4aa8d8] flex-shrink-0" />
              <select data-folder-select value={openId ?? ''}
                onChange={e => chooseFolder(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-[13.5px] font-semibold text-slate-800 outline-none">
                {tree.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.sub ? '   ↳ ' : ''}{r.name}{fileCount(r.id) != null ? ` (${fileCount(r.id)})` : ''}
                  </option>
                ))}
                {!tree.length && <option value={openId ?? ''}>{openName}</option>}
              </select>
            </label>
          )}
        </div>

        <div className="flex-1 min-h-0 flex border-t border-gray-100">
          {/* The folders, down the side, always there. */}
          {!phone && (
            <nav data-finder-folders className="w-[214px] flex-shrink-0 overflow-y-auto border-e border-gray-100 py-2 px-2 bg-[#fbfcfd]">
              <div className="px-2 pb-1 text-[10.5px] font-extrabold tracking-wide text-slate-400 uppercase">{w.folders}</div>
              {!tree.length && sweeping && [0, 1, 2, 3].map(i => (
                <div key={i} data-folder-skeleton className="flex items-center gap-2 px-2.5 py-2 animate-pulse">
                  <span className="w-3.5 h-3.5 rounded bg-slate-200" />
                  <span className="h-3 rounded bg-slate-200" style={{ width: `${62 - i * 9}%` }} />
                </div>
              ))}
              {!tree.length && !sweeping && <p className="px-2 py-2 text-[12px] text-slate-400">{w.noFolders}</p>}
              {tree.map(r => {
                const on = !searching && r.id === openId;
                const n = fileCount(r.id);
                return (
                  <button key={r.id} type="button" data-folder-row={r.id} data-folder-sub={r.sub ? '1' : undefined}
                    data-folder-open={on ? '1' : undefined}
                    onClick={() => chooseFolder(r.id)}
                    title={r.name}
                    className={`w-full flex items-center gap-1.5 py-1.5 rounded-lg text-start ${
                      r.sub ? 'ps-6 pe-2' : 'px-2'} ${on ? 'bg-[#e6f1fa] text-[#1e3a5f] font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {r.sub && <CornerDownRight size={11} className={`text-slate-300 flex-shrink-0 ${he ? '-scale-x-100' : ''}`} />}
                    <Folder size={14} className="text-[#4aa8d8] flex-shrink-0" fill={on ? '#cfe6f5' : 'none'} />
                    <span className="flex-1 min-w-0 truncate text-[12.5px]">{r.name}</span>
                    <span data-folder-count className="text-[11px] text-slate-400 tabular-nums flex-shrink-0">
                      {n ?? (inFlight.current.has(r.id) ? <Loader2 size={10} className="animate-spin" /> : '')}
                    </span>
                  </button>
                );
              })}
              {sweeping && tree.length > 0 && (
                <div data-subs-busy className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-slate-400">
                  <Loader2 size={11} className="animate-spin" /> {w.subsBusy}
                </div>
              )}
            </nav>
          )}

          {/* The cards. */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3">
            {!searching && filter === 'all' && recents.length > 0 && (
              <div data-finder-recents className="mb-3">
                <div className="pb-1.5 text-[10.5px] font-extrabold tracking-wide text-slate-400 uppercase">{w.recent}</div>
                <div className="flex gap-2 overflow-x-auto no-bar">
                  {recents.map(r => (
                    <button key={r.id} type="button" data-finder-recent={r.id} onClick={() => chooseRecent(r)}
                      title={r.name}
                      className="flex items-center gap-2 flex-shrink-0 max-w-[240px] ps-1.5 pe-2.5 py-1.5 rounded-xl border border-gray-200 bg-white hover:border-[#4aa8d8] text-start">
                      <span className="w-9 h-9 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                        <img src={driveThumbUrl(r.id, 120)} alt="" loading="lazy" className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-slate-800" dir="auto">{stemOf(r.name)}</span>
                        <span className="flex items-center gap-1 text-[10.5px] text-slate-500">
                          <Clock size={10} /> {ago(r.at, he)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div data-finder-head className="pb-2 text-[10.5px] font-extrabold tracking-wide text-slate-400 uppercase truncate">
              {head}
            </div>

            {openListing === null && !searching && (
              <p data-finder-unreachable className="px-1 py-6 text-center text-[12.5px] text-slate-500">{w.unreachable}</p>
            )}
            {!loadingView && shown.length === 0 && openListing !== null && (
              <p data-finder-empty className="px-1 py-6 text-center text-[12.5px] text-slate-400">
                {searching ? (sweeping ? w.stillLooking : w.nothing) : w.empty}
              </p>
            )}
            <div ref={gridRef} data-tile-grid className="grid gap-2.5"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${phone ? 140 : 170}px, 1fr))` }}>
              {loadingView && <SkeletonCards count={3} />}
              {shown.map((c, i) => (
                <PlanCard key={c.key} card={c} w={w} he={he}
                  current={!!current && (c.file.id === current || c.pick?.id === current)}
                  starred={!!starredId && !!c.pick && starredId === c.pick.id}
                  starAuto={starAuto}
                  selected={i === sel}
                  showPath={searching}
                  onHover={() => { if (sel >= 0 && sel !== i) setSel(i); }}
                  onChoose={() => choose(c)}
                  onStar={onStar && c.pick ? () => onStar(c.pick!) : undefined}
                  onPreview={onPreview && c.pick ? () => onPreview(c.pick!, c.folder) : undefined}
                  onOpenNewTab={onOpenNewTab && c.pick ? () => onOpenNewTab(c.pick!) : undefined}
                />
              ))}
            </div>
            {searching && sweeping && shown.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                <Loader2 size={11} className="animate-spin" /> {w.stillLooking}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
