import { useLayoutEffect, useRef, useState } from 'react';

export interface DayChip<K extends string> { key: K; label: string; color: string }

/**
 * The worker's day chips (All · Yesterday · Today · Tomorrow · This Week).
 *
 * They WRAP, never scroll: as a sideways scroller "This Week" sat half past the
 * screen's edge on the iPhone 17 Pro and Pro Max and the Fold's cover screen,
 * and wholly off it on a 360px Galaxy (session #88's overlap sweep).
 *
 * One line whenever the five fit (Hebrew on most phones, a Fold opened). When
 * they don't, plain wrapping left "This Week" alone on a second line stretched
 * across the screen, so the row splits as 3 + 2 instead — or as many lines as
 * Russian at the largest text size needs. A chip never shrinks below its own
 * word (whitespace-nowrap holds a flex item's floor at its full label).
 */
export function DayFilterChips<K extends string>({ options, value, onPick }: {
  options: DayChip<K>[];
  value: K;
  onPick: (k: K) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
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
  }, [options.map(o => o.label).join('|')]);

  return (
    <div ref={row} data-day-filters data-split={split || undefined}
      className="bg-white border-b border-gray-100 px-3 py-2.5 flex flex-wrap gap-1.5 flex-shrink-0">
      {options.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onPick(key)}
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
  );
}
