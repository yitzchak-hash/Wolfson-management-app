import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Music2, ChevronLeft, ChevronRight, Shuffle, Play, Pause, Repeat, ExternalLink,
  Volume2, VolumeX, Maximize2, Minimize2, SlidersHorizontal, X, Eye, EyeOff, Trash2,
} from 'lucide-react';
import { CanvasElement } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';

/**
 * A reel of TikToks on the board.
 *
 * Deliberately NOT built on TikTok's developer API. That needs an app
 * registration, a review, a client secret on a server and a login for whoever
 * owns the account — an enormous amount of machinery to show a list of videos
 * somebody already has the links to. Pasting the links is the whole interface:
 * copy them out of the app, drop them in, done.
 *
 * The player is TikTok's own EMBEDDED PLAYER — `/player/v1/<id>` — which needs
 * no script of theirs on the page and no key. Everything the widget needs to
 * build it — the video id — is already in a full link, so a board full of full
 * links plays with no network call of our own at all. A short share link from
 * the phone has no id in it, and only then is the resolver asked.
 *
 * `/player/v1` and not the older `/embed/v2`: the old frame is a whole PAGE —
 * video plus caption strip — with no way in from outside, so our play button
 * could only tear the frame down and remount it, and the sound could not be
 * touched at all. The player frame is a bare video that speaks the documented
 * postMessage protocol (`{"x-tiktok-player": true, type: "play"|"pause"|
 * "mute"|"unMute"}` in, `onPlayerReady`/`onStateChange` out), which is what
 * makes the bottom play button and the sound toggle real controls rather than
 * remount tricks. The remount-with-autoplay path is kept as the FALLBACK for a
 * player that never says ready.
 */

interface Meta { videoId?: string; title?: string; author?: string; thumbnail?: string; url?: string }

/** The id inside a pasted link, when it is there to be had. */
export function tiktokId(url: string): string | null {
  const m = /\/video\/(\d{6,})/.exec(url) || /\/v\/(\d{6,})/.exec(url) || /^\s*(\d{15,})\s*$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Split whatever was pasted into links.
 *
 * People paste all sorts: one per line out of a notes app, a run of them
 * separated by spaces out of a chat, or a comma-separated row out of a
 * spreadsheet. Splitting on any whitespace or comma handles all three, and
 * keeping only things that look like links means a pasted "1." or a stray
 * word does not become an entry.
 */
export function splitLinks(raw: string): string[] {
  return String(raw ?? '')
    .split(/[\s,]+/)
    .map(s => s.trim().replace(/[.,)]+$/, ''))
    .filter(s => /tiktok\.com/i.test(s) || /^\d{15,}$/.test(s));
}

/**
 * A fixed shuffle from a seed.
 *
 * Seeded rather than random so the order holds still: a reel that re-shuffles
 * on every re-render never finishes a video, and one that re-shuffles when
 * somebody else's edit syncs in is worse. The seed is stored, so pressing
 * shuffle is what changes the order and nothing else does.
 */
export function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The big video manager — settings as a popup covering most of the screen.
 *
 * Every pasted link is a TILE with the video's own preview picture (read
 * through `/api/tiktok`, the same oEmbed route the reel already uses for
 * short links), and each tile carries hide and remove. Hidden links stay in
 * the list — dimmed, labelled — and are simply skipped by the reel, so a
 * video can be rested without losing the link.
 *
 * MODULE LEVEL on purpose (the declared-in-render trap: a component born in a
 * render body is a new type every render and remounts on every board tick).
 * It renders through a portal from inside a board node, so it SEALS its
 * pointer events — without that, a press on any button here reaches the
 * node's own pointerdown, which captures the pointer and the button never
 * sees its click (the standing portal-in-a-node trap).
 */
