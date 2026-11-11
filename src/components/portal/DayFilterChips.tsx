import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface DayChip<K extends string> { key: K; label: string; color: string }

/**
 * The worker's day filter (All · Yesterday · Today · Tomorrow · This Week · Dates).
 *
 * FOLDED into one bubble by default (owner, recording 2026-11-11 122535, 0:16 — "turn it into a collapsible bubble
 * where it's all, and then we can filter yesterday, today, this week, or specific dates"): the bubble says the
 * choice in force; a tap opens the chips, and picking one folds it again. `extra` is drawn under the open chips —
 * the from/to boxes when "Dates" is the choice.
 *
 * Open, the chips WRAP, never scroll: as a sideways scroller "This Week" sat half past the screen's edge on the
 * iPhone 17 Pro and Pro Max and the Fold's cover screen, and wholly off it on a 360px Galaxy (session #88's overlap
 * sweep). One line whenever they fit; when they don't the row splits three to a line. A chip never shrinks below its
 * own word (whitespace-nowrap holds a flex item's floor at its full label).
 */
export function DayFilterChips<K extends string>({ options, value, onPick, summary, extra, keepOpen }: {
  options: DayChip<K>[];
  value: K;
  onPick: (k: K) => void;
  /** The words on the folded bubble (defaults to the chosen chip's label). */
  summary?: string;
  extra?: ReactNode;
  /** Picking this chip leaves the bubble open (the dates need their boxes). */
  keepOpen?: K;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  const [open, setOpen] = useState(false);
  const chosen = options.find(o => o.key === value) ?? options[0];

  useLayoutEffect(() => {
    const el = row.current;
    if (!el || !open) return;
    const measure = () => {
      const words = [...el.querySelectorAll<HTMLElement>('[data-chip-word]')];
      const cs = getComputedStyle(el);
      const gap = parseFloat(cs.columnGap) || 0;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const btn = words[0]?.parentElement;
      const pad = btn ? parseFloat(getComputedStyle(btn).paddingLeft) + parseFloat(getComputedStyle(btn).paddingRight) : 0;
      const need = words.reduce((s, w) => s + w.offsetWidth + pad, 0) + gap * (words.length - 1);
      setSplit(need > room + 0.5);
    };
    measure();
    // The width changes with the phone turning; the words with the text size
    // and the language — both resize the row's own box or its children.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, options.map(o => o.label).join('|')]);

  return (
    <div data-day-filters data-open={open || undefined} className="bg-white border-b border-gray-100 px-3 py-2 flex-shrink-0">
      <button data-day-filter-bubble aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: chosen?.color ?? '#1e3a5f' }}>
        <span data-day-filter-summary>{summary ?? chosen?.label}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={row} data-split={split || undefined} className="mt-2 flex flex-wrap gap-1.5">
          {options.map(({ key, label, color }) => (
            <button
              key={key}
              data-day-filter={key}
              onClick={() => { onPick(key); if (key !== keepOpen) setOpen(false); }}
              // basis 30%: at most three to a line, so a split row is 3 + 2.
              className={`${split ? 'basis-[30%]' : ''} flex-auto whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                value === key ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              style={value === key ? { backgroundColor: color } : {}}
            >
              <span data-chip-word>{label}</span>
            </button>
          ))}
        </div>
      )}
      {open && extra}
    </div>
  );
}
