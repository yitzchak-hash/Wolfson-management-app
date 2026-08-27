import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Target } from 'lucide-react';
import { CanvasElement, DASHBOARD_BOARD } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import { useStore } from '../../data/store';

/**
 * The TzviAir Goals board, embedded — live tiles from the separate goals app
 * at tzviair-goals.vercel.app, standing on the board like any other widget.
 *
 * The embed is the goals app's OWN `widget.js` (script loaded once, an
 * auto-resizing iframe mounted into this node). All goal data lives in that
 * app and is read/written INSIDE the iframe — this codebase never touches
 * `/api/goals`, and must not: its POST replaces the whole goals board with
 * no auth, so a buggy host write could wipe real data. `interactive` is the
 * sanctioned way to allow changes, and it is forced OFF wherever this app
 * renders read-only (the wall).
 *
 * FIVE STYLES (`data.style`), the owner's ask — one widget, the look in the
 * pencil, the dedupe round's own idiom:
 *  - `board`   — the full tile grid, interactive (the iframe).
 *  - `summary` — the compact strip with the progress bar (the iframe).
 *  - `ring`    — a progress ring drawn BY THE HOST from the live counters.
 *  - `number`  — the big completed/total figure, host-drawn.
 *  - `bar`     — a slim progress bar with the counts, host-drawn.
 * The host-drawn three still mount the widget — HIDDEN — because `onState`
 * is the one sanctioned channel for the counters; drawing from a direct
 * `/api/goals` read is exactly what the contract forbids. Absent style
 * defaults by SURFACE: summary on the dashboard, board everywhere else
 * (legacy `data.view` is read the same way and never written again).
 *
 * Rules kept, each from a paid-for trap:
 *  - `data.sample` is the shelf's door (the weather/photos precedent): the
 *    store makes no network calls, so the card draws canned tiles instead of
 *    hanging on a spinner.
 *  - The iframe swallows its own pointer events, so board drags never fight
 *    it — the node is dragged by its chrome, exactly like the map.
 *  - The mount is destroyed on unmount (and re-made when settings change),
 *    or a remount would stack duplicate iframes and listeners.
 *  - Auto height: the iframe follows its content and the widget body scrolls
 *    (`Frame` is overflow-auto) — widgets scroll, they do not clip.
 */

const WIDGET_ORIGIN = 'https://tzviair-goals.vercel.app';
const SCRIPT_SRC = `${WIDGET_ORIGIN}/widget.js`;
export const GOALS_SITE = WIDGET_ORIGIN;

export interface GoalsState { total: number; completed: number; inProgress: number; notStarted: number }
export type GoalsMountHandle = { iframe: HTMLIFrameElement; destroy: () => void };
type WidgetApi = { mount: (target: Element, options: Record<string, unknown>) => GoalsMountHandle };

declare global {
  interface Window { TzviAirGoalsWidget?: WidgetApi }
}

let scriptPromise: Promise<WidgetApi> | null = null;

