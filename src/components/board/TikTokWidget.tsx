import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Music2, ChevronLeft, ChevronRight, Shuffle, Play, Pause, Repeat, ExternalLink, ClipboardPaste,
  Volume2, VolumeX,
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

export function TikTokWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const links = useMemo(() => splitLinks(String(data.links ?? '')), [data.links]);
  const seed = Number(data.seed ?? 0);
  const order = useMemo(
    () => (data.shuffle && seed ? shuffled(links, seed) : links),
    [links, data.shuffle, seed]);

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
  const [pasting, setPasting] = useState(false);
  const [draft, setDraft] = useState('');
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
    const read = () => setBox({ w: node.clientWidth, h: node.clientHeight });
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
    setDraft(''); setPasting(false); setAt(0);
  };

  // ── empty ─────────────────────────────────────────────────────────────────
  if (!links.length || pasting) {
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
            {links.length > 0 && (
              <button data-no-drag data-el-action onClick={() => { setPasting(false); setDraft(''); }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 border border-gray-200">
                Cancel
              </button>
            )}
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      title={`${data.title || 'TikTok'} · ${Math.min(at + 1, order.length)}/${order.length}`}
      icon={Music2} tone="#ec4899"
    >
      <div className="h-full flex flex-col min-h-0 gap-1">
        <div ref={boxRef}
          className="flex-1 min-h-0 rounded-lg overflow-hidden bg-black relative flex items-start justify-center">
          {videoId ? (
            <iframe
              ref={iframeRef}
              // The token stays in the key as the FALLBACK: for a player that
              // never says ready, re-mounting asking for autoplay is still the
              // one lever that starts it.
              key={`${videoId}:${playToken}`}
              // TikTok's documented embedded player — a bare video that
              // answers postMessage, not the old embed page with its caption
              // strip. `loop` when the reel is NOT walking on by itself, so a
              // finished video plays again instead of freezing on its last
              // frame; when it IS walking, the ended event is what advances.
              src={`https://www.tiktok.com/player/v1/${videoId}`
                + `?autoplay=${wantAutoplay ? 1 : 0}&muted=${muted ? 1 : 0}`
                + `&loop=${playing && order.length > 1 ? 0 : 1}`
                + '&music_info=0&description=0&rel=0&native_context_menu=0'
                + '&closed_caption=0&fullscreen_button=0&timestamp=0'}
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
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
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
            onClick={() => {
              if (ready) { post(vidPlaying ? 'pause' : 'play'); setVidPlaying(p => !p); }
              else setPlayToken(t => t + 1);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500">
            {vidPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
          {/* The sound, right beside play — the video starts silent because
              that is the only start a browser allows without a press, and this
              press is what turns it up. */}
          <button data-no-drag data-el-action
            title={muted ? 'Turn the sound on' : 'Turn the sound off'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (ready) post(next ? 'mute' : 'unMute');
              // Not ready: the muted flag is in the frame's URL, so remount —
              // the press is the user gesture an unmuted start needs.
              else setPlayToken(t => t + 1);
            }}
            className="p-1 rounded hover:bg-gray-100"
            style={{ color: muted ? '#94a3b8' : '#ec4899' }}>
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
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
          <button data-no-drag data-el-action title="Paste more links"
            onClick={() => setPasting(true)}
            className="p-1 rounded text-gray-500 hover:bg-gray-100"><ClipboardPaste size={13} /></button>
          <a data-no-drag data-el-action href={current} target="_blank" rel="noopener noreferrer"
            title="Open this one on TikTok"
            className="p-1 rounded text-gray-500 hover:bg-gray-100"><ExternalLink size={13} /></a>
        </div>
      </div>
    </Frame>
  );
}
