import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Crosshair, Loader2 , LocateFixed } from 'lucide-react';
import { CanvasElement, isCountableApartment, personColor } from '../../types';
import { daysOf } from '../../data/taskDays';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import {
  LatLon, TILE, lonToX, latToY, xToLon, yToLat, fitBounds, scatterAround, geocodeAddress,
} from '../../data/geocode';

/** Tiles the browser has already shown once — they never fade in again. */
const loadedTileUrls = new Set<string>();

/**
 * A real street map, on the board.
 *
 * An outline of the country with dots on it was the cheap version, and it
 * answers the wrong question: seeing that four jobs are "near Netanya" is not
 * useful, seeing which street each is on is. So this draws actual map tiles,
 * pans and zooms like every map anybody has used, and puts the jobs on it.
 *
 * It is written by hand rather than with a mapping library. A slippy map is a
 * grid of 256-pixel images addressed by zoom, x and y, plus the Mercator
 * projection to place a coordinate — about a hundred lines. A library would be
 * hundreds of kilobytes and would need its own CSS, its own pointer handling,
 * and its own escape from the board's drag system, which is the part that
 * would actually have been hard.
 *
 * Positions come from the address field that is already typed on a job. A job
 * with no address still appears, out in the middle of the country with a red
 * exclamation over it, named after whoever is assigned to it — so an address
 * nobody has filled in is visible as a gap rather than as an absence.
 */

const ISRAEL: LatLon = { lat: 31.9, lon: 35.0 };
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;

interface Marker {
  id: string;
  at: LatLon;
  label: string;
  colour: string;
  jobId?: string;
  /** True for a job with no usable address — drawn with a warning. */
  unplaced: boolean;
  sub?: string;
  /** What the hover card shows: the job, in a sentence and a few pictures. */
  stageName?: string;
  address?: string;
  who?: string;
  openTasks?: number;
  photos?: string[];
}

