import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

/**
 * A link row that folds away (owner, 2026-10-08: "the Zoho should be
 * collapsible, as well as the Drive folder").
 *
 * Folded, it is ONE line — the icon, the label, and the answer to the only
 * question somebody scanning the window has: is there one, and what is it
 * called. A linked row keeps a small open-arrow on that line, because the
 * Drive folder is the thing the office opens twenty times a day and folding
 * it must not cost a click to get there. Unfolded, it is exactly the controls
 * it always was — the field, the pencil, the status line.
 *
 * Open or closed is remembered per MACHINE (localStorage, `drawer_fold_<id>`):
 * how much of the window you want on screen is about the screen you are at,
 * not the office's data, so it stays out of the store and the backups.
 * Absent means open, which is how every window looked before this existed.
 */
const KEY = (id: string) => `drawer_fold_${id}`;

function readOpen(id: string): boolean {
  try { return localStorage.getItem(KEY(id)) !== '0'; } catch { return true; }
}

export function LinkSection({
  id, icon: Icon, label, summary, linked, href, toggleTitle, children, extra,
}: {
  /** `drive` | `zoho` — names the hook (`data-collapse-<id>`) and the storage key. */
  id: string;
  icon: React.ElementType;
  label: string;
  /** The one-line answer: a folder's title, "linked" or "not linked". */
  summary: string;
  linked: boolean;
  /** Where the folded row's open-arrow goes; absent = no arrow. */
  href?: string;
  toggleTitle: string;
  /** Something small that belongs on the folded line too (the Drive light). */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(KEY(id), next ? '1' : '0'); } catch { /* private mode */ }
  };
  const openHref = href?.trim()
    ? (href.trim().startsWith('http') ? href.trim() : `https://${href.trim()}`)
    : undefined;

  return (
    <div className="min-w-0" data-link-section={id} data-open={open ? '1' : '0'}>
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          {...{ [`data-collapse-${id}`]: '' }}
          aria-expanded={open}
          onClick={toggle}
          title={toggleTitle}
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-start rounded-md hover:bg-gray-50 transition-colors"
        >
          {open
            ? <ChevronDown size={13} className="flex-shrink-0 text-gray-400" />
            : <ChevronRight size={13} className="flex-shrink-0 text-gray-400 rtl:rotate-180" />}
          <Icon size={12} className="flex-shrink-0 text-gray-500" />
          <span className="flex-shrink-0 text-[11px] font-semibold text-gray-600">{label}</span>
          {extra && <span className="flex-shrink-0 inline-flex">{extra}</span>}
          <span data-link-summary
            className={`min-w-0 truncate text-[11px] ${linked ? 'font-medium text-gray-800' : 'italic text-gray-400'}`}>
            · {summary}
          </span>
        </button>
        {!open && openHref && (
          <a href={openHref} target="_blank" rel="noopener noreferrer" data-link-open={id}
            title={summary}
            className="flex-shrink-0 w-7 h-7 rounded-md border border-gray-200 text-gray-400 hover:text-[#4aa8d8] hover:border-[#4aa8d8] flex items-center justify-center transition-colors">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      {/* The field's own label would say the header's words a second time. */}
      {open && <div className="mt-1 [&>div>label:first-child]:hidden">{children}</div>}
    </div>
  );
}
