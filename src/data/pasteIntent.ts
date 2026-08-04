/**
 * Works out what a clipboard string MEANS, so the right-click menu can offer one
 * specific action instead of a generic "Paste".
 *
 * Plain "Paste" is always disabled; only the matching action lights up. On a
 * node it fills that field (asking first if the field is already set); on empty
 * board a link offers to create a new job.
 */
export type PasteKind = 'drive' | 'zoho' | 'aptNumber' | 'familyName' | 'none';

export interface PasteIntent {
  kind: PasteKind;
  value: string;
  /** Short menu label, e.g. "Paste as Drive link". */
  label: string;
}

const DRIVE_RE = /(?:drive|docs)\.google\.com\//i;
const ZOHO_RE = /(?:^|\/\/|\.)zoho\.(?:com|eu|in)\b/i;

export function detectPasteIntent(raw: string | null | undefined): PasteIntent {
  const s = (raw ?? '').trim();
  if (!s) return { kind: 'none', value: '', label: 'Paste' };

  if (DRIVE_RE.test(s)) return { kind: 'drive', value: s, label: 'Paste as Drive link' };
  if (ZOHO_RE.test(s)) return { kind: 'zoho', value: s, label: 'Paste as Zoho link' };

  // A bare 1-3 digit number is an apartment number, not a name.
  if (/^\d{1,3}$/.test(s)) return { kind: 'aptNumber', value: s, label: 'Paste as apartment number' };

  // Short text with no URL scheme reads as a family / job name. Length-capped so
  // a pasted paragraph does not silently become someone's name.
  if (!/^https?:\/\//i.test(s) && s.length <= 60 && /[^\d\s]/.test(s)) {
    return { kind: 'familyName', value: s, label: 'Paste as family name' };
  }

  return { kind: 'none', value: s, label: 'Paste' };
}

/** Which Apartment field an intent writes to. */
export function fieldForIntent(kind: PasteKind): 'driveLink' | 'zohoLink' | 'apartmentNumber' | 'displayName' | null {
  switch (kind) {
    case 'drive': return 'driveLink';
    case 'zoho': return 'zohoLink';
    case 'aptNumber': return 'apartmentNumber';
    case 'familyName': return 'displayName';
    default: return null;
  }
}

/** Only links can create a job from empty canvas. */
export function canCreateFromIntent(kind: PasteKind): boolean {
  return kind === 'drive' || kind === 'zoho';
}
