import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, User, Sun, Moon, AlertTriangle, Loader2, CheckCircle2, Search, CalendarDays, Settings,
         ChevronDown, Check, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../data/store';
import { usePhone } from '../../data/usePhone';
import { Project } from '../../types';
import { Tooltip } from '../ui/Tooltip';
import { ActivityTicker } from '../ui/ActivityTicker';
import { WhatsNewButton } from '../ui/WhatsNew';
import { GlobalSearch } from '../ui/GlobalSearch';
import { subscribeCloudSync, isFirebaseConfigured } from '../../data/firebase';

function CloudSyncBadge({ light }: { light: boolean }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const s = useStore(state => state.mainUiStrings);
  useEffect(() => subscribeCloudSync(setStatus), []);
  if (!isFirebaseConfigured) return null;
  if (status === 'idle') return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium transition-all ${status === 'saved' ? 'text-green-400' : light ? 'text-gray-400' : 'text-gray-300'}`}>
      {status === 'saving'
        ? <><Loader2 size={13} className="animate-spin" /> {s.syncSaving}</>
        : <><CheckCircle2 size={13} /> {s.syncSaved}</>}
    </div>
  );
}


/**
 * The company mark.
 *
 * On a phone it is decoration standing beside a control, so it gives up its
 * width FIRST — a high shrink factor against the picker's near-zero one — down
 * to a floor where it is still legible. Measured at 360/390/414: with the cap
 * at 84 the header stops being over-constrained at all, which is what stopped
 * the workspace name losing its last letters to a fraction of a pixel.
 */
function TzviAirLogo() {
  return (
    <img
      src="/tzviair-logo.png"
      alt="TzviAir"
      className="flex-shrink-[20] md:flex-shrink-0 min-w-[56px] h-8 md:h-14 max-w-[84px] md:max-w-none object-contain"
      style={{ width: 'auto', display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.18))' }}
    />
  );
}


/**
 * A workspace logo in a fixed SQUARE, never at a fixed height.
 *
 * The pictures run from 1.2 to 3.4 times as wide as they are tall, so one
 * shared height gives them wildly different widths — which is what left the old
 * header row unable to fit on a phone and squeezing every logo to a sliver.
 * A square with `object-contain` letterboxes whichever way the picture leans
 * and always takes exactly the same room.
 */
function WorkspaceLogo({ project, light, className = 'flex' }: { project: Project; light: boolean; className?: string }) {
  return (
    <span
      className={`${className} flex-shrink-0 w-7 h-7 rounded-lg items-center justify-center overflow-hidden`}
      style={{
        backgroundColor: light ? `${project.color}1f` : 'rgba(255,255,255,0.10)',
        border: `1px solid ${project.color}59`,
      }}
    >
      <img src={project.logoPath} alt="" draggable={false} className="max-w-full max-h-full object-contain" />
    </span>
  );
}


/**
 * Which workspace you are in.
 *
 * This was one logo button per project, laid out in a row. A row survives
 * neither of the two things happening to it: the project builder means there is
 * no upper bound on how many workspaces there are, and on a 390px phone three
 * of them plus the company logo already wanted more width than the header had,
 * so flex shrank the pictures into unreadable slivers. A dropdown is the same
 * size at three workspaces or thirty, and the name is spelt out rather than
 * guessed at from a thumbnail.
 */
function WorkspacePicker({ light }: { light: boolean }) {
  const { projects, currentProjectId, setCurrentProject, projectOrder, setProjectOrder,
          mainUiStrings: s } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  /** Which row is being dragged up or down the menu. */
  const [dragId, setDragId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  /** Where the button sits, measured when the menu opens — the portal has no
      anchor of its own. */
  const [anchor, setAnchor] = useState<{ top: number; left: number; right: number } | null>(null);

  /**
   * The workspaces sit in whatever order the office decided.
   *
   * Any workspace made after the order was last saved falls in at the end
   * rather than disappearing, which is what a naive `sort by index` would do to
   * a project the order has never heard of.
   */
  const ordered = useMemo(() => {
    if (!projectOrder.length) return projects;
    const rank = new Map(projectOrder.map((id, i) => [id, i]));
    return [...projects].sort((a, b) =>
      (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  }, [projects, projectOrder]);

  // Escape, and a press anywhere else, close it. A panel that stays open behind
  // your next click swallows it — the standing bug CLAUDE.md calls out.
  // The menu lives in a PORTAL now, so "anywhere else" must check the menu's
  // own ref too — `wrapRef.contains` alone would close it on its own rows.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    // Capture, so a press that another surface stops still closes this.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  // The portal is positioned from the button's measured rect. Re-measured on
  // every open and on resize; the header never scrolls, so scroll cannot move
  // the anchor out from under it.
  useEffect(() => {
    if (!open) return;
    function measure() {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 6, left: r.left, right: window.innerWidth - r.right });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  function reorder(from: string, to: string) {
    if (from === to) return;
    const ids = ordered.map(p => p.id).filter(id => id !== from);
    ids.splice(ids.indexOf(to), 0, from);
    setProjectOrder(ids);
  }

  function handlePickProject(id: string) {
    setOpen(false);
    setCurrentProject(id);
    navigate(id === 'general' ? '/jobs' : '/project');
  }

  const active = ordered.find(p => p.id === currentProjectId) ?? ordered[0];
  if (!active) return null;

  return (
    // `shrink-[0.05]` against the company mark's 20: both can give way, so the
    // header can never overflow, but the name only starts losing letters once
    // the mark has nothing left to give.
    <div ref={wrapRef} className="relative min-w-0 flex shrink-[0.05] md:shrink">
      <button
        onClick={() => {
          const r = wrapRef.current?.getBoundingClientRect();
          if (r) setAnchor({ top: r.bottom + 6, left: r.left, right: window.innerWidth - r.right });
          setOpen(v => !v);
        }}
        title={s.switchProject}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 md:gap-2 min-w-0 max-w-[46vw] md:max-w-none rounded-xl py-1 pl-1.5 pr-1 md:pr-2.5 transition-colors"
        style={{
          // The chip itself is washed in the workspace colour, which is what
          // lets the phone drop the logo square and still say where you are.
          backgroundColor: `${active.color}${light ? '1f' : '33'}`,
          border: `1px solid ${active.color}${light ? '66' : 'aa'}`,
        }}
      >
        <WorkspaceLogo project={active} light={light} className="hidden md:flex" />
        <span
          className="min-w-0 truncate text-[11.5px] md:text-[13px] font-bold"
          style={{ color: light ? '#1e3a5f' : '#ffffff' }}
        >
          {active.shortName}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 w-3 h-3 md:w-3.5 md:h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: light ? '#6b7280' : 'rgba(255,255,255,0.7)' }}
        />
      </button>

      {open && createPortal(
        // Rendered through a PORTAL at the document root. Inside the header the
        // menu was capped at the header's own z-30 stacking context, so the
        // board's floating chrome (z-40/z-50) and any sticky page content drew
        // straight over it — no z-index ON THE MENU can save a child from its
        // parent's stacking context, the same disease the drawer tooltips had.
        // Edge-to-edge under the header on a phone; anchored to the measured
        // button rect from `md` up (right-edge-anchored under RTL).
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] rounded-2xl overflow-hidden md:w-[288px]"
          style={{
            ...(phone
              ? { left: 8, right: 8, top: 58 }
              : s.isRtl
                ? { right: Math.max(8, anchor?.right ?? 8), top: anchor?.top ?? 58 }
                : { left: Math.max(8, Math.min(anchor?.left ?? 8, window.innerWidth - 296)), top: anchor?.top ?? 58 }),
            backgroundColor: light ? '#ffffff' : '#162d4a',
            border: light ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 18px 44px -10px rgba(15,23,42,0.45)',
          }}
        >
          <div
            className="px-3 pt-2.5 pb-1 text-[9.5px] font-extrabold tracking-wide"
            style={{ color: light ? '#9ca3af' : '#7f9ec2' }}
          >
            {s.switchProject}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto pb-1.5">
            {ordered.map(p => {
              const on = p.id === currentProjectId;
              return (
                <button
                  key={p.id}
                  role="menuitemradio"
                  aria-checked={on}
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragId) reorder(dragId, p.id); setDragId(null); }}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => handlePickProject(p.id)}
                  className={`w-full flex items-stretch gap-2.5 px-2.5 py-2 text-left transition-colors ${
                    on ? '' : light ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
                  style={{
                    ...(on ? { backgroundColor: light ? `${p.color}14` : 'rgba(255,255,255,0.07)' } : {}),
                    opacity: dragId === p.id ? 0.55 : 1,
                  }}
                >
                  {/* The same identity rail the sidebar wears, so a colour means
                      one workspace everywhere in the app. */}
                  <span className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <WorkspaceLogo project={p} light={light} />
                  <span className="min-w-0 flex-1 self-center">
                    <span className="block text-[13px] font-bold truncate"
                      style={{ color: light ? '#1e3a5f' : '#ffffff' }}>{p.shortName}</span>
                    <span className="block text-[10.5px] truncate"
                      style={{ color: light ? '#9ca3af' : '#8fa9c6' }}>{p.name}</span>
                  </span>
                  {on && <Check size={15} className="flex-shrink-0 self-center" style={{ color: p.color }} />}
                  {/* Drag to reorder is a mouse gesture — HTML5 drag never fires
                      from a finger — so the grip is not advertised on a phone. */}
                  <GripVertical size={13} className="hidden md:block flex-shrink-0 self-center"
                    style={{ color: light ? '#d1d5db' : 'rgba(255,255,255,0.28)' }} />
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}


export function Header() {
  const { currentUser, logout, lightTheme, setLightTheme, firebaseSyncError, mainUiStrings: s } = useStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    <header
      className="h-14 md:h-[74px] flex items-center justify-between px-2 md:px-5 shadow-lg flex-shrink-0 z-30 transition-colors duration-200 gap-2"
      style={{ backgroundColor: lightTheme ? '#ffffff' : '#1e3a5f', borderBottom: lightTheme ? '1px solid #e5e7eb' : 'none' }}
    >
      {/* Everything left of the actions has to survive a 390px phone, so the
          company logo shrinks, the divider goes, and the workspace name inside
          the picker truncates before anything is pushed off the edge. */}
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        <TzviAirLogo />
        <div className="hidden md:block w-px h-10" style={{ backgroundColor: lightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.2)' }} />
        <div className="flex items-center gap-1 md:gap-2 min-w-0">
          <WorkspacePicker light={lightTheme} />
          {currentUser && (
            <>
              <div className="hidden md:block w-px h-8 mx-1" style={{ backgroundColor: lightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.2)' }} />
              <Tooltip text={s.globalCalendarTitle}>
                <button
                  onClick={() => navigate('/calendar')}
                  className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex-shrink-0"
                  style={{
                    color: lightTheme ? '#1e3a5f' : '#ffffff',
                    backgroundColor: lightTheme ? 'rgba(74,168,216,0.14)' : 'rgba(74,168,216,0.24)',
                    border: '1px solid rgba(74,168,216,0.45)',
                  }}
                >
                  <CalendarDays size={17} /> <span className="hidden md:inline">{s.navCalendar}</span>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 md:gap-2 flex-shrink-0">
        {/* What the APP learned to do — left of what the office just did. */}
        {currentUser && <WhatsNewButton />}
        {/* What just changed, and who did it — see ActivityTicker. */}
        {currentUser && <ActivityTicker light={lightTheme} />}
        <CloudSyncBadge light={lightTheme} />

        {currentUser && (
          <Tooltip text={s.appSettingsTitle}>
            <button
              onClick={() => navigate('/app-settings')}
              className="p-2 rounded-lg transition-colors"
              style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
            >
              <Settings size={18} />
            </button>
          </Tooltip>
        )}

        {currentUser && (
          <Tooltip text={s.searchTooltip}>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
            >
              <Search size={17} />
            </button>
          </Tooltip>
        )}

        {/* Theme toggle */}
        <Tooltip text={lightTheme ? s.switchToDark : s.switchToLight}>
          <button
            onClick={() => setLightTheme(!lightTheme)}
            className="hidden sm:block p-2 rounded-lg transition-colors"
            style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
          >
            {lightTheme ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </Tooltip>

        {currentUser && (
          <>
            <div className="hidden lg:block text-right ml-1">
              <div className="text-sm font-medium" style={{ color: lightTheme ? '#1e3a5f' : 'white' }}>{currentUser.name}</div>
              <div className="text-xs" style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}>{currentUser.role}</div>
            </div>
            <div className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center border"
              style={{ backgroundColor: 'rgba(74,168,216,0.2)', borderColor: 'rgba(74,168,216,0.4)' }}>
              <User size={16} className="text-[#4aa8d8]" />
            </div>
            <Tooltip text={s.signOut}>
              <button
                onClick={logout}
                className="p-2 rounded-lg transition-colors"
                style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
              >
                <LogOut size={18} />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </header>
    {firebaseSyncError && (
      <div className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-red-600 text-white">
        <AlertTriangle size={15} className="flex-shrink-0" />
        <span>{firebaseSyncError}</span>
      </div>
    )}
</>
  );
}
