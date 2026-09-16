/**
 * The worker's phone RINGS — the portal's side of pushClient.ts.
 *
 * `PushBanner`: one line under the header, once, asking to turn notifications
 * on (the browser's own permission prompt follows the tap); dismissable; never
 * drawn when the phone cannot do it or the keys are not set — a button that
 * asks and then does nothing is worse than no button. Re-registers silently
 * on every open once it was turned on, so a rotated subscription is replaced.
 *
 * `ArrivalWatcher`: while the portal is OPEN, watches his open tasks and the
 * office's messages on them across every workspace (live + snapshots, which
 * the foreign live sync keeps fresh). Anything not seen before on this phone
 * rings the chime, shows a tappable banner at the top, and — with the tab in
 * the background — a real notification. What was seen is kept per phone
 * (`portal_seen_<worker>`), so the first-ever open is quiet and a task that
 * arrived while the phone was in a pocket is announced on the next open.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { useStore, loadAllProjectsTaskData, loadProjectSnapshot } from '../../data/store';
import { Contractor, ContractorAssignment, ContractorNote, PortalLang, aptLabel, projectShortName } from '../../types';
import { chime, enablePush, notifyHere, pushConfigured, pushPermission, pushRemembered, pushSupported } from '../../data/pushClient';

const W = {
  en: { ask: 'Get a sound when the office sends you work', on: 'Turn on', later: 'Not now', newTask: 'New task for you', message: (who: string) => `Message from ${who || 'the office'}`, voice: 'Voice message', photo: 'Photo', file: 'File' },
  he: { ask: 'לקבל צליל כשהמשרד שולח לך עבודה', on: 'הפעלה', later: 'לא עכשיו', newTask: 'משימה חדשה בשבילך', message: (who: string) => `הודעה מ${who || 'המשרד'}`, voice: 'הודעה קולית', photo: 'תמונה', file: 'קובץ' },
  ru: { ask: 'Получать звук, когда офис присылает работу', on: 'Включить', later: 'Не сейчас', newTask: 'Новая задача для вас', message: (who: string) => `Сообщение от ${who || 'офиса'}`, voice: 'Голосовое сообщение', photo: 'Фото', file: 'Файл' },
};

export function PushBanner({ contractor, lang }: { contractor: Contractor; lang: PortalLang }) {
  const words = W[lang] ?? W.en;
  const dismissKey = `push_dismissed_${contractor.id}`;
  const [state, setState] = useState<'hidden' | 'ask' | 'busy'>(() => {
    if (!pushSupported() || !pushConfigured()) return 'hidden';
    try { if (localStorage.getItem(dismissKey)) return 'hidden'; } catch { /* private mode */ }
    return pushPermission() === 'default' && !pushRemembered(contractor.id) ? 'ask' : 'hidden';
  });

  // Turned on before — or the browser already says yes (a permission granted
  // on another visit, never asked again): subscribe quietly on every open, so
  // a rotated subscription is replaced and a granted phone is never left
  // silently unregistered.
  useEffect(() => {
    if (pushPermission() === 'granted') void enablePush(contractor.id, false);
  }, [contractor.id]);

  if (state === 'hidden') return null;
  return (
    <div data-push-banner className="flex items-center gap-2.5 px-3 py-2 text-[13px]"
      style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa', color: '#7c2d12' }}>
      <BellRing size={16} className="flex-shrink-0" style={{ color: '#ea580c' }} />
      <span className="flex-1 min-w-0 font-semibold leading-tight">{words.ask}</span>
      <button
        type="button"
        data-push-on
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          const r = await enablePush(contractor.id, true);
          // 'off' = the prompt was closed without an answer — ask again next time.
          if (r === 'off') setState('ask');
          else setState('hidden');
        }}
        className="flex-shrink-0 px-3 py-1.5 rounded-full text-white font-bold text-[12.5px] disabled:opacity-50"
        style={{ backgroundColor: '#ea580c' }}
      >
        {words.on}
      </button>
      <button type="button" data-push-later
        onClick={() => { try { localStorage.setItem(dismissKey, '1'); } catch { /* private mode */ } setState('hidden'); }}
        className="w-7 h-7 flex items-center justify-center rounded-full text-orange-700/70 hover:bg-orange-100" title={words.later}>
        <X size={14} />
      </button>
    </div>
  );
}

interface Arrival { key: string; title: string; body: string; taskId: string; projectId: string }

