import React from 'react';

/**
 * Brand and domain icons drawn as inline SVG.
 *
 * lucide has no Google Drive or Zoho mark, and a generic link/folder glyph makes
 * the three tile buttons hard to tell apart at a glance. These are the real
 * shapes, so the button says what it opens without being read.
 */

/** Google Drive — the three-panel triangle, in its own colours. */
export function DriveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.7 2.5h8.6l7.2 12.5h-8.6z" fill="#ffc107" />
      <path d="M.5 15 4.8 7.5 13.4 22.5H4.8z" fill="#1976d2" />
      <path d="M4.8 22.5 9.1 15h14.4l-4.3 7.5z" fill="#4caf50" />
    </svg>
  );
}

/** Zoho — the wordmark's four-square motif, reduced to an identifiable glyph. */
export function ZohoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="3" width="9.5" height="8" rx="1.6" fill="#e42527" />
      <rect x="13" y="3" width="9.5" height="8" rx="1.6" fill="#f9b21d" />
      <rect x="1.5" y="13" width="9.5" height="8" rx="1.6" fill="#089949" />
      <rect x="13" y="13" width="9.5" height="8" rx="1.6" fill="#226db4" />
    </svg>
  );
}

/**
 * Architectural plan — a folded drawing sheet with a floor-plan figure on it.
 * Reads as "the plans" rather than a generic document.
 */
export function PlanIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5 9 3l6 1.5L21 3v16.5L15 21l-6-1.5L3 21z" />
      <path d="M9 3v16.5M15 4.5V21" />
      <path d="M5.4 9.4h2.2M5.4 13.2h2.2M11 7.6h2.4v4.2H11z" />
    </svg>
  );
}

/**
 * Waze — the speech-bubble face, reduced to an identifiable glyph. Sits at the
 * end of an address so a worker on site can press it and be navigating; the
 * words "open navigation" would take more room than the whole address field.
 */
export function WazeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.2c-4.9 0-8.9 3.6-8.9 8.1 0 1.6.5 3.1 1.4 4.4-.3.9-1 1.7-2 2.1-.5.2-.5.9 0 1.1 1.3.6 2.7.7 3.9.4 1.6 1.3 3.6 2 5.6 2 4.9 0 8.9-3.6 8.9-8.1S16.9 2.2 12 2.2z"
        fill="#33ccff"
      />
      <circle cx="9.2" cy="9.6" r="1.15" fill="#0b2239" />
      <circle cx="15" cy="9.6" r="1.15" fill="#0b2239" />
      <path d="M8.8 13.2c.8 1.4 2 2.1 3.3 2.1s2.5-.7 3.3-2.1"
        fill="none" stroke="#0b2239" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Google Photos — the four-petal pinwheel, reduced to an identifiable glyph. */
export function PhotosIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 A5 5 0 0 0 12 12 Z" fill="#4285f4" />
      <path d="M22 12 A5 5 0 0 0 12 12 Z" fill="#ea4335" />
      <path d="M12 22 A5 5 0 0 0 12 12 Z" fill="#fbbc04" />
      <path d="M2 12 A5 5 0 0 0 12 12 Z" fill="#34a853" />
    </svg>
  );
}

/** The Waze link for an address — opens the app on a phone, the site on a desk. */
export function wazeUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

/** TV — with a slash when hidden from the wallboard. */
export function TvIcon({ size = 14, hidden = false, color = 'currentColor' }: {
  size?: number; hidden?: boolean; color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4.5" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      {hidden && <path d="M3 3l18 18" strokeWidth="2.2" />}
    </svg>
  );
}
