import React from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * The CRM's small marks (ecosystem slice S12). A field the CRM owns (job
 * number, customer, address, phone) carries the "CRM" tag beside its label and
 * shows its value read-only; a press on either opens the CRM in a new tab.
 */

/** The glyph on every "opens the CRM" control. */
export function CrmMark({ size = 12 }: { size?: number }) {
  return <ExternalLink size={size} aria-hidden="true" className="flex-shrink-0" />;
}

/** The tag beside a CRM-owned field's label. `title` is the mark's name ("From CRM"). */
export function FromCrmTag({ href, title, field }: { href: string; title: string; field: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
      data-from-crm={field}
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 ms-1.5 px-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:border-indigo-300 text-[9px] font-bold leading-[14px] align-middle">
      CRM <CrmMark size={9} />
    </a>
  );
}

/** A CRM-owned value: not an input here, a link to where it is edited. */
export function CrmValue({ href, title, value, field, className = '' }: {
  href: string; title: string; value: string; field: string; className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
      data-crm-value={field}
      onClick={e => e.stopPropagation()}
      className={`flex items-center gap-2 w-full min-w-0 border border-indigo-100 bg-indigo-50/40 rounded-lg px-3 py-2 text-sm text-gray-800 hover:border-indigo-300 transition-colors ${className}`}>
      <span className="truncate flex-1 min-w-0">{value || ' '}</span>
      <span className="text-indigo-500"><CrmMark size={12} /></span>
    </a>
  );
}
