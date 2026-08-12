import React, { useMemo } from 'react';
import { Globe2, Flame } from 'lucide-react';
import { CanvasElement } from '../../types';
import { Frame, d, useTick } from '../../data/widgets';
import { sunTimes, shabbatWindow, SUN_PLACES } from '../../data/sun';
import { hebrewLabel } from '../../data/hebrewDates';

/**
 * The two widgets about time itself.
 *
 * Both exist because the office repeatedly works something out on its fingers:
 * what time it is where a supplier is, and how long is left before the vans
 * have to be back. Neither is data the app holds — both are arithmetic the
 * browser can do perfectly and a person cannot.
 */

// ─── World clocks ────────────────────────────────────────────────────────────

export interface WorldCity {
  id: string;
  name: string;
  tz: string;
  lat?: number;
  lon?: number;
  /** Which two days are the weekend there. */
  weekend?: 'satsun' | 'frisat';
}

/**
 * Cities worth having on a board in this trade — where the equipment comes
 * from, where the money is, and where the family is.
 */
export const WORLD_CITIES: WorldCity[] = [
  { id: 'il', name: 'Israel', tz: 'Asia/Jerusalem', lat: 32.08, lon: 34.78, weekend: 'frisat' },
  { id: 'ny', name: 'New York', tz: 'America/New_York', lat: 40.71, lon: -74.01 },
  { id: 'la', name: 'Los Angeles', tz: 'America/Los_Angeles', lat: 34.05, lon: -118.24 },
  { id: 'tor', name: 'Toronto', tz: 'America/Toronto', lat: 43.65, lon: -79.38 },
  { id: 'lon', name: 'London', tz: 'Europe/London', lat: 51.51, lon: -0.13 },
  { id: 'ant', name: 'Antwerp', tz: 'Europe/Brussels', lat: 51.22, lon: 4.40 },
  { id: 'par', name: 'Paris', tz: 'Europe/Paris', lat: 48.86, lon: 2.35 },
  { id: 'ber', name: 'Berlin', tz: 'Europe/Berlin', lat: 52.52, lon: 13.40 },
  { id: 'mil', name: 'Milan', tz: 'Europe/Rome', lat: 45.46, lon: 9.19 },
  { id: 'ist', name: 'Istanbul', tz: 'Europe/Istanbul', lat: 41.01, lon: 28.98 },
  { id: 'mos', name: 'Moscow', tz: 'Europe/Moscow', lat: 55.76, lon: 37.62 },
  { id: 'dub', name: 'Dubai', tz: 'Asia/Dubai', lat: 25.20, lon: 55.27, weekend: 'satsun' },
  { id: 'mum', name: 'Mumbai', tz: 'Asia/Kolkata', lat: 19.08, lon: 72.88 },
  { id: 'bkk', name: 'Bangkok', tz: 'Asia/Bangkok', lat: 13.76, lon: 100.50 },
  { id: 'sha', name: 'Shanghai', tz: 'Asia/Shanghai', lat: 31.23, lon: 121.47 },
  { id: 'hk', name: 'Hong Kong', tz: 'Asia/Hong_Kong', lat: 22.32, lon: 114.17 },
  { id: 'tok', name: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.69 },
  { id: 'syd', name: 'Sydney', tz: 'Australia/Sydney', lat: -33.87, lon: 151.21 },
  { id: 'jnb', name: 'Johannesburg', tz: 'Africa/Johannesburg', lat: -26.20, lon: 28.05 },
  { id: 'sao', name: 'São Paulo', tz: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 },
];

/** A list that may have been typed as one line or stored as an array. */
export function listOf(v: unknown, fallback: string[]): string[] {
  const out = Array.isArray(v)
    ? v.map(x => String(x).trim())
    : String(v ?? '').split(',').map(x => x.trim());
  const clean = out.filter(Boolean);
  return clean.length ? clean : fallback;
}

/** The wall-clock parts in a zone, without constructing a fake Date. */
function partsIn(tz: string, now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      weekday: 'short', day: 'numeric', month: 'short',
    }).formatToParts(now).map(x => [x.type, x.value]),
  );
  // '24' is what en-GB gives for midnight in hour12:false, which would sort
  // and draw as a day that has 25 hours in it.
  const hour = Number(p.hour) % 24;
  return {
    hour, minute: Number(p.minute), weekday: String(p.weekday),
    date: `${p.day} ${p.month}`,
    label: `${String(hour).padStart(2, '0')}:${p.minute}`,
  };
}

