/**
 * Printing, done once.
 *
 * Every print button in the app opens the same kind of sheet: a title, a line
 * of context, then the content. Doing it here rather than page by page means a
 * printout looks the same wherever it came from, and it means none of the
 * calling pages have to know about print CSS, page breaks or popup blockers.
 *
 * Deliberately NOT `window.print()` on the app itself. The app is a dark,
 * scrolling, full-height layout with fixed rails and overflow containers —
 * printing it directly gives one page of sidebar. A clean document built for
 * paper is the only thing that produces a sheet somebody can carry.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface PrintOptions {
  /** Extra line under the title — filters applied, totals, whatever gives it context. */
  subtitle?: string;
  /** Landscape suits wide tables and building diagrams. */
  landscape?: boolean;
  /** Hebrew sheets need the whole document flipped. */
  rtl?: boolean;
  /** Extra CSS for the sheet. */
  css?: string;
  /** Wait before firing the dialog — images need a moment to decode. */
  delay?: number;
}

function chrome(title: string, body: string, o: PrintOptions = {}) {
  return `<!doctype html>
<html dir="${o.rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${o.landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  /* @page margins only apply on paper. The preview the user sees first is a
     screen, so give it the same breathing room or the sheet looks broken. */
  body { margin:0; padding:16px 20px; font:12px/1.5 "Segoe UI",Helvetica,Arial,sans-serif; color:#111827; }
  @media print { body { padding:0; } }
  .sheet-head { border-bottom:2px solid #1e3a5f; padding-bottom:8px; margin-bottom:14px;
    display:flex; align-items:flex-end; gap:12px; }
  .sheet-head h1 { margin:0; font-size:17px; color:#1e3a5f; letter-spacing:-.01em; }
  .sheet-head .sub { font-size:11px; color:#6b7280; margin-top:2px; }
  .sheet-head .when { margin-${o.rtl ? 'right' : 'left'}:auto; font-size:10px; color:#9ca3af;
    white-space:nowrap; text-align:${o.rtl ? 'left' : 'right'}; }
  table { border-collapse:collapse; width:100%; }
  thead { display:table-header-group; }          /* repeat the header on every page */
  tr { break-inside:avoid; page-break-inside:avoid; }
  th { text-align:${o.rtl ? 'right' : 'left'}; font-size:9.5px; text-transform:uppercase;
    letter-spacing:.05em; color:#6b7280; border-bottom:1.5px solid #d1d5db; padding:6px 7px; }
  td { border-bottom:1px solid #f1f3f5; padding:6px 7px; vertical-align:top; font-size:11.5px; }
  tbody tr:nth-child(even) td { background:#fafbfc; }
  .muted { color:#9ca3af; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-${o.rtl ? 'left' : 'right'}:5px;
    vertical-align:middle; }
  .pill { display:inline-block; padding:1px 6px; border-radius:9px; font-size:9.5px; font-weight:700; }
  .card { border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; margin-bottom:8px;
    break-inside:avoid; page-break-inside:avoid; }
  .card h3 { margin:0 0 3px; font-size:12.5px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .foot { margin-top:16px; padding-top:6px; border-top:1px solid #e5e7eb;
    font-size:9px; color:#b0b7c3; }
  img.page { width:100%; display:block; page-break-after:always; }
  img.page:last-of-type { page-break-after:auto; }
  @media print { .noprint { display:none !important; } }
  ${o.css ?? ''}
</style></head>
<body>
  <div class="sheet-head">
    <div>
      <h1>${esc(title)}</h1>
      ${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}
    </div>
    <div class="when">TzviAir<br>${new Date().toLocaleString()}</div>
  </div>
  ${body}
  <div class="foot">Printed from the TzviAir job management system.</div>
</body></html>`;
}

/**
 * Open the sheet and put the print dialog up.
 *
 * Returns false when the browser blocked the window, so the caller can say so
 * rather than looking as though the button did nothing.
 */
export function printSheet(title: string, bodyHtml: string, o: PrintOptions = {}): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(chrome(title, bodyHtml, o));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* user closed it */ } }, o.delay ?? 250);
  return true;
}

export interface PrintColumn<T> {
  header: string;
  /** Return a string, or pre-escaped HTML when `html` is set. */
  value: (row: T) => string;
  html?: boolean;
  width?: string;
}

/** The common case: a titled table with a repeating header. */
export function printTable<T>(
  title: string,
  rows: T[],
  columns: PrintColumn<T>[],
  o: PrintOptions = {},
): boolean {
  if (!rows.length) {
    return printSheet(title, '<p class="muted">Nothing to print — no rows match the current filters.</p>', o);
  }
  const head = columns
    .map(c => `<th${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.header)}</th>`).join('');
  const body = rows.map(r =>
    `<tr>${columns.map(c => `<td>${c.html ? c.value(r) : esc(c.value(r))}</td>`).join('')}</tr>`,
  ).join('');
  return printSheet(title, `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, o);
}

/** A coloured dot, for stage and status columns. Already escaped. */
export const printDot = (color: string, label: string) =>
  `<span class="dot" style="background:${esc(color)}"></span>${esc(label)}`;

export const printPill = (bg: string, fg: string, label: string) =>
  `<span class="pill" style="background:${esc(bg)};color:${esc(fg)}">${esc(label)}</span>`;

/** Full-page images — used by anything that prints a rendered view. */
export function printImages(title: string, dataUrls: string[], o: PrintOptions = {}): boolean {
  return printSheet(
    title,
    dataUrls.map(src => `<img class="page" src="${src}">`).join(''),
    { delay: 600, ...o },
  );
}

/** Escape hatch for callers building their own markup. */
export const printEsc = esc;
