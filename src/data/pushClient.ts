/**
 * THE WORKER'S PHONE RINGS (owner, 2026-09-16: "the worker should get a
 * notification in the app and in his phone with a noise as well, just like a
 * WhatsApp message").
 *
 * Two halves, this file being the phone's:
 * - WEB PUSH — the browser's own push channel, so a notification arrives when
 *   the portal is CLOSED. It needs a service worker (`/sw.js`), the worker's
 *   permission, and a VAPID key pair: the public half in the bundle
 *   (`VITE_VAPID_PUBLIC_KEY`), the private half on the server (`VAPID_PRIVATE_KEY`,
 *   used by the push branch in api/geocode.js). The subscription — a
 *   per-browser address the push service hands out — is kept in the global
 *   Firestore collection `pushSubs`, one document per phone, so the office
 *   can send to every phone the worker has turned this on.
 * - IN THE APP — while the portal is open, a new task or a new office message
 *   arriving live rings a chime (drawn with WebAudio — no third party's sound)
 *   and, when the tab is in the background, a local notification through the
 *   same service worker.
 *
 * Nothing here is app data: the subscription is a mechanism (it dies with the
 * browser profile), kept OUT of persist / export / import.
 *
 * iPhone: Safari only delivers web push to a site ADDED TO THE HOME SCREEN.
 * The portal already installs its own manifest, so the shortcut the worker
 * makes is that installation.
 */
import { fsSet, fsDelete, isFirebaseConfigured } from './firebase';

export type PushState = 'on' | 'denied' | 'unsupported' | 'unconfigured' | 'failed' | 'off';

const PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

export const pushConfigured = () => PUBLIC_KEY.length > 20;

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** What this browser says right now — before or after the worker was asked. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

const onKey = (contractorId: string) => `push_on_${contractorId}`;
export function pushRemembered(contractorId: string): boolean {
  try { return localStorage.getItem(onKey(contractorId)) === '1'; } catch { return false; }
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** A short stable id for a subscription — its endpoint hashed. */
function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;
export function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return Promise.resolve(null);
  if (!regPromise) {
    regPromise = navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null);
  }
  return regPromise;
}

/**
 * Turn push on for this worker on THIS phone — idempotent, so the portal can
 * call it again on every open to keep the subscription fresh (push services
 * rotate them). Returns what happened, in one word the UI can act on.
 */
export async function enablePush(contractorId: string, ask = true): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!pushConfigured()) return 'unconfigured';
  try {
    const reg = await swRegistration();
    if (!reg) return 'failed';
    let perm = Notification.permission;
    if (perm === 'default' && ask) perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUBLIC_KEY) as BufferSource });
    }
    const json = sub.toJSON();
    if (!json.endpoint) return 'failed';
    if (isFirebaseConfigured) {
      await fsSet('pushSubs', `${contractorId}__${hashOf(json.endpoint)}`, {
        contractorId,
        sub: { endpoint: json.endpoint, keys: json.keys ?? {} },
        ua: navigator.userAgent.slice(0, 160),
        updatedAt: new Date().toISOString(),
      });
    }
    try { localStorage.setItem(onKey(contractorId), '1'); } catch { /* private mode */ }
    return 'on';
  } catch {
    return 'failed';
  }
}

/** Turn it off on this phone: unsubscribe and forget the address. */
export async function disablePush(contractorId: string): Promise<void> {
  try {
    const reg = await swRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      if (isFirebaseConfigured) await fsDelete('pushSubs', `${contractorId}__${hashOf(sub.endpoint)}`);
      await sub.unsubscribe();
    }
  } catch { /* nothing to undo */ }
  try { localStorage.removeItem(onKey(contractorId)); } catch { /* private mode */ }
}

// ── The in-app half ──────────────────────────────────────────────────────────

let audio: AudioContext | null = null;
/**
 * A two-note chime, drawn with WebAudio — no file, no third party's sound. A
 * browser only lets a page make sound after a tap; on a phone that has been
 * used at all the context resumes, and when it will not, the chime is simply
 * silent (the notification and the banner still say it).
 */
export function chime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    const ctx = audio;
    const go = () => {
      const t0 = ctx.currentTime + 0.02;
      const note = (freq: number, at: number, len: number) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g); g.connect(ctx.destination);
        o.start(at); o.stop(at + len + 0.02);
      };
      note(880, t0, 0.22);
      note(1174.7, t0 + 0.16, 0.34);
    };
    if (ctx.state === 'suspended') void ctx.resume().then(go).catch(() => {});
    else go();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch { /* no sound is not a fault */ }
}

/**
 * A notification from the OPEN page — for a task that arrived live while the
 * tab was in the background. Through the service worker when it is there
 * (Android requires it), the plain constructor otherwise.
 */
export async function notifyHere(title: string, body: string, tag: string, url: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await swRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: '/tzviair-logo.png', tag, data: { url } });
    } else {
      const n = new Notification(title, { body, icon: '/tzviair-logo.png', tag });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* the banner and the chime still said it */ }
}
