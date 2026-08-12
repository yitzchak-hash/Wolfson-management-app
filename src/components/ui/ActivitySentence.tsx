import React from 'react';
import { ActivityPart } from '../../data/activityText';

/**
 * An activity line, with the job's name as something you can press.
 *
 * The feed's whole purpose is "who did what" — and the answer always ends with
 * you wanting to look at the job it happened to. Printing the name as plain
 * text meant reading it, then going and finding it on the board by hand, which
 * is the slow half of the job the feed was supposed to save.
 *
 * The name is underlined and carries the accent colour, so it reads as a link
 * before you try it rather than after.
 *
 * `data-no-drag` and `data-el-action` are not decoration: the board's node
 * handler takes any press inside a widget as the start of a drag unless the
 * target opts out, so without them the link would never fire on the board —
 * only on the TV, where nothing drags. Every interactive thing inside a widget
 * needs both.
 */
export function ActivitySentence({
  parts,
  onOpen,
  className = '',
  linkClassName = 'underline decoration-dotted underline-offset-2 font-semibold hover:decoration-solid',
  linkColor = '#4aa8d8',
}: {
  parts: ActivityPart[];
  /** Absent (or the TV's read-only mode) leaves the whole line as plain text. */
  onOpen?: (jobId: string) => void;
  className?: string;
  linkClassName?: string;
  linkColor?: string;
}) {
  return (
    <span className={className}>
      {parts.map((p, i) => (
        p.jobId && onOpen ? (
          <button
            key={i}
            type="button"
            data-no-drag
            data-el-action
            onClick={e => { e.stopPropagation(); onOpen(p.jobId!); }}
            className={linkClassName}
            style={{ color: linkColor }}
            title={`Open ${p.text}`}
          >
            {p.text}
          </button>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        )
      ))}
    </span>
  );
}
