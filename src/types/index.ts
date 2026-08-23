export type Classification = 'standard' | 'shinui';

export type BuildingId = string;

export interface Project {
  id: string;
  name: string;
  shortName: string;
  logoPath: string;
  type?: 'building' | 'general';
  /** Workspace identity colour — the left rail, the header chip, sidebar accents. */
  color: string;
}

/** The colour for a project id, with a safe fallback. */
export function projectColor(projects: Project[], id: string): string {
  return projects.find(p => p.id === id)?.color ?? '#1e3a5f';
}

/**
 * The four bins the board ships with.
 *
 * A bin is now just a NAMED, COLOURED GROUP that also happens to be a board of
 * its own, so these four are only the ones that exist on day one — you can add,
 * rename, recolour and remove your own. A job's `boardBin` therefore holds
 * either one of these four words or the id of a bin node you made, and
 * `binKeyOf()` is the single place that resolves either into the same thing.
 */
export type BinKind = 'done' | 'ready' | 'archive' | 'trash';

export const BIN_KINDS: BinKind[] = ['done', 'ready', 'archive', 'trash'];

export const BIN_META: Record<BinKind, { label: string; color: string }> = {
  ready:   { label: 'Ready to Start', color: '#0ea5e9' },
  done:    { label: 'Done',           color: '#16a34a' },
  archive: { label: 'Archive',        color: '#64748b' },
  trash:   { label: 'Trash',          color: '#dc2626' },
};

/** The value a job's `boardBin` takes for this bin node. */
export function binKeyOf(el: { id: string; binKind?: BinKind }): string {
  return el.binKind ?? el.id;
}

/** What a bin is called: whatever you typed, or its built-in name. */
export function binLabelOf(el: { text?: string; binKind?: BinKind }): string {
  if (el.text && el.text.trim()) return el.text.trim();
  return el.binKind ? BIN_META[el.binKind].label : 'Group';
}

/** The four that ship with the board are permanent; your own are not. */
export function isBuiltInBin(el: { binKind?: BinKind }): boolean {
  return !!el.binKind;
}

/**
 * Board appearance and behaviour, stored per project inside `settings/app`.
 *
 * Bins are NOT stored here: they are real CanvasElements with a `binKind`, so
 * they move, resize and sync exactly like every other node.
 */
export interface BoardSetting {
  /** What is on the toolbar and in what order. */
  toolbar?: ToolbarSetup;
  themeId?: string;
  snapToGrid?: boolean;
  /**
   * Which sides the board is allowed to grow on.
   *
   * Absent means down and right only, which is how a board has always behaved.
   * Growing UP or LEFT moves everything already on the board, so it is never
   * silent: dragging a node hard against a locked edge asks first, and the
   * answer can be kept as a standing permission for that side.
   *
   * The rule underneath all four: space only exists where something was
   * actually put. Zooming out must never reveal room nobody asked for.
   */
  expand?: { top?: boolean; left?: boolean; right?: boolean; bottom?: boolean };
  /**
   * What was in a planner or notebook that has been removed from a board.
   *
   * A widget's people and squares live in the NODE, so taking the node off the
   * board used to take a season's planning with it — the owner's "God forbid,
   * it should always be saved and never, ever delete notebook's data".
   * Removing one now files its contents here first, and placing a fresh
   * planner of the same kind brings the newest back. It rides inside
   * `boardSettings`, which is already persisted, synced, exported and
   * imported, so this needs no new state key anywhere.
   *
   * Newest first, capped — see PLANNER_ARCHIVE_MAX.
   */
  plannerArchive?: {
    at: string;
    /** The widget id it came from: 'rota' or 'week-planner'. */
    widget: string;
    /** What the office called it, for the "brought back" message. */
    title?: string;
    data: Record<string, unknown>;
  }[];
  /**
   * Advanced guides: as well as lining edges up, match a neighbour's SIZE
   * while resizing, so two things can be made the same width or height
   * without measuring. Absent means on — it only ever helps, and it announces
   * itself with its own pair of lines.
   */
  smartGuides?: boolean;
  /**
   * Does the building's name stay on top while the diagram scrolls?
   *
   * Absent means yes, which is what it has always done — the point of the bar
   * is that you can tell which column you are looking at when you are ten
   * floors down. The padlock on the bar switches it off for anybody who would
   * rather have the row of screen back.
   */
  stickyBuildingName?: boolean;
  /**
   * Margin, in board units, kept clear on all four sides — like the margins
   * on a page. Nothing is dropped inside it, so the work never sits flush
   * against the chrome. Absent means the default (BOARD_MARGIN).
   */
  margin?: number;
  showControls?: boolean;
  /** 'canvas' = the free board, 'stages' = the same jobs in stage columns. */
  viewMode?: 'canvas' | 'stages';
  /** Board overview: true = pinned on, false = off, absent = show when useful. */
  showMinimap?: boolean;
  /** TV wallboard: default language and manual display-scale override. */
  tvLang?: 'en' | 'he';
  tvScale?: number;
  /**
   * Your own short domain for the wallboard link, e.g. `rsilink.tv`.
   *
   * The link somebody types into a wall panel's browser is typed with a remote
   * or an on-screen keyboard, so every character costs. Point the domain at the
   * same deployment and put it here, and the app hands out the short one.
   */
  tvDomain?: string;
  /**
   * How big the CONTROLS are on the wall panel — buttons, tool rails, icons.
   *
   * Separate from `tvScale`, which sizes the board's content. A wall panel is
   * driven with a finger and a fat-tipped pen, and a 50px tool button laid out
   * for a mouse is a miss more often than a hit. 1 is the desk size; the panel
   * usually wants 1.4 or 1.7.
   */
  tvTouchScale?: number;
  /** The panel's shape and what it is driven at, for laying the wall out. */
  tvShape?: string;
  tvRes?: string;
  /**
   * The address contractor portal links are handed out on.
   *
   * A contractor link used to be built from whatever address the office
   * happened to be looking at when they pressed Copy. That is fine while
   * everybody is on the live site and silently wrong the moment somebody is on
   * a preview build: the link carries the preview address, and a preview sits
   * behind Vercel's own sign-in, so the contractor is asked to log in to an
   * account they will never have. Old preview addresses stop existing
   * altogether, which is the 404.
   *
   * Set this to the live address and a link is the same link no matter who
   * copies it or where they are standing. Blank keeps the old behaviour.
   */
  portalDomain?: string;
  /**
   * Which board the wallboard shows. Empty is the workspace's main board.
   * Set by the top-level admin in app settings — never on the TV, which has no
   * keyboard and is read-only by design.
   */
  tvBoard?: string;
  /**
   * Which part of the board the TV shows, in board coordinates.
   *
   * A board grows past what any screen can hold, and the interesting corner is
   * rarely the top-left one. Absent means "the whole board, fitted".
   */
  tvView?: { x: number; y: number; w: number; h: number };
  /**
   * EACH wall panel's own setup, keyed by the id the panel minted for itself
   * (`tvScreenId` in tvScreens.ts). The office runs more than one TV, and one
   * shared region/scale meant every panel showed the same slice at the same
   * size whatever its shape. A panel with an entry here uses it; without one
   * it falls back to the shared `tvView`/`tvScale`. Lives in the __tv bag so
   * it inherits persist/sync/export with no new state key.
   */
  tvScreens?: Record<string, {
    name?: string;
    view?: { x: number; y: number; w: number; h: number };
    scale?: number;
  }>;
}

export type BoardSettingKey = keyof BoardSetting;

/**
 * A saved arrangement of the board.
 *
 * Positions only — never the jobs themselves. Restoring moves things back to
 * where they were and cannot resurrect a deleted job or undo an edit, which is
 * exactly the guarantee that makes it safe to press.
 */
/**
 * What sits on the board's toolbar, and in what order.
 *
 * The rail was a fixed list in code, so an office that never draws still had a
 * pen and a highlighter taking up two of its slots, and a widget somebody
 * places twenty times a day was three clicks away in the store. This is the
 * order, plus any widgets promoted onto the rail.
 *
 * Stored per workspace inside `boardSettings`, because a job board and a
 * building project want different things to hand.
 */
export interface ToolbarSetup {
  /** Built-in tool ids, in order. Absent = the shipped order. */
  tools?: string[];
  /** Tool ids that have been switched off. */
  hidden?: string[];
  /** Widget ids promoted onto the rail from the store. */
  widgets?: string[];
}

export interface BoardLayout {
  id: string;
  at: string;
  label: string;
  jobs: { id: string; x: number; y: number }[];
  els: { id: string; x: number; y: number; w: number; h: number }[];
}

export interface User {
  id: string;
  name: string;
  role: string;
  code: string;
  active: boolean;
  createdAt: string;
  /** Their colour on the rota. Falls back to one derived from the name. */
  color?: string;
}

/**
 * A stable colour for somebody who has not been given one.
 *
 * Derived from the name, so the same person is the same colour on every
 * machine and after every reload without anything having to be stored. The
 * lightness and saturation are fixed, so no two people can come out as "grey"
 * or "almost white" — only the hue moves.
 */
