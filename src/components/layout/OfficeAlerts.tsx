/**
 * The OFFICE rings too — the other direction of PortalAlerts' ArrivalWatcher.
 *
 * While the admin app is open it watches every workspace (the open one live,
 * the rest from the snapshots the foreign live sync keeps fresh) for two
 * things a worker does from his phone: a MESSAGE on a task (a contractor
 * note — words, a voice memo, a picture, a file) and a CLOSED job. Anything
 * not seen before on this computer chimes, shows a tappable card top-right,
 * and — with the tab in the background — a real desktop notification.
 * Pressing the card walks to the item step by step: switch workspace if it
 * lives elsewhere, open the job, land on its Tasks tab with that task lit
 * (`taskFocus`). A general job (no unit) lands on the Tasks page instead.
 *
 * What was seen is per computer (`office_seen_<userId>`); the first seconds
 * after arriving are a BASELINE, never an alarm — the same two rules the
 * worker's side already paid for.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, CheckCircle2, X } from 'lucide-react';
import { useStore, loadAllProjectsTaskData, loadProjectSnapshot } from '../../data/store';
import { ContractorAssignment, ContractorNote, aptLabel, projectShortName } from '../../types';
import { chime, notifyHere } from '../../data/pushClient';
import { rememberTaskFocus } from '../../data/taskFocus';

interface Arrival {
  key: string;
  kind: 'message' | 'closed';
  title: string;
  body: string;
  taskId: string;
  apartmentId: string;
  projectId: string;
  at: string;
}

const RECENT_DAYS = 14;

export function OfficeAlerts() {
  const s = useStore(st => st.mainUiStrings);
  const currentUser = useStore(st => st.currentUser);
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveTasks = useStore(st => st.contractorAssignments);
  const liveNotes = useStore(st => st.contractorNotes);
  const liveApts = useStore(st => st.apartments);
  const snapshotTick = useStore(st => st.snapshotTick);
  const projects = useStore(st => st.projects);
  const contractors = useStore(st => st.contractors);
  const setCurrentProject = useStore(st => st.setCurrentProject);
  const setPendingFocus = useStore(st => st.setPendingFocus);
  const navigate = useNavigate();

  const current = useMemo(() => {
    const out = new Map<string, Arrival>();
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    const he = !!s.isRtl;
    const wsName = (pid: string) => projectShortName(projects.find(p => p.id === pid), he, pid);
    const whoOf = (id: string, fallback: string) => contractors.find(c => c.id === id)?.name || fallback || s.unknownUser;
    for (const p of loadAllProjectsTaskData()) {
      const live = p.projectId === currentProjectId;
      const tasks: ContractorAssignment[] = live ? liveTasks : p.assignments;
      const apts = live ? liveApts : p.apartments;
      const notes: ContractorNote[] = live ? liveNotes : loadProjectSnapshot(p.projectId).contractorNotes;
      const byId = new Map(tasks.map(a => [a.id, a]));
      const whereOf = (a: ContractorAssignment) => {
        const apt = apts.find(x => x.id === a.apartmentId);
        const unit = a.general ? '' : apt ? (aptLabel(apt) || apt.displayName || '') : '';
        return [wsName(p.projectId), unit].filter(Boolean).join(' · ');
      };
      for (const n of notes) {
        if (n.authorType !== 'contractor') continue;
        const a = byId.get(n.assignmentId);
        if (!a) continue;
        if (Date.parse(n.createdAt) < since) continue;
        const said = n.text?.trim()
          || (n.attachmentMimeType?.startsWith('audio/') ? '🎤'
            : n.attachmentMimeType?.startsWith('image/') ? '📷'
            : n.attachmentMimeType ? '📎' : '');
        out.set(`n:${n.id}`, {
          key: `n:${n.id}`, kind: 'message', at: n.createdAt,
          title: s.officeNotifMessage.replace('{who}', whoOf(a.contractorId, n.authorName)),
          body: [whereOf(a), said].filter(Boolean).join(' · '),
          taskId: a.id, apartmentId: a.apartmentId, projectId: p.projectId,
        });
      }
      for (const a of tasks) {
        if (!a.completedAt || Date.parse(a.completedAt) < since) continue;
        out.set(`c:${a.id}`, {
          key: `c:${a.id}`, kind: 'closed', at: a.completedAt,
          title: s.officeNotifClosed.replace('{who}', whoOf(a.contractorId, '')),
          body: [whereOf(a), a.taskDescription].filter(Boolean).join(' · '),
          taskId: a.id, apartmentId: a.apartmentId, projectId: p.projectId,
        });
      }
    }
    return out;
  }, [currentProjectId, liveTasks, liveNotes, liveApts, snapshotTick, projects, contractors, s]);

  const seenKey = `office_seen_${currentUser?.id ?? 'anon'}`;
  const [toast, setToast] = useState<Arrival | null>(null);
  const [askPerm, setAskPerm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settled = useRef(false);
  // A STATE beside the ref: an office standing in an empty workspace has no
  // ids at arrival, so nothing would ever write the baseline — and with no
  // baseline the first message is swallowed as "first visit". Settling
  // re-runs the effect once so an empty baseline is written too.
  const [settledAt, setSettledAt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { settled.current = true; setSettledAt(Date.now()); }, 2500);
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
    // Nothing loaded yet AND not settled: wait — the baseline is written once settled.
    if (!seen && ids.length === 0 && !settled.current) return;
    if (seen && fresh.length && settled.current) {
      const newest = fresh.map(k => current.get(k)!).sort((x, y) => x.at.localeCompare(y.at)).pop()!;
      setToast(newest);
      chime();
      if (document.hidden) void notifyHere(newest.title, newest.body, `tzviair-office-${newest.taskId}`, '/');
      setAskPerm('Notification' in window && Notification.permission === 'default');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 12000);
    }
    if (!seen || settled.current) {
      try { localStorage.setItem(seenKey, JSON.stringify(ids.slice(-600))); } catch { /* private mode */ }
    }
  }, [current, seenKey, settledAt]);

  function open(a: Arrival) {
    setToast(null);
    rememberTaskFocus(a.taskId);
    if (a.projectId !== currentProjectId) setCurrentProject(a.projectId);
    if (!a.apartmentId) { navigate('/tasks'); return; }
    // Switch first, THEN the intent — setCurrentProject clears pendingFocus.
    setPendingFocus({ kind: 'task', id: a.taskId, apartmentId: a.apartmentId });
    navigate(a.projectId === 'general' ? '/jobs' : '/project');
  }

  if (!toast) return null;
  const Icon = toast.kind === 'closed' ? CheckCircle2 : MessageCircle;
  return (
    <div
      data-office-toast
      data-office-toast-kind={toast.kind}
      className="fixed z-[210] w-[340px] max-w-[calc(100vw-24px)] rounded-2xl shadow-2xl text-white"
      style={{ top: 66, insetInlineEnd: 12, backgroundColor: '#0f1f35', border: '1px solid rgba(255,255,255,.15)' }}
    >
      <button type="button" data-office-toast-open onClick={() => open(toast)}
        className="w-full flex items-start gap-3 px-4 py-3 text-start rounded-2xl hover:bg-white/5">
        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: toast.kind === 'closed' ? '#16a34a' : '#4aa8d8' }}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-extrabold leading-tight">{toast.title}</span>
          <span className="block text-[12.5px] mt-0.5 leading-snug opacity-90 line-clamp-2">{toast.body}</span>
          <span className="block text-[11px] mt-1 opacity-70">{s.officeNotifOpen} ›</span>
        </span>
      </button>
      <button type="button" aria-label="close" onClick={() => setToast(null)}
        className="absolute top-2 end-2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/15">
        <X size={13} />
      </button>
      {askPerm && (
        <button type="button" data-office-toast-allow
          onClick={() => { void Notification.requestPermission().then(() => setAskPerm(false)); }}
          className="w-full text-[11.5px] px-4 py-1.5 border-t border-white/10 text-start opacity-90 hover:opacity-100 rounded-b-2xl">
          🔔 {s.officeNotifAllow}
        </button>
      )}
    </div>
  );
}