export function ArrivalWatcher({ contractor, lang, onOpen }: {
  contractor: Contractor;
  lang: PortalLang;
  onOpen: (projectId: string, taskId: string) => void;
}) {
  const words = W[lang] ?? W.en;
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveTasks = useStore(st => st.contractorAssignments);
  const liveNotes = useStore(st => st.contractorNotes);
  const liveApts = useStore(st => st.apartments);
  const snapshotTick = useStore(st => st.snapshotTick);
  const projects = useStore(st => st.projects);

  /** Everything that can ring, keyed so a repeat is never announced twice. */
  const current = useMemo(() => {
    const out = new Map<string, Arrival>();
    const wsName = (pid: string) => projectShortName(projects.find(p => p.id === pid), lang === 'he', pid);
    for (const p of loadAllProjectsTaskData()) {
      const live = p.projectId === currentProjectId;
      const tasks: ContractorAssignment[] = live ? liveTasks : p.assignments;
      const apts = live ? liveApts : p.apartments;
      const notes: ContractorNote[] = live ? liveNotes : loadProjectSnapshot(p.projectId).contractorNotes;
      const mine = tasks.filter(a => a.contractorId === contractor.id);
      const mineIds = new Set(mine.map(a => a.id));
      for (const a of mine) {
        if (a.completedAt) continue;
        const apt = apts.find(x => x.id === a.apartmentId);
        const where = a.general ? wsName(p.projectId) : apt ? (aptLabel(apt) || apt.displayName || '') : '';
        out.set(`t:${a.id}`, {
          key: `t:${a.id}`, title: words.newTask, taskId: a.id, projectId: p.projectId,
          body: [where, a.taskDescription].filter(Boolean).join(' · '),
        });
      }
      for (const n of notes) {
        if (n.authorType !== 'office' || !mineIds.has(n.assignmentId)) continue;
        const said = n.text?.trim()
          || (n.attachmentMimeType?.startsWith('audio/') ? words.voice
            : n.attachmentMimeType?.startsWith('image/') ? words.photo
            : n.attachmentMimeType ? words.file : '');
        out.set(`n:${n.id}`, {
          key: `n:${n.id}`, title: words.message(n.authorName), taskId: n.assignmentId, projectId: p.projectId, body: said,
        });
      }
    }
    return out;
    // snapshotTick: a foreign workspace's live sync landing must recompute this.
  }, [contractor.id, currentProjectId, liveTasks, liveNotes, liveApts, snapshotTick, projects, words, lang]);

  const seenKey = `portal_seen_${contractor.id}`;
  const [toast, setToast] = useState<Arrival | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The first look after arriving is a BASELINE, never an alarm: the live
  // sync and the snapshots land over the first seconds, and announcing each
  // as it arrives would ring for everything he already has.
  const settled = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { settled.current = true; }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let seen: Set<string> | null = null;
    try {
      const raw = localStorage.getItem(seenKey);
      seen = raw ? new Set(JSON.parse(raw) as string[]) : null;
    } catch { seen = null; }
    const ids = [...current.keys()];
    const fresh = seen ? ids.filter(k => !seen!.has(k)) : [];
    // First ever visit on this phone, or nothing loaded yet: record and stay quiet.
    if (!seen && ids.length === 0) return;
    if (seen && fresh.length && settled.current) {
      const a = current.get(fresh[fresh.length - 1])!;
      setToast(a);
      chime();
      if (document.hidden) void notifyHere(a.title, a.body, `tzviair-${a.taskId}`, location.pathname);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 9000);
    }
    // Remembered only once the arrival has settled — or the baseline written
    // during the first seconds would swallow what lands a moment later.
    if (!seen || settled.current) {
      try { localStorage.setItem(seenKey, JSON.stringify(ids.slice(-400))); } catch { /* private mode */ }
    }
  }, [current, seenKey]);

  if (!toast) return null;
  return (
    <button
      type="button"
      data-arrival-toast
      onClick={() => { setToast(null); onOpen(toast.projectId, toast.taskId); }}
      className="fixed left-3 right-3 z-[200] flex items-start gap-3 rounded-2xl px-4 py-3 text-start shadow-2xl active:scale-[0.99]"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', backgroundColor: '#0f1f35', color: '#fff', border: '1px solid rgba(255,255,255,.15)' }}
    >
      <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4aa8d8' }}>
        <Bell size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold leading-tight">{toast.title}</span>
        <span className="block text-[12.5px] mt-0.5 leading-snug opacity-90 line-clamp-2">{toast.body}</span>
      </span>
    </button>
  );
}
