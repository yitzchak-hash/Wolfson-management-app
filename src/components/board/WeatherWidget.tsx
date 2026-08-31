import React, { useEffect, useState } from 'react';
import { CloudSun, Wind, Droplets, AlertTriangle } from 'lucide-react';
import { CanvasElement } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import { SUN_PLACES } from '../../data/sun';

/**
 * The forecast, for the site.
 *
 * The only widget in the app that needs the internet, and it earns it: rain
 * decides whether a crane lift happens, whether a roof unit goes up, and
 * whether a first fix is worth sending anybody out for. Everything else on the
 * board is data the company already holds.
 *
 * Open-Meteo is used directly rather than through the app's own server because
 * there is no key to hide — it is free, keyless, and sends the headers a
 * browser needs. A proxy would be an extra thing to deploy, an extra thing to
 * break, and would protect nothing.
 */

interface Forecast {
  now: { temp: number; code: number; wind: number; humidity: number };
  days: { date: string; code: number; hi: number; lo: number; rain: number }[];
  at: number;
}

/**
 * WMO weather codes, which is what the forecast speaks.
 *
 * Grouped rather than listed one by one: the difference between "slight" and
 * "moderate" drizzle does not change anybody's morning, and eleven shades of
 * rain on a small tile is noise.
 */
function describe(code: number): { icon: string; word: string; wet: boolean } {
  if (code === 0) return { icon: '☀️', word: 'Clear', wet: false };
  if (code <= 2) return { icon: '🌤️', word: 'Mostly sunny', wet: false };
  if (code === 3) return { icon: '☁️', word: 'Cloudy', wet: false };
  if (code <= 48) return { icon: '🌫️', word: 'Fog', wet: false };
  if (code <= 57) return { icon: '🌦️', word: 'Drizzle', wet: true };
  if (code <= 67) return { icon: '🌧️', word: 'Rain', wet: true };
  if (code <= 77) return { icon: '🌨️', word: 'Snow', wet: true };
  if (code <= 82) return { icon: '🌧️', word: 'Showers', wet: true };
  if (code <= 86) return { icon: '🌨️', word: 'Snow showers', wet: true };
  return { icon: '⛈️', word: 'Storm', wet: true };
}

const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

export function WeatherWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const place = SUN_PLACES.find(p => p.id === (data.placeId ?? 'telaviv')) ?? SUN_PLACES[2];
  /**
   * A forecast handed in rather than fetched.
   *
   * Only the widget store uses it. A card that sits on "loading…" — or worse,
   * fires a request for every scroll of the shelf — is not a preview of
   * anything, and the shelf has no business making network calls.
   */
  const canned = data.sample as Forecast | undefined;
  const [fc, setFc] = useState<Forecast | null>(canned ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (canned) return;
    let cancelled = false;
    const load = async () => {
      try {
        const url = 'https://api.open-meteo.com/v1/forecast'
          + `?latitude=${place.lat}&longitude=${place.lon}`
          + '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m'
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
          + '&timezone=auto&forecast_days=5';
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (cancelled) return;
        setFc({
          now: {
            temp: Math.round(j.current.temperature_2m),
            code: j.current.weather_code,
            wind: Math.round(j.current.wind_speed_10m),
            humidity: Math.round(j.current.relative_humidity_2m),
          },
          days: j.daily.time.map((t: string, i: number) => ({
            date: t,
            code: j.daily.weather_code[i],
            hi: Math.round(j.daily.temperature_2m_max[i]),
            lo: Math.round(j.daily.temperature_2m_min[i]),
            rain: j.daily.precipitation_probability_max?.[i] ?? 0,
          })),
          at: Date.now(),
        });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    load();
    // Half-hourly. A forecast does not change faster than that, and a wall
    // panel left on for a month should not make a request a minute.
    const t = setInterval(load, 30 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [place.id, !!canned]);

  if (failed && !fc) {
    return (
      <Frame title={data.title || `Weather · ${place.name}`} icon={CloudSun} tone="#94a3b8">
        <span className="text-[10px] text-gray-400 flex items-start gap-1">
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
          No forecast — this is the one widget that needs the internet.
        </span>
      </Frame>
    );
  }

  if (!fc) {
    return (
      <Frame title={data.title || `Weather · ${place.name}`} icon={CloudSun}>
        <span className="text-[10px] text-gray-300">loading…</span>
      </Frame>
    );
  }

  const nowW = describe(fc.now.code);
  // The number that actually changes a plan: the worst chance of rain in the
  // next few days. A run of dry days is worth saying nothing about.
  const wettest = fc.days.reduce((w, x) => (x.rain > w.rain ? x : w), fc.days[0]);

  return (
    <Frame title={data.title || `Weather · ${place.name}`} icon={CloudSun}
      tone={wettest.rain >= 50 ? '#0ea5e9' : undefined}>
      <div className="h-full flex flex-col min-h-0 gap-1">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span style={{ fontSize: 30, lineHeight: 1 }}>{nowW.icon}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-black tabular-nums leading-none text-slate-800">
                {fc.now.temp}°
              </span>
              <span className="text-[10.5px] text-gray-400 truncate">{nowW.word}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span className="flex items-center gap-0.5"><Wind size={9} /> {fc.now.wind} km/h</span>
              <span className="flex items-center gap-0.5"><Droplets size={9} /> {fc.now.humidity}%</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex gap-1">
          {fc.days.slice(0, 5).map((day, i) => {
            const w = describe(day.code);
            return (
              <div key={day.date}
                className="flex-1 min-w-0 rounded-md flex flex-col items-center justify-center py-0.5"
                style={{ backgroundColor: day.rain >= 50 ? 'rgba(14,165,233,.12)' : 'rgba(148,163,184,.08)' }}
                title={`${dayName(day.date)} — ${w.word}, ${day.lo}° to ${day.hi}°, ${day.rain}% chance of rain`}>
                <span className="text-[9.5px] font-bold text-slate-500">
                  {i === 0 ? 'today' : dayName(day.date)}
                </span>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>{w.icon}</span>
                <span className="text-[11px] font-black tabular-nums text-slate-700">{day.hi}°</span>
                <span className="text-[9px] tabular-nums text-slate-400">{day.lo}°</span>
                {day.rain >= 30 && (
                  <span className="text-[8.5px] font-bold" style={{ color: '#0ea5e9' }}>{day.rain}%</span>
                )}
              </div>
            );
          })}
        </div>

        {wettest.rain >= 50 && (
          <div className="text-[9.5px] font-semibold flex-shrink-0 truncate" style={{ color: '#0284c7' }}>
            {wettest.rain}% rain {wettest.date === fc.days[0].date ? 'today' : `on ${dayName(wettest.date)}`}
            {' '}— worth checking anything open to the sky.
          </div>
        )}
      </div>
    </Frame>
  );
}
