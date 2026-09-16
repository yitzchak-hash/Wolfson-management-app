/**
 * THE OFFICE RINGS THE WORKER'S PHONE (the sending half of pushClient.ts).
 *
 * Called by the store when a task is made for a worker or the office writes
 * on his task. It looks up every phone the worker turned notifications on
 * (`pushSubs`, one document per phone), hands them with the words to the
 * server's push branch — which holds the VAPID private key and does the
 * signing — and forgets the phones the push service says are gone (404/410:
 * an uninstalled app, a cleared browser). Fire-and-forget throughout: a
 * notification that cannot be sent must never hold up, or fail, the write
 * that caused it.
 *
 * Words in the WORKER's language (`Contractor.lang`), because it is his phone.
 */
import { fsGetAll, fsDelete, isFirebaseConfigured } from './firebase';
import { portalLink } from './portalLink';
import type { Contractor } from '../types';

const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';

export interface WorkerPing {
  kind: 'task' | 'message';
  /** The task's words, or the message. */
  body: string;
  /** Who wrote (a message) — the title names them. */
  from?: string;
  /** Where — "47 — A2" / the job's name, for the task line. */
  where?: string;
  taskId?: string;
  /** The message's attachment type when it has no words — named instead. */
  attachment?: string;
}

const T = {
  en: { task: 'New task for you', message: (who: string) => `Message from ${who || 'the office'}`, voice: 'Voice message', photo: 'Photo', file: 'File' },
  he: { task: 'משימה חדשה בשבילך', message: (who: string) => `הודעה מ${who || 'המשרד'}`, voice: 'הודעה קולית', photo: 'תמונה', file: 'קובץ' },
  ru: { task: 'Новая задача для вас', message: (who: string) => `Сообщение от ${who || 'офиса'}`, voice: 'Голосовое сообщение', photo: 'Фото', file: 'Файл' },
};

interface SubDoc { id: string; contractorId?: string; sub?: { endpoint: string; keys: Record<string, string> } }

/** Is this page the worker's own portal? His own writes never ring his phone. */
const onPortal = () => typeof location !== 'undefined' && location.pathname.startsWith('/c/');

export function notifyWorker(contractor: Contractor | undefined, portalDomain: string | undefined, ping: WorkerPing): void {
  if (!contractor || !isFirebaseConfigured || !API_KEY || onPortal()) return;
  void (async () => {
    try {
      const docs = (await fsGetAll('pushSubs')) as unknown as SubDoc[];
      const mine = docs.filter(d => d.contractorId === contractor.id && d.sub?.endpoint);
      if (!mine.length) return;
      const lang = (contractor.lang === 'he' || contractor.lang === 'ru') ? contractor.lang : 'en';
      const words = T[lang];
      const title = ping.kind === 'task' ? words.task : words.message(ping.from ?? '');
      const said = ping.body
        || (ping.attachment?.startsWith('audio/') ? words.voice
          : ping.attachment?.startsWith('image/') ? words.photo
          : ping.attachment ? words.file : '');
      const body = [ping.where, said].filter(Boolean).join(' · ').slice(0, 220);
      const base = portalLink(contractor.token, portalDomain);
      const url = ping.taskId ? `${base}?task=${encodeURIComponent(ping.taskId)}` : base;
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ push: {
          subs: mine.map(d => d.sub),
          title, body, url,
          tag: ping.taskId ? `tzviair-${ping.taskId}` : undefined,
        } }),
      });
      if (!res.ok) return;
      const out = await res.json().catch(() => ({})) as { gone?: string[] };
      for (const ep of out.gone ?? []) {
        const dead = mine.find(d => d.sub?.endpoint === ep);
        if (dead) void fsDelete('pushSubs', dead.id);
      }
    } catch { /* a missed ring is not a failed write */ }
  })();
}