function TikTokManager({ links, hidden, meta, onResolved, onSave, onJump, onClose }: {
  links: string[];
  hidden: string[];
  meta: Record<string, Meta>;
  onResolved: (found: Record<string, Meta>) => void;
  onSave: (nextLinks: string[], nextHidden: string[]) => void;
  onJump: (url: string, nextHidden: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(0);

  // Previews for every link that has none yet, chunked in threes so a big
  // list does not fire thirty requests at once. A link the route cannot
  // answer just keeps its dark card — the popup must open either way.
  useEffect(() => {
    let dead = false;
    const need = links.filter(l => !meta[l]?.thumbnail && !meta[l]?.videoId);
    if (!need.length) return;
    setBusy(need.length);
    (async () => {
      const found: Record<string, Meta> = {};
      for (let i = 0; i < need.length; i += 3) {
        const chunk = need.slice(i, i + 3);
        await Promise.all(chunk.map(async url => {
          try {
            const r = await fetch('/api/tiktok', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
            });
            if (r.ok) found[url] = await r.json();
          } catch { /* the tile stays a dark card */ }
        }));
        if (dead) return;
        setBusy(n => Math.max(0, n - chunk.length));
      }
      if (!dead && Object.keys(found).length) onResolved(found);
    })();
    return () => { dead = true; };
    // Once per open — the list it was opened with is the list it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the popup and ONLY the popup — capture + stopPropagation so
  // the board's own Escape ladder underneath never hears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const addFromDraft = () => {
    const merged = [...links, ...splitLinks(draft)];
    const seen = new Set<string>();
    const clean = merged.filter(l => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    onSave(clean, hidden);
    setDraft('');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center"
      data-tiktok-manager
      onPointerDown={stop} onPointerUp={stop} onPointerMove={stop}
      onClick={stop} onDoubleClick={stop} onContextMenu={stop}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(96vw, 1280px)', height: 'min(94vh, 900px)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <Music2 size={18} style={{ color: '#ec4899' }} />
          <div className="font-bold text-gray-800 text-sm">TikTok videos</div>
          <div className="text-[11px] text-gray-400">
            {links.length} video{links.length === 1 ? '' : 's'}
            {hidden.length ? ` · ${hidden.length} hidden` : ''}
            {busy > 0 ? ` · reading previews… ${busy} left` : ''}
          </div>
          <span className="flex-1" />
          <button data-tiktok-manager-close onClick={onClose} title="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <input
            data-tiktok-manager-paste
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && splitLinks(draft).length) addFromDraft(); }}
            placeholder="Paste more links here — one, or a whole list at once"
            className="flex-1 text-[12px] rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#ec4899]"
          />
          <button
            data-tiktok-manager-add
            onClick={addFromDraft}
            disabled={!splitLinks(draft).length}
            className="px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: '#ec4899' }}
          >
            Add {splitLinks(draft).length || ''}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {links.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-gray-400">
              No videos yet — paste some links above.
            </div>
          ) : (
            <div className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
              {links.map(url => {
                const m = meta[url];
                const hid = hidden.includes(url);
                return (
                  <div key={url} data-tiktok-tile
                    className={`rounded-xl overflow-hidden border border-gray-200 bg-white flex flex-col ${hid ? 'opacity-50' : ''}`}>
                    <button
                      data-tiktok-tile-play
                      title="Play this one"
                      onClick={() => {
                        // Playing a hidden one is asking for it back.
                        const nextHidden = hid ? hidden.filter(h => h !== url) : hidden;
                        if (hid) onSave(links, nextHidden);
                        onJump(url, nextHidden);
                      }}
                      className="relative bg-gray-900 group/tile"
                      style={{ aspectRatio: '9 / 13' }}
                    >
                      {m?.thumbnail
                        ? <img src={m.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        : <span className="absolute inset-0 flex items-center justify-center text-white/25"><Music2 size={30} /></span>}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center text-white
                                         opacity-80 group-hover/tile:opacity-100">
                          <Play size={20} />
                        </span>
                      </span>
                      {hid && (
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wide
                                         bg-black/60 text-white px-1.5 py-0.5 rounded">
                          hidden
                        </span>
                      )}
                    </button>
                    <div className="p-2">
                      <div className="text-[11px] font-semibold text-gray-800 truncate" title={m?.title || url}>
                        {m?.title || url}
                      </div>
                      <div className="text-[9px] text-gray-400 truncate">{m?.author || ' '}</div>
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          data-tiktok-tile-hide
                          title={hid ? 'Show it in the reel again' : 'Hide it from the reel — the link stays'}
                          onClick={() => onSave(links, hid ? hidden.filter(h => h !== url) : [...hidden, url])}
                          className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-semibold text-gray-500 hover:bg-gray-100"
                        >
                          {hid ? <Eye size={12} /> : <EyeOff size={12} />}
                          {hid ? 'Show' : 'Hide'}
                        </button>
                        <span className="flex-1" />
                        <a href={url} target="_blank" rel="noopener noreferrer" title="Open on TikTok"
                          className="p-1 rounded text-gray-400 hover:bg-gray-100">
                          <ExternalLink size={12} />
                        </a>
                        <button
                          data-tiktok-tile-remove
                          title="Remove this link"
                          onClick={() => onSave(links.filter(l => l !== url), hidden.filter(h => h !== url))}
                          className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body);
}

export function TikTokWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const links = useMemo(() => splitLinks(String(data.links ?? '')), [data.links]);
  /**
   * Hidden links stay in the list and are skipped by the reel — resting a
   * video without losing the link. Managed only from the big popup.
   */
  const hidden = useMemo(
    () => (Array.isArray(data.hidden) ? (data.hidden as string[]) : []),
    [data.hidden]);
  const shown = useMemo(() => links.filter(l => !hidden.includes(l)), [links, hidden]);
  const seed = Number(data.seed ?? 0);
  const order = useMemo(
    () => (data.shuffle && seed ? shuffled(shown, seed) : shown),
    [shown, data.shuffle, seed]);

  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(!!data.auto);
  /**
   * Pressing play has to actually start the VIDEO.
   *
   * The play button used to toggle the auto-ADVANCE timer and nothing else, so
   * a reel could walk through a dozen links without one of them ever playing —
   * "the videos aren't playing even if I press play". The player is a
   * third-party iframe with no transport we can reach from out here, so the
   * one lever there is is to re-mount it asking for autoplay. Bumping this
   * changes the frame's key, which is what makes that happen; and pressing the
   * button is itself the user gesture a browser wants before it will let a
   * video start.
   */
  const [playToken, setPlayToken] = useState(0);
  /**
   * A reel plays on its own unless it is told not to.
   *
   * It defaulted to off, so every video had to be started by hand — "I keep
   * having to press play". `undefined` is a reel nobody has been near, and it
   * should behave the way a reel obviously should; only choosing "wait for me
   * to press play" ('') turns it off.
   */
  const wantAutoplay = (data.autoplay ?? '1') !== '' || playToken > 0;

  /**
   * The player's own answers, and the sound.
   *
   * `ready` — the frame has said `onPlayerReady`, so postMessage is a real
   * transport and the buttons drive the video directly. Until then the play
   * button falls back to the remount trick, which always works but starts the
   * video over. `vidPlaying` follows `onStateChange`, so the button shows
   * pause while the video really is playing.
   *
   * `muted` starts TRUE because that is the only autoplay a browser allows: an
   * unmuted autoplay is refused and the frame sits there with its centre play
   * button — "it keeps asking me to press the play button in the middle". The
   * video starts silent and the sound button beside play turns it up, which is
   * a user gesture and is allowed.
   */
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [vidPlaying, setVidPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  /** The live mute choice, for the once-registered message listener. */
  const mutedRef = useRef(true);
  mutedRef.current = muted;
  /**
   * The loudness slider's number, remembered on the node. HONESTY NOTE: the
   * player's protocol takes only mute/unMute from a page — there is no
   * volume message (verified against TikTok's embed-player spec) — so 0 is
   * silence, anything above turns the sound on, and the actual loudness is
   * the screen's own volume. The number is kept and re-shown, and when the
   * player reports its own volume (onVolumeChange) the slider follows it.
   */
  const [vol, setVol] = useState<number>(() => {
    const v = Number(data.volume);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 100;
  });
  const volRef = useRef(vol);
  volRef.current = vol;
  const [draft, setDraft] = useState('');
  const [manage, setManage] = useState(false);
  const [meta, setMeta] = useState<Record<string, Meta>>(() => (data.meta as Record<string, Meta>) ?? {});

  const seconds = Math.max(5, Number(data.seconds ?? 30));
  const current = order[Math.min(at, Math.max(0, order.length - 1))];
  const directId = current ? tiktokId(current) : null;
  const known = current ? meta[current] : undefined;
  const videoId = directId ?? known?.videoId ?? null;

  // ── auto-advance ──────────────────────────────────────────────────────────
  //
  // The timer is only the FALLBACK, for a player that never says ready. A
  // ready player reports when its video ENDS, and that is what moves the reel
  // on — the timer walking blind is what cut videos off mid-clip and read as
  // "it keeps switching videos randomly".
  useEffect(() => {
    if (!playing || order.length < 2 || ready) return;
    const t = setInterval(() => setAt(i => (i + 1) % order.length), seconds * 1000);
    return () => clearInterval(t);
  }, [playing, order.length, seconds, ready]);

  useEffect(() => { if (at >= order.length) setAt(0); }, [order.length]);
  // The setting is the source of truth for the timer; changing it in the
  // pencil should take effect without having to press the button as well.
  useEffect(() => { setPlaying(!!data.auto); }, [data.auto]);

  /**
   * Speak the player's protocol.
   *
   * One send helper and one listener. The listener filters on the frame's own
   * window and the `x-tiktok-player` stamp, so a message from any other iframe
   * on the board can never drive the reel. `onStateChange` uses the player's
   * numeric states (1 playing, 2 paused, 0 ended); ended moves the reel on
   * when it is in move-on-by-itself mode, so the reel walks at the pace of the
   * videos instead of a blind timer cutting them off mid-clip.
   */
  const post = useCallback((type: string, value?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { 'x-tiktok-player': true, type, ...(value !== undefined ? { value } : {}) }, '*');
  }, []);
  const playingAuto = useRef(false);
  playingAuto.current = playing && order.length > 1;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      let msg: unknown = e.data;
      if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch { return; } }
      if (!msg || typeof msg !== 'object' || !('x-tiktok-player' in (msg as object))) return;
      const m = msg as { type?: string; value?: unknown };
      if (m.type === 'onPlayerReady') {
        setReady(true);
        /**
         * Re-assert the SOUND the moment a fresh frame introduces itself.
         *
         * The mute choice lives out here, but every video change mounts a new
         * frame — and a frame asked to autoplay UNMUTED is refused by the
         * browser, so the reel went silent on every advance however many
         * times the sound was turned on. The URL still asks for the safe
         * silent start; this message right after ready is what carries the
         * choice across videos. Through a ref, because this listener is
         * registered once and would otherwise hold the first render's value.
         */
        if (!mutedRef.current) {
          iframeRef.current?.contentWindow?.postMessage(
            { 'x-tiktok-player': true, type: 'unMute' }, '*');
        }
      }
      if (m.type === 'onStateChange') {
        const v = Number(m.value);
        if (v === 1) setVidPlaying(true);
        if (v === 0 || v === 2) setVidPlaying(false);
        if (v === 0 && playingAuto.current) setAt(i => (i + 1) % Math.max(1, order.length));
      }
      if (m.type === 'onVolumeChange') {
        // The player reports 0..100 (some builds 0..1) — the slider follows.
        const raw = Number(m.value);
        if (Number.isFinite(raw) && raw >= 0) {
          const v = Math.round(raw <= 1 ? raw * 100 : raw);
          if (v >= 0 && v <= 100) setVol(v);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [order.length]);

  /**
   * A TikTok is a PORTRAIT video, and the box it is put in is whatever shape
   * the node was dragged to.
   *
   * Stretching the frame to the box gives a squashed video with black bars its
   * own player draws inside it. The frame is sized to the largest 9:16 box
   * that fits and centred, so the video is as big as the node allows and the
   * right shape — "the aspect ratio needs to fit into the widget according to
   * the size of the widget". `fill` crops to the box instead, for anybody who
   * would rather have no letterboxing.
   */
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    // Damped (the standing measure rule) — a measure never feeds its own loop.
    const read = () => setBox(prev =>
      prev.w === node.clientWidth && prev.h === node.clientHeight
        ? prev : { w: node.clientWidth, h: node.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const RATIO = 9 / 16;
  const frame = (() => {
    if (!box.w || !box.h) return { width: '100%', height: '100%' };
    const fitH = Math.min(box.h, box.w / RATIO);
    const fitW = fitH * RATIO;
    if (data.fill) {
      // Cover: the smaller side is filled and the overflow is clipped by the
      // rounded box around it.
      const coverW = Math.max(box.w, box.h * RATIO);
      return { width: coverW, height: coverW / RATIO };
    }
    return { width: fitW, height: fitH };
  })();

  /**
   * The frame's address is FROZEN per mount.
   *
   * `muted` and `loop` used to be interpolated straight into `src`, so
   * touching the sound button or the Repeat toggle changed the address, React
   * rewrote the attribute, and the browser RELOADED the frame — the video
   * started over. That was the restart. The address is now computed once per
   * (video, playToken) with the settings read through refs; everything that
   * changes mid-video travels over the player's postMessage protocol instead,
   * and a Repeat flip simply takes effect from the next video (a ready
   * player's `ended` event is what advances the reel anyway).
   */
  const wantAutoRef = useRef(wantAutoplay);
  wantAutoRef.current = wantAutoplay;
  const src = useMemo(() => {
    if (!videoId) return '';
    return `https://www.tiktok.com/player/v1/${videoId}`
      + `?autoplay=${wantAutoRef.current ? 1 : 0}&muted=${mutedRef.current ? 1 : 0}`
      + `&loop=${playingAuto.current ? 0 : 1}`
      + '&music_info=0&description=0&rel=0&native_context_menu=0'
      // The player's OWN volume control is off: pressing it navigated to the
      // video's tiktok.com page instead of changing the sound, so the
      // widget's sound button is the one control and cannot be undermined.
      + '&volume_control=0'
      + '&closed_caption=0&fullscreen_button=0&timestamp=0';
  }, [videoId, playToken]);

  // ── full screen, and the tap ladder ───────────────────────────────────────
  //
  // The full-screen button puts the reel's OWN root into the browser's top
  // layer, so the node outline, the action strip and every piece of board
  // chrome disappear with the board itself — only the video and (when asked
  // for) the floating control pill remain. The iframe eats every tap, so a
  // transparent overlay above it is what makes tapping the video mean
  // anything: first tap brings the controls back (the "border"), and once
  // they are up each tap toggles pause/play through the player's protocol.
  // The controls put themselves away after a few quiet seconds, which resets
  // the ladder. The small × top-right is ALWAYS visible — a touch screen has
  // no Escape key, and full screen with no visible way out reads as stuck.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const [fsChrome, setFsChrome] = useState(false);
  /**
   * Full screen fills a WALL — the pill's 13px icons were unpressable specks
   * there. The whole pill (and the exit ×) is zoomed by the screen's own
   * size: ~2.5× on a TV, ~1.6× on a phone. `zoom` scales the layout, so the
   * buttons inside keep their proportions.
   */
  const fsZoom = fs
    ? Math.min(2.8, Math.max(1.6, Math.min(window.innerWidth, window.innerHeight) / 420))
    : 1;
  const chromeTimer = useRef<number | null>(null);
  useEffect(() => {
    const onChange = () => {
      const now = document.fullscreenElement === rootRef.current;
      setFs(now);
      if (!now) setFsChrome(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const armChromeHide = useCallback(() => {
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setFsChrome(false), 4000);
  }, []);
  useEffect(() => () => { if (chromeTimer.current) window.clearTimeout(chromeTimer.current); }, []);
  const toggleFs = () => {
    if (fs) { void document.exitFullscreen(); }
    else { void rootRef.current?.requestFullscreen(); setFsChrome(false); }
  };
  const togglePlayPause = () => {
    if (ready) { post(vidPlaying ? 'pause' : 'play'); setVidPlaying(p => !p); }
    else setPlayToken(t => t + 1);
  };
  const fsTap = () => {
    if (!fsChrome) { setFsChrome(true); armChromeHide(); return; }
    togglePlayPause();
    armChromeHide();
  };

  /**
   * Only short links are ever resolved, and only once each.
   *
   * A board of full links makes no request at all. When one does have to be
   * asked about, the answer is written back onto the node — which syncs, so
   * one machine's lookup serves every other screen.
   */
  const resolving = useRef(false);
  useEffect(() => {
    if (!current || directId || known || resolving.current) return;
    resolving.current = true;
    (async () => {
      try {
        const r = await fetch('/api/tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: current }),
        });
        if (!r.ok) return;
        const j = await r.json();
        setMeta(prev => {
          const next = { ...prev, [current]: j as Meta };
          if (!c.readOnly) c.update({ data: { ...d(el), meta: next } });
          return next;
        });
      } catch {
        /* a link that cannot be resolved still shows as a link */
      } finally {
        resolving.current = false;
      }
    })();
  }, [current, directId, known]);

  const commitPaste = () => {
    const merged = [...links, ...splitLinks(draft)];
    // De-duplicated, because the usual way to add three more is to paste the
    // whole list again.
    const seen = new Set<string>();
    const clean = merged.filter(l => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    c.update({ data: { ...data, links: clean.join('\n') } });
    setDraft(''); setAt(0);
  };

  const saveLists = (nextLinks: string[], nextHidden: string[]) => {
    c.update({ data: { ...d(el), links: nextLinks.join('\n'), hidden: nextHidden } });
  };
  const jumpTo = (url: string, nextHidden: string[]) => {
    const nextShown = links.filter(l => !nextHidden.includes(l));
    const nextOrder = data.shuffle && seed ? shuffled(nextShown, seed) : nextShown;
    const i = nextOrder.indexOf(url);
    if (i >= 0) setAt(i);
    setManage(false);
    // The press in the popup is the user gesture — start it playing.
    setPlayToken(t => t + 1);
  };

  // ── empty ─────────────────────────────────────────────────────────────────
  if (!links.length) {
    return (
      <Frame title={String(data.title || 'TikTok')} icon={Music2} tone="#ec4899">
        <div className="h-full flex flex-col gap-1 min-h-0">
          <textarea
            data-no-drag data-el-action
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={'Paste your links here — one per line, or all in a row.\n'
              + 'https://www.tiktok.com/@someone/video/123…'}
            className="flex-1 min-h-0 w-full text-[10px] rounded-lg border border-gray-200 p-2
                       outline-none focus:border-[#ec4899] resize-none"
          />
          <div className="flex gap-1 flex-shrink-0">
            <button data-no-drag data-el-action onClick={commitPaste}
              disabled={!splitLinks(draft).length}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: '#ec4899' }}>
              Add {splitLinks(draft).length || ''}
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  const controls = (
    <div
      data-tiktok-controls
      className={fs
        ? 'absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-full px-3 py-1.5 shadow-2xl z-10'
        : 'flex items-center gap-1 flex-shrink-0'}
      style={fs ? { zoom: fsZoom } : undefined}
    >
      <button data-no-drag data-el-action title="Previous"
        onClick={() => setAt(i => (i - 1 + order.length) % order.length)}
        className="p-1 rounded text-gray-500 hover:bg-gray-100"><ChevronLeft size={13} /></button>
      {/* Plays and pauses THIS video — through the player's own protocol
          when the frame has said ready, by remounting with autoplay when
          it has not. The reel walking on by itself is the separate Repeat
          control further along — two different things that were one
          button. */}
      <button data-no-drag data-el-action
        title={vidPlaying ? 'Pause' : 'Play this one'}
        onClick={togglePlayPause}
        className="p-1 rounded hover:bg-gray-100 text-gray-500">
        {vidPlaying ? <Pause size={13} /> : <Play size={13} />}
      </button>
      {/* The sound, right beside play — the video starts silent because
          that is the only start a browser allows without a press, and this
          press is what turns it up. Always through the player's protocol,
          NEVER a remount: the remount was the restart. A frame that has not
          said ready yet gets the choice re-asserted the moment it does. */}
      <button data-no-drag data-el-action
        title={muted ? 'Turn the sound on' : 'Turn the sound off'}
        onClick={() => {
          const next = !muted;
          setMuted(next);
          post(next ? 'mute' : 'unMute');
          /**
           * A player that never said ready cannot hear the message — for that
           * one the remount path is the lever (the play button's own
           * fallback): the fresh frame's address carries the new mute choice,
           * and this press is the user gesture the browser wants.
           */
          if (!ready) setPlayToken(t => t + 1);
        }}
        className="p-1 rounded hover:bg-gray-100"
        style={{ color: muted ? '#94a3b8' : '#ec4899' }}>
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
      {/* The loudness slider the office asked for — as honest as the platform
          allows: TikTok's player takes only sound-on / sound-off from a page
          (its protocol has no volume message), so 0 silences, anything above
          turns the sound on, and the screen's own volume is the loudness.
          The number is remembered, and when the player reports its own
          volume the slider follows it. */}
      <input data-no-drag data-el-action data-tiktok-volume
        type="range" min={0} max={100} step={5}
        value={muted ? 0 : vol}
        title="Sound — 0 is off. TikTok only takes on/off from a page; set loudness with the screen's own volume."
        onPointerDown={e => e.stopPropagation()}
        onChange={e => {
          const v = +e.target.value;
          setVol(v || volRef.current || 100);
          const wantMute = v === 0;
          if (wantMute !== muted) {
            setMuted(wantMute);
            post(wantMute ? 'mute' : 'unMute');
            if (!ready) setPlayToken(t => t + 1);
          }
        }}
        onPointerUp={() => {
          if (!c.readOnly) c.update({ data: { ...data, volume: volRef.current } });
        }}
        className="flex-shrink-0"
        style={{ width: 56, accentColor: '#ec4899' }} />
      <button data-no-drag data-el-action title={playing ? 'Stop moving on' : 'Move on by itself'}
        onClick={() => setPlaying(p => !p)}
        className="p-1 rounded hover:bg-gray-100"
        style={{ color: playing ? '#ec4899' : '#94a3b8' }}>
        <Repeat size={13} />
      </button>
      <button data-no-drag data-el-action title="Next"
        onClick={() => setAt(i => (i + 1) % order.length)}
        className="p-1 rounded text-gray-500 hover:bg-gray-100"><ChevronRight size={13} /></button>

      <span className="flex-1" />

      <button data-no-drag data-el-action
        title={data.shuffle ? 'Shuffle again' : 'Shuffle the order'}
        onClick={() => {
          // A NEW seed every press, so pressing it twice gives two orders
          // rather than the same one back.
          c.update({ data: { ...data, shuffle: true, seed: (seed + 1 + order.length * 7919) % 2147483647 } });
          setAt(0);
        }}
        className="p-1 rounded hover:bg-gray-100"
        style={{ color: data.shuffle ? '#ec4899' : '#94a3b8' }}>
        <Shuffle size={13} />
      </button>
      <button data-no-drag data-el-action data-tiktok-manage title="Videos & settings"
        onClick={() => { if (!c.readOnly) setManage(true); }}
        className="p-1 rounded text-gray-500 hover:bg-gray-100"><SlidersHorizontal size={13} /></button>
      <button data-no-drag data-el-action data-tiktok-fullscreen
        title={fs ? 'Exit full screen' : 'Full screen'}
        onClick={toggleFs}
        className="p-1 rounded text-gray-500 hover:bg-gray-100">
        {fs ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
      <a data-no-drag data-el-action href={current} target="_blank" rel="noopener noreferrer"
        title="Open this one on TikTok"
        className="p-1 rounded text-gray-500 hover:bg-gray-100"><ExternalLink size={13} /></a>
    </div>
  );

  return (
    <Frame
      title={`${data.title || 'TikTok'} · ${Math.min(at + 1, order.length)}/${order.length}`}
      icon={Music2} tone="#ec4899"
    >
      <div ref={rootRef} data-tiktok-root
        className={`h-full flex flex-col min-h-0 ${fs ? '' : 'gap-1'}`}
        style={fs ? { background: '#000' } : undefined}>
        <div ref={boxRef}
          className={`flex-1 min-h-0 overflow-hidden bg-black relative flex items-start justify-center ${fs ? '' : 'rounded-lg'}`}>
          {videoId ? (
            <iframe
              ref={iframeRef}
              // The token stays in the key as the FALLBACK: for a player that
              // never says ready, re-mounting asking for autoplay is still the
              // one lever that starts it.
              key={`${videoId}:${playToken}`}
              // TikTok's documented embedded player — a bare video that
              // answers postMessage, not the old embed page with its caption
              // strip. The address is the frozen-per-mount one above.
              src={src}
              title={known?.title || 'TikTok'}
              // No scrollbar, ever: it is a video, and there is nothing in the
              // node the office is meant to scroll.
              scrolling="no"
              style={{ border: 0, width: frame.width, height: frame.height, overflow: 'hidden' }}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              // A board node that scrolls is not a place for an iframe to be
              // able to navigate the whole app.
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
              // A fresh frame has said nothing yet — the buttons fall back to
              // the remount path until it introduces itself.
              onLoad={() => { setReady(false); setVidPlaying(wantAutoplay); }}
            />
          ) : (
            <a
              data-no-drag data-el-action
              href={current} target="_blank" rel="noopener noreferrer"
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-3"
            >
              {known?.thumbnail
                ? <img src={known.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                : null}
              <span className="relative text-[11px] font-bold text-white truncate max-w-full">
                {known?.title || 'Open this one on TikTok'}
              </span>
              <span className="relative text-[9px] text-white/70 flex items-center gap-1">
                <ExternalLink size={9} /> {known?.author || current}
              </span>
            </a>
          )}
          {/* The tap ladder's ear. The iframe swallows every press, so in full
              screen this transparent sheet above it is what a tap lands on.
              data-no-drag/data-el-action AND the stopPropagation: without
              them the board node underneath captures the pointer and the
              click retargets away — the standing capture trap. */}
          {fs && videoId && (
            <div data-tiktok-tap data-no-drag data-el-action
              className="absolute inset-0 cursor-pointer"
              onPointerDown={e => e.stopPropagation()}
              onClick={fsTap} />
          )}
          {/* The always-visible way out — a touch screen has no Escape key. */}
          {fs && (
            <button data-tiktok-exit data-no-drag data-el-action
              onPointerDown={e => e.stopPropagation()}
              onClick={toggleFs} title="Exit full screen"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white/80
                         hover:bg-black/70 hover:text-white flex items-center justify-center"
              style={{ zoom: fsZoom }}>
              <Minimize2 size={16} />
            </button>
          )}
          {fs && fsChrome && controls}
        </div>
        {!fs && controls}
      </div>
      {manage && (
        <TikTokManager
          links={links}
          hidden={hidden}
          meta={meta}
          onResolved={found => setMeta(prev => {
            const next = { ...prev, ...found };
            if (!c.readOnly) c.update({ data: { ...d(el), meta: next } });
            return next;
          })}
          onSave={saveLists}
          onJump={jumpTo}
          onClose={() => setManage(false)}
        />
      )}
    </Frame>
  );
}