export function loadGoalsScript(): Promise<WidgetApi> {
  if (window.TzviAirGoalsWidget) return Promise.resolve(window.TzviAirGoalsWidget);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.TzviAirGoalsWidget) resolve(window.TzviAirGoalsWidget);
        else reject(new Error('widget.js loaded but did not initialize'));
      };
      script.onerror = () => {
        // A failed load must not poison every later mount — clear the
        // promise so the retry button can genuinely try again.
        scriptPromise = null;
        reject(new Error('failed to load the goals widget script'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export type GoalsStyle = 'board' | 'summary' | 'ring' | 'number' | 'bar';
const STYLES: GoalsStyle[] = ['board', 'summary', 'ring', 'number', 'bar'];

export function GoalsWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const isRtl = useStore(state => !!state.mainUiStrings.isRtl);
  const navigate = useNavigate();

  const rawStyle = String(data.style ?? '')
    // Legacy bags carry `view` from before the styles existed.
    || (data.view === 'board' ? 'board' : data.view === 'dashboard' ? 'summary' : '');
  const style: GoalsStyle = (STYLES as string[]).includes(rawStyle)
    ? (rawStyle as GoalsStyle)
    : (el.board === DASHBOARD_BOARD ? 'summary' : 'board');
  const hostDrawn = style === 'ring' || style === 'number' || style === 'bar';

  const lang = (data.lang === 'he' || data.lang === 'en')
    ? (data.lang as 'he' | 'en')
    : (isRtl ? 'he' : 'en');
  // Buttons default by surface too: the board is where people work, the
  // dashboard's compact card is a glance — and the wall or any other
  // read-only surface never gets them whatever is set.
  const interactive = (data.interactive === '1'
    || (data.interactive !== '0' && style === 'board')) && !c.readOnly;
  const max = Number(data.max) > 0 ? Number(data.max) : undefined;

  const slotRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<GoalsState | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const sample = !!data.sample;

  useEffect(() => {
    if (sample) return;
    let handle: GoalsMountHandle | null = null;
    let cancelled = false;
    loadGoalsScript()
      .then(api => {
        if (cancelled || !slotRef.current) return;
        handle = api.mount(slotRef.current, {
          // A host-drawn style mounts the light summary view purely for its
          // onState counters — the iframe itself stays hidden.
          view: style === 'board' ? 'board' : 'dashboard',
          lang, interactive, max,
          // Frame draws the title and paints the panel — the widget's own
          // header row and background would be a box inside a box.
          transparent: true, header: false, link: true, height: 'auto',
          onState: (s: GoalsState) => { if (!cancelled) setState(s); },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; handle?.destroy(); };
  }, [sample, style, lang, interactive, max, retryTick]);

  const badge = (s: GoalsState) => lang === 'he'
    ? `${s.completed}/${s.total} הושלמו · ${s.inProgress} בתהליך`
    : `${s.completed}/${s.total} done · ${s.inProgress} in progress`;

  // ── the shelf's canned tiles — no network on the store ────────────────────
  if (sample) {
    const rows: [string, string][] = [
      ['לסיים את כל ההתקנות בוולפסון A1', '#16a34a'],
      ['לצלם כל דירה שנסגרת', '#f59e0b'],
      ['אפס משימות באיחור השבוע', '#94a3b8'],
    ];
    return (
      <Frame title={String(data.title || 'Goals')} icon={Target} tone="#1e3a5f">
        <div data-goals-widget className="space-y-1.5" dir="rtl">
          <div className="text-[10px] font-bold" style={{ color: '#1e3a5f' }}>2/9 הושלמו · 3 בתהליך</div>
          {rows.map(([t, col]) => (
            <div key={t} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
              <span className="text-[10.5px] font-semibold text-gray-700 truncate">{t}</span>
            </div>
          ))}
          <div className="text-[9px] text-gray-400 text-center">sample data</div>
        </div>
      </Frame>
    );
  }

  const failedCard = (
    <div className="flex flex-col items-center justify-center gap-1.5 py-6 px-3 text-center">
      <div className="text-[11px] font-semibold text-gray-600">
        {lang === 'he' ? 'לוח היעדים לא נטען.' : "Couldn't reach the goals board."}
      </div>
      <button data-no-drag data-el-action data-goals-retry
        onClick={() => { setFailed(false); setRetryTick(t => t + 1); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
        style={{ backgroundColor: '#1e3a5f' }}>
        <RefreshCw size={11} /> {lang === 'he' ? 'נסה שוב' : 'Try again'}
      </button>
    </div>
  );

  // ── the host-drawn styles: counters through onState, iframe hidden ────────
  if (hostDrawn) {
    const s = state;
    const pct = s && s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    const openFull = () => { if (!c.readOnly) navigate('/goals'); };
    const figure = !s
      ? <div className="text-[11px] text-gray-400 text-center py-4">…</div>
      : style === 'ring' ? (
        <div className="flex flex-col items-center gap-1">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="#16a34a" strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${(pct / 100) * 2 * Math.PI * 40} ${2 * Math.PI * 40}`}
              transform="rotate(-90 48 48)" />
            <text x="48" y="45" textAnchor="middle" fontSize="17" fontWeight="800" fill="#1e3a5f">
              {s.completed}/{s.total}
            </text>
            <text x="48" y="60" textAnchor="middle" fontSize="9" fontWeight="600" fill="#94a3b8">
              {lang === 'he' ? 'הושלמו' : 'done'}
            </text>
          </svg>
          <div className="text-[10px] font-semibold text-gray-500">
            {lang === 'he' ? `${s.inProgress} בתהליך` : `${s.inProgress} in progress`}
          </div>
        </div>
      ) : style === 'number' ? (
        <div className="flex flex-col items-center gap-0.5 py-1">
          <div className="text-[34px] leading-none font-black tabular-nums" style={{ color: '#1e3a5f' }}>
            {s.completed}<span className="text-gray-300">/</span>{s.total}
          </div>
          <div className="text-[10.5px] font-bold text-gray-500">
            {lang === 'he' ? 'יעדים הושלמו' : 'goals done'}
          </div>
          <div className="text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
            {lang === 'he' ? `${s.inProgress} בתהליך עכשיו` : `${s.inProgress} running now`}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 py-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-black tabular-nums" style={{ color: '#1e3a5f' }}>{pct}%</span>
            <span className="text-[10px] font-semibold text-gray-500">{badge(s)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: '#16a34a' }} />
          </div>
        </div>
      );
    return (
      <Frame title={String(data.title || 'Goals')} icon={Target} tone="#1e3a5f">
        <div data-goals-widget data-goals-style={style} className="min-h-full">
          {failed ? failedCard : (
            <button data-no-drag data-el-action data-goals-open
              onClick={openFull} disabled={c.readOnly}
              className="w-full text-left disabled:cursor-default"
              title={c.readOnly ? undefined : 'Open the goals page'}>
              {figure}
            </button>
          )}
          {/* The mount lives on for its counters; nobody sees it. */}
          <div ref={slotRef} data-goals-slot style={{ display: 'none' }} />
        </div>
      </Frame>
    );
  }

  return (
    <Frame title={String(data.title || 'Goals')} icon={Target} tone="#1e3a5f">
      <div data-goals-widget data-goals-style={style} className="min-h-full">
        {state && (
          <div data-goals-badge className="text-[10px] font-bold mb-1.5" style={{ color: '#1e3a5f' }}>
            {badge(state)}
          </div>
        )}
        {failed ? failedCard : <div ref={slotRef} data-goals-slot />}
      </div>
    </Frame>
  );
}
