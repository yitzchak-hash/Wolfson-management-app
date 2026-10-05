import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../data/store';
import { describeActivity } from '../../data/activityText';
import { ACTIVITY_UI, foldActivity } from '../../data/activityWords';

/**
 * The live feed, in the top bar.
 *
 * Two people work this board from two machines and the real-time listeners mean
 * things move on your screen that you did not move — so the first question is
 * always "who did that?". This answers it without anybody opening the log.
 *
 * Three things make it read as LIVE rather than as a caption:
 *  - a dot that actually pulses, always, not only when something lands;
 *  - the age of each entry, which counts up on its own rather than being
 *    computed once and quietly going stale while you look at it;
 *  - it stays put. It used to vanish when nothing had happened for fifteen
 *    minutes, which meant the one thing it had to prove — that it is live and
 *    watching — was invisible for most of the day.
 *
 * Clicking it opens the full log, because the next question after "who did
 * that?" is "what else have they done?".
 *
 * It reads the same words and the same consolidation as the log itself
 * (owner, 2026-10-05: it had been saying "updated the viewed" and "set the
 * completedAt to 2026-1…"). Five photos in a row are one line, "Igor
 * uploaded 5 photos", not five turns of the wheel.
 */
export function ActivityTicker({ light }: { light: boolean }) {
  const activityLogs = useStore(s => s.activityLogs);
  const apartments = useStore(s => s.apartments);
  const stages = useStore(s => s.stages);
  const ui = useStore(s => s.mainUiStrings);
  const lang = ui.isRtl ? 'he' : 'en';
  const words = ACTIVITY_UI[lang];
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [pulse, setPulse] = useState(false);
  const lastSeenId = useRef<string | null>(null);

  /**
   * A ticking clock, so "2m ago" becomes "3m ago" while you watch.
   *
   * The age was worked out once when the entry was drawn and then never again,
   * so a feed left open said "just now" about something from an hour ago —
   * which is worse than saying nothing.
   */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Today's changes, newest first and folded — enough to cycle through. */
  const recent = useMemo(() => {
    const cutoff = Date.now() - 12 * 3_600_000;
    const fresh = activityLogs
      .filter(l => new Date(l.createdAt).getTime() > cutoff)
      .slice(0, 80);
    return foldActivity(fresh).slice(0, 8);
  }, [activityLogs]);

  // A genuinely new entry flashes once, then the feed settles into cycling.
  // A run's id is its NEWEST record's, so a sixth photo joining the run is new.
  useEffect(() => {
    const newest = recent[0];
    if (!newest || newest.id === lastSeenId.current) return;
    lastSeenId.current = newest.id;
    setIndex(0);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1600);
    return () => clearTimeout(t);
  }, [recent]);

  useEffect(() => {
    if (recent.length < 2) return;
    const t = setInterval(() => setIndex(i => (i + 1) % recent.length), 4500);
    return () => clearInterval(t);
  }, [recent.length]);

  const entry = recent.length ? recent[Math.min(index, recent.length - 1)] : null;
  const line = entry ? describeActivity(entry.logs, apartments, Date.now(), { lang, stages }) : null;

  return (
    <button
      data-live-feed
      onClick={() => navigate('/activity')}
      className="hidden lg:flex items-center gap-2 min-w-0 max-w-[340px] px-2 py-1 rounded-lg
                 transition-colors hover:bg-white/5"
      title={line ? `${line.who} ${line.what} · ${line.when} — ${words.openLog}`
                  : `${words.nothingToday} — ${words.openLog}`}
    >
      {/* The dot pulses whether or not anything has just landed: a still dot
          says "a label", a beating one says "watching". */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
          style={{ backgroundColor: pulse ? '#4ade80' : '#4aa8d8' }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: pulse ? '#22c55e' : '#4aa8d8' }} />
      </span>

      <span className="text-[9px] font-extrabold tracking-widest flex-shrink-0"
        style={{ color: light ? '#94a3b8' : '#64748b' }}>
        {ui.liveLabel || 'LIVE'}
      </span>

      {line ? (
        <span key={(entry?.id ?? '') + index}
          data-live-line
          className="text-[11px] truncate live-ticker-line text-start"
          style={{ color: '#94a3b8' }}>
          <b className="font-semibold">{line.who}</b> {line.what}
          <span style={{ color: light ? '#cbd5e1' : '#475569' }}> · {line.when}</span>
        </span>
      ) : (
        <span className="text-[11px] truncate" style={{ color: light ? '#cbd5e1' : '#475569' }}>
          {words.nothingToday}
        </span>
      )}
    </button>
  );
}