/**
 * The upfront ask, as a HEADER pill — not a floating card. Chrome only asks
 * for notification permission from a click, and the ask used to live on
 * the first worker-message card, so a computer that had not yet received a
 * message never saw it ("why don't I see the permission asked on my
 * computer"). A floating card was tried first and sat over the job window's
 * plan bar on a tablet; a pill in the header overlaps nothing. Shown while
 * the permission is still undecided and not dismissed on this machine
 * (`office_notif_asked`); Turn on runs the browser's own prompt.
 */
export function OfficeAlertsAsk({ light }: { light: boolean }) {
  const s = useStore(st => st.mainUiStrings);
  const [show, setShow] = useState<boolean>(() => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'default') return false;
      return localStorage.getItem('office_notif_asked') !== '1';
    } catch { return false; }
  });
  if (!show) return null;
  const dismiss = () => { setShow(false); try { localStorage.setItem('office_notif_asked', '1'); } catch { /* private mode */ } };
  return (
    <span data-office-notif-ask className="flex items-center gap-1 rounded-full pe-1"
      style={{ backgroundColor: light ? '#fff7ed' : 'rgba(251,191,36,.14)', border: `1px solid ${light ? '#fdba74' : 'rgba(251,191,36,.45)'}` }}>
      <button data-office-notif-on type="button"
        onClick={() => { void Notification.requestPermission().finally(dismiss); }}
        title={s.officeNotifAskBody}
        className="flex items-center gap-1.5 ps-2.5 pe-1.5 py-1 rounded-full text-[11.5px] font-bold"
        style={{ color: light ? '#9a3412' : '#fcd34d' }}>
        <span aria-hidden>🔔</span>
        <span className="hidden md:inline">{s.officeNotifAskTitle}</span>
        <span className="md:hidden">{s.officeNotifAllow}</span>
      </button>
      <button data-office-notif-later type="button" onClick={dismiss} title={s.officeNotifLater}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] opacity-70 hover:opacity-100"
        style={{ color: light ? '#9a3412' : '#fcd34d' }}>
        <X size={11} />
      </button>
    </span>
  );
}