export function WorldClocks({ el }: { el: CanvasElement }) {
  useTick(true, 20_000);
  const data = d(el);
  // The settings form writes a comma-separated string; the seed and the store
  // preview hold an array. Both have to work, or editing the list once turns
  // the widget into a single city called "il, ny, lon".
  const ids: string[] = listOf(data.cities, ['il', 'ny', 'lon', 'sha']);
  const from = Number(data.workStart ?? 9);
  const to = Number(data.workEnd ?? 17);
  const now = new Date();

  const rows = ids
    .map(id => WORLD_CITIES.find(c => c.id === id) ?? { id, name: id, tz: id } as WorldCity)
    .map(city => {
      const p = partsIn(city.tz, now);
      const weekendDays = city.weekend === 'frisat' ? ['Fri', 'Sat'] : ['Sat', 'Sun'];
      const off = weekendDays.includes(p.weekday);
      const atDesk = !off && p.hour >= from && p.hour < to;

      /**
       * Light or dark from the real sun where a coordinate is known.
       *
       * A fixed "six to six" is wrong by hours at any latitude in winter, and
       * the whole point of the row is telling you at a glance whether the
       * person you want to ring is awake.
       */
      let day = p.hour >= 6 && p.hour < 18;
      if (city.lat !== undefined && city.lon !== undefined) {
        const t = sunTimes(now, city.lat, city.lon);
        if (t.sunrise && t.sunset) {
          day = now.getTime() >= t.sunrise.getTime() && now.getTime() < t.sunset.getTime();
        }
      }
      return { city, p, atDesk, off, day };
    });

  return (
    <Frame title={data.title || 'World clocks'} icon={Globe2}>
      <div className="h-full overflow-y-auto pr-1 flex flex-col gap-[3px]">
        {rows.map(({ city, p, atDesk, off, day }) => (
          <div key={city.id} className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-[2px]"
            style={{ backgroundColor: day ? 'rgba(254,243,199,.55)' : 'rgba(30,58,95,.06)' }}>
            <span className="text-[11px] flex-shrink-0" title={day ? 'daylight there' : 'dark there'}>
              {day ? '☀️' : '🌙'}
            </span>
            <span className="text-[10.5px] font-semibold text-slate-700 flex-1 truncate">{city.name}</span>
            {/* A green dot means somebody is likely to pick up. */}
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: atDesk ? '#16a34a' : off ? '#cbd5e1' : '#f59e0b' }}
              title={off ? 'their weekend' : atDesk ? 'working hours there' : 'outside working hours'} />
            <span className="text-[11px] font-black tabular-nums text-slate-800 flex-shrink-0">
              {p.label}
            </span>
            <span className="text-[8px] text-slate-400 w-[22px] flex-shrink-0">{p.weekday}</span>
          </div>
        ))}
        {rows.length === 0 && <span className="text-[10px] text-gray-400">Pick some cities in the settings.</span>}
      </div>
    </Frame>
  );
}

// ─── Shabbat and sun clock ───────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (t: Date) => `${pad(t.getHours())}:${pad(t.getMinutes())}`;

