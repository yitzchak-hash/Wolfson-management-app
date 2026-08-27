import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Target } from 'lucide-react';
import { useStore } from '../data/store';
import {
  loadGoalsScript, GoalsState, GoalsMountHandle, GOALS_SITE,
} from '../components/board/GoalsWidget';

/**
 * The whole goals board as its own page — the tab beside Dashboard.
 *
 * The owner's ask: the goals WEBSITE, in the app, from a computer (the TV is
 * deliberately not touched — the wall keeps the read-only widget). This
 * mounts the goals app's own embeddable page full-width through `widget.js`
 * — the same sanctioned door the widget uses, because it is the one surface
 * that app promises will work inside a frame — as the full interactive tile
 * grid with the goals app's own header row. Everything on it is live: the
 * timers run, start/finish work, and it polls for changes by itself.
 *
 * The counters from `onState` sit in the page header, and an "open the real
 * site" button covers anything the embed page does not carry. This codebase
 * still never touches `/api/goals` — the standing contract.
 */
export default function GoalsPage() {
  const s = useStore(state => state.mainUiStrings);
  const lang = s.isRtl ? 'he' : 'en';

  const slotRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<GoalsState | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let handle: GoalsMountHandle | null = null;
    let cancelled = false;
    loadGoalsScript()
      .then(api => {
        if (cancelled || !slotRef.current) return;
        handle = api.mount(slotRef.current, {
          view: 'board', lang, interactive: true,
          // The goals app's own header row stays ON here — this page IS the
          // goals website, so it wears that site's face; only the "open the
          // full board" link is off, because we are already standing on it.
          transparent: false, header: true, link: false, height: 'auto',
          onState: (st: GoalsState) => { if (!cancelled) setState(st); },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; handle?.destroy(); };
  }, [lang, retryTick]);

  return (
    <div data-goals-page className="w-full max-w-5xl mx-auto px-3 md:px-6 py-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Target size={18} style={{ color: '#1e3a5f' }} />
        <h1 className="text-lg font-bold text-gray-900 m-0">{s.navGoals}</h1>
        {state && (
          <span data-goals-badge className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#1e3a5f14', color: '#1e3a5f' }}>
            {lang === 'he'
              ? `${state.completed}/${state.total} הושלמו · ${state.inProgress} בתהליך`
              : `${state.completed}/${state.total} done · ${state.inProgress} in progress`}
          </span>
        )}
        <a href={GOALS_SITE} target="_blank" rel="noreferrer"
          className="ms-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
                     border border-gray-200 text-gray-600 hover:text-[#1e3a5f] hover:border-[#1e3a5f]/40 transition-colors">
          <ExternalLink size={12} />
          {lang === 'he' ? 'פתח באתר עצמו' : 'Open the site itself'}
        </a>
      </div>

      {failed ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center rounded-2xl border border-gray-200 bg-white">
          <div className="text-sm font-semibold text-gray-600">
            {lang === 'he' ? 'לוח היעדים לא נטען.' : "Couldn't reach the goals board."}
          </div>
          <button data-goals-retry
            onClick={() => { setFailed(false); setRetryTick(t => t + 1); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}>
            <RefreshCw size={13} /> {lang === 'he' ? 'נסה שוב' : 'Try again'}
          </button>
        </div>
      ) : (
        <div ref={slotRef} data-goals-slot className="rounded-2xl overflow-hidden" />
      )}
    </div>
  );
}
