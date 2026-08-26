/**
 * LIVE PRESENCE — who else is on this board right now, where their mouse is,
 * and what they are dragging, the Google-Sheets feeling.
 *
 * It rides Firebase's REALTIME DATABASE, not Firestore: cursor traffic is a
 * handful of tiny writes per second per person, which would chew Firestore's
 * per-write quota for nothing, while RTDB is built for exactly this kind of
 * cheap ephemeral stream. It is a separate channel in the SAME Firebase
 * project — `VITE_FIREBASE_DATABASE_URL` names it — and it never touches the
 * office's data: presence rows die with the tab (`onDisconnect().remove()`),
 * nothing is stored, and with the URL absent every function here is a no-op.
 *
 * The database module is loaded LAZILY, only when the URL is configured — it
 * is ~40KB of bundle nobody without the feature should pay for.
 */
import { firebaseApp } from './firebase';

export interface PresencePeer {
  key: string;
  name: string;
  color: string;
  board: string;
  /** Cursor, in BOARD coordinates — absent while the pointer is off the board. */
  x?: number | null;
  y?: number | null;
  /** Tiles mid-drag under that hand: live positions, in board coordinates. */
  drag?: Record<string, { x: number; y: number }> | null;
  at: number;
}

const DB_URL = (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined) || '';

export function presenceReady(): boolean {
  return !!DB_URL && !!firebaseApp();
}

/** This TAB's identity — two windows on one machine are two people at the board. */
function tabId(): string {
  try {
    let id = sessionStorage.getItem('presence_tab_id');
    if (!id) {
      id = `P${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      sessionStorage.setItem('presence_tab_id', id);
    }
    return id;
  } catch { return 'P-anon'; }
}

type DbMod = typeof import('firebase/database');
let dbMod: DbMod | null = null;
let dbInstance: unknown = null;
let loading: Promise<void> | null = null;

function ensureDb(): Promise<void> {
  if (dbMod || !presenceReady()) return Promise.resolve();
  if (!loading) {
    loading = import('firebase/database').then(m => {
      dbMod = m;
      dbInstance = m.getDatabase(firebaseApp()!, DB_URL);
    }).catch(() => { dbMod = null; dbInstance = null; });
  }
  return loading;
}

// ── my own row ──────────────────────────────────────────────────────────────

let mine: { pid: string; board: string; name: string; color: string } | null = null;
let cursor: { x: number | null; y: number | null } = { x: null, y: null };
let dragging: Record<string, { x: number; y: number }> | null = null;
let writeTimer: number | null = null;
let heartbeat: number | null = null;

function myRef() {
  if (!dbMod || !dbInstance || !mine) return null;
  return dbMod.ref(dbInstance as never, `presence/${mine.pid}/${tabId()}`);
}

function writeNow() {
  const r = myRef();
  if (!r || !dbMod || !mine) return;
  void dbMod.set(r, {
    name: mine.name, color: mine.color, board: mine.board,
    x: cursor.x, y: cursor.y,
    drag: dragging,
    at: { '.sv': 'timestamp' },
  }).catch(() => { /* presence is best-effort */ });
}

/**
 * Throttled, trailing: at most ~8 writes a second however fast the mouse
 * moves, and the LAST position always lands.
 */
function scheduleWrite() {
  if (writeTimer != null) return;
  writeTimer = window.setTimeout(() => { writeTimer = null; writeNow(); }, 120);
}

/**
 * Start telling this workspace's board who and where I am. Returns stop().
 * The row is removed on disconnect by the SERVER, so a tab that dies without
 * cleanup does not leave a ghost cursor standing.
 */
export function startPresence(pid: string, board: string, me: { name: string; color: string }): () => void {
  if (!presenceReady()) return () => {};
  mine = { pid, board, name: me.name, color: me.color };
  void ensureDb().then(() => {
    const r = myRef();
    if (!r || !dbMod) return;
    void dbMod.onDisconnect(r).remove();
    writeNow();
  });
  // A quiet hand still answers "is he here?" — refresh the stamp regularly so
  // the staleness filter (15s) never drops a live but motionless colleague.
  heartbeat = window.setInterval(writeNow, 10_000);
  return () => {
    if (heartbeat != null) { clearInterval(heartbeat); heartbeat = null; }
    if (writeTimer != null) { clearTimeout(writeTimer); writeTimer = null; }
    const r = myRef();
    if (r && dbMod) void dbMod.remove(r).catch(() => { /* gone anyway */ });
    mine = null;
    cursor = { x: null, y: null };
    dragging = null;
  };
}

/** The live cursor (board coordinates), and whatever the hand is carrying. */
export function publishPresence(p: {
  x: number | null; y: number | null;
  drag: Record<string, { x: number; y: number }> | null;
}): void {
  if (!mine) return;
  cursor = { x: p.x, y: p.y };
  dragging = p.drag;
  scheduleWrite();
}

// ── everyone else ───────────────────────────────────────────────────────────

type PeerSub = (peers: PresencePeer[]) => void;
const subs = new Set<PeerSub>();
let livePeers: PresencePeer[] = [];
let injected: PresencePeer[] = [];

function fanOut() {
  const all = [...livePeers, ...injected];
  for (const s of subs) s(all);
}

/**
 * Everyone on this workspace's board except me, freshest data the channel
 * has. The caller filters staleness on ITS clock tick — a peer whose row
 * stops refreshing simply fades out within seconds.
 */
export function subscribePeers(pid: string, board: string, cb: PeerSub): () => void {
  subs.add(cb);
  let off: (() => void) | null = null;
  if (presenceReady()) {
    void ensureDb().then(() => {
      if (!dbMod || !dbInstance) return;
      const r = dbMod.ref(dbInstance as never, `presence/${pid}`);
      off = dbMod.onValue(r, snap => {
        const val = (snap.val() ?? {}) as Record<string, Omit<PresencePeer, 'key'>>;
        const self = tabId();
        livePeers = Object.entries(val)
          .filter(([k, p]) => k !== self && (p.board ?? '') === board)
          .map(([k, p]) => ({ ...p, key: k }));
        fanOut();
      });
    });
  }
  cb([...livePeers, ...injected]);
  return () => {
    subs.delete(cb);
    if (off) off();
  };
}

/**
 * The harness's door: this container has no Firebase, and a websocket to
 * firebaseio.com cannot be stubbed with page.route — so in DEV builds the
 * test injects peers straight into the same fan-out the real channel feeds.
 * Dev-only by the guard below; the production bundle never exposes it.
 */
export function _injectPeersForTest(peers: PresencePeer[]): void {
  injected = peers;
  fanOut();
}
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __injectPresence?: (p: PresencePeer[]) => void }).__injectPresence =
    _injectPeersForTest;
}