/** A countdown as words, biggest unit first, never more than two units. */
function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60_000);
  const days = Math.floor(m / 1440), hours = Math.floor((m % 1440) / 60), mins = m % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${pad(mins)}m`;
  return `${mins}m`;
}

/**
 * A point on the 24-hour dial. Midnight at the top, noon at the bottom.
 *
 * Sine on x and minus-cosine on y is the rotation: a plain polar conversion
 * puts zero at three o'clock, which would draw midnight on the right-hand side
 * and make the whole dial unreadable.
 */
function dialPoint(t: Date, r: number, cx: number, cy: number) {
  const frac = (t.getHours() * 60 + t.getMinutes()) / 1440;
  return { x: cx + r * Math.sin(frac * 2 * Math.PI), y: cy - r * Math.cos(frac * 2 * Math.PI) };
}

function arcPath(from: Date, to: Date, r: number, cx: number, cy: number) {
  const a = dialPoint(from, r, cx, cy);
  const b = dialPoint(to, r, cx, cy);
  const mins = (t: Date) => t.getHours() * 60 + t.getMinutes();
  const large = ((mins(to) - mins(from) + 1440) % 1440) > 720 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function ShabbatClock({ el }: { el: CanvasElement }) {
  useTick(true, 15_000);
  const data = d(el);
  const place = SUN_PLACES.find(p => p.id === (data.placeId ?? 'telaviv')) ?? SUN_PLACES[2];
  const candleMinutes = Number(data.candleMinutes ?? place.candleMinutes);
  // How long before candle lighting the last van has to leave. The number the
  // office actually argues about on a Friday.
  const vanBuffer = Number(data.vanBuffer ?? 90);

  const now = new Date();
  const w = useMemo(
    () => shabbatWindow(now, place.lat, place.lon, candleMinutes),
    // Recomputed every tick on purpose — it is cheap, and a memo keyed on the
    // minute would still have to be invalidated by the same tick.
    [now.getTime(), place.id, candleMinutes],
  );
  const sun = sunTimes(now, place.lat, place.lon);
  const van = new Date(w.start.getTime() - vanBuffer * 60_000);

  const S = 100, cx = S / 2, cy = S / 2, R = 40;
  const nowPt = dialPoint(now, R, cx, cy);

  const next = w.nextIs === 'start' ? w.start : w.end;
  const vanAhead = now.getTime() < van.getTime();

  return (
    <Frame title={data.title || `Shabbat · ${place.name}`} icon={Flame} tone="#b45309">
      <div className="h-full flex gap-2 min-h-0">
        <svg viewBox={`0 0 ${S} ${S}`} className="h-full flex-shrink-0" style={{ aspectRatio: '1' }}>
          {/* Night is the ground the day is drawn on, so an arc is enough. */}
          <circle cx={cx} cy={cy} r={R} fill="#0f172a" opacity={0.08} />
          {sun.sunrise && sun.sunset && (
            <path d={arcPath(sun.sunrise, sun.sunset, R, cx, cy)}
              stroke="#fcd34d" strokeWidth={7} fill="none" strokeLinecap="round" />
          )}
          {[0, 6, 12, 18].map(h => {
            const t = new Date(now); t.setHours(h, 0, 0, 0);
            const a = dialPoint(t, R + 6, cx, cy);
            return <text key={h} x={a.x} y={a.y + 2} textAnchor="middle"
              className="fill-slate-400" style={{ fontSize: 6 }}>{h}</text>;
          })}

          {/* The three moments, only when they fall inside the day being drawn. */}
          {[
            { t: van, c: '#f59e0b', k: 'van' },
            { t: w.start, c: '#dc2626', k: 'candles' },
            { t: w.end, c: '#7c3aed', k: 'havdalah' },
          ].map(({ t, c, k }) => {
            const p1 = dialPoint(t, R - 7, cx, cy);
            const p2 = dialPoint(t, R + 4, cx, cy);
            return <line key={k} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={c} strokeWidth={2.2} strokeLinecap="round" />;
          })}

          {/* Now. */}
          <line x1={cx} y1={cy} x2={nowPt.x} y2={nowPt.y} stroke="#1e3a5f" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={2.4} fill="#1e3a5f" />
        </svg>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="text-[8.5px] font-bold tracking-wide uppercase"
            style={{ color: w.inShabbat ? '#7c3aed' : '#b45309' }}>
            {w.inShabbat ? 'Shabbat ends in' : vanAhead ? 'Last van leaves in' : 'Candle lighting in'}
          </div>
          <div className="text-[21px] font-black leading-none tabular-nums text-slate-800">
            {countdown((w.inShabbat ? w.end : vanAhead ? van : w.start).getTime() - now.getTime())}
          </div>
          <div className="text-[9px] text-slate-500 mt-1 leading-snug">
            <div>🕯 {hhmm(w.start)} · ✨ {hhmm(w.end)}</div>
            <div className="text-slate-400">
              🚐 {hhmm(van)} · {hebrewLabel(now)}
            </div>
          </div>
          {!w.inShabbat && (
            <div className="text-[8px] text-slate-300 truncate">
              {next.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
}
