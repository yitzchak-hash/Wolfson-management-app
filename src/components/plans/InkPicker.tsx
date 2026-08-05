import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X, Pipette } from 'lucide-react';
import { savedColors, saveColor, forgetColor, recentColors, rememberColor } from './annotTools';

/**
 * Picking an ink colour.
 *
 * The old one was a row of swatches and the browser's own `<input type=color>`,
 * which opens the operating system's dialog — a different shape and a different
 * era on every machine, and on the Samsung panel a modal that covers the plan
 * you are trying to match a colour to.
 *
 * This is drawn in the app: a saturation/value field with a hue rail beneath
 * it, live against the plan, plus a shelf of colours somebody deliberately
 * KEPT. Recents churn; saved ones are the two or three the office decided on.
 */

export function InkPicker({ value, onChange, palette, onClose, anchor }: {
  value: string;
  onChange: (hex: string) => void;
  /** The tool's own suggested colours, shown first. */
  palette: string[];
  onClose: () => void;
  /** Where to hang the panel from, in viewport coordinates. */
  anchor: { x: number; y: number };
}) {
  const [saved, setSaved] = useState<string[]>(() => savedColors());
  const [recents] = useState<string[]>(() => recentColors());
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<null | 'field' | 'hue' | 'alpha'>(null);

  // Follow an outside change (picking a swatch, switching tool) without
  // fighting the drag that is in progress.
  useEffect(() => {
    if (dragging.current) return;
    setHsv(hexToHsv(value));
    setText(value);
  }, [value]);

  const hex = useMemo(() => hsvToHex(hsv), [hsv]);

  const commit = useCallback((h: string) => {
    onChange(h);
    setText(h);
  }, [onChange]);

  function fieldAt(e: { clientX: number; clientY: number }) {
    const r = fieldRef.current!.getBoundingClientRect();
    const s = clamp((e.clientX - r.left) / r.width);
    const v = 1 - clamp((e.clientY - r.top) / r.height);
    const next = { ...hsv, s, v };
    setHsv(next);
    commit(hsvToHex(next));
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return;
      e.preventDefault();
      if (dragging.current === 'field') fieldAt(e);
    }
    function up() { dragging.current = null; }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });

  const W = 250;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - W - 12));
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - 400));

  return (
    <>
      <div className="fixed inset-0 z-[160]" onPointerDown={onClose} />
      <div
        className="fixed z-[161] rounded-2xl overflow-hidden select-none"
        style={{
          left, top, width: W,
          background: '#ffffff',
          border: '1px solid rgba(15,23,42,.08)',
          boxShadow: '0 20px 48px -10px rgba(15,23,42,.38)',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Saturation / value */}
        <div
          ref={fieldRef}
          onPointerDown={e => { dragging.current = 'field'; fieldAt(e); }}
          className="relative cursor-crosshair"
          style={{
            height: 140,
            background:
              `linear-gradient(to top, #000, transparent),
               linear-gradient(to right, #fff, hsl(${hsv.h}deg 100% 50%))`,
            touchAction: 'none',
          }}
        >
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`,
              width: 16, height: 16, transform: 'translate(-50%,-50%)',
              border: '2.5px solid #fff', boxShadow: '0 0 0 1.5px rgba(15,23,42,.45)',
              backgroundColor: hex,
            }}
          />
        </div>

        <div className="p-3 space-y-2.5">
          {/* Hue */}
          <input
            type="range" min={0} max={360} value={hsv.h}
            onChange={e => { const next = { ...hsv, h: Number(e.target.value) }; setHsv(next); commit(hsvToHex(next)); }}
            className="ink-hue w-full"
            aria-label="Hue"
          />

          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex-shrink-0"
              style={{ backgroundColor: hex, border: '1px solid rgba(15,23,42,.14)' }} />
            <input
              value={text}
              onChange={e => {
                setText(e.target.value);
                const v = normalise(e.target.value);
                if (v) { setHsv(hexToHsv(v)); onChange(v); }
              }}
              spellCheck={false}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-[12.5px] font-mono outline-none"
              style={{ backgroundColor: '#f1f5f9', color: '#334155' }}
            />
            <button
              onClick={() => { setSaved(saveColor(hex)); rememberColor(hex); }}
              title="Keep this colour"
              className="p-1.5 rounded-lg text-white flex-shrink-0"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              <Plus size={13} />
            </button>
          </div>

          <Shelf label="For this tool" colors={palette} value={value} onPick={commit} />
          {saved.length > 0 && (
            <Shelf
              label="Kept" colors={saved} value={value} onPick={commit}
              onForget={c => setSaved(forgetColor(c))}
            />
          )}
          {recents.length > 0 && (
            <Shelf label="Recent" colors={recents} value={value} onPick={commit} />
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-[12px] font-semibold"
          style={{ backgroundColor: '#f8fafc', color: '#475569', borderTop: '1px solid rgba(15,23,42,.06)' }}
        >
          Done
        </button>
      </div>
    </>
  );
}

function Shelf({ label, colors, value, onPick, onForget }: {
  label: string; colors: string[]; value: string;
  onPick: (c: string) => void; onForget?: (c: string) => void;
}) {
  return (
    <div>
      <div className="text-[9.5px] font-bold tracking-wide mb-1" style={{ color: '#94a3b8' }}>
        {label.toUpperCase()}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map(c => {
          const on = c.toLowerCase() === value.toLowerCase();
          return (
            <span key={c} className="relative group/sw">
              <button
                onClick={() => onPick(c)}
                title={c}
                className="w-[22px] h-[22px] rounded-lg flex items-center justify-center transition-transform"
                style={{
                  backgroundColor: c,
                  border: on ? '2px solid #1e3a5f' : '1px solid rgba(15,23,42,.16)',
                  transform: on ? 'scale(1.12)' : undefined,
                }}
              >
                {on && <Check size={11} color={isLight(c) ? '#0f172a' : '#fff'} />}
              </button>
              {onForget && (
                <button
                  onClick={() => onForget(c)}
                  title="Forget this one"
                  className="absolute -top-1.5 -right-1.5 p-[2px] rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 opacity-0 group-hover/sw:opacity-100 transition-opacity"
                >
                  <X size={8} />
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── colour maths ─────────────────────────────────────────────────────────────

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function normalise(v: string): string | null {
  const t = v.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return null;
  const h = m[1];
  return '#' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toLowerCase();
}

export function hexToHsv(hexIn: string): { h: number; s: number; v: number } {
  const hex = normalise(hexIn) ?? '#dc2626';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: { h: number; s: number; v: number }): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Whether a tick on this swatch should be dark. */
export function isLight(hexIn: string): boolean {
  const hex = normalise(hexIn) ?? '#000000';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
