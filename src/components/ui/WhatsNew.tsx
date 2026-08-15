import React, { useEffect, useState } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  WHATS_NEW, WhatsNewDemo, whatsNewSeen, markWhatsNewSeen,
} from '../../data/whatsNew';

/**
 * The what's-new walkthrough: one item at a time, next-next-next, the way a
 * phone presents an update. Each slide shows a small animated vignette of the
 * GESTURE the feature uses, because seeing "hold here, drag there" teaches in
 * a second what a paragraph cannot.
 */

/** The vignettes — pure CSS, one per gesture family. */
function Demo({ kind }: { kind: WhatsNewDemo }) {
  return (
    <div className="relative h-28 rounded-xl overflow-hidden mb-4 wn-scene"
      style={{ backgroundColor: '#eef4fa' }}>
      {kind === 'drag' && (
        <>
          <span className="wn-slot" style={{ left: '58%', top: 34 }} />
          <span className="wn-tile wn-anim-drag" />
        </>
      )}
      {kind === 'tap' && (
        <>
          <span className="wn-tile" style={{ left: '40%', top: 30, width: 90 }} />
          <span className="wn-finger wn-anim-tap" />
        </>
      )}
      {kind === 'pin' && (
        <>
          <span className="wn-sheet" />
          <span className="wn-pin wn-anim-pin">1</span>
        </>
      )}
      {kind === 'zoom' && <span className="wn-tile wn-anim-zoom" style={{ left: '38%', top: 28 }} />}
      {kind === 'list' && (
        <span className="wn-list">
          {[0, 1, 2].map(i => <span key={i} className="wn-row wn-anim-row" style={{ animationDelay: `${i * 160}ms` }} />)}
        </span>
      )}
      {kind === 'sparkle' && (
        <span className="wn-burst">
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
          <span className="wn-tick">✓</span>
        </span>
      )}
    </div>
  );
}

export function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(() => !whatsNewSeen());

  return (
    <>
      <button
        onClick={() => { setOpen(true); setUnseen(false); markWhatsNewSeen(); }}
        title="What's new"
        className="relative p-2 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
      >
        <Sparkles size={17} />
        {unseen && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"
            aria-label="New updates" />
        )}
      </button>
      {open && <WhatsNewShow onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsNewShow({ onClose }: { onClose: () => void }) {
  // Flattened: every item is a slide, with its entry's date riding along.
  const slides = WHATS_NEW.flatMap(e => e.items.map(item => ({ ...item, date: e.date, entry: e.title })));
  const [at, setAt] = useState(0);
  const s = slides[at];

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setAt(a => Math.min(slides.length - 1, a + 1));
      if (e.key === 'ArrowLeft') setAt(a => Math.max(0, a - 1));
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, slides.length]);

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: '#1e3a5f' }}>
          <Sparkles size={15} className="text-[#4aa8d8]" />
          <span className="text-white text-sm font-bold flex-1">What&apos;s new</span>
          <span className="text-[11px] text-white/60">{s.entry} · {s.date}</span>
          <button onClick={onClose} className="p-1 rounded text-white/70 hover:bg-white/15"><X size={15} /></button>
        </div>

        {/* Keyed by slide so the vignette restarts its animation each time. */}
        <div className="p-5" key={at}>
          {s.demo && <Demo kind={s.demo} />}
          <h3 className="text-[17px] font-extrabold text-gray-900 mb-1.5">{s.title}</h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">{s.body}</p>
        </div>

        <div className="flex items-center gap-2 px-5 pb-4">
          <button onClick={() => setAt(a => Math.max(0, a - 1))} disabled={at === 0}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <span className="flex-1 flex items-center justify-center gap-1">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setAt(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === at ? 16 : 6, height: 6,
                  backgroundColor: i === at ? '#1e3a5f' : '#e2e8f0',
                }} />
            ))}
          </span>
          {at < slides.length - 1 ? (
            <button onClick={() => setAt(a => a + 1)}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: '#1e3a5f' }}>
              Next
            </button>
          ) : (
            <button onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: '#16a34a' }}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