export function MapWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 200 });

  /**
   * Everything looked up so far, address → coordinate.
   *
   * Seeded from what the node has stored, so a board that has settled once
   * makes no network requests at all on the next load — and because the node
   * syncs, one machine doing the looking up spares every other machine.
   */
  const [geo, setGeo] = useState<Record<string, LatLon | null>>(
    () => (data.geo as Record<string, LatLon | null>) ?? {});
  const [looking, setLooking] = useState(0);

  const [view, setView] = useState<{ center: LatLon; zoom: number } | null>(null);
  /** The last geolocation fix, drawn as the blue dot. Session-only. */
  const [myFix, setMyFix] = useState<LatLon | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /**
   * Whether the gesture that just ended was a drag.
   *
   * A click fires after the pointer is released, by which time `drag` has been
   * cleared — so the pin's own handler has no way to know it was dragged
   * ACROSS rather than pressed. Without this, panning the map by starting the
   * drag on top of a pin ended by opening that job, which reads as the map
   * randomly opening things.
   */
  const dragged = useRef(false);
  const viewRef = useRef<{ center: LatLon; zoom: number } | null>(null);
  viewRef.current = view;

  const tileUrl = String(data.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');

  // ── what goes on the map ──────────────────────────────────────────────────
  /**
   * The owner's filter, from the pencil: everything, only jobs that have an
   * address (the red scattered no-address pins hidden), or TODAY'S WORK —
   * only jobs with an open task covering today, which is the "where are my
   * crews right now" view. Today goes through the task's whole day list, so
   * day two of a three-day job still shows.
   */
  const showMode = String(data.show || 'all');
  const allJobs = useMemo(() => c.jobs.filter(isCountableApartment), [c.jobs]);
  const jobs = useMemo(() => {
    if (showMode !== 'today') return allJobs;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ids = new Set((c.assignments ?? [])
      .filter(a => !a.completedAt && daysOf(a).includes(todayKey))
      .map(a => a.apartmentId));
    return allJobs.filter(j => ids.has(j.id));
  }, [allJobs, showMode, c.assignments]);

  const addresses = useMemo(
    () => [...new Set(jobs.map(j => (j.address ?? '').trim()).filter(Boolean))],
    [jobs]);

  /**
   * Look up whatever has not been looked up yet, one at a time.
   *
   * Serial rather than parallel because the geocoder allows one request a
   * second and refuses — permanently — anybody who ignores that. Results are
   * written back to the node in ONE update at the end of the run rather than
   * per address, so forty jobs cost one sync rather than forty.
   */
  useEffect(() => {
    let cancelled = false;
    const todo = addresses.filter(a => !(a in geo));
    if (!todo.length) return;

    (async () => {
      const found: Record<string, LatLon | null> = {};
      for (const address of todo) {
        if (cancelled) return;
        setLooking(todo.length - Object.keys(found).length);
        const r = await geocodeAddress(address);
        // A failure is NOT recorded. Recording it would cache a network blip
        // as "this address does not exist" for as long as the board lives.
        if (r.kind === 'hit') found[address] = r.at;
        else if (r.kind === 'miss') found[address] = null;
      }
      if (cancelled) return;
      setLooking(0);
      if (!Object.keys(found).length) return;
      setGeo(prev => {
        const next = { ...prev, ...found };
        // The TV must not write. It renders the same map from the same cache
        // and simply looks anything missing up again for itself.
        if (!c.readOnly) c.update({ data: { ...d(el), geo: next } });
        return next;
      });
    })();

    return () => { cancelled = true; };
    // Keyed on the addresses themselves: adding a job with a new address
    // should start a run, and moving the node should not.
  }, [addresses.join('|')]);

  /**
   * The newest pictures back from site, per job.
   *
   * A photo knows its TASK, and a task knows its job — so the chain is
   * photo → assignment → apartment. Built once for every job on the map
   * rather than per hover, so moving the pointer across a busy map does not
   * re-walk the whole photo list each time.
   */
  const photosByJob = useMemo(() => {
    const jobOfAssignment = new Map((c.assignments ?? []).map(a => [a.id, a.apartmentId]));
    const out = new Map<string, string[]>();
    for (const p of c.photos ?? []) {
      const jid = p.assignmentId ? jobOfAssignment.get(p.assignmentId) : undefined;
      if (!jid) continue;
      const url = p.storageUrl || p.dataUrl || p.driveUrl;
      if (!url) continue;
      const list = out.get(jid) ?? [];
      if (list.length < 3) list.push(url);
      out.set(jid, list);
    }
    return out;
  }, [c.photos, c.assignments]);

  const markers: Marker[] = useMemo(() => jobs.flatMap(j => {
    const address = (j.address ?? '').trim();
    const at = address ? geo[address] : undefined;
    const name = j.displayName?.trim() || j.apartmentNumber || 'Job';
    const openTasks = (c.assignments ?? []).filter(a => a.apartmentId === j.id && !a.completedAt).length;
    const booked = (c.assignments ?? []).find(a => a.apartmentId === j.id && !a.completedAt);
    const bookedWho = booked ? c.contractors.find(x => x.id === booked.contractorId)?.name : undefined;
    const photos = photosByJob.get(j.id) ?? [];
    // Only-with-address: the red scattered pins are hidden outright.
    if (!at && showMode === 'addressed') return [];

    if (at) {
      const stage = c.stages.find(s => s.id === j.currentStageId);
      return {
        id: j.id, at, jobId: j.id,
        // Today's-work pins are named after the WORKER there — the map is
        // answering "where are my crews", not "what is this job called".
        label: showMode === 'today' && bookedWho ? bookedWho : name,
        sub: showMode === 'today' && bookedWho ? name : address,
        colour: stage?.color ?? '#4aa8d8', unplaced: false,
        stageName: stage?.name, address, who: bookedWho, openTasks, photos,
      };
    }

    /**
     * No address, or one nothing could find.
     *
     * The job is still shown — out in the middle of the country, marked with a
     * red exclamation, and named after whoever is assigned to it, because
     * "Igor has a job with no address on it" is a more useful sentence than
     * the job silently not being on the map at all.
     */
    const task = c.assignments.find(a => a.apartmentId === j.id && !a.completedAt)
      ?? c.assignments.find(a => a.apartmentId === j.id);
    const who = task ? c.contractors.find(x => x.id === task.contractorId) : undefined;
    return {
      id: j.id,
      at: scatterAround(ISRAEL, j.id),
      jobId: j.id,
      label: who?.name ?? name,
      sub: who ? name : 'no address on it',
      colour: who ? personColor(who.name, who.color) : '#94a3b8',
      unplaced: true,
      stageName: c.stages.find(s => s.id === j.currentStageId)?.name,
      address: '', who: bookedWho, openTasks, photos,
    };
  }), [jobs, geo, c.stages, c.assignments, c.contractors, photosByJob]);

  // ── size, and the first view ──────────────────────────────────────────────
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    // Damped (the standing measure rule) — a measure never feeds its own loop.
    const read = () => setSize(prev => {
      const w = node.clientWidth || 300, h = node.clientHeight || 200;
      return prev.w === w && prev.h === h ? prev : { w, h };
    });
    const ro = new ResizeObserver(read);
    ro.observe(node);
    read();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (view) return;
    const saved = data.view as { center: LatLon; zoom: number } | undefined;
    if (saved?.center) { setView(saved); return; }
    // Fit to whatever is placed. Unplaced markers are excluded from the fit —
    // one of them out in the desert would zoom the whole map out to nothing.
    const placed = markers.filter(m => !m.unplaced).map(m => m.at);
    setView(fitBounds(placed, size.w, size.h));
  }, [markers.length, size.w, size.h]);

  const v = view ?? { center: ISRAEL, zoom: 7 };
  const z = Math.round(v.zoom);

  /**
   * What is already in the browser's hands.
   *
   * A tile that has loaded once never flashes again; a tile that failed is
   * drawn as quiet grey rather than a broken-image icon. Module-level so the
   * memory survives re-renders and even a re-mount of the widget.
   */
  const loadedTiles = loadedTileUrls;
  const [, bumpTiles] = useState(0);

  /**
   * The OLD view, kept underneath while the new zoom's tiles arrive.
   *
   * Without this every zoom step was a white flash and the map read as
   * broken. The previous layer is the tiles that were on screen, scaled and
   * shifted to where they now belong, cleared shortly after the new ones have
   * had their chance.
   */
  const [under, setUnder] = useState<{
    tiles: { key: string; url: string; left: number; top: number }[];
    scale: number; ox: number; oy: number;
  } | null>(null);
  const lastFrame = useRef<{ z: number; tiles: { key: string; url: string; left: number; top: number }[] } | null>(null);

  // The world pixel at the top-left corner of the box.
  const originX = lonToX(v.center.lon, z) - size.w / 2;
  const originY = latToY(v.center.lat, z) - size.h / 2;

  const tiles = useMemo(() => {
    const out: { key: string; url: string; left: number; top: number }[] = [];
    const n = 2 ** z;
    const x0 = Math.floor(originX / TILE), x1 = Math.floor((originX + size.w) / TILE);
    const y0 = Math.floor(originY / TILE), y1 = Math.floor((originY + size.h) / TILE);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // y outside the world has no tile; x wraps, because the world does.
        if (y < 0 || y >= n) continue;
        const wx = ((x % n) + n) % n;
        out.push({
          key: `${z}/${x}/${y}`,
          url: tileUrl.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(y)),
          left: x * TILE - originX,
          top: y * TILE - originY,
        });
      }
    }
    return out;
  }, [z, originX, originY, size.w, size.h, tileUrl]);

  // A zoom change: park the last frame underneath, scaled to the new world.
  // It stays until the NEW tiles have genuinely arrived — a fixed timeout was
  // tuned against stubbed instant tiles, and real tiles on a site connection
  // outlived it, which is exactly the 'blanks out when I zoom' report.
  useEffect(() => {
    const prev = lastFrame.current;
    if (prev && prev.z !== z && prev.tiles.length) {
      const scale = 2 ** (z - prev.z);
      setUnder({ tiles: prev.tiles, scale, ox: 0, oy: 0 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z]);
  /**
   * Remember the frame AFTER the underlay effect has had its look.
   *
   * As a plain render-body assignment this ran during the z=8 render — before
   * the effect above committed — so the effect always compared the new frame
   * with itself and the underlay never appeared. Effects run in declaration
   * order after commit, so this one, declared second, records the frame the
   * NEXT zoom will need.
   */
  useEffect(() => { lastFrame.current = { z, tiles }; });

  // Enough of the current view has loaded → the old picture may go. Checked on
  // every tile-load bump; a 5s ceiling covers a tile server having a bad day.
  useEffect(() => {
    if (!under) return;
    const have = tiles.filter(t => loadedTiles.has(t.url)).length;
    if (tiles.length > 0 && have >= Math.ceil(tiles.length * 0.6)) {
      // Loaded is not yet VISIBLE: the new tiles fade in over 180ms, and
      // retiring the old picture the instant the bytes arrive left a one-
      // fade-long dim flash. The handover waits for the fade.
      const done = setTimeout(() => setUnder(null), 280);
      return () => clearTimeout(done);
    }
    const cap = setTimeout(() => setUnder(null), 5000);
    return () => clearTimeout(cap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, tiles, loadedTiles.size]);

  const place = (at: LatLon) => ({
    left: lonToX(at.lon, z) - originX,
    top: latToY(at.lat, z) - originY,
  });

  /**
   * Pixels are meaningless without saying WHICH zoom's pixels.
   *
   * This closed over the render's `z`, so zoomAt — which computes the new
   * centre in the NEW zoom's pixels — converted them at the OLD zoom, and
   * every zoom doubled the longitude: 34.8° → 250° → 680° → off the world,
   * where there are no tiles. Which is precisely 'every time I zoom in, it
   * blanks out' and why the buttons seemed dead. The zoom is now an explicit
   * argument, so the mistake cannot be re-made silently.
   */
  const setCenterFromPixel = (px: number, py: number, atZoom: number) =>
    ({ lat: yToLat(py, atZoom), lon: xToLon(px, atZoom) });

  /**
   * Screen pixels → the map's OWN pixels.
   *
   * The map draws inside `WidgetSurface`'s scale (and the board's zoom, and
   * the wall's), so `getBoundingClientRect()` is in SCALED screen pixels
   * while `size.w` is local units. Raw `clientX - r.left` was therefore
   * wrong at any scale but 1 — which is why the wheel did not zoom to where
   * the mouse was, and why a drag panned at the wrong speed on a resized
   * widget. The ratio of the rect to the client box is the live scale (the
   * ScreenReport idiom: measure, never trust a prop).
   */
  const localScale = () => {
    const node = box.current;
    if (!node || node.clientWidth === 0) return 1;
    const k = node.getBoundingClientRect().width / node.clientWidth;
    return k > 0.01 ? k : 1;
  };

  /** Zoom, keeping whatever is under the pointer under the pointer. */
  const zoomAt = (delta: number, clientX?: number, clientY?: number) => {
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
    if (nz === z) return;
    const r = box.current?.getBoundingClientRect();
    const k = localScale();
    const ox = clientX !== undefined && r ? (clientX - r.left) / k : size.w / 2;
    const oy = clientY !== undefined && r ? (clientY - r.top) / k : size.h / 2;
    // The world point under the cursor, before and after — the difference is
    // how far the centre has to move so it stays put.
    const worldLon = xToLon(originX + ox, z);
    const worldLat = yToLat(originY + oy, z);
    const nx = lonToX(worldLon, nz) - ox + size.w / 2;
    const ny = latToY(worldLat, nz) - oy + size.h / 2;
    const next = { center: setCenterFromPixel(nx, ny, nz), zoom: nz };
    setView(next);
    saveViewSoon(next);
  };

  /**
   * The view is remembered 800ms after the hand STOPS.
   *
   * Writing on every wheel tick pushed the whole element through the store —
   * and the store serialises the project — once per step, which is what made
   * zooming feel like dragging a sled. The map stays local and instant; the
   * store hears about it once, at rest.
   */
  const saveTimer = useRef<number>(0);
  function saveViewSoon(next: { center: LatLon; zoom: number }) {
    if (c.readOnly) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      c.update({ data: { ...d(el), view: next } });
    }, 800);
  }

  /**
   * The wheel is bound natively, not through React's `onWheel`.
   *
   * React registers wheel PASSIVELY at the root, so `preventDefault` inside an
   * `onWheel` prop does nothing at all except log a warning — the zoom would
   * happen and the page would scroll underneath it at the same time. A
   * listener registered here with `{ passive: false }` is the only way to
   * actually stop that. The board's own wheel handling does the same, for the
   * same reason.
   */
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      zoomRef.current(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const unplaced = markers.filter(m => m.unplaced).length;

  return (
    <Frame
      title={data.title || `Map · ${markers.length} job${markers.length === 1 ? '' : 's'}`}
      icon={MapIcon}
    >
      <div
        ref={box}
        // `data-wheel-own` tells the board to leave the wheel alone here. The
        // plain `data-wheel` is not enough: it means "I am a scroller", and is
        // only honoured while the element has somewhere left to scroll — the
        // map has no overflow at all, so that test never matched and the board
        // zoomed itself instead. `data-no-drag`/`data-el-action` keep a press
        // from starting a tile drag on the board.
        data-wheel-own data-no-drag data-el-action
        className="relative w-full h-full rounded-md overflow-hidden select-none"
        style={{ backgroundColor: '#e8ecef', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={e => {
          /**
           * A press on one of the map's own BUTTONS is not the start of a pan.
           *
           * Capturing the pointer here retargets the release to the map, and a
           * click whose press and release land on different elements fires on
           * their common ancestor — the map — so every corner button (+, −,
           * location, fit) silently died the moment capture was taken. Leave
           * buttons alone entirely.
           */
          if ((e.target as HTMLElement).closest('button')) return;
          // Captured on the MAP, never on `e.target`. Capturing on the target
          // meant a drag begun on a pin was delivered to that pin all the way
          // to the release, which then counted as a click on it and opened the
          // job — so panning the map opened things at random.
          box.current?.setPointerCapture?.(e.pointerId);
          dragged.current = false;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={e => {
          const st = drag.current;
          if (!st) return;
          const k = localScale();
          // Divided by the render scale, or the map pans at the wrong speed
          // on any resized widget — the board's own toWorld lesson.
          const dx = (e.clientX - st.x) / k, dy = (e.clientY - st.y) / k;
          if (!st.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
          st.moved = true;
          st.x = e.clientX; st.y = e.clientY;
          setView(cur => {
            const base = cur ?? { center: ISRAEL, zoom: 7 };
            const zz = Math.round(base.zoom);
            return {
              zoom: base.zoom,
              center: {
                lat: yToLat(latToY(base.center.lat, zz) - dy, zz),
                lon: xToLon(lonToX(base.center.lon, zz) - dx, zz),
              },
            };
          });
        }}
        onPointerUp={() => {
          const moved = !!drag.current?.moved;
          dragged.current = moved;
          drag.current = null;
          // viewRef, not `view` — this closure was created before the pan and
          // would store the position the map STARTED from.
          if (moved && viewRef.current) saveViewSoon(viewRef.current);
        }}
      >
        {/* The previous zoom's picture, scaled to the new world, so a zoom is
            never a white flash. */}
        {under && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ transform: `scale(${under.scale})`, transformOrigin: `${size.w / 2}px ${size.h / 2}px` }}>
            {under.tiles.map(t => (
              <img key={'u' + t.key} src={t.url} alt="" draggable={false}
                className="absolute" style={{ left: t.left, top: t.top, width: TILE, height: TILE }} />
            ))}
          </div>
        )}
        {tiles.map(t => (
          <img
            key={t.key} src={t.url} alt="" draggable={false}
            onLoad={() => { if (!loadedTiles.has(t.url)) { loadedTiles.add(t.url); bumpTiles(n => n + 1); } }}
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
            className="absolute pointer-events-none"
            style={{
              left: t.left, top: t.top, width: TILE, height: TILE,
              opacity: loadedTiles.has(t.url) ? 1 : 0,
              transition: 'opacity 180ms ease',
            }}
          />
        ))}

        {/* You, as the blue dot every map has taught everybody to read. */}
        {myFix && (() => {
          const p = place(myFix);
          return (
            <span className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: p.left, top: p.top }}>
              <span className="block w-3.5 h-3.5 rounded-full border-2 border-white"
                style={{ backgroundColor: '#1e73e8', boxShadow: '0 0 0 4px rgba(30,115,232,.25)' }} />
            </span>
          );
        })()}
        {markers.map(m => {
          const p = place(m.at);
          if (p.left < -60 || p.top < -60 || p.left > size.w + 60 || p.top > size.h + 60) return null;
          return (
            <button
              key={m.id}
              data-no-drag data-el-action
              onClick={ev => {
                ev.stopPropagation();
                // A drag that happened to start on this pin is not a click on it.
                if (dragged.current) { dragged.current = false; return; }
                if (m.jobId) c.openJob(m.jobId);
              }}
              title={`${m.label}${m.sub ? ` — ${m.sub}` : ''}`}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group/pin"
              style={{ left: p.left, top: p.top, zIndex: 1 }}
            >
              {/* The hover card: everything about the job, and the last
                  pictures back from site. It is what turns a coloured dot
                  into something worth pointing at. */}
              <span className="absolute bottom-full mb-1 w-[168px] rounded-lg overflow-hidden text-left
                               opacity-0 group-hover/pin:opacity-100 transition-opacity pointer-events-none"
                style={{ backgroundColor: 'rgba(15,23,42,.95)', color: '#fff', zIndex: 30,
                         boxShadow: '0 6px 18px rgba(15,23,42,.4)' }}>
                <span className="block px-2 pt-1.5 text-[10px] font-bold leading-tight">{m.label}</span>
                {m.address ? (
                  <span className="block px-2 text-[8.5px] leading-tight" style={{ color: '#cbd5e1' }}>
                    {m.address}
                  </span>
                ) : (
                  <span className="block px-2 text-[8.5px] leading-tight" style={{ color: '#fca5a5' }}>
                    No address on this job
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 flex-wrap">
                  {m.stageName && (
                    <span className="px-1 rounded text-[8px] font-bold"
                      style={{ backgroundColor: m.colour, color: '#fff' }}>{m.stageName}</span>
                  )}
                  {!!m.openTasks && (
                    <span className="px-1 rounded text-[8px] font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,.18)' }}>
                      {m.openTasks} open
                    </span>
                  )}
                  {m.who && (
                    <span className="text-[8px]" style={{ color: '#cbd5e1' }}>{m.who}</span>
                  )}
                </span>
                {!!m.photos?.length && (
                  <span className="flex gap-[2px] px-1 pb-1">
                    {m.photos.map((src, i) => (
                      <img key={i} src={src} alt=""
                        className="block rounded object-cover"
                        style={{ width: 52, height: 40 }} />
                    ))}
                  </span>
                )}
              </span>

              {/* A proper map pin — the teardrop everybody knows — at a size
                  you can actually aim at. The old 11px dot read as a speck on
                  a busy map, which is what the owner reported. */}
              <svg width={26} height={34} viewBox="0 0 26 34" className="block drop-shadow-md"
                style={{ transform: 'translateY(2px)' }}>
                <path
                  d="M13 33C13 33 24.5 19.6 24.5 12.5C24.5 6.15 19.35 1 13 1C6.65 1 1.5 6.15 1.5 12.5C1.5 19.6 13 33 13 33Z"
                  fill={m.unplaced ? '#dc2626' : m.colour}
                  stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />
                {m.unplaced
                  ? <text x="13" y="17.5" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff">!</text>
                  : <circle cx="13" cy="12.5" r="4.2" fill="#ffffff" fillOpacity={0.92} />}
              </svg>
            </button>
          );
        })}

        {/* Controls. Small, in the corner, and out of the way of the map. */}
        <div className="absolute top-1 right-1 flex flex-col gap-[2px]">
          {[['+', 1], ['−', -1]].map(([sym, dz]) => (
            <button key={sym as string} data-no-drag data-el-action
              onClick={ev => { ev.stopPropagation(); zoomAt(dz as number); }}
              className="w-5 h-5 rounded bg-white/90 text-[12px] font-bold text-slate-600 shadow-sm leading-none">
              {sym}
            </button>
          ))}
          <button data-no-drag data-el-action
            title="Where am I?"
            onClick={ev => {
              ev.stopPropagation();
              // The browser asks the person; a refusal simply does nothing.
              navigator.geolocation?.getCurrentPosition(pos => {
                const at = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                setMyFix(at);
                const next = { center: at, zoom: Math.max(z, 15) };
                setView(next);
                saveViewSoon(next);
              });
            }}
            className="w-5 h-5 rounded bg-white/90 shadow-sm flex items-center justify-center text-[#1e73e8]">
            <LocateFixed size={11} />
          </button>
          <button data-no-drag data-el-action
            title="Fit everything on the map"
            onClick={ev => {
              ev.stopPropagation();
              const placed = markers.filter(m => !m.unplaced).map(m => m.at);
              const next = fitBounds(placed.length ? placed : markers.map(m => m.at), size.w, size.h);
              setView(next);
              if (!c.readOnly) c.update({ data: { ...d(el), view: next } });
            }}
            className="w-5 h-5 rounded bg-white/90 shadow-sm flex items-center justify-center text-slate-600">
            <Crosshair size={11} />
          </button>
        </div>

        {looking > 0 && (
          <span className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded
                           text-[8px] font-bold bg-white/90 text-slate-600 shadow-sm">
            <Loader2 size={9} className="animate-spin" /> finding {looking}
          </span>
        )}

        {/* How many jobs have no address, said plainly and big enough to read
            across a room — the owner counted eighteen of them before the map
            said so. Pressing it flies to where they are shown. */}
        {unplaced > 0 && (
          <button data-no-drag data-el-action
            className="absolute bottom-1 left-1 px-2 py-1 rounded-md text-[10px] font-bold shadow-md"
            style={{ backgroundColor: 'rgba(220,38,38,.94)', color: '#fff' }}
            title="No address on these — press to fly to where they are shown"
            onClick={ev => {
              /*
                Zoomed into a street, the address-less pins live somewhere else
                entirely and read as missing. The badge that reports them is
                now the way to REACH them.
              */
              ev.stopPropagation();
              const loose = markers.filter(m => m.unplaced).map(m => m.at);
              if (!loose.length) return;
              const next = fitBounds(loose, size.w, size.h);
              setView(next);
              saveViewSoon(next);
            }}>
            {unplaced} {unplaced === 1 ? 'job has' : 'jobs have'} no address ›
          </button>
        )}

        {/* Required by the tile licence, and small enough not to matter. */}
        <span className="absolute bottom-0 right-0 px-1 text-[7px]"
          style={{ backgroundColor: 'rgba(255,255,255,.7)', color: '#64748b' }}>
          © OpenStreetMap
        </span>
      </div>
    </Frame>
  );
}
