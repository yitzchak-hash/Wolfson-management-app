/**
 * Sunrise and sunset, with no library and no network.
 *
 * Candle lighting is not a fixed time — it is sunset minus a few minutes, and
 * sunset moves by more than three hours across the year. Anything that hard-
 * codes a Friday cut-off is wrong for most of the year, and a widget that tells
 * the office the wrong time to send a van home is worse than no widget.
 *
 * This is the standard NOAA solar-position calculation. It is a page of
 * arithmetic, it needs nothing but a date and a coordinate, and it agrees with
 * the published tables to well within a minute — which is far tighter than the
 * custom it feeds, where the difference between an 18 and a 40 minute cushion
 * is the actual question.
 */

const rad = Math.PI / 180;
const deg = 180 / Math.PI;

export interface SunTimes {
  /** Local Date objects, or null on a day the sun never sets or never rises. */
  sunrise: Date | null;
  sunset: Date | null;
  /** Solar noon, which always exists. */
  noon: Date;
}

/**
 * Sunrise and sunset for one calendar day at one place.
 *
 * `lat` north-positive, `lon` east-positive — the convention every mapping
 * tool uses, and the one Israel's coordinates are quoted in. The day taken is
 * the LOCAL calendar day of the date handed in, because that is the day whose
 * sunset somebody is asking about.
 *
 * This is NOAA's full solar-position method rather than the short form. The
 * short form is a well-known page of trigonometry and it is out by up to three
 * minutes, which is fine for a sun dial and not fine for candle lighting: the
 * error is not evenly signed, and being two minutes LATE is the direction that
 * matters. The extra terms below — the equation of time proper, the correction
 * for nutation, and the obliquity of the ecliptic rather than a constant — are
 * what take it under a minute.
 */
export function sunTimes(date: Date, lat: number, lon: number, zenith = 90.833): SunTimes {
  // Noon of the local day, expressed as a Julian day, which is what the whole
  // calculation is referenced to.
  const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const jd = localNoon.getTime() / 86_400_000 + 2_440_587.5;
  const T = (jd - 2_451_545) / 36_525;

  const L0 = mod360(280.46646 + T * (36_000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * rad) * 0.000289;

  const trueLong = L0 + C;
  const omegaNut = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omegaNut * rad);

  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omegaNut * rad);

  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(appLong * rad));

  // The equation of time, in minutes — the difference between clock noon and
  // the sun actually being due south. It swings by a quarter of an hour across
  // the year, and leaving it out is most of the error in the short method.
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime = 4 * deg * (
    y * Math.sin(2 * L0 * rad)
    - 2 * e * Math.sin(M * rad)
    + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
    - 0.5 * y * y * Math.sin(4 * L0 * rad)
    - 1.25 * e * e * Math.sin(2 * M * rad)
  );

  // 90.833° from the zenith by default: the sun's own radius plus the standard
  // allowance for atmospheric refraction, which is why sunset is a couple of
  // minutes later than a flat geometric horizon would give. A larger angle
  // asks a different question — 98.5° is the sun 8.5° down, which is nightfall.
  const cosHA = Math.cos(zenith * rad) / (Math.cos(lat * rad) * Math.cos(decl))
    - Math.tan(lat * rad) * Math.tan(decl);

  const utcMidnight = Date.UTC(
    localNoon.getFullYear(), localNoon.getMonth(), localNoon.getDate(), 0, 0, 0, 0);
  const atMinutes = (m: number) => new Date(utcMidnight + m * 60_000);
  const noon = atMinutes(720 - 4 * lon - eqTime);

  if (cosHA > 1 || cosHA < -1) {
    // Polar day or polar night. Nowhere this app operates, but returning a
    // silently wrong time would be worse than saying there isn't one.
    return { sunrise: null, sunset: null, noon };
  }

  const ha = Math.acos(cosHA) * deg;
  return {
    sunrise: atMinutes(720 - 4 * (lon + ha) - eqTime),
    sunset: atMinutes(720 - 4 * (lon - ha) - eqTime),
    noon,
  };
}

const mod360 = (x: number) => ((x % 360) + 360) % 360;

/** Israel's default coordinate — the middle of the country, near Modi'in. */
export const ISRAEL_CENTRE = { lat: 31.9, lon: 35.0 };

/**
 * Nightfall — the sun 8.5° below the horizon.
 *
 * Havdalah is not "sunset plus a fixed number of minutes": the sun takes
 * longer to get 8.5° down in summer than in winter, and longer the further
 * north you are, so a fixed offset drifts by several minutes across the year.
 * This is the same calculation asking about a lower sun, which costs nothing
 * and is what Hebcal and the printed tables use.
 */
