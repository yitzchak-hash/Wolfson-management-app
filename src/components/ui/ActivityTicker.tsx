import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { useStore } from '../../data/store';
import { describeActivity } from '../../data/activityText';

/**
 * A quiet line showing what just changed.
 *
 * Two people work this board from two machines, and the real-time listeners mean
 * things move on your screen that you did not move. The ticker answers "who did
 * that?" without anyone having to open the activity log.
 *
 * Deliberately restrained: one line, one entry at a time, and it disappears
 * entirely once nothing has happened for a while. A permanent scrolling banner
 * would be noise in a room where the app is open all day.
 */
export function ActivityTicker({ light }: { light: boolean }) {
  const activityLogs = useStore(s => s.activityLogs);
  const apartments = useStore(s => s.apartments);
  const [index, setIndex] = useState(0);
  const [pulse, setPulse] = useState(false);
  const lastSeenId = useRef<string | null>(null);

  /** Only the last quarter hour is interesting; older is history, not news. */
  const recent = useMemo(() => {
    const cutoff = Date.now() - 15 * 60_000;
    return activityLogs
      .filter(l => new Date(l.createdAt).getTime() > cutoff)
      .slice(0, 6);
  }, [activityLogs]);

  // A genuinely new entry flashes once, then the ticker settles into cycling.
  useEffect(() => {
    const newest = recent[0];
    if (!newest || newest.id === lastSeenId.current) return;
    lastSeenId.current = newest.id;
    setIndex(0);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1400);
    return () => clearTimeout(t);
  }, [recent]);

  useEffect(() => {
    if (recent.length < 2) return;
    const t = setInterval(() => setIndex(i => (i + 1) % recent.length), 4500);
    return () => clearInterval(t);
  }, [recent.length]);

  if (recent.length === 0) return null;

  const entry = recent[Math.min(index, recent.length - 1)];
  const { who, what, when } = describeActivity(entry, apartments);

  return (
    <div
      className="hidden lg:flex items-center gap-1.5 min-w-0 max-w-[280px] transition-opacity"
      title={`${who} ${what} · ${when}`}
    >
      <Activity
        size={12}
        className={pulse ? 'animate-ping' : ''}
        style={{ color: pulse ? '#4ade80' : light ? '#cbd5e1' : '#64748b' }}
      />
      <span
        key={entry.id + index}
        className="text-[11px] truncate live-ticker-line"
        style={{ color: light ? '#94a3b8' : '#94a3b8' }}
      >
        <b className="font-semibold">{who}</b> {what} · {when}
      </span>
    </div>
  );
}
