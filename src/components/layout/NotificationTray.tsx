import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Eye, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore } from '../../data/store';
import { openQuestions } from '../../data/stageHow';
import { fsListenWhere, isFirebaseConfigured } from '../../data/firebase';
import { prefGet, prefSet, onPrefsChange } from '../../data/prefs';
import { haptic } from '../../data/haptics';
import type { SharedLogEntry } from '../../data/sharedLinks';

/**
 * THE NOTIFICATION TRAY (owner, 2026-11-19: "a little tiny notification tray that will ping every time something
 * happens — whether Igor updated something that needs sorting, if someone opened the link, if a pin came in, that's
 * very important").
 *
 * Read off what the app already has, nothing new is stored but the "seen up to" time:
 *   · a worker's work he could not file (an apartment's open site-visit question),
 *   · an outside Shared link opened, and a pin placed on one (the link's server log, sharedLinkLogs),
 *   · a pin placed by someone else on one of this workspace's plans (planPins).
 * "Seen up to" is per person, per workspace, in the cloud (data/prefs) — the badge counts what came after it, and a
 * soft ping sounds when something new arrives while the app is open.
 */
type Kind = 'unfiled' | 'opened' | 'pin';
interface Item { id: string; kind: Kind; at: string; text: string; aptId?: string }

const RECENT_MS = 14 * 24 * 3600_000;

function ping() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
    setTimeout(() => { void ctx.close().catch(() => {}); }, 600);
  } catch { /* a browser that will not make sound: the badge still counts */ }
}

export function NotificationTray({ light }: { light: boolean }) {
  const apartments = useStore(st => st.apartments);
  const pins = useStore(st => st.planPins);
  const pid = useStore(st => st.currentProjectId);
  const me = useStore(st => st.currentUser?.name ?? '');
  const ui = useStore(st => st.mainUiStrings);
  const setPendingOpenAptId = useStore(st => st.setPendingOpenAptId);
  const navigate = useNavigate();
  const he = !!ui.isRtl;
  const W = (en: string, h: string) => (he ? h : en);
  const [logs, setLogs] = useState<SharedLogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [, bump] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => onPrefsChange(() => bump(n => n + 1)), []);
  useEffect(() => {
    setLogs([]);
    if (!isFirebaseConfigured || pid === 'general') return;
    return fsListenWhere('sharedLinkLogs', { projectId: pid }, rows => setLogs(rows as unknown as SharedLogEntry[]));
  }, [pid]);

  const aptName = (id?: string) => {
    const a = id ? apartments.find(x => x.id === id) : undefined;
    return a ? `${W('Apt', 'דירה')} ${a.buildingId} · ${a.apartmentNumber}${a.displayName && a.displayName !== a.apartmentNumber ? ` — ${a.displayName}` : ''}` : (id ?? '');
  };

  const items: Item[] = useMemo(() => {
    const since = Date.now() - RECENT_MS;
    const recent = (iso?: string) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) && t >= since; };
    const out: Item[] = [];
    for (const a of apartments) for (const v of openQuestions(a)) {
      out.push({ id: `q-${v.id}`, kind: 'unfiled', at: v.endedAt ?? v.startedAt, aptId: a.id,
        text: W(`${v.byName} finished work and didn't know where to file it · ${aptName(a.id)}`, `${v.byName} סיים עבודה ולא ידע איפה לתייק · ${aptName(a.id)}`) });
    }
    // A link's visits: one line per open (the server already writes at most one a minute).
    for (const l of logs) {
      if (!recent(l.at)) continue;
      const where = [l.city, l.country].filter(Boolean).join(', ');
      if (l.action === 'open') out.push({ id: `o-${l.id}`, kind: 'opened', at: l.at,
        text: W(`A shared link was opened${where ? ` · ${where}` : ''}${l.device ? ` · ${l.device}` : ''}`, `קישור משותף נפתח${where ? ` · ${where}` : ''}${l.device ? ` · ${l.device}` : ''}`) });
      if (l.action === 'pin-add') out.push({ id: `sp-${l.id}`, kind: 'pin', at: l.at, aptId: l.apartmentId,
        text: W(`A pin came in from a shared link · ${aptName(l.apartmentId)}`, `סיכה חדשה מקישור משותף · ${aptName(l.apartmentId)}`) });
    }
    for (const p of pins) {
      if (!recent(p.createdAt) || !p.createdBy || p.createdBy === me) continue;
      out.push({ id: `p-${p.id}`, kind: 'pin', at: p.createdAt, aptId: p.apartmentId,
        text: W(`${p.createdBy} added a pin · ${aptName(p.apartmentId)}`, `${p.createdBy} הוסיף סיכה · ${aptName(p.apartmentId)}`) });
    }
    return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartments, logs, pins, me, he]);

  const seenKey = `notif.seen.${pid}`;
  const seen = prefGet(seenKey) ?? '';
  const unseen = items.filter(i => (i.at ?? '') > seen).length;

  // The ping: something new arrived while the app is open (not the first load).
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (lastCount.current !== null && unseen > lastCount.current) { ping(); haptic('tick'); }
    lastCount.current = unseen;
  }, [unseen]);
  useEffect(() => { lastCount.current = null; }, [pid]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [open]);

  if (pid === 'general') return null;
  const MENU_W = 340;
  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)), top: r.bottom + 6 });
    setOpen(true);
    prefSet(seenKey, new Date().toISOString());
  };
  const when = (iso: string) => { try { return format(parseISO(iso), 'd MMM, HH:mm'); } catch { return ''; } };
  const icon = (k: Kind) => k === 'unfiled' ? <AlertTriangle size={15} className="text-amber-500" />
    : k === 'pin' ? <MapPin size={15} className="text-red-500" /> : <Eye size={15} className="text-sky-600" />;

  return (
    <>
      <button ref={btnRef} data-notif-bell onClick={() => (open ? setOpen(false) : openMenu())}
        title={W('Notifications', 'התראות')} aria-label={W('Notifications', 'התראות')}
        className="relative p-2 rounded-lg transition-colors flex-shrink-0" style={{ color: light ? '#6b7280' : '#9ca3af' }}>
        <Bell size={18} />
        {unseen > 0 && (
          <span data-notif-count className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} data-notif-tray className="fixed z-[400] rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: MENU_W, maxHeight: '70vh' }} dir={he ? 'rtl' : 'ltr'}>
          <div className="px-3 py-2 border-b border-gray-100 text-sm font-semibold text-gray-800">{W('Notifications', 'התראות')}</div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 40px)' }}>
            {items.length === 0 ? <div className="p-4 text-sm text-gray-400">{W('Nothing new.', 'אין חדש.')}</div> : items.map(i => (
              <button key={i.id} type="button" data-notif-item={i.kind}
                onClick={() => { if (i.aptId) { setOpen(false); setPendingOpenAptId(i.aptId); navigate('/project'); } }}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-start border-b border-gray-50 ${i.aptId ? 'hover:bg-gray-50' : 'cursor-default'} ${(i.at ?? '') > seen ? 'bg-amber-50/60' : ''}`}>
                <span className="mt-0.5 flex-shrink-0">{icon(i.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-gray-800 leading-snug">{i.text}</span>
                  <span className="block text-[11px] text-gray-400 mt-0.5">{when(i.at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