export function personColor(name: string, chosen?: string): string {
  if (chosen?.trim()) return chosen;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}deg 62% 46%)`;
}

/**
 * A named board inside a workspace.
 *
 * Worth being precise about what this is, because the assumption it corrects is
 * a natural one: boards were never per-user. `canvasElements` lives in the
 * project's own Firestore collection, so everybody in a workspace has always
 * been looking at the same surface — there was exactly one board per workspace
 * and no way to have a second.
 *
 * A view is a second surface in the same workspace: its own notes, widgets,
 * groups and arrangement of the same jobs. Jobs are NOT copied — one job, laid
 * out differently on each board, which is the point. `Apartment.viewPos` holds
 * where it sits on each.
 *
 * `userIds` empty means everybody sees it. Naming users narrows it to them —
 * a secretary's own board, until she shares it.
 */
export type BoardAccess = 'edit' | 'view';

export interface BoardView {
  id: string;                    // 'V-…'
  projectId: string;
  name: string;
  color?: string;
  /** Whose board it is. Absent on boards made before boards had owners. */
  ownerId?: string;
  /**
   * Who else can reach it, and how far.
   *
   * Sharing has three answers, not two: edit it, look at it, or not know it
   * exists. The third is the absence of an entry — a board you have not been
   * given does not appear in your picker at all, which is the point of a
   * board being yours.
   */
  share?: Record<string, BoardAccess>;
  /**
   * The old field. It meant "these people can edit; empty means everyone".
   * Kept so boards made before this still open, and read by boardAccess()
   * when `share` is absent. Nothing writes it any more.
   */
  userIds: string[];
  createdAt: string;
  createdBy: string;
}

/**
 * How far this person can go on this board — or null for "cannot see it".
 *
 * One function, so the picker, the board itself and the wallboard cannot
 * disagree about who may do what. The order matters: the top-level admin and
 * the owner always get edit, whatever the sharing says, because a board nobody
 * can get back into is a board that has been lost.
 */
export function boardAccess(
  v: BoardView, userId: string, isAdmin: boolean,
): BoardAccess | null {
  if (isAdmin) return 'edit';
  if (userId && (v.ownerId ?? '') === userId) return 'edit';
  if (v.share) return v.share[userId] ?? null;
  // Legacy boards: empty userIds meant everyone, and everyone could edit.
  if (!v.userIds || v.userIds.length === 0) return 'edit';
  return v.userIds.includes(userId) ? 'edit' : null;
}

/** The workspace's original board, which has no record of its own. */
export const MAIN_BOARD = '';

/**
 * How many removed planners a workspace keeps.
 *
 * Deep enough that a year of tidying up cannot push a real season's planning
 * off the end, shallow enough that the settings document stays small.
 */
export const PLANNER_ARCHIVE_MAX = 20;

/** Default board margin — a comfortable gutter, not a cliff. */
export const BOARD_MARGIN = 28;

/**
 * The dashboard is a board too.
 *
 * Its widgets are ordinary CanvasElements carrying this board id, which means
 * they are persisted, synced to Firestore, exported into a backup and read back
 * out of one by machinery that already exists and is already tested. A separate
 * `dashboardWidgets` collection would have meant eleven new store points and a
 * new way to lose data; this needs none.
 *
 * It never appears in the board picker — `boardsForUser` lists `boardViews`,
 * and this is not one of them.
 */
export const DASHBOARD_BOARD = '__dashboard';

/**
 * The wallboard's dashboard is a board too, for exactly the same reason.
 *
 * Its widgets are CanvasElements on this reserved board id, so arranging it,
 * saving it and getting it onto every device is machinery that already exists
 * and is already tested. It also means the settings screen can show the REAL
 * thing and edit it in place, rather than a list of buttons describing it.
 */
export const TV_DASH_BOARD = '__tvdash';

export function boardsForUser(views: BoardView[], projectId: string, userId: string, isAdmin: boolean) {
  return views.filter(v => v.projectId === projectId && boardAccess(v, userId, isAdmin) !== null);
}

export interface Building {
  id: BuildingId;
  name: string;
  displayOrder: number;
}

/**
 * "Show me this" — carried across a navigation.
 *
 * Search could find nine kinds of thing and only knew how to show one of them.
 * A stage went to the settings page, where the stage can be RENAMED but not
 * seen; a worker went to the same place. Both answered a question nobody asked:
 * you searched for a stage because you wanted the jobs at it.
 *
 * So a result no longer carries a route, it carries what it IS, and the page
 * that can show that thing picks the intent up on arrival. Session-only — it is
 * consumed on the next render and is never persisted, so it stays out of
 * backups entirely.
 */
export type FocusIntent =
  /**
   * `reveal` means SHOW me where this is, and nothing else.
   *
   * Choosing a search result takes you to the thing and opens it, which is
   * usually what you wanted. "Show on board" is the other half of the question
   * — where does this actually sit? — so it travels and pulses and then stops,
   * leaving the board on screen instead of a drawer over it.
   */
  | { kind: 'apartment'; id: string; reveal?: boolean }
  | { kind: 'stage'; id: string }
  | { kind: 'contractor'; id: string }
  | { kind: 'task'; id: string; apartmentId: string }
  | { kind: 'group'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'markup'; apartmentId: string };

export interface Stage {
  id: string;
  name: string;
  nameHe?: string;  // Hebrew name for bilingual support
  color: string;
  order: number;
  active: boolean;
  description?: string; // kept for data compat; no longer shown in UI
  projectId?: string;   // if set, stage only appears in this project (e.g. 'general')
  createdAt: string;
  updatedAt: string;
}

export function getStageName(stage: Stage, isRtl: boolean): string {
  return (isRtl && stage.nameHe) ? stage.nameHe : stage.name;
}

/**
 * Does this apartment count as a real unit?
 *
 * Only units that actually show something on the board count — one with a
 * number or a name. Blank placeholder slots (basement/lobby/ground spaces that
 * nobody has named yet) are scaffolding, not units, and must never inflate a
 * total. Naming a slot clears `isUnnamed`, so it starts counting from then on.
 */
export function isCountableApartment(
  apt: { apartmentNumber?: string; displayName?: string; isUnnamed?: boolean; boardBin?: string } | null | undefined,
): boolean {
  if (!apt || apt.isUnnamed) return false;
  // A job sitting in a bin is not a live unit
  if (apt.boardBin) return false;
  return !!(apt.apartmentNumber?.trim() || apt.displayName?.trim());
}

/**
 * Human label for an apartment that ALWAYS keeps the apartment number visible.
 * A family name never replaces the number — it is appended to it:
 *   { apartmentNumber: '37', displayName: 'Artzi' } → "37 — Artzi"
 *   { apartmentNumber: '37', displayName: '37'    } → "37"
 */
export function aptLabel(
  apt: { apartmentNumber?: string; displayName?: string } | null | undefined,
): string {
  if (!apt) return '?';
  const num = apt.apartmentNumber?.trim() ?? '';
  const name = apt.displayName?.trim() ?? '';
  if (!name || name === num) return num || '?';
  if (!num) return name;
  return `${num} — ${name}`;
}

/** "3h ago" / "yesterday" / "6 Aug" — short, because tile space is scarce.
 *  Used by the board tiles and the job list, so the stamp reads the same. */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export interface StageNoteAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl?: string;
  driveFileId?: string;
  driveUrl?: string;
}

export interface StageNoteVersion {
  id: string;
  noteId: string;
  noteText: string;
  attachments?: StageNoteAttachment[];
  savedAt: string;
  savedBy: string;
  savedByName: string;
}

export interface StageNote {
  id: string;
  apartmentId: string;
  stageId: string;
  noteText: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
  // Legacy single-attachment fields (kept for backward compat read)
  attachmentFilename?: string;
  attachmentMimeType?: string;
  attachmentDataUrl?: string;
  attachmentDriveFileId?: string;
  attachmentDriveUrl?: string;
  // Multi-attachment support
  attachments?: StageNoteAttachment[];
}

export interface Apartment {
  id: string;
  buildingId: BuildingId;
  apartmentNumber: string;
  displayName: string;
  floor: number;
  colPosition: number;  // 1-4 within the 4-col building grid
  colSpan: number;      // 1 = single col, 2 = spans left or right half
  isDuplexApt: boolean; // true for apts 55-56 (shown on 2 floors)
  currentStageId: string | null;
  classification: Classification;
  shinuiDetails: null; // kept for data compat, form removed from UI
  generalNotes: string;
  isUnnamed: boolean;
  mergedWith?: string; // id of partner apartment when buyer physically connected two units

  /**
   * Which board bin this job sits in, if any. Absent = on the main board.
   * Bins are ORGANISATIONAL and entirely independent of `currentStageId` —
   * a job can be at stage "Piping" and sit in Done. Nothing is ever purged.
   */
  boardBin?: string;
  /**
   * Position inside its bin's own board. Separate from canvasX/canvasY so a job
   * filed into a bin and taken out again returns to where it was on the main
   * board, rather than to wherever it was left inside the bin.
   */
  binX?: number;
  binY?: number;
  binnedAt?: string;   // when it entered the bin — used for date filtering
  /**
   * Last change to the job's CONTENT. Deliberately not bumped by canvasX/canvasY,
   * so tidying the board does not make every tile read "edited just now".
   */
  contentUpdatedAt?: string;
  /**
   * Extra board positions for the SAME job. A ghost is not a copy — there is one
   * record, drawn in several places, so editing either edits the same job.
   * Rendered more transparent than the real node.
   */
  ghosts?: { x: number; y: number }[];
  /**
   * The job LIVES in a weekly notebook, not on the board.
   *
   * Dropping a job on a day moves it in: the board stops drawing it and the
   * square holds it. Putting it in a second square makes a ghost — the same
   * record appearing again, exactly like a ghost on the board — so one job can
   * be on two people's rows or two days without ever becoming two jobs.
   *
   * It is NOT a bin. A binned job drops out of every total in the app; a
   * scheduled one must not, or the unit and task counts would fall every time
   * the office planned some work. `isCountableApartment` deliberately ignores
   * this field.
   *
   * Emptying the last square puts the job back on the board where it was.
   */
  inNotebook?: string;
  /**
   * Thumbs-up count. Right-click adds one, clicking the badge takes one back.
   * A count rather than a flag because several people share one board.
   */
  thumbsUp?: number;
  /** Thumbs down, counted separately so both numbers are visible at once. */
  thumbsDown?: number;
  /** Optional photo behind the tile. Stored as a URL, never as bytes. */
  tilePhotoUrl?: string;
  /**
   * Hand-set position within a stage column. Absent means "sort by last
   * modified", which stays the default — this only records a deliberate
   * reordering, so a column nobody has touched still surfaces recent work.
   */
  stageOrder?: number;
  /**
   * Whether this appears on the TV wallboard. UNDEFINED MEANS VISIBLE —
   * everything shows by default and Esther switches off only what is private.
   */
  showOnTv?: boolean;
  /**
   * Pinned in place on the board. A locked tile cannot be dragged or swept up
   * by a group move — a press on it pans the board instead, and a plain click
   * opens the job. Board furniture, not job content (CANVAS_ONLY in the store).
   */
  boardLocked?: boolean;
  /**
   * An INVISIBLE grouping: everything sharing this id moves as one thing.
   *
   * Nothing is drawn around it — the owner asked for grouping you feel rather
   * than see, with a small chip beside the lock as the only sign. Membership
   * is a plain shared string rather than a container record, so a member is
   * still an ordinary tile in every count, every report and every backup, and
   * ungrouping one thing is clearing one field.
   */
  boardGroup?: string;
  /**
   * A resized job tile, in board units.
   *
   * ABSENT means the shared default (TILE_W × TILE_H), so the field stays
   * undefined on almost every record rather than writing the same two numbers
   * onto hundreds of jobs. They ride inside `apartments`, which is already
   * persisted, exported, imported and synced — no new key anywhere — and both
   * are CANVAS_ONLY, because sizing a tile is arranging the board, not
   * editing the job.
   */
  tileW?: number;
  tileH?: number;
  stageDates?: Record<string, string>; // stageId → ISO timestamp of when that stage was first set
  driveLink?: string; // Google Drive folder URL for this apartment's files
  plansPdfLink?: string; // Google Drive link to the Engineering Plans PDF
  zohoLink?: string;   // General Jobs: Zoho CRM / work order link
  address?: string;    // General Jobs: job site address
  /**
   * The client's phone number, shown beside the address with a tap-to-call
   * link. Stored as typed (dashes and all) — it is for a person to read and
   * dial, not for a machine to parse.
   */
  phone?: string;
  /**
   * Where the job sits on each NAMED board, keyed by view id. The main board
   * keeps using canvasX/canvasY, so nothing that exists today moves.
   */
  viewPos?: Record<string, { x: number; y: number }>;
  canvasX?: number;    // General Jobs: free-canvas X position (px)
  canvasY?: number;    // General Jobs: free-canvas Y position (px)
  tileColor?: string;  // General Jobs: custom background color for the tile
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

// Free-form canvas elements in the General Jobs canvas (sticky notes, section boxes)
export interface CanvasElement {
  id: string;
  type: 'note' | 'box' | 'title' | 'countdown' | 'stopwatch' | 'clipart' | 'stroke' | 'bin' | 'voice' | 'widget' | 'arrow';
  /** countdown: target ISO time · stopwatch: started ISO time (absent = paused) */
  targetAt?: string;
  startedAt?: string;
  /** stopwatch accumulated ms while paused */
  elapsedMs?: number;
  /** clipart: which piece */
  art?: 'pin' | 'tape' | 'clip' | 'marker' | 'sticky-stack' | 'document' | 'arrow' | 'star';
  /** stroke: freehand path in world coordinates, "x,y x,y …" */
  points?: string;
  strokeWidth?: number;
  /** Stroke shape: round, chisel, dashed, dotted, soft. See StrokeNib. */
  nib?: 'round' | 'chisel' | 'dashed' | 'dotted' | 'soft';
  /** Sizes vary by node type — not everything is the same size. */
  fontSize?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  /**
   * Bin nodes are drop targets for jobs. They are movable and resizable like any
   * other element, and entirely independent of stages.
   */
  binKind?: BinKind;
  /**
   * A group may OPTIONALLY stand for a stage. When it does, filing a job into
   * it moves the job to that stage as well; when it does not, the group is
   * filing only. Bins and stages stay independent systems either way — this is
   * a link somebody chose, not a coupling.
   */
  stageId?: string;
  /**
   * Which board this node lives on. Absent means the main board; a bin key
   * means it lives inside that bin — which is what makes a bin a real board
   * with its own notes, widgets and arrangement rather than just a list.
   */
  board?: string;
  /**
   * On the wall dashboard: a size and an order PER SCREEN SHAPE.
   *
   * A row of four cards that reads across a 16:9 television is four narrow
   * columns on a panel turned on its side, and the office arranges the wall
   * from a PC whose window is neither. `w`/`h`/`z` above stay the fallback, so
   * every arrangement made before this is what each new shape starts from.
   * Keyed by the shapes in `data/dashRatios.ts`.
   */
  byRatio?: Record<string, { w: number; h: number; z: number }>;
  /** voice: Firebase Storage download URL + its storage path, for deletion. */
  audioUrl?: string;
  audioPath?: string;
  audioSeconds?: number;
  /** Thumbs-up count — see Apartment.thumbsUp. */
  thumbsUp?: number;
  thumbsDown?: number;
  /**
   * Where it sits in the stack.
   *
   * Absent means "wherever its type puts it" — a section box behind, a note in
   * front — which is the right default and what every existing record has.
   * Setting it makes that choice win, so a box can be brought over a note when
   * somebody deliberately wants it there.
   */
  z?: number;
  /** Section boxes only: how see-through the fill is. */
  boxOpacity?: number;
  /**
   * An outline round the node, in a colour you choose.
   *
   * Not the same thing as `color`, which fills it. An outline is how a wallboard
   * says "these four belong together" without moving anything — it can be put
   * on a widget, a note, a title or a job group alike.
   */
  outline?: string;
  outlineWidth?: number;
  /** When it was placed — drives the "just added" dot, and nothing else. */
  addedAt?: string;
  /**
   * Clip art can ATTACH to a job or another node: a pin stuck through its
   * corner, a clip on its edge. The art then follows whatever it is stuck to,
   * because that is what being stuck to something means.
   */
  attachedTo?: string;
  /**
   * Which of the five anchors it is stuck to. Free fractions drifted — a pin
   * dropped "near the top-left" landed wherever the pointer happened to be, and
   * two pins on two tiles never lined up. Snapping to named anchors means a
   * pinned corner is the same corner on every tile.
   */
  attachAnchor?: 'tl' | 'tr' | 'bl' | 'br' | 'tm';
  /**
   * Its size as a fraction of the host's WIDTH. Attached art has no size of its
   * own for the same reason it has no position of its own: resize the tile and
   * a pin that stayed 64px would be wrong immediately.
   */
  attachScale?: number;
  /** Legacy free-position attach. Read for older records, never written. */
  attachAt?: { fx: number; fy: number };
  /**
   * The document piece carries a real file: a Drive link or an upload, plus the
   * name to print on it. Only the URL is ever stored, never the bytes.
   */
  docUrl?: string;
  docName?: string;
  /** Arrows join two things and re-draw themselves as either end moves. */
  fromId?: string;
  toId?: string;
  /** Title styling, set in the title editor. */
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  underline?: boolean;
  /**
   * Widgets: which kind this is (see `src/data/widgets.tsx`) and its own state.
   * Keeping the state in one free-form bag is what lets a new widget be added
   * without touching the type, the store, the sync or the backup.
   */
  widget?: string;
  data?: Record<string, unknown>;
  /** See Apartment.showOnTv — undefined means visible. */
  showOnTv?: boolean;
  /** See Apartment.boardLocked — a locked node cannot be dragged or resized. */
  locked?: boolean;
  /** See Apartment.boardGroup — the invisible grouping this node belongs to. */
  boardGroup?: string;
  /**
   * Pinned elements keep their board X (so they pan and zoom sideways with the
   * content they label) but hold a FIXED screen Y, so they stay put vertically
   * while the board scrolls. They still scale with zoom.
   */
  pinned?: boolean;
  pinTop?: number;
}

/**
 * A punch-list pin dropped on an apartment's engineering plan.
 *
 * Stored as a PERCENTAGE position against the plan, never baked into the PDF:
 * the original file in Drive is never touched, and the office viewer and the
 * contractor portal draw the same overlay from the same coordinates, so both
 * see identical markup. Percentages rather than pixels so a pin stays put at
 * any viewer size, on any screen.
 */
export interface PlanPin {
  id: string;
  apartmentId: string;
  /** 0-100, relative to the plan viewer's box. */
  xPct: number;
  yPct: number;
  text: string;
  createdAt: string;
  createdBy: string;
  /** Set when the item is done. Resolved pins stay, greyed, as a record. */
  resolvedAt?: string;
  resolvedBy?: string;
}

/** The drawing tools available when marking up a plan. */
export type AnnTool =
  | 'pen' | 'marker' | 'highlighter' | 'pencil'
  | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'bubble';

/**
 * One mark on a plan.
 *
 * Coordinates are NORMALISED against the page — x and y each run 0..1, across
 * and DOWN. That is what lets a mark made on the 86" screen land on exactly the
 * same duct when the same plan is opened on a phone, and what lets the server
 * stamp it into a PDF of any paper size without knowing anything about the
 * device it was drawn on.
 *
 * `pts` is flat — [x, y, w, x, y, w, …] — rather than an array of objects. A
 * detailed markup runs to thousands of points and goes into both Firestore and
 * a request body; the flat form is roughly a third of the size for identical
 * information. `w` is the per-point width multiplier, which is where pen
 * pressure (or the Samsung dual nib's contact size) is preserved.
 *
 * Widths are given against a 1000-unit-wide reference page, so the same stroke
 * is the same relative weight on A4 and on A0.
 */
export interface AnnStroke {
  id: string;
  /** 0-based page index within the PDF. */
  page: number;
  tool: AnnTool;
  color: string;
  width: number;
  opacity: number;
  pts: number[];
  /** Text and speech-bubble tools. */
  text?: string;
  fontSize?: number;
  /** Heavier type, for the one note on the sheet that has to be read. */
  bold?: boolean;
  /** Shapes only — filled as well as outlined. */
  fill?: boolean;
}

/**
 * A saved markup version of one plan.
 *
 * The strokes are kept here, in the app's own data, as well as being stamped
 * into a PDF in Drive. That is deliberate: the PDF is the shareable, printable,
 * permanent artefact, and this is the editable source. It is what makes "start
 * from version 2 and add to it" possible without ever having to read ink back
 * out of a PDF, which is not something a browser can do.
 */
export interface PlanAnnotation {
  id: string;
  apartmentId: string;
  /** Drive file id of the plan that was marked up. */
  planFileId: string;
  planName?: string;
  version: number;
  strokes: AnnStroke[];
  pageCount: number;
  createdAt: string;
  createdBy: string;
  /** The stamped PDF in Drive, once it has been filed. */
  driveFileId?: string;
  driveUrl?: string;
  /** Which version this one was continued from, when it was. */
  basedOn?: number;
  note?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  buildingId: string;
  apartmentId: string;
  apartmentNumber: string;
  actionType: string;
  fieldChanged: string;
  previousValue: string;
  newValue: string;
  stageId: string;
  createdAt: string;
}

export interface AppSettings {
  loginCodes: { code: string; userId: string }[];
}

// ─── Contractors ───────────────────────────────────────────────────────────────

export type ContractorCategory = 'drywall' | 'ac' | 'general';

/**
 * The fifteen things a worker can be allowed to do.
 *
 * Kept as a union rather than a bag of booleans on the worker so that adding a
 * sixteenth is one line here and one entry in `data/workerLevels.ts`, and every
 * place that reads permissions keeps compiling.
 */
export type WorkerPermission =
  | 'ownTasks' | 'completeTasks' | 'uploadPhotos' | 'addNotes' | 'selfAssign'
  | 'assignOthers'
  | 'seeDiagrams' | 'seeAllApartments' | 'seePlans' | 'markUpPlans' | 'seeSnags'
  | 'allTasks' | 'seePlanner' | 'seeSchedule' | 'seeContacts' | 'switchProject';

/**
 * A saved set of those switches.
 *
 * Global, like users and contractors — a level describes a kind of person, not
 * a kind of person on one site.
 */
export interface WorkerLevel {
  id: string;
  name: string;
  nameHe?: string;
  description?: string;
  /** The three that ship. Editable; not deletable. */
  builtIn?: boolean;
  perms: Partial<Record<WorkerPermission, boolean>>;
}

export interface Contractor {
  id: string;
  name: string;
  email: string;
  category: ContractorCategory;
  /**
   * Which level this worker is on, and anything overridden just for them.
   *
   * Absent means the starting level, so every worker that existed before
   * levels did carries on behaving as a contractor — which is what they were.
   */
  levelId?: string;
  perms?: Partial<Record<WorkerPermission, boolean>>;
  /** The language THEY chose in the portal, if they changed it. */
  lang?: 'en' | 'he';
  /**
   * How big the portal's text is for THIS worker, as a multiplier (1 = normal).
   * Synced like `lang`, and for the same reason: "I can't read the screen" is
   * fixed by the office over the phone, not by a site visit.
   */
  textScale?: number;
  /**
   * Photos are REQUIRED to close a task unless this is on. The requirement is
   * the default because a finished job with no evidence is what the photos
   * exist to prevent; this switch is for the worker whose work has nothing to
   * photograph.
   */
  photosOptional?: boolean;
  /** Their colour on the rota. Falls back to one derived from the name. */
  color?: string;
  token: string; // 24-char random alphanumeric — used in shareable /c/:token URL
  active: boolean;
  createdAt: string;
}

/**
 * Somebody on the payroll.
 *
 * Deliberately its own list, separate from `users` (who log in to the admin)
 * and from `contractors` (who are given work through the portal). The three
 * overlap on paper and not at all in what they are for: a labourer who taps in
 * every morning has no login and takes no assignments, and an office manager
 * clocks in without ever appearing on a job. Folding any two together would
 * mean one list where two thirds of every row is blank.
 */
export interface Employee {
  id: string;
  name: string;
  nameHe?: string;
  /** Free text — "Installer", "Office", "Driver". Only ever displayed. */
  role?: string;
  /** Their colour on the tap-in board. Falls back to one derived from the name. */
  color?: string;
  active: boolean;
  /** Where they sit on the board, so the wall panel can be arranged by hand. */
  sortOrder?: number;
  createdAt: string;
}

/**
 * One tap. Not a shift — a shift is derived by pairing these.
 *
 * `day` is the LOCAL calendar day the punch belongs to, stored alongside the
 * instant rather than worked out from it, because a punch just before midnight
 * has to stay on the day the person was working.
 */
export interface TimePunch {
  id: string;
  employeeId: string;
  /** yyyy-mm-dd, local. */
  day: string;
  /** ISO instant. */
  at: string;
  kind: 'in' | 'out';
  /** Written by the app to close off a day somebody forgot to finish. */
  auto?: boolean;
  /** 'board', 'auto', or whoever corrected it by hand. */
  source?: string;
  note?: string;
}

export interface TimeClockSettings {
  /** When a day is assumed to have started, for somebody who forgot to tap in. */
  dayStart: string;
  /** When a forgotten day gets closed off. */
  dayEnd: string;
  /** Unpaid break deducted from any day with time on it. */
  breakMinutes: number;
  /** Round each day to the nearest N minutes. 0 leaves it exact. */
  roundMinutes: number;
}

export interface TaskAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string;       // base64 preview (empty when driveFileId is set)
  driveFileId?: string;  // Google Drive file ID after upload
  driveUrl?: string;     // Google Drive web view link
}

export type TaskPriority = 'urgent' | 'normal' | 'low';

export interface ContractorAssignment {
  id: string;
  contractorId: string;
  apartmentId: string;
  buildingId: BuildingId;
  taskDescription: string;
  dueDate: string | null;      // ISO date string (YYYY-MM-DD)
  stageId: string | null;      // links to a Stage
  completedAt: string | null;  // null = pending
  createdAt: string;
  createdBy: string;
  createdByName: string;
  attachments?: TaskAttachment[];
  priority?: TaskPriority;     // 'urgent' | 'normal' | 'low'
}

export interface ContractorNote {
  id: string;
  assignmentId: string;
  apartmentId: string;
  contractorId: string;
  text: string;
  authorType: 'contractor' | 'office';
  authorId: string;
  authorName: string;
  createdAt: string;
  attachmentDataUrl?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
  attachmentDriveFileId?: string;  // Drive file ID for note attachments uploaded to Drive
  attachmentDriveUrl?: string;     // Drive web view link
}

export interface DataSummary {
  apartments: number;
  stages: number;
  contractors: number;
  tasks: number;
  completedTasks: number;
  photos: number;
  notes: number;
  activityLogs: number;
}

export interface BackupSnapshot {
  id: string;
  activityLogId: string;
  createdAt: string;
  label: string;
  apartmentStates: {
    id: string;
    currentStageId: string | null;
    classification: string;
    generalNotes: string;
    driveLink?: string;
    plansPdfLink?: string;
    displayName: string;
    mergedWith?: string;
  }[];
  stageNotes: StageNote[];
  contractorAssignments: ContractorAssignment[];
  contractors?: Contractor[];
  contractorNotes?: ContractorNote[];
}

export interface ContractorPhoto {
  id: string;
  assignmentId: string;
  apartmentId: string;
  contractorId: string;
  dataUrl: string;       // base64 fallback — empty when storageUrl or driveUrl is set
  filename: string;
  fileType?: 'image' | 'video' | 'file'; // default: 'image' (for backward compat)
  mimeType?: string;
  uploadedAt: string;
  fileSizeBytes?: number;  // original file size for quota tracking
  storageUrl?: string;     // Firebase Storage download URL (primary remote store)
  storagePath?: string;    // Firebase Storage path (needed for deletion)
  driveFileId?: string;    // Google Drive file ID (legacy/fallback)
  driveUrl?: string;       // Google Drive web view link (legacy/fallback)
  /**
   * When the office looked at this upload. Absent means it is still waiting in
   * the job's review queue. Deliberately NOT a notification — the queue lives
   * inside the job, where the rest of that job's context already is.
   */
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface OfficeNoteFile {
  id: string;
  apartmentId: string;
  dataUrl: string;       // base64 (empty when driveFileId is set)
  filename: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
  driveFileId?: string;
  driveUrl?: string;
}

export type BackupFrequency = 'activity' | 'daily' | 'weekly' | 'monthly';

export type DriveExportFrequency = 'off' | 'hourly' | 'every5h' | 'every12h' | 'daily' | 'weekly';

export interface GeneralNoteVersion {
  id: string;
  apartmentId: string;
  noteText: string;
  savedAt: string;
  savedBy: string;
  savedByName: string;
}

export interface BackupLogEntry {
  id: string;
  filename: string;
  sizeKB: number;
  driveUploaded: boolean;
  triggeredBy: 'manual' | 'scheduled';
  createdAt: string;
}

export interface ContractorUiStrings {
  isRtl: boolean;
  linkNotFound: string;
  linkInvalid: string;
  myTasks: string;
  buildingMap: string;
  noAssignments: string;
  noAssignmentsHint: string;
  filterAll: string;
  filterOverdue: string;
  filterToday: string;
  filterTomorrow: string;
  /** "days", as in "3 days". Optional: these strings are user-edited and
      stored, so an object written before this key existed must still type
      -check — the portal falls back rather than rendering a blank badge. */
  daysLabel?: string;
  filterYesterday: string;
  filterThisWeek: string;
  mapHint: string;
  sectionTask: string;
  fromOffice: string;
  engineeringPlans: string;
  completed: string;
  undo: string;
  filesAndPhotos: string;
  uploading: string;
  addFile: string;
  tapToAddMedia: string;
  requiredBeforeComplete: string;
  sectionNotes: string;
  yourNotes: string;
  addNote: string;
  addMediaBeforeComplete: string;
  markCompletePrompt: string;
  markCompleteHint: string;
  cancel: string;
  confirmComplete: string;
  markingComplete: string;
  markAsComplete: string;
  noApartmentsAssigned: string;
  tapToExpand: string;
  viewOnDrive: string;
  hide: string;
  view: string;
  /** Shown when the office has marked up the plan. */
  markedUpPlan: string;
  download: string;
  taskSingular: string;
  taskPlural: string;
  doneLabel: string;
  duePrefix: string;
  calendarTab: string;
  /** Print sheet — button and column headings. */
  printLabel: string;
  apartmentColumn: string;
  stageColumn: string;
}

export const DEFAULT_CONTRACTOR_UI_STRINGS: ContractorUiStrings = {
  isRtl: false,
  linkNotFound: 'Link not found',
  linkInvalid: 'This link is invalid or has been deactivated. Contact your project manager.',
  myTasks: 'My Tasks',
  buildingMap: 'Building Map',
  noAssignments: 'No assignments yet',
  noAssignmentsHint: 'Your project manager will assign tasks here.',
  filterAll: 'All',
  filterOverdue: 'Overdue',
  filterToday: 'Today',
  filterTomorrow: 'Tomorrow',
  daysLabel: 'days',
  filterYesterday: 'Yesterday',
  filterThisWeek: 'This Week',
  mapHint: 'Highlighted apartments are your assignments. Tap to open task.',
  sectionTask: 'Task',
  fromOffice: 'From Office',
  engineeringPlans: 'Engineering Plans',
  completed: 'Completed',
  undo: 'Undo',
  filesAndPhotos: 'Files & Photos',
  uploading: 'Uploading…',
  addFile: 'Add File',
  tapToAddMedia: 'Tap to add photos, videos, or files',
  requiredBeforeComplete: 'Required before marking complete',
  sectionNotes: 'Notes',
  yourNotes: 'Your Notes',
  addNote: 'Add a note…',
  addMediaBeforeComplete: 'Add at least one photo or file to mark this task complete.',
  markCompletePrompt: 'Mark this task as complete?',
  markCompleteHint: 'This will notify the office. You can undo afterwards.',
  cancel: 'Cancel',
  confirmComplete: 'Confirm Complete',
  markingComplete: 'Marking complete…',
  markAsComplete: 'Mark as Complete',
  noApartmentsAssigned: 'No apartments assigned yet.',
  tapToExpand: 'Tap to expand',
  viewOnDrive: 'View on Drive',
  hide: 'Hide',
  view: 'View',
  markedUpPlan: 'Plan with the office markup',
  download: 'Download',
  taskSingular: 'task',
  taskPlural: 'tasks',
  doneLabel: 'done',
  duePrefix: 'Due',
  printLabel: 'Print my tasks',
  apartmentColumn: 'Apartment',
  stageColumn: 'Stage',
  calendarTab: 'Calendar',
};

export const HEBREW_CONTRACTOR_UI_STRINGS: ContractorUiStrings = {
  isRtl: true,
  linkNotFound: 'הקישור לא נמצא',
  linkInvalid: 'קישור זה אינו תקין או שהושבת. פנו למנהל הפרויקט.',
  myTasks: 'המשימות שלי',
  buildingMap: 'מפת הבניין',
  noAssignments: 'אין משימות עדיין',
  noAssignmentsHint: 'מנהל הפרויקט שלך יקצה משימות כאן.',
  filterAll: 'הכל',
  filterOverdue: 'באיחור',
  filterToday: 'היום',
  filterTomorrow: 'מחר',
  daysLabel: 'ימים',
  filterYesterday: 'אתמול',
  filterThisWeek: 'השבוע',
  mapHint: 'הדירות המודגשות הן המשימות שלך. הקש לפתיחה.',
  sectionTask: 'משימה',
  fromOffice: 'מהמשרד',
  engineeringPlans: 'תוכניות הנדסיות',
  completed: 'הושלם',
  undo: 'בטל',
  filesAndPhotos: 'קבצים ותמונות',
  uploading: 'מעלה...',
  addFile: 'הוסף קובץ',
  tapToAddMedia: 'הקש להוסיף תמונות, סרטונים או קבצים',
  requiredBeforeComplete: 'נדרש לפני סימון כהושלם',
  sectionNotes: 'הערות',
  yourNotes: 'ההערות שלך',
  addNote: 'הוסף הערה...',
  addMediaBeforeComplete: 'הוסף לפחות תמונה או קובץ אחד לפני סימון המשימה כהושלמה.',
  markCompletePrompt: 'לסמן משימה זו כהושלמה?',
  markCompleteHint: 'פעולה זו תודיע למשרד. ניתן לבטל לאחר מכן.',
  cancel: 'ביטול',
  confirmComplete: 'אישור הושלם',
  markingComplete: 'מסמן כהושלם...',
  markAsComplete: 'סמן כהושלם',
  noApartmentsAssigned: 'לא הוקצו דירות עדיין.',
  tapToExpand: 'הקש להרחיב',
  viewOnDrive: 'הצג ב-Drive',
  hide: 'הסתר',
  view: 'הצג',
  markedUpPlan: 'תוכנית עם הערות המשרד',
  download: 'הורד',
  taskSingular: 'משימה',
  taskPlural: 'משימות',
  doneLabel: 'הושלם',
  duePrefix: 'תאריך יעד',
  printLabel: 'הדפס את המשימות שלי',
  apartmentColumn: 'דירה',
  stageColumn: 'שלב',
  calendarTab: 'לוח שנה',
};

// ─── Main Admin UI Strings ────────────────────────────────────────────────────

export interface MainUiStrings {
  isRtl: boolean;
  // Sidebar navigation
  navProject: string;
  navDashboard: string;
  navTasks: string;
  navAnalytics: string;
  navReports: string;
  navActivity: string;
  navSettings: string;
  // Page titles
  pageDashboard: string;
  pageProject: string;
  pageTasks: string;
  pageAnalytics: string;
  pageReports: string;
  pageActivity: string;
  pageSettings: string;
  // Dashboard
  totalUnits: string;
  notStarted: string;
  changes: string;
  withNotes: string;
  progressByStage: string;
  progressByBuilding: string;
  recentActivity: string;
  customizeDashboard: string;
  widgetSummaryStats: string;
  widgetTaskStats: string;
  // Apartment drawer tabs
  tabDetails: string;
  tabTasks: string;
  tabNotes: string;
  tabHistory: string;
  tabPhotos: string;
  // Common actions
  save: string;
  cancel: string;
  add: string;
  delete: string;
  edit: string;
  // Settings tabs
  settingsStages: string;
  settingsUsers: string;
  settingsContractors: string;
  settingsApp: string;
  settingsLanguage: string;
  settingsBuildings: string;
  addApartmentBtn: string;
  addFloorBtn: string;
  floorLabel: string;
  columnLabel: string;
  displayNameLabel: string;
  apartmentsCount: string;
  // Misc
  noActivity: string;
  noTasks: string;
  addTask: string;
  allContractors: string;
  selectContractor: string;
  selectApartment: string;
  stageOptional: string;
  taskDescriptionPlaceholder: string;
  // Common extras
  confirm: string;
  restore: string;
  download: string;
  upload: string;
  print: string;
  search: string;
  clearFilters: string;
  noResults: string;
  never: string;
  yes: string;
  no: string;
  all: string;
  off: string;
  overdue: string;
  today: string;
  tomorrow: string;
  daysLabel: string;
  urgentPriority: string;
  normalPriority: string;
  lowPriority: string;
  aptPrefix: string;
  floorPrefix: string;
  buildingPrefix: string;
  standard: string;
  notStartedOption: string;
  // Header
  syncSaving: string;
  syncSaved: string;
  searchTooltip: string;
  switchToDark: string;
  switchToLight: string;
  signOut: string;
  // Dashboard extras
  overdueTasks: string;
  pendingTasks: string;
  completedToday: string;
  overallStarted: string;
  changesUnits: string;
  unitsStarted: string;
  // Project Diagram
  searchApt: string;
  selectStagePlaceholder: string;
  applyTo: string;
  bulkSelected: string;
  bulkUnits: string;
  bulkNotStarted: string;
  inBulkMode: string;
  // Tasks Page
  newTask: string;
  bulkAdd: string;
  listView: string;
  calendarView: string;
  navCalendar: string;
  globalCalendarTitle: string;
  allProjects: string;
  openInProject: string;
  allStages: string;
  allPriorities: string;
  overdueOnly: string;
  dueFrom: string;
  dueTo: string;
  markComplete: string;
  markIncomplete: string;
  editTask: string;
  deleteTask: string;
  deleteTaskConfirm: string;
  taskDeleted: string;
  taskUpdated: string;
  noPriorityLabel: string;
  // Analytics
  totalApartments: string;
  residentialUnits: string;
  workStarted: string;
  notYetStarted: string;
  contractorsLabel: string;
  totalAssignments: string;
  tasksCompletedLabel: string;
  pendingLabel: string;
  completedLabel: string;
  stageCompletionsWeek: string;
  tasksCompletedWeek: string;
  contractorTasksSection: string;
  noContractorAssignments: string;
  // Activity Log
  activityLogPage: string;
  entriesLabel: string;
  userFilter: string;
  allUsers: string;
  actionTypeFilter: string;
  fromDate: string;
  toDate: string;
  allActions: string;
  stageFieldChange: string;
  noteAction: string;
  taskCreatedAction: string;
  taskCompletedAction: string;
  taskReopenedAction: string;
  taskDeletedAction: string;
  contractorUploadAction: string;
  contractorNoteAction: string;
  contractorCompletedAction: string;
  noLogsMatch: string;
  // Reports
  reportsPage: string;
  exportCsv: string;
  selectExportColumns: string;
  stageNotesColumns: string;
  requiredLabel: string;
  includeTasks: string;
  includeTasksHint: string;
  filtersSection: string;
  searchApartment: string;
  enterButton: string;
  classificationFilter: string;
  includeNotStarted: string;
  lastUpdatedFrom: string;
  clearDates: string;
  stagesEmptyAll: string;
  showingLabel: string;
  apartmentsLabel: string;
  unnamed: string;
  groundFloor: string;
  noApartmentsMatch: string;
  doneSuffix: string;
  // Settings Page
  pickColor: string;
  addNewStage: string;
  stageName: string;
  addNewUser: string;
  nameField: string;
  roleField: string;
  codeField: string;
  addNewContractor: string;
  fullNameField: string;
  emailField: string;
  copyLink: string;
  copied: string;
  noContractors: string;
  firebaseConnection: string;
  allSystemsGo: string;
  connectionIssue: string;
  runTest: string;
  runAgain: string;
  runningTests: string;
  forceSync: string;
  forceSyncUploading: string;
  forceSyncDone: string;
  forceSyncFailed: string;
  displayTheme: string;
  dark: string;
  light: string;
  activeLabel: string;
  hiddenLabel: string;
  accessCodes: string;
  accessCodesHint: string;
  enableAutoSnapshots: string;
  snapshotHint: string;
  snapshotHistoryLabel: string;
  noSnapshotsYet: string;
  confirmButton: string;
  driveFolderUrl: string;
  autoExportFreq: string;
  lastExport: string;
  exportNow: string;
  exportingLabel: string;
  manualBackup: string;
  manualBackupDesc: string;
  exportJson: string;
  importJson: string;
  exportLogLabel: string;
  moveUp: string;
  moveDown: string;
  changeColor: string;
  saveChanges: string;
  deleteStageTooltip: string;
  hideStage: string;
  activateStage: string;
  // Apartment Drawer
  familyName: string;
  familyNamePlaceholder: string;
  typeField: string;
  standardApt: string;
  hasModifications: string;
  currentStage: string;
  generalNotes: string;
  generalNotesPlaceholder: string;
  attachFiles: string;
  noteHistory: string;
  engineeringPlans: string;
  detecting: string;
  refreshButton: string;
  clickToExpand: string;
  fullView: string;
  lookingForPdf: string;
  noPdfFound: string;
  setPdfHint: string;
  saveChangesBtn: string;
  driveFolder: string;
  connectedUnit: string;
  linkedToApt: string;
  noConnection: string;
  linkMutualHint: string;
  noTasksAssigned: string;
  noPhotosYet: string;
  photosDesc: string;
  noDriveLinked: string;
  setDriveFolderHint: string;
  driveBackendNotConfigured: string;
  loadingPhotos: string;
  stageChangedModal: string;
  assignTaskQuestion: string;
  noJustSave: string;
  assignTaskBtn: string;
  unlinkApartments: string;
  unmergeQuestion: string;
  keepsData: string;
  stageWillBeCleared: string;
  bothKeepData: string;
  justRemovesLink: string;
  apartmentSaved: string;
  apartmentUnlinked: string;
  cannotMergeBldgs: string;
  alreadyMergedError: string;
  imageUnavailable: string;
  openDownload: string;
  // Stage Notes
  officeNotes: string;
  officeNotesFor: string;
  noteLabel: string;
  fileLabel: string;
  filesLabel: string;
  assignContractor: string;
  stageReached: string;
  editHistory: string;
  allContractorNotes: string;
  contractorNotesSection: string;
  attachFile: string;
  // Quick Add / Bulk Add
  pendingBadge: string;
  hideDone: string;
  driveWarning: string;
  createTask: string;
  selectAll: string;
  deselectAll: string;
  inView: string;
  normalDefault: string;
  keepAsData: string;
  keepAsDataDesc: string;
  eachAptDrive: string;
  eachAptDriveDesc: string;
  oneAptDrive: string;
  oneAptDriveDesc: string;
  driveMissingWarning: string;
  noDriveLink2: string;
  noEligibleApts: string;
  goBack: string;
  proceedAnyway: string;
  uploadToSelected: string;
  driveLinkedBadge: string;
  // Activity Section
  updatedStageNote: string;
  uploadedFile: string;
  addedNote: string;
  markedComplete: string;
  changedStage: string;
  changedClassification: string;
  updatedGeneralNotes: string;
  renamedApartment: string;
  noActivityYet2: string;
  revertConfirm: string;
  // Building Diagram
  groundCommercial: string;
  lobby: string;
  doneIndicator: string;
  // Login
  whoIsSigningIn: string;
  enterCode: string;
  pleaseEnterDigits: string;
  invalidCode: string;
  enterProject: string;
  footerText: string;
  // Settings Language tab chrome
  rtlLayoutLabel: string;
  rtlLayoutHint: string;
  langSearchPlaceholder: string;
  langFieldsMatch: string;
  langNoMatch: string;
  adminUiLangSection: string;
  contractorLangSection: string;
  saveAdminLang: string;
  saveLang: string;
  // Settings App chrome
  driveFolderSave: string;
  firebaseDesc: string;
  forcePushDesc: string;
  // Contractor categories
  categoryDrywall: string;
  categoryAC: string;
  categoryGeneral: string;
  // Shared form labels
  stageLabel: string;
  dueDateLabel: string;
  noneOption: string;
  priorityLabel: string;
  attachmentsLabel: string;
  attachBtn: string;
  descriptionLabel: string;
  contractorLabel: string;
  yesBtn: string;
  uploadingLabel: string;
  noneSelected: string;
  basement: string;
  aptShort: string;
  // Toast / confirm messages
  taskAdded: string;
  noteSaved: string;
  stageNameSaved: string;
  stageNameAdded: string;
  userAdded: string;
  contractorAdded: string;
  deletedLabel: string;
  restoredLabel: string;
  backupRestored: string;
  importFailed: string;
  snapshotRestored: string;
  pdfFound: string;
  themeAppliedDark: string;
  themeAppliedLight: string;
  deleteStageConfirmMsg: string;
  deleteContractorConfirmMsg: string;
  // QuickAdd / BulkAdd
  newTaskHeading: string;
  describeWorkPlaceholder: string;
  tasksHeading: string;
  noTasksYet: string;
  createBulkTask: string;
  whereToStoreFiles: string;
  missingDriveLinksTitle: string;
  selectTargetApt: string;
  creatingTasksLabel: string;
  filesWillKeepLocal: string;
  noDriveAnyApt: string;
  selectAptForDrive: string;
  selectContractorPlaceholder: string;
  taskDescRequired: string;
  contractorRequired: string;
  // Settings Page — export/import modals
  exportSummaryTitle: string;
  importSuccessTitle: string;
  doneBtn: string;
  exportedToDriveNote: string;
  importRestoredNote: string;
  summaryApartments: string;
  summaryStages: string;
  summaryContractors: string;
  summaryTasks: string;
  summaryCompletedTasks: string;
  summaryPhotos: string;
  summaryNotes: string;
  summaryActivity: string;
  summaryApartmentsRestored: string;
  fileSizeKb: string;
  // Settings Page — backup section
  everyActivity: string;
  snapshotsStored: string;
  aptsCount: string;
  tasksCount: string;
  driveAutoExportSection: string;
  folderConfigured: string;
  stageNameEnglishPlaceholder: string;
  // Apartment Drawer extra
  downloadLabel: string;
  settingsLabel: string;
  statusLabel: string;
  hideLabel: string;
  stdShort: string;
  chgShort: string;
  recentActivityLabel: string;
  autoBackupOn: string;
  restoredToPoint: string;
  filesAttachedToast: string;
  fileAttachedToast: string;
  driveLinkedCheck: string;
  plansDetected: string;
  noPdfHelp: string;
  mergedDriveDiffers: string;
  loadPhotosHint: string;
  driveApiKeyHint: string;
  restoreVersionTitle: string;
  storedLocallyTitle: string;
  removeFileTitle: string;
  downloadFileTitle: string;
  rescanDriveTooltip: string;
  openFolderTooltip: string;
  saveDriveLinkTooltip: string;
  // ActivitySection
  revertConfirmMsg: string;
  restoreBtn: string;
  restoreTooltip: string;
  notStartedFallback: string;
  // GlobalSearch
  searchPlaceholder: string;
  searchTypeApartment: string;
  searchTypeTask: string;
  searchTypeNote: string;
  searchTypeContractorNote: string;
  searchNoResults: string;
  searchStartTyping: string;
  // Reports — column headers
  colBuilding: string;
  colApartment: string;
  colFloor: string;
  colCurrentStage: string;
  colClassification: string;
  colGeneralNotes: string;
  colLastUpdated: string;
  colUpdatedBy: string;
  colTaskDesc: string;
  colContractor: string;
  colDueDate: string;
  colStatus: string;
  colCompleted: string;
  statusCompleted: string;
  statusPending: string;
  groundFloorLabel: string;
  columnsBtn: string;
  // BuildingDiagram / ProjectDiagram tooltips
  shinuiTooltip: string;
  addTaskTooltip: string;
  hideShinuiBadgeTooltip: string;
  showShinuiBadgeTooltip: string;
  exitBulkModeTooltip: string;
  enterBulkModeTooltip: string;
  printDiagramTooltip: string;
  clearFiltersTooltip: string;
  buildingDiagramLabel: string;
  appSettingsHint: string;
  projectSettingsHint: string;
  navProjectSettings: string;
  moreLabel: string;
  appSettingsTitle: string;
  projectSettingsTitle: string;
  linkedPairSeparateHint: string;
  markDone: string;
  markProgress: string;
  markIssue: string;
  markNone: string;
  contractorStatusTitle: string;
  liveLabel: string;
  loadingLabel: string;
  sheetUnavailable: string;
  contractorSheetLabel: string;
  noSheetConfigured: string;
  noSheetConfiguredHint: string;
  aptNotInSheet: string;
  openSheet: string;
  // Activity inline template parts
  activityChangedStage: string;
  activityAddedNote: string;
  activityUpdatedField: string;
  activityOf: string;
  activityMarkedAs: string;
  activityAs: string;
  activityUpdatedNotes: string;
  activityRenamed: string;
  activityIn: string;
  activityTo: string;
  // StageNotes
  versionsCount: string;
  versionCount: string;
  emptyNoteLabel: string;
  unknownStage: string;
  // Login extra
  loginSubtitle: string;
  loginFooterBrand: string;
  switchProject: string;
  // General Jobs
  jobsNavLabel: string;
  addJobBtn: string;
  jobNameLabel: string;
  addressLabel: string;
  zohoLinkLabel: string;
  noJobsYet: string;
  generalJobsTitle: string;
  deleteJobConfirm: string;
  deleteWithTasksWarning: string;
  deleteApartmentLabel: string;
  jobLabel: string;
  openZohoBtn: string;
}

export const DEFAULT_MAIN_UI_STRINGS: MainUiStrings = {
  isRtl: false,
  navProject: 'Project',
  navDashboard: 'Dashboard',
  navTasks: 'Tasks',
  navAnalytics: 'Analytics',
  navReports: 'Reports',
  navActivity: 'Activity',
  navSettings: 'Settings',
  pageDashboard: 'Project Dashboard',
  pageProject: 'Project Diagram',
  pageTasks: 'Tasks',
  pageAnalytics: 'Analytics',
  pageReports: 'Reports',
  pageActivity: 'Activity Log',
  pageSettings: 'Settings',
  totalUnits: 'Total Units',
  notStarted: 'Not Started',
  changes: 'Changes',
  withNotes: 'With Notes',
  progressByStage: 'Progress by Stage',
  progressByBuilding: 'Progress by Building',
  recentActivity: 'Recent Activity',
  customizeDashboard: 'Customize',
  widgetSummaryStats: 'Summary Stats',
  widgetTaskStats: 'Task Stats',
  tabDetails: 'Details',
  tabTasks: 'Tasks',
  tabNotes: 'Notes',
  tabHistory: 'History',
  tabPhotos: 'Photos',
  save: 'Save',
  cancel: 'Cancel',
  add: 'Add',
  delete: 'Delete',
  edit: 'Edit',
  settingsStages: 'Stages',
  settingsUsers: 'Users',
  settingsContractors: 'Workers',
  settingsApp: 'App',
  settingsLanguage: 'Language',
  settingsBuildings: 'Buildings',
  addApartmentBtn: 'Add Apartment',
  addFloorBtn: 'Add Floor',
  floorLabel: 'Floor',
  columnLabel: 'Column',
  displayNameLabel: 'Display Name',
  apartmentsCount: 'apartments',
  noActivity: 'No recent activity.',
  noTasks: 'No tasks yet. Add a task to get started.',
  addTask: 'Add Task',
  allContractors: 'All workers',
  selectContractor: 'Select worker *',
  selectApartment: 'Select apartment *',
  stageOptional: 'Stage (optional)',
  taskDescriptionPlaceholder: 'Task description *',
  // Common extras
  confirm: 'Confirm',
  restore: 'Restore',
  download: 'Download',
  upload: 'Upload',
  print: 'Print',
  search: 'Search',
  clearFilters: 'Clear filters',
  noResults: 'No results',
  never: 'Never',
  yes: 'Yes',
  no: 'No',
  all: 'All',
  off: 'Off',
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  daysLabel: 'days',
  urgentPriority: '🔴 Urgent',
  normalPriority: '⚪ Normal',
  lowPriority: '🟢 Low',
  aptPrefix: 'Apt',
  floorPrefix: 'Floor',
  buildingPrefix: 'Building',
  standard: 'Standard',
  notStartedOption: '— Not Started —',
  // Header
  syncSaving: 'Saving…',
  syncSaved: 'Saved ✓',
  searchTooltip: 'Search (⌘K)',
  switchToDark: 'Switch to dark theme',
  switchToLight: 'Switch to light theme',
  signOut: 'Sign out',
  // Dashboard extras
  overdueTasks: 'Overdue Tasks',
  pendingTasks: 'Pending Tasks',
  completedToday: 'Completed Today',
  overallStarted: 'Overall started',
  changesUnits: 'Changes units',
  unitsStarted: 'units started',
  // Project Diagram
  searchApt: 'Search apt...',
  selectStagePlaceholder: 'Select stage…',
  applyTo: 'Apply to',
  bulkSelected: 'selected — click apartments to select',
  bulkUnits: 'units',
  bulkNotStarted: 'not started',
  inBulkMode: 'in bulk mode',
  // Tasks Page
  newTask: 'New Task',
  bulkAdd: 'Bulk Add',
  listView: 'List view',
  calendarView: 'Calendar view',
  navCalendar: 'Calendar',
  globalCalendarTitle: 'All Workspaces Calendar',
  allProjects: 'All Projects',
  openInProject: 'Open in',
  allStages: 'All stages',
  allPriorities: 'All priorities',
  overdueOnly: 'Overdue only',
  dueFrom: 'Due from',
  dueTo: 'Due to',
  markComplete: 'Mark as complete',
  markIncomplete: 'Mark as incomplete',
  editTask: 'Edit task',
  deleteTask: 'Delete task',
  deleteTaskConfirm: 'Delete this task?',
  taskDeleted: 'Task deleted',
  taskUpdated: 'Task updated',
  noPriorityLabel: 'Priority (optional)',
  // Analytics
  totalApartments: 'Total Apartments',
  residentialUnits: 'Residential units',
  workStarted: 'Work Started',
  notYetStarted: 'not yet started',
  contractorsLabel: 'Workers',
  totalAssignments: 'total assignments',
  tasksCompletedLabel: 'Tasks Completed',
  pendingLabel: 'Pending',
  completedLabel: 'Completed',
  stageCompletionsWeek: 'Stage Completions / Week',
  tasksCompletedWeek: 'Tasks Completed / Week',
  contractorTasksSection: 'Worker tasks',
  noContractorAssignments: 'No contractor assignments yet.',
  // Activity Log
  activityLogPage: 'Activity Log',
  entriesLabel: 'entries',
  userFilter: 'User',
  allUsers: 'All users',
  actionTypeFilter: 'Action type',
  fromDate: 'From',
  toDate: 'To',
  allActions: 'All actions',
  stageFieldChange: 'Stage/field change',
  noteAction: 'Note',
  taskCreatedAction: 'Task created',
  taskCompletedAction: 'Task completed',
  taskReopenedAction: 'Task re-opened',
  taskDeletedAction: 'Task deleted',
  contractorUploadAction: 'Worker upload',
  contractorNoteAction: 'Worker note',
  contractorCompletedAction: 'Worker completed',
  noLogsMatch: 'No activity logs match current filters',
  // Reports
  reportsPage: 'Reports',
  exportCsv: 'Export CSV',
  selectExportColumns: 'Select Export Columns',
  stageNotesColumns: 'Stage Notes Columns',
  requiredLabel: '(required)',
  includeTasks: 'Include Tasks',
  includeTasksHint: '(adds Task 1–N columns: description, worker, stage, due date, status, completion date)',
  filtersSection: 'Filters',
  searchApartment: 'Search apartment…',
  enterButton: 'Enter',
  classificationFilter: 'Classification',
  includeNotStarted: 'Include Not Started',
  lastUpdatedFrom: 'Last Updated — From',
  clearDates: 'Clear dates',
  stagesEmptyAll: 'Stages (empty = all)',
  showingLabel: 'Showing',
  apartmentsLabel: 'apartments',
  unnamed: 'Unnamed',
  groundFloor: 'G',
  noApartmentsMatch: 'No apartments match the current filters',
  doneSuffix: 'done',
  // Settings Page
  pickColor: 'Pick a color:',
  addNewStage: 'Add New Stage',
  stageName: 'Stage name...',
  addNewUser: 'Add New User',
  nameField: 'Name *',
  roleField: 'Role',
  codeField: '6-digit code *',
  addNewContractor: 'Add a worker',
  fullNameField: 'Full name *',
  emailField: 'Email address',
  copyLink: 'Copy link',
  copied: 'Copied!',
  noContractors: 'No workers in this category.',
  firebaseConnection: 'Firebase Connection',
  allSystemsGo: 'All systems go',
  connectionIssue: 'Connection issue',
  runTest: 'Run Connection Test',
  runAgain: 'Run Again',
  runningTests: 'Running tests…',
  forceSync: 'Force Push Local → Cloud',
  forceSyncUploading: 'Uploading…',
  forceSyncDone: 'Pushed successfully',
  forceSyncFailed: 'Push failed — check console',
  displayTheme: 'Display Theme',
  dark: 'Dark',
  light: 'Light',
  activeLabel: 'Active',
  hiddenLabel: 'Hidden',
  accessCodes: 'Access Codes',
  accessCodesHint: 'Edit codes in the Users tab. Changes take effect on next login.',
  enableAutoSnapshots: 'Enable auto-snapshots',
  snapshotHint: 'Saves a restore point when data changes',
  snapshotHistoryLabel: 'Snapshot History',
  noSnapshotsYet: 'No snapshots yet — enable auto-snapshots to start saving restore points.',
  confirmButton: 'Confirm',
  driveFolderUrl: 'Drive folder URL',
  autoExportFreq: 'Auto-export frequency',
  lastExport: 'Last export:',
  exportNow: 'Export Now',
  exportingLabel: 'Exporting…',
  manualBackup: 'Manual Backup',
  manualBackupDesc: 'Export all data to a JSON file — apartments, stages, notes, workers, photos, settings. Import to fully restore.',
  exportJson: 'Export JSON',
  importJson: 'Import JSON',
  exportLogLabel: 'Export Log',
  moveUp: 'Move up',
  moveDown: 'Move down',
  changeColor: 'Change color',
  saveChanges: 'Save changes',
  deleteStageTooltip: 'Delete stage',
  hideStage: 'Click to hide stage',
  activateStage: 'Click to activate stage',
  // Apartment Drawer
  familyName: 'Family Name',
  familyNamePlaceholder: 'Family name…',
  typeField: 'Type',
  standardApt: 'Standard apartment',
  hasModifications: 'Has modifications (Shinui)',
  currentStage: 'Current Stage',
  generalNotes: 'General Notes',
  generalNotesPlaceholder: 'General notes about this apartment…',
  attachFiles: 'Attach files to office notes',
  noteHistory: 'Note History',
  engineeringPlans: 'Engineering Plans',
  detecting: 'Detecting…',
  refreshButton: 'Refresh',
  clickToExpand: 'Click to expand',
  fullView: 'Full View',
  lookingForPdf: 'Looking for Plans PDF in Drive…',
  noPdfFound: 'No Plans PDF found. Click Refresh to retry, or set Drive folder below.',
  setPdfHint: 'Set the Drive folder in Settings below to auto-detect Plans PDF.',
  saveChangesBtn: 'Save Changes',
  driveFolder: 'Google Drive Folder',
  connectedUnit: 'Connected Unit (buyer-merged apartments)',
  linkedToApt: 'Linked to Apt',
  noConnection: '— No connection —',
  linkMutualHint: 'Linking is mutual — both apartments show the connection.',
  noTasksAssigned: 'No tasks assigned to this apartment.',
  noPhotosYet: 'No photos yet',
  photosDesc: 'Photos uploaded by workers will appear here.',
  noDriveLinked: 'No Drive folder linked',
  setDriveFolderHint: 'Set the Drive folder in Details → Settings to load photos.',
  driveBackendNotConfigured: 'Drive backend not configured',
  loadingPhotos: 'Loading photos from Drive…',
  stageChangedModal: 'Stage Changed',
  assignTaskQuestion: 'Would you like to assign a task for this stage?',
  noJustSave: 'No, just save',
  assignTaskBtn: 'Assign Task',
  unlinkApartments: 'Unlink Apartments',
  unmergeQuestion: 'Which apartment keeps the shared data (stage, drive link)?',
  keepsData: 'keeps the data',
  stageWillBeCleared: 'stage & drive link will be cleared',
  bothKeepData: 'Both keep their current data',
  justRemovesLink: 'Just removes the link — no data is cleared',
  apartmentSaved: 'Apartment details saved',
  apartmentUnlinked: 'Apartment unlinked',
  cannotMergeBldgs: 'Cannot merge apartments from different buildings',
  alreadyMergedError: 'That apartment is already merged with another unit',
  imageUnavailable: 'Image unavailable',
  openDownload: 'Open / Download',
  // Stage Notes
  officeNotes: 'Office Notes',
  officeNotesFor: 'Office notes for',
  noteLabel: 'Note',
  fileLabel: 'file',
  filesLabel: 'files',
  assignContractor: 'Assign a worker',
  stageReached: 'Stage reached:',
  editHistory: 'Edit History',
  allContractorNotes: 'All Contractor Notes',
  contractorNotesSection: 'Worker notes',
  attachFile: 'Attach file',
  // Quick Add / Bulk Add
  pendingBadge: 'pending',
  hideDone: 'Hide done',
  driveWarning: 'Set a Google Drive folder in the Details tab before creating tasks.',
  createTask: 'Create Task',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  inView: 'in view',
  normalDefault: 'Normal (default)',
  keepAsData: 'Keep as task data only',
  keepAsDataDesc: 'Files are stored as task attachments locally. No Google Drive upload.',
  eachAptDrive: 'Upload to each apartment\'s Drive',
  eachAptDriveDesc: 'Creates a separate copy in each apartment\'s Photos/Task Notes/ folder. Apartments without a Drive link will keep files locally.',
  oneAptDrive: 'Upload to one specific apartment\'s Drive',
  oneAptDriveDesc: 'You choose which apartment\'s folder to use. Other apartments keep a local copy.',
  driveMissingWarning: 'Drive link missing',
  noDriveLink2: 'No Drive link',
  noEligibleApts: 'No eligible apartments',
  goBack: 'Go back',
  proceedAnyway: 'Proceed anyway',
  uploadToSelected: 'Upload to selected apartment',
  driveLinkedBadge: 'Drive ✓',
  // Activity Section
  updatedStageNote: 'updated stage note',
  uploadedFile: 'uploaded file:',
  addedNote: 'added a note',
  markedComplete: 'marked task complete',
  changedStage: 'changed stage',
  changedClassification: 'changed classification:',
  updatedGeneralNotes: 'updated general notes',
  renamedApartment: 'renamed apartment to "',
  noActivityYet2: 'No activity yet',
  revertConfirm: 'Revert all data to this point?',
  // Building Diagram
  groundCommercial: 'Ground / Commercial',
  lobby: 'Lobby',
  doneIndicator: '✓ Done',
  // Login
  whoIsSigningIn: 'Who is signing in?',
  enterCode: 'Enter your access code',
  pleaseEnterDigits: 'Please enter all 6 digits.',
  invalidCode: 'Invalid code. Please try again.',
  enterProject: 'Enter Project',
  footerText: 'TzviAir Internal System',
  // Settings Language tab chrome
  rtlLayoutLabel: 'Right-to-Left (RTL) layout',
  rtlLayoutHint: 'Enable for Hebrew, Arabic, and other RTL languages.',
  langSearchPlaceholder: 'Search language fields…',
  langFieldsMatch: 'fields match',
  langNoMatch: 'No fields match',
  adminUiLangSection: 'Admin UI Language',
  contractorLangSection: 'Worker portal language',
  saveAdminLang: 'Save Admin UI Language',
  saveLang: 'Save Language Settings',
  // Settings App chrome
  driveFolderSave: 'Save',
  firebaseDesc: 'Tests each service one by one — runs a live read/write to confirm Firestore works.',
  forcePushDesc: 'If cloud data looks out of date, push your current local state to overwrite it.',
  // Contractor categories
  categoryDrywall: 'Drywall',
  categoryAC: 'AC',
  categoryGeneral: 'General',
  // Shared form labels
  stageLabel: 'Stage',
  dueDateLabel: 'Due date',
  noneOption: 'None',
  priorityLabel: 'Priority',
  attachmentsLabel: 'Attachments',
  attachBtn: 'Attach',
  descriptionLabel: 'Description',
  contractorLabel: 'Worker',
  yesBtn: 'Yes',
  uploadingLabel: 'Uploading…',
  noneSelected: '— None —',
  basement: 'Basement',
  aptShort: 'Apt',
  // Toast / confirm messages
  taskAdded: 'Task added',
  noteSaved: 'Note saved',
  stageNameSaved: 'Stage saved',
  stageNameAdded: 'Stage added',
  userAdded: 'User added',
  contractorAdded: 'Worker added',
  deletedLabel: 'Deleted',
  restoredLabel: 'Restored',
  backupRestored: 'Backup restored successfully',
  importFailed: 'Import failed',
  snapshotRestored: 'Snapshot restored',
  pdfFound: 'PDF found',
  themeAppliedDark: 'Dark theme applied',
  themeAppliedLight: 'Light theme applied',
  deleteStageConfirmMsg: 'Delete this stage?',
  deleteContractorConfirmMsg: 'Remove this worker?',
  // QuickAdd / BulkAdd
  newTaskHeading: 'New Task',
  describeWorkPlaceholder: 'Describe the work to be done…',
  tasksHeading: 'Tasks',
  noTasksYet: 'No tasks assigned yet.',
  createBulkTask: 'Create Bulk Task',
  whereToStoreFiles: 'Where to put the attached files?',
  missingDriveLinksTitle: 'Missing Drive Links',
  selectTargetApt: 'Select target apartment',
  creatingTasksLabel: 'Creating tasks…',
  filesWillKeepLocal: "Files can't be uploaded to Drive for these apartments. They'll keep local copies instead.",
  noDriveAnyApt: 'None of the selected apartments have a Google Drive folder configured.',
  selectAptForDrive: "Choose which apartment's Drive folder will receive the uploaded files. All other apartments will keep a local copy.",
  selectContractorPlaceholder: 'Select a worker…',
  taskDescRequired: 'Task description *',
  contractorRequired: 'Worker *',
  // Settings Page — export/import modals
  exportSummaryTitle: 'Export Summary',
  importSuccessTitle: 'Import Successful',
  doneBtn: 'Done',
  exportedToDriveNote: 'Also uploaded to Google Drive backup folder.',
  importRestoredNote: 'All data has been fully restored. This replaced the previous state.',
  summaryApartments: 'Apartments',
  summaryStages: 'Active stages',
  summaryContractors: 'Active workers',
  summaryTasks: 'Tasks',
  summaryCompletedTasks: 'Completed tasks',
  summaryPhotos: 'Photos & files',
  summaryNotes: 'Notes',
  summaryActivity: 'Activity entries',
  summaryApartmentsRestored: 'Apartments restored',
  fileSizeKb: 'KB',
  // Settings Page — backup section
  everyActivity: 'Every Activity',
  snapshotsStored: 'stored',
  aptsCount: 'apts',
  tasksCount: 'tasks',
  driveAutoExportSection: 'Google Drive Auto-Export',
  folderConfigured: 'Folder configured',
  stageNameEnglishPlaceholder: 'English name',
  // Apartment Drawer extra
  downloadLabel: 'Download',
  settingsLabel: 'Settings',
  statusLabel: 'Status',
  hideLabel: 'Hide',
  stdShort: 'Std',
  chgShort: 'Chg',
  recentActivityLabel: 'Recent Activity',
  autoBackupOn: 'Auto-backup on',
  restoredToPoint: 'Restored to selected point in time',
  filesAttachedToast: 'files attached',
  fileAttachedToast: 'file attached',
  driveLinkedCheck: 'Drive folder linked',
  plansDetected: 'Plans PDF detected',
  noPdfHelp: 'No PDF found. Check folder has "Engineered Plans" subfolder or PDF at root.',
  mergedDriveDiffers: 'Merged partner has a different Drive link. Saving will sync both.',
  loadPhotosHint: 'Click the Photos tab to load from Drive.',
  driveApiKeyHint: 'Set VITE_DRIVE_API_KEY to enable photo browsing.',
  restoreVersionTitle: 'Restore this version',
  storedLocallyTitle: 'Stored locally only — not synced to Drive',
  removeFileTitle: 'Remove file',
  downloadFileTitle: 'Download file',
  rescanDriveTooltip: 'Re-scan Drive folder for Plans PDF',
  openFolderTooltip: 'Open folder in Drive',
  saveDriveLinkTooltip: 'Save drive link',
  // ActivitySection
  revertConfirmMsg: 'Revert all data to this point?',
  restoreBtn: 'Restore',
  restoreTooltip: 'Restore to state before this change',
  notStartedFallback: 'Not started',
  // GlobalSearch
  searchPlaceholder: 'Search apartments, tasks, notes…',
  searchTypeApartment: 'Apartment',
  searchTypeTask: 'Task',
  searchTypeNote: 'Stage Note',
  searchTypeContractorNote: 'Contractor Note',
  searchNoResults: 'No results',
  searchStartTyping: 'Start typing to search…',
  // Reports — column headers
  colBuilding: 'Building',
  colApartment: 'Apartment',
  colFloor: 'Floor',
  colCurrentStage: 'Current Stage',
  colClassification: 'Classification',
  colGeneralNotes: 'General Notes',
  colLastUpdated: 'Last Updated',
  colUpdatedBy: 'Updated By',
  colTaskDesc: 'Description',
  colContractor: 'Worker',
  colDueDate: 'Due Date',
  colStatus: 'Status',
  colCompleted: 'Completed',
  statusCompleted: 'Completed',
  statusPending: 'Pending',
  groundFloorLabel: 'Ground',
  columnsBtn: 'Columns',
  // BuildingDiagram / ProjectDiagram tooltips
  shinuiTooltip: 'Apartment has modifications (Shinui)',
  addTaskTooltip: 'Add task',
  hideShinuiBadgeTooltip: 'Hide the "C" badge on apartments with modifications',
  showShinuiBadgeTooltip: 'Show badge on apartments with modifications (Shinui)',
  exitBulkModeTooltip: 'Exit bulk update mode',
  enterBulkModeTooltip: 'Select multiple apartments to update their stage at once',
  printDiagramTooltip: 'Print building diagram',
  clearFiltersTooltip: 'Clear all active filters',
  buildingDiagramLabel: 'Building Diagram',
  appSettingsHint: 'Shared across every workspace.',
  projectSettingsHint: 'These settings apply to this workspace only.',
  navProjectSettings: 'Project',
  moreLabel: 'More',
  appSettingsTitle: 'App Settings',
  projectSettingsTitle: 'Project Settings',
  linkedPairSeparateHint: 'Connected units — each tracked separately by the worker',
  markDone: 'Done',
  markProgress: 'In progress',
  markIssue: 'Issue',
  markNone: 'Not started',
  contractorStatusTitle: 'Worker status',
  liveLabel: 'LIVE',
  loadingLabel: 'Loading…',
  sheetUnavailable: 'Sheet unavailable',
  contractorSheetLabel: 'Worker sheet',
  noSheetConfigured: 'No worker sheet linked',
  noSheetConfiguredHint: 'Add the sheet link under Settings → App for this workspace.',
  aptNotInSheet: "This apartment isn't in the sheet",
  openSheet: 'Open sheet',
  // Activity inline template parts
  activityChangedStage: 'changed stage of',
  activityAddedNote: 'added note on',
  activityUpdatedField: 'updated',
  activityOf: 'of',
  activityMarkedAs: 'marked',
  activityAs: 'as',
  activityUpdatedNotes: 'updated notes for',
  activityRenamed: 'renamed',
  activityIn: 'in',
  activityTo: 'to',
  // StageNotes
  versionsCount: 'versions',
  versionCount: 'version',
  emptyNoteLabel: 'empty',
  unknownStage: 'Unknown stage',
  // Login extra
  loginSubtitle: 'AC installation project management system.',
  loginFooterBrand: 'TZVIAIR · PROJECT MANAGEMENT',
  switchProject: 'Select a project',
  jobsNavLabel: 'Jobs',
  addJobBtn: 'Add Job',
  jobNameLabel: 'Job Name',
  addressLabel: 'Address',
  zohoLinkLabel: 'Zoho Link',
  noJobsYet: 'No jobs yet. Click "Add Job" to get started.',
  generalJobsTitle: 'General Jobs',
  deleteJobConfirm: 'Delete this job?',
  deleteWithTasksWarning: 'This will also permanently delete all tasks and notes assigned to it. This cannot be undone.',
  deleteApartmentLabel: 'Delete Apartment',
  jobLabel: 'Job',
  openZohoBtn: 'Open in Zoho',
};

export const HEBREW_MAIN_UI_STRINGS: MainUiStrings = {
  isRtl: true,
  navProject: 'פרויקט',
  navDashboard: 'לוח בקרה',
  navTasks: 'משימות',
  navAnalytics: 'ניתוח',
  navReports: 'דוחות',
  navActivity: 'פעילות',
  navSettings: 'הגדרות',
  pageDashboard: 'לוח בקרה',
  pageProject: 'תרשים הפרויקט',
  pageTasks: 'משימות',
  pageAnalytics: 'ניתוח נתונים',
  pageReports: 'דוחות',
  pageActivity: 'יומן פעילות',
  pageSettings: 'הגדרות',
  totalUnits: 'סה״כ יחידות',
  notStarted: 'טרם התחיל',
  changes: 'שינויים',
  withNotes: 'עם הערות',
  progressByStage: 'התקדמות לפי שלב',
  progressByBuilding: 'התקדמות לפי בניין',
  recentActivity: 'פעילות אחרונה',
  customizeDashboard: 'התאם',
  widgetSummaryStats: 'נתוני סיכום',
  widgetTaskStats: 'נתוני משימות',
  tabDetails: 'פרטים',
  tabTasks: 'משימות',
  tabNotes: 'הערות',
  tabHistory: 'היסטוריה',
  tabPhotos: 'תמונות',
  save: 'שמור',
  cancel: 'ביטול',
  add: 'הוסף',
  delete: 'מחק',
  edit: 'ערוך',
  settingsStages: 'שלבים',
  settingsUsers: 'משתמשים',
  settingsContractors: 'קבלנים',
  settingsApp: 'אפליקציה',
  settingsLanguage: 'שפה',
  settingsBuildings: 'בניינים',
  addApartmentBtn: 'הוסף דירה',
  addFloorBtn: 'הוסף קומה',
  floorLabel: 'קומה',
  columnLabel: 'עמודה',
  displayNameLabel: 'שם תצוגה',
  apartmentsCount: 'דירות',
  noActivity: 'אין פעילות אחרונה.',
  noTasks: 'אין משימות עדיין.',
  addTask: 'הוסף משימה',
  allContractors: 'כל הקבלנים',
  selectContractor: 'בחר קבלן *',
  selectApartment: 'בחר דירה *',
  stageOptional: 'שלב (אופציונלי)',
  taskDescriptionPlaceholder: 'תיאור המשימה *',
  // Common extras
  confirm: 'אישור',
  restore: 'שחזור',
  download: 'הורדה',
  upload: 'העלאה',
  print: 'הדפסה',
  search: 'חיפוש',
  clearFilters: 'נקה מסננים',
  noResults: 'אין תוצאות',
  never: 'אף פעם',
  yes: 'כן',
  no: 'לא',
  all: 'הכל',
  off: 'כבוי',
  overdue: 'באיחור',
  today: 'היום',
  tomorrow: 'מחר',
  daysLabel: 'ימים',
  urgentPriority: '🔴 דחוף',
  normalPriority: '⚪ רגיל',
  lowPriority: '🟢 נמוך',
  aptPrefix: 'דירה',
  floorPrefix: 'קומה',
  buildingPrefix: 'בניין',
  standard: 'סטנדרטי',
  notStartedOption: '— טרם התחיל —',
  // Header
  syncSaving: 'שומר...',
  syncSaved: 'נשמר ✓',
  searchTooltip: 'חיפוש (⌘K)',
  switchToDark: 'עבור לנושא כהה',
  switchToLight: 'עבור לנושא בהיר',
  signOut: 'התנתק',
  // Dashboard extras
  overdueTasks: 'משימות באיחור',
  pendingTasks: 'משימות ממתינות',
  completedToday: 'הושלמו היום',
  overallStarted: 'סה״כ התחיל',
  changesUnits: 'יחידות שינויים',
  unitsStarted: 'יחידות שהתחילו',
  // Project Diagram
  searchApt: 'חפש דירה...',
  selectStagePlaceholder: 'בחר שלב...',
  applyTo: 'החל על',
  bulkSelected: 'נבחרו — לחץ על דירות לבחירה',
  bulkUnits: 'יחידות',
  bulkNotStarted: 'לא התחיל',
  inBulkMode: 'במצב עריכה מרובה',
  // Tasks Page
  newTask: 'משימה חדשה',
  bulkAdd: 'הוספה מרובה',
  listView: 'תצוגת רשימה',
  calendarView: 'תצוגת לוח שנה',
  navCalendar: 'לוח שנה',
  globalCalendarTitle: 'לוח שנה — כל סביבות העבודה',
  allProjects: 'כל הפרויקטים',
  openInProject: 'פתח ב',
  allStages: 'כל השלבים',
  allPriorities: 'כל העדיפויות',
  overdueOnly: 'באיחור בלבד',
  dueFrom: 'תאריך יעד מ',
  dueTo: 'עד',
  markComplete: 'סמן כהושלם',
  markIncomplete: 'סמן כלא הושלם',
  editTask: 'ערוך משימה',
  deleteTask: 'מחק משימה',
  deleteTaskConfirm: 'למחוק משימה זו?',
  taskDeleted: 'משימה נמחקה',
  taskUpdated: 'משימה עודכנה',
  noPriorityLabel: 'עדיפות (אופציונלי)',
  // Analytics
  totalApartments: 'סה״כ דירות',
  residentialUnits: 'יחידות מגורים',
  workStarted: 'עבודה התחילה',
  notYetStarted: 'טרם התחיל',
  contractorsLabel: 'קבלנים',
  totalAssignments: 'סה״כ הקצאות',
  tasksCompletedLabel: 'משימות הושלמו',
  pendingLabel: 'ממתין',
  completedLabel: 'הושלם',
  stageCompletionsWeek: 'השלמות שלב / שבוע',
  tasksCompletedWeek: 'משימות שהושלמו / שבוע',
  contractorTasksSection: 'משימות קבלן',
  noContractorAssignments: 'אין הקצאות קבלן עדיין.',
  // Activity Log
  activityLogPage: 'יומן פעילות',
  entriesLabel: 'רשומות',
  userFilter: 'משתמש',
  allUsers: 'כל המשתמשים',
  actionTypeFilter: 'סוג פעולה',
  fromDate: 'מתאריך',
  toDate: 'עד תאריך',
  allActions: 'כל הפעולות',
  stageFieldChange: 'שינוי שלב / שדה',
  noteAction: 'הערה',
  taskCreatedAction: 'משימה נוצרה',
  taskCompletedAction: 'משימה הושלמה',
  taskReopenedAction: 'משימה נפתחה מחדש',
  taskDeletedAction: 'משימה נמחקה',
  contractorUploadAction: 'העלאת קבלן',
  contractorNoteAction: 'הערת קבלן',
  contractorCompletedAction: 'קבלן השלים',
  noLogsMatch: 'אין רשומות פעילות תואמות מסננים',
  // Reports
  reportsPage: 'דוחות',
  exportCsv: 'יצוא CSV',
  selectExportColumns: 'בחר עמודות לייצוא',
  stageNotesColumns: 'עמודות הערות שלב',
  requiredLabel: '(נדרש)',
  includeTasks: 'כלול משימות',
  includeTasksHint: '(מוסיף עמודות: תיאור, קבלן, שלב, תאריך יעד, סטטוס, השלמה)',
  filtersSection: 'מסננים',
  searchApartment: 'חפש דירה...',
  enterButton: 'חפש',
  classificationFilter: 'סיווג',
  includeNotStarted: 'כלול לא התחיל',
  lastUpdatedFrom: 'עודכן לאחרונה — מ',
  clearDates: 'נקה תאריכים',
  stagesEmptyAll: 'שלבים (ריק = הכל)',
  showingLabel: 'מציג',
  apartmentsLabel: 'דירות',
  unnamed: 'ללא שם',
  groundFloor: 'ק',
  noApartmentsMatch: 'אין דירות תואמות את המסננים הנוכחיים',
  doneSuffix: 'בוצע',
  // Settings Page
  pickColor: 'בחר צבע:',
  addNewStage: 'הוסף שלב חדש',
  stageName: 'שם שלב...',
  addNewUser: 'הוסף משתמש חדש',
  nameField: 'שם *',
  roleField: 'תפקיד',
  codeField: 'קוד 6 ספרות *',
  addNewContractor: 'הוסף קבלן חדש',
  fullNameField: 'שם מלא *',
  emailField: 'כתובת אימייל',
  copyLink: 'העתק קישור',
  copied: 'הועתק!',
  noContractors: 'אין קבלנים בקטגוריה זו.',
  firebaseConnection: 'חיבור Firebase',
  allSystemsGo: 'הכל תקין',
  connectionIssue: 'בעיית חיבור',
  runTest: 'בדוק חיבור',
  runAgain: 'בדוק שוב',
  runningTests: 'בודק...',
  forceSync: 'דחוף נתונים מקומיים → ענן',
  forceSyncUploading: 'מעלה...',
  forceSyncDone: 'הועלה בהצלחה',
  forceSyncFailed: 'העלאה נכשלה — בדוק קונסול',
  displayTheme: 'ערכת נושא',
  dark: 'כהה',
  light: 'בהיר',
  activeLabel: 'פעיל',
  hiddenLabel: 'מוסתר',
  accessCodes: 'קודי גישה',
  accessCodesHint: 'ערוך קודים בלשונית משתמשים. שינויים ייכנסו לתוקף בכניסה הבאה.',
  enableAutoSnapshots: 'הפעל תמונות מצב אוטומטיות',
  snapshotHint: 'שומר נקודת שחזור עם שינויי נתונים',
  snapshotHistoryLabel: 'היסטוריית תמונות מצב',
  noSnapshotsYet: 'אין תמונות מצב עדיין — הפעל תמונות מצב אוטומטיות כדי להתחיל.',
  confirmButton: 'אישור',
  driveFolderUrl: 'כתובת URL של תיקיית Drive',
  autoExportFreq: 'תדירות יצוא אוטומטי',
  lastExport: 'יצוא אחרון:',
  exportNow: 'יצוא עכשיו',
  exportingLabel: 'מייצא...',
  manualBackup: 'גיבוי ידני',
  manualBackupDesc: 'יצוא כל הנתונים לקובץ JSON. ייבוא לשחזור מלא.',
  exportJson: 'יצוא JSON',
  importJson: 'ייבוא JSON',
  exportLogLabel: 'יומן יצוא',
  moveUp: 'הזז למעלה',
  moveDown: 'הזז למטה',
  changeColor: 'שנה צבע',
  saveChanges: 'שמור שינויים',
  deleteStageTooltip: 'מחק שלב',
  hideStage: 'לחץ להסתרת שלב',
  activateStage: 'לחץ להפעלת שלב',
  // Apartment Drawer
  familyName: 'שם משפחה',
  familyNamePlaceholder: 'שם משפחה...',
  typeField: 'סוג',
  standardApt: 'דירה סטנדרטית',
  hasModifications: 'יש שינויים (שינוי)',
  currentStage: 'שלב נוכחי',
  generalNotes: 'הערות כלליות',
  generalNotesPlaceholder: 'הערות כלליות על דירה זו...',
  attachFiles: 'צרף קבצים להערות משרד',
  noteHistory: 'היסטוריית הערות',
  engineeringPlans: 'תוכניות הנדסה',
  detecting: 'מזהה...',
  refreshButton: 'רענן',
  clickToExpand: 'לחץ להרחבה',
  fullView: 'תצוגה מלאה',
  lookingForPdf: 'מחפש PDF תוכניות ב-Drive...',
  noPdfFound: 'לא נמצא PDF. לחץ רענן לנסות שוב, או הגדר תיקיית Drive למטה.',
  setPdfHint: 'הגדר תיקיית Drive בהגדרות למטה לזיהוי אוטומטי של PDF תוכניות.',
  saveChangesBtn: 'שמור שינויים',
  driveFolder: 'תיקיית Google Drive',
  connectedUnit: 'יחידה מקושרת (דירות משולבות)',
  linkedToApt: 'מקושר לדירה',
  noConnection: '— אין חיבור —',
  linkMutualHint: 'קישור הוא הדדי — שתי הדירות מציגות את החיבור.',
  noTasksAssigned: 'אין משימות לדירה זו.',
  noPhotosYet: 'אין תמונות עדיין',
  photosDesc: 'תמונות שהועלו על ידי קבלנים יופיעו כאן.',
  noDriveLinked: 'לא קושרה תיקיית Drive',
  setDriveFolderHint: 'הגדר תיקיית Drive בפרטים → הגדרות לטעינת תמונות.',
  driveBackendNotConfigured: 'Drive backend לא מוגדר',
  loadingPhotos: 'טוען תמונות מ-Drive...',
  stageChangedModal: 'השלב שונה',
  assignTaskQuestion: 'האם ברצונך להקצות משימת קבלן לשלב זה?',
  noJustSave: 'לא, רק שמור',
  assignTaskBtn: 'הקצה משימה',
  unlinkApartments: 'בטל קישור דירות',
  unmergeQuestion: 'איזו דירה שומרת את הנתונים המשותפים?',
  keepsData: 'שומרת את הנתונים',
  stageWillBeCleared: 'שלב וקישור Drive יימחקו',
  bothKeepData: 'שתיהן שומרות את הנתונים הנוכחיים',
  justRemovesLink: 'רק מסיר את הקישור — אין מחיקת נתונים',
  apartmentSaved: 'פרטי הדירה נשמרו',
  apartmentUnlinked: 'הדירה בוטלה קישור',
  cannotMergeBldgs: 'לא ניתן לאחד דירות מבניינים שונים',
  alreadyMergedError: 'הדירה כבר מאוחדת עם יחידה אחרת',
  imageUnavailable: 'תמונה לא זמינה',
  openDownload: 'פתח / הורד',
  // Stage Notes
  officeNotes: 'הערות משרד',
  officeNotesFor: 'הערות משרד ל',
  noteLabel: 'הערה',
  fileLabel: 'קובץ',
  filesLabel: 'קבצים',
  assignContractor: 'הקצה קבלן',
  stageReached: 'שלב הושג:',
  editHistory: 'היסטוריית עריכה',
  allContractorNotes: 'כל הערות הקבלן',
  contractorNotesSection: 'הערות קבלן',
  attachFile: 'צרף קובץ',
  // Quick Add / Bulk Add
  pendingBadge: 'ממתין',
  hideDone: 'הסתר הושלם',
  driveWarning: 'הגדר תיקיית Google Drive בלשונית הפרטים לפני יצירת משימות.',
  createTask: 'צור משימה',
  selectAll: 'בחר הכל',
  deselectAll: 'בטל בחירה',
  inView: 'בתצוגה',
  normalDefault: 'רגיל (ברירת מחדל)',
  keepAsData: 'שמור כנתוני משימה בלבד',
  keepAsDataDesc: 'קבצים מאוחסנים כקבצים מצורפים למשימה מקומית. ללא העלאה ל-Google Drive.',
  eachAptDrive: 'העלה ל-Drive של כל דירה',
  eachAptDriveDesc: 'יוצר עותק נפרד בתיקיית Photos/Task Notes/ של כל דירה.',
  oneAptDrive: 'העלה ל-Drive של דירה אחת ספציפית',
  oneAptDriveDesc: 'בוחר באיזו תיקיית דירה להשתמש. דירות אחרות שומרות עותק מקומי.',
  driveMissingWarning: 'קישור Drive חסר',
  noDriveLink2: 'אין קישור Drive',
  noEligibleApts: 'אין דירות כשירות',
  goBack: 'חזור',
  proceedAnyway: 'המשך בכל זאת',
  uploadToSelected: 'העלה לדירה שנבחרה',
  driveLinkedBadge: 'Drive ✓',
  // Activity Section
  updatedStageNote: 'עדכן הערת שלב',
  uploadedFile: 'העלה קובץ:',
  addedNote: 'הוסיף הערה',
  markedComplete: 'סומן כהושלם',
  changedStage: 'שינה שלב',
  changedClassification: 'שינה סיווג:',
  updatedGeneralNotes: 'עדכן הערות כלליות',
  renamedApartment: 'שינה שם דירה ל-"',
  noActivityYet2: 'אין פעילות עדיין',
  revertConfirm: 'לשחזר את כל הנתונים לנקודה זו?',
  // Building Diagram
  groundCommercial: 'קרקע / מסחרי',
  lobby: 'לובי',
  doneIndicator: '✓ הושלם',
  // Login
  whoIsSigningIn: 'מי נכנס?',
  enterCode: 'הכנס את קוד הגישה שלך',
  pleaseEnterDigits: 'יש להזין את כל 6 הספרות.',
  invalidCode: 'קוד שגוי. נסה שוב.',
  enterProject: 'כנס לפרויקט',
  footerText: 'מערכת פנימית של TzviAir',
  // Settings Language tab chrome
  rtlLayoutLabel: 'פריסת ימין לשמאל (RTL)',
  rtlLayoutHint: 'הפעל עבור עברית, ערבית ושפות RTL אחרות.',
  langSearchPlaceholder: 'חפש שדות שפה…',
  langFieldsMatch: 'שדות תואמים',
  langNoMatch: 'אין שדות תואמים',
  adminUiLangSection: 'שפת ממשק ניהול',
  contractorLangSection: 'שפת פורטל קבלנים',
  saveAdminLang: 'שמור שפת ממשק ניהול',
  saveLang: 'שמור הגדרות שפה',
  // Settings App chrome
  driveFolderSave: 'שמור',
  firebaseDesc: 'בודק כל שירות אחד אחד — מבצע קריאה/כתיבה חיה כדי לאשר ש-Firestore פועל.',
  forcePushDesc: 'אם נתוני הענן נראים לא מעודכנים, דחוף את המצב המקומי הנוכחי שלך כדי לדרוס אותם.',
  // Contractor categories
  categoryDrywall: 'גבס',
  categoryAC: 'מיזוג',
  categoryGeneral: 'כללי',
  // Shared form labels
  stageLabel: 'שלב',
  dueDateLabel: 'תאריך יעד',
  noneOption: 'ללא',
  priorityLabel: 'עדיפות',
  attachmentsLabel: 'קבצים מצורפים',
  attachBtn: 'צרף',
  descriptionLabel: 'תיאור',
  contractorLabel: 'קבלן',
  yesBtn: 'כן',
  uploadingLabel: 'מעלה…',
  noneSelected: '— ללא —',
  basement: 'מרתף',
  aptShort: 'דירה',
  // Toast / confirm messages
  taskAdded: 'משימה נוספה',
  noteSaved: 'הערה נשמרה',
  stageNameSaved: 'שלב נשמר',
  stageNameAdded: 'שלב נוסף',
  userAdded: 'משתמש נוסף',
  contractorAdded: 'קבלן נוסף',
  deletedLabel: 'נמחק',
  restoredLabel: 'שוחזר',
  backupRestored: 'גיבוי שוחזר בהצלחה',
  importFailed: 'ייבוא נכשל',
  snapshotRestored: 'גרסה שוחזרה',
  pdfFound: 'PDF נמצא',
  themeAppliedDark: 'ערכת כהה הופעלה',
  themeAppliedLight: 'ערכת בהירה הופעלה',
  deleteStageConfirmMsg: 'למחוק שלב זה?',
  deleteContractorConfirmMsg: 'למחוק קבלן זה?',
  // QuickAdd / BulkAdd
  newTaskHeading: 'משימה חדשה',
  describeWorkPlaceholder: 'תאר את העבודה שיש לבצע…',
  tasksHeading: 'משימות',
  noTasksYet: 'אין משימות מוקצות עדיין.',
  createBulkTask: 'יצירת משימה מרוכזת',
  whereToStoreFiles: 'איפה לשמור את הקבצים המצורפים?',
  missingDriveLinksTitle: 'קישורי Drive חסרים',
  selectTargetApt: 'בחר דירת יעד',
  creatingTasksLabel: 'יוצר משימות…',
  filesWillKeepLocal: 'לא ניתן להעלות קבצים ל-Drive עבור דירות אלה. יישמרו עותקים מקומיים.',
  noDriveAnyApt: 'לאף אחת מהדירות הנבחרות אין תיקיית Google Drive מוגדרת.',
  selectAptForDrive: 'בחר את תיקיית ה-Drive של הדירה שתקבל את הקבצים. שאר הדירות ישמרו עותק מקומי.',
  selectContractorPlaceholder: 'בחר קבלן…',
  taskDescRequired: 'תיאור משימה *',
  contractorRequired: 'קבלן *',
  // Settings Page — export/import modals
  exportSummaryTitle: 'סיכום ייצוא',
  importSuccessTitle: 'ייבוא הצליח',
  doneBtn: 'סיום',
  exportedToDriveNote: 'הועלה גם לתיקיית הגיבוי ב-Google Drive.',
  importRestoredNote: 'כל הנתונים שוחזרו במלואם. זה החליף את המצב הקודם.',
  summaryApartments: 'דירות',
  summaryStages: 'שלבים פעילים',
  summaryContractors: 'קבלנים פעילים',
  summaryTasks: 'משימות',
  summaryCompletedTasks: 'משימות שהושלמו',
  summaryPhotos: 'תמונות וקבצים',
  summaryNotes: 'הערות',
  summaryActivity: 'פעולות',
  summaryApartmentsRestored: 'דירות שוחזרו',
  fileSizeKb: 'KB',
  // Settings Page — backup section
  everyActivity: 'כל פעולה',
  snapshotsStored: 'שמורות',
  aptsCount: 'דירות',
  tasksCount: 'משימות',
  driveAutoExportSection: 'ייצוא אוטומטי ל-Google Drive',
  folderConfigured: 'תיקייה מוגדרת',
  stageNameEnglishPlaceholder: 'שם באנגלית',
  // Apartment Drawer extra
  downloadLabel: 'הורד',
  settingsLabel: 'הגדרות',
  statusLabel: 'סטטוס',
  hideLabel: 'הסתר',
  stdShort: 'רגיל',
  chgShort: 'שינוי',
  recentActivityLabel: 'פעילות אחרונה',
  autoBackupOn: 'גיבוי אוטומטי פעיל',
  restoredToPoint: 'שוחזר לנקודת הזמן שנבחרה',
  filesAttachedToast: 'קבצים צורפו',
  fileAttachedToast: 'קובץ צורף',
  driveLinkedCheck: 'תיקיית Drive מקושרת',
  plansDetected: 'PDF תכניות זוהה',
  noPdfHelp: 'לא נמצא PDF. בדוק שיש תיקיית "Engineered Plans" או PDF בשורש.',
  mergedDriveDiffers: 'לדירה המקושרת יש קישור Drive שונה. השמירה תסנכרן את שניהם.',
  loadPhotosHint: 'לחץ על לשונית התמונות לטעינה מ-Drive.',
  driveApiKeyHint: 'הגדר VITE_DRIVE_API_KEY כדי לאפשר עיון בתמונות.',
  restoreVersionTitle: 'שחזר גרסה זו',
  storedLocallyTitle: 'נשמר מקומית בלבד — לא מסונכרן ל-Drive',
  removeFileTitle: 'הסר קובץ',
  downloadFileTitle: 'הורד קובץ',
  rescanDriveTooltip: 'סרוק מחדש את תיקיית Drive לחיפוש PDF תכניות',
  openFolderTooltip: 'פתח תיקייה ב-Drive',
  saveDriveLinkTooltip: 'שמור קישור Drive',
  // ActivitySection
  revertConfirmMsg: 'לשחזר את כל הנתונים לנקודה זו?',
  restoreBtn: 'שחזר',
  restoreTooltip: 'שחזר למצב לפני שינוי זה',
  notStartedFallback: 'לא התחיל',
  // GlobalSearch
  searchPlaceholder: 'חפש דירות, משימות, הערות…',
  searchTypeApartment: 'דירה',
  searchTypeTask: 'משימה',
  searchTypeNote: 'הערת שלב',
  searchTypeContractorNote: 'הערת קבלן',
  searchNoResults: 'אין תוצאות',
  searchStartTyping: 'התחל להקליד לחיפוש…',
  // Reports — column headers
  colBuilding: 'בניין',
  colApartment: 'דירה',
  colFloor: 'קומה',
  colCurrentStage: 'שלב נוכחי',
  colClassification: 'סיווג',
  colGeneralNotes: 'הערות כלליות',
  colLastUpdated: 'עדכון אחרון',
  colUpdatedBy: 'עודכן על ידי',
  colTaskDesc: 'תיאור',
  colContractor: 'קבלן',
  colDueDate: 'תאריך יעד',
  colStatus: 'סטטוס',
  colCompleted: 'הושלם',
  statusCompleted: 'הושלם',
  statusPending: 'ממתין',
  groundFloorLabel: 'קרקע',
  columnsBtn: 'עמודות',
  // BuildingDiagram / ProjectDiagram tooltips
  shinuiTooltip: 'דירת שינוי',
  addTaskTooltip: 'הוסף משימה',
  hideShinuiBadgeTooltip: 'הסתר תג שינוי בדירות',
  showShinuiBadgeTooltip: 'הצג תג שינוי בדירות',
  exitBulkModeTooltip: 'צא ממצב עדכון מרוכז',
  enterBulkModeTooltip: 'בחר מספר דירות לעדכון שלב בבת אחת',
  printDiagramTooltip: 'הדפס תרשים בניין',
  clearFiltersTooltip: 'נקה את כל הפילטרים',
  buildingDiagramLabel: 'תרשים בניין',
  appSettingsHint: 'משותף לכל סביבות העבודה.',
  projectSettingsHint: 'הגדרות אלו חלות על סביבת עבודה זו בלבד.',
  navProjectSettings: 'פרויקט',
  moreLabel: 'עוד',
  appSettingsTitle: 'הגדרות אפליקציה',
  projectSettingsTitle: 'הגדרות פרויקט',
  linkedPairSeparateHint: 'יחידות מקושרות — כל אחת נמדדת בנפרד אצל הקבלן',
  markDone: 'הושלם',
  markProgress: 'בתהליך',
  markIssue: 'בעיה',
  markNone: 'לא התחיל',
  contractorStatusTitle: 'סטטוס קבלן',
  liveLabel: 'חי',
  loadingLabel: 'טוען…',
  sheetUnavailable: 'הגיליון אינו זמין',
  contractorSheetLabel: 'גיליון קבלן',
  noSheetConfigured: 'לא מקושר גיליון קבלן',
  noSheetConfiguredHint: 'הוסף את קישור הגיליון תחת הגדרות ← אפליקציה עבור סביבת עבודה זו.',
  aptNotInSheet: 'דירה זו אינה בגיליון',
  openSheet: 'פתח גיליון',
  // Activity inline template parts
  activityChangedStage: 'שינה שלב של',
  activityAddedNote: 'הוסיף הערה על',
  activityUpdatedField: 'עדכן',
  activityOf: 'של',
  activityMarkedAs: 'סימן',
  activityAs: 'כ',
  activityUpdatedNotes: 'עדכן הערות עבור',
  activityRenamed: 'שינה שם של',
  activityIn: 'ב',
  activityTo: 'ל',
  // StageNotes
  versionsCount: 'גרסאות',
  versionCount: 'גרסה',
  emptyNoteLabel: 'ריק',
  unknownStage: 'שלב לא ידוע',
  // Login extra
  loginSubtitle: 'מערכת ניהול פרויקטים להתקנות מיזוג.',
  loginFooterBrand: 'צביאייר · ניהול פרויקטים',
  switchProject: 'בחר פרויקט',
  jobsNavLabel: 'עבודות',
  addJobBtn: 'הוסף עבודה',
  jobNameLabel: 'שם עבודה',
  addressLabel: 'כתובת',
  zohoLinkLabel: 'קישור Zoho',
  noJobsYet: 'אין עבודות עדיין. לחץ על "הוסף עבודה" להתחיל.',
  generalJobsTitle: 'עבודות כלליות',
  deleteJobConfirm: 'למחוק עבודה זו?',
  deleteWithTasksWarning: 'פעולה זו תמחק לצמיתות את כל המשימות וההערות המשויכות אליה. לא ניתן לבטל פעולה זו.',
  deleteApartmentLabel: 'מחק דירה',
  jobLabel: 'עבודה',
  openZohoBtn: 'פתח ב-Zoho',
};
