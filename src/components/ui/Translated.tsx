import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import { TRANSLATE_WORDS, useTranslated, type Lang } from '../../data/translate';

/**
 * A piece of text somebody else wrote, shown in the READER's language with a
 * "show original" link under it — the one drawing for every message, task
 * description and note in the app. With no `to`, or nothing to translate, it
 * is just the text.
 */
export function Translated({ text, to, className, style, dir = 'auto' }: {
  text: string;
  to?: Lang | null;
  className?: string;
  style?: React.CSSProperties;
  dir?: 'auto' | 'ltr' | 'rtl';
}) {
  const tr = useTranslated(text, to);
  const [showOriginal, setShowOriginal] = useState(false);
  if (!tr) return <span className={className} style={style} dir={dir}>{text}</span>;
  const w = TRANSLATE_WORDS[to!];
  return (
    <span className={className} style={style} data-translated={showOriginal ? 'original' : 'translation'}>
      <span dir={dir}>{showOriginal ? text : tr}</span>
      <button
        type="button"
        data-translate-toggle
        onClick={e => { e.stopPropagation(); setShowOriginal(v => !v); }}
        className="inline-flex items-center gap-1 ms-2 align-baseline text-[10.5px] font-semibold opacity-70 hover:opacity-100"
        style={{ color: '#4aa8d8' }}
        title={showOriginal ? w.showTranslation : w.showOriginal}
      >
        <Languages size={10} />
        {showOriginal ? w.showTranslation : w.showOriginal}
      </button>
    </span>
  );
}

/**
 * The translation ALONE, no toggle — for a truncated list row where a link
 * has no room. The row's sheet shows the full `Translated` with the toggle.
 */
export function TrText({ text, to }: { text: string; to?: Lang | null }) {
  const tr = useTranslated(text, to);
  return <>{tr ?? text}</>;
}