export function nightfall(date: Date, lat: number, lon: number, degreesBelow = 8.5): Date | null {
  return sunTimes(date, lat, lon, 90 + degreesBelow).sunset;
}

export interface SunPlace {
  id: string; name: string; lat: number; lon: number;
  /** Minutes before sunset the candles are lit, by that city's custom. */
  candleMinutes: number;
}

export const SUN_PLACES: SunPlace[] = [
  // Jerusalem keeps 40 minutes and Haifa 30 by long-standing local custom;
  // the rest of Israel is 20. These match the times Hebcal publishes, which is
  // what the office would otherwise be reading off a printed sheet. Every one
  // is settable on the widget — this is only the starting point.
  { id: 'jerusalem', name: 'Jerusalem', lat: 31.7683, lon: 35.2137, candleMinutes: 40 },
  { id: 'haifa', name: 'Haifa', lat: 32.7940, lon: 34.9896, candleMinutes: 30 },
  { id: 'telaviv', name: 'Tel Aviv', lat: 32.0853, lon: 34.7818, candleMinutes: 20 },
  { id: 'beersheva', name: "Be'er Sheva", lat: 31.2530, lon: 34.7915, candleMinutes: 20 },
  { id: 'netanya', name: 'Netanya', lat: 32.3215, lon: 34.8532, candleMinutes: 20 },
  { id: 'modiin', name: "Modi'in", lat: 31.8928, lon: 35.0104, candleMinutes: 20 },
  { id: 'ashdod', name: 'Ashdod', lat: 31.8044, lon: 34.6553, candleMinutes: 20 },
  { id: 'bneibrak', name: 'Bnei Brak', lat: 32.0807, lon: 34.8338, candleMinutes: 20 },
  { id: 'kiryatgat', name: 'Kiryat Gat', lat: 31.6100, lon: 34.7642, candleMinutes: 20 },
  { id: 'beitshemesh', name: 'Beit Shemesh', lat: 31.7457, lon: 34.9887, candleMinutes: 20 },
];

export interface ShabbatWindow {
  /** When the candles are lit — sunset on Friday, less the cushion. */
  start: Date;
  /** Havdalah — nightfall on Saturday. */
  end: Date;
  /** Friday's sunset itself, for drawing the dial. */
  sunset: Date;
  /** True while now falls between the two. */
  inShabbat: boolean;
  /** The next boundary to count down to, and which one it is. */
  next: Date;
  nextIs: 'start' | 'end';
}

/**
 * This week's Shabbat, from any moment.
 *
 * "Next Friday" is not enough: at nine on a Saturday morning the answer the
 * office wants is when Shabbat ENDS, not when the following one starts. So the
 * window is worked out first and the countdown picks whichever edge is ahead.
 */
export function shabbatWindow(
  now: Date,
  lat: number,
  lon: number,
  candleMinutes = 20,
  havdalahDegrees = 8.5,
): ShabbatWindow {
  const friday = new Date(now);
  friday.setHours(12, 0, 0, 0);
  // Walk back to the Friday of this week, then forward a week if that Shabbat
  // is already over.
  friday.setDate(friday.getDate() - ((friday.getDay() - 5 + 7) % 7));

  /**
   * Both edges are rounded the SAFE way — candles down to the minute, havdalah
   * up. The astronomy is good to about half a minute, and half a minute of
   * uncertainty either side of a religious boundary should never fall on the
   * side that says there is more time than there is. It also happens to be
   * what the printed sheets do, so the two agree far more often.
   */
  const floorMin = (t: Date) => new Date(Math.floor(t.getTime() / 60_000) * 60_000);
  const ceilMin = (t: Date) => new Date(Math.ceil(t.getTime() / 60_000) * 60_000);

  const build = (fri: Date) => {
    const sat = new Date(fri); sat.setDate(sat.getDate() + 1);
    const sunset = sunTimes(fri, lat, lon).sunset ?? fri;
    const end = nightfall(sat, lat, lon, havdalahDegrees)
      ?? new Date((sunTimes(sat, lat, lon).sunset ?? sat).getTime() + 42 * 60_000);
    return {
      sunset,
      start: new Date(floorMin(sunset).getTime() - candleMinutes * 60_000),
      end: ceilMin(end),
    };
  };

  let w = build(friday);
  if (now.getTime() > w.end.getTime()) {
    const next = new Date(friday); next.setDate(next.getDate() + 7);
    w = build(next);
  }

  const inShabbat = now.getTime() >= w.start.getTime() && now.getTime() <= w.end.getTime();
  return {
    ...w,
    inShabbat,
    next: inShabbat ? w.end : w.start,
    nextIs: inShabbat ? 'end' : 'start',
  };
}
