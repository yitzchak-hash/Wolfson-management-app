/**
 * SHARED LINKS — the office side (owner, 2026-11-18: Project settings → Shared, "type a name → a link is created").
 *
 * A link opens /s/<token>: an outside person (a developer, a site manager) sees this one project's board and
 * building, and a read-only apartment window, and may add pins to a plan. Everything they see comes from the server
 * (lib/sharedView.js); this file is only the office's half:
 *
 *  - the TOKEN is 32 random bytes made here, in the browser, and shown ONCE. Only its SHA-256 is saved, so the
 *    cloud never holds a working link — not even in a backup. Lost it? Turn that one off and make a new one.
 *  - turning a link off sets `revokedAt` (a field patch, nothing else), and the server refuses it from then on.
 *  - the outside pins (`sharedPins`) are read here so the office sees them on the apartment's plan, by link name.
 *
 * Both collections are in the full backup (lib/fullBackup.js GLOBAL_COLLECTIONS); a restore never switches a link
 * back on (lib/fullRestore.js NEVER_RESTORED).
 */
import { useEffect, useState } from 'react';
import { fsListenWhere, fsSet, fsPatch, fsGetWhere, isFirebaseConfigured } from './firebase';
import { bareDomain } from './portalLink';
import type { SharedPinFile } from '../types';

const LINKS = 'sharedLinks';
const PINS = 'sharedPins';

export interface SharedLink {
  id: string;
  name: string;
  projectId: string;
  /** SHA-256 of the token, hex. The token itself is never stored. */
  tokenHash: string;
  /** The link's key itself, so it can be copied again (absent on links made before 2026-11-19). */
  token?: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  revokedBy?: string;
  lastOpenedAt?: string | null;
  openCount?: number;
}

/** A pin an outside viewer put on a plan (written by the server only). */
export interface SharedPin {
  id: string;
  linkId: string;
  linkName: string;
  projectId: string;
  apartmentId: string;
  planFileId: string;
  page: number;
  /** 0-100 of the sheet, like the office's own pins. */
  xPct: number;
  yPct: number;
  text: string;
  createdAt: string;
  /** Photos, PDFs and voice notes the outside person added (in the apartment's Drive "Punch List/Outside"). */
  files?: SharedPinFile[];
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(d));
}

/** The address a token opens — on the office's nominated live domain when there is one. */
export function sharedUrl(token: string, domain?: string): string {
  const clean = bareDomain(domain);
  return `${clean ? `https://${clean}` : window.location.origin}/s/${token}`;
}

/** Make a link. Resolves with the full address — the only time it ever exists. */
export async function createSharedLink(projectId: string, name: string, byName: string, domain?: string): Promise<{ link: SharedLink; url: string }> {
  if (!isFirebaseConfigured) throw new Error('The cloud is not connected on this computer.');
  if (!window.crypto?.subtle) throw new Error('This browser cannot make a safe link (it needs a secure https page).');
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = base64url(raw);
  const idBytes = new Uint8Array(12);
  crypto.getRandomValues(idBytes);
  const link: SharedLink = {
    id: `sl_${hex(idBytes)}`,
    name: name.trim().slice(0, 80),
    projectId,
    tokenHash: await sha256Hex(token),
    // Kept so the office can copy the link again any time (owner, 2026-11-19: "you should always have a copy link
    // button"). The server still finds a link only by its hash.
    token,
    createdAt: new Date().toISOString(),
    createdBy: byName,
    revokedAt: null,
    lastOpenedAt: null,
    openCount: 0,
  };
  await fsSet(LINKS, link.id, link);
  // fsSet reports a failure on the sync badge rather than throwing — so look before handing out a link that is not there.
  const back = await fsGetWhere(LINKS, { tokenHash: link.tokenHash });
  if (!back.length) throw new Error('The link was not saved — check the connection and try again.');
  return { link, url: sharedUrl(token, domain) };
}

/** Turn a link off for good. Only `revokedAt` / `revokedBy` are written. */
export function turnOffSharedLink(link: SharedLink, byName: string): Promise<number> {
  return fsPatch(LINKS, link.id, { revokedAt: link.revokedAt ?? null }, { revokedAt: new Date().toISOString(), revokedBy: byName });
}

/** This workspace's links, live. null while the first answer is on its way. */
export function useSharedLinks(projectId: string): SharedLink[] | null {
  const [links, setLinks] = useState<SharedLink[] | null>(null);
  useEffect(() => {
    setLinks(null);
    if (!isFirebaseConfigured) { setLinks([]); return; }
    return fsListenWhere(LINKS, { projectId }, rows => {
      setLinks((rows as unknown as SharedLink[]).slice().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')));
    });
  }, [projectId]);
  return links;
}

/** One line of a link's log, written by the server (lib/sharedView.js) — what the outside person did, from where. */
export interface SharedLogEntry {
  id: string; linkId: string; at: string;
  action: 'open' | 'apartment' | 'plan' | 'photo' | 'pin-add' | 'pin-remove' | 'pin-file';
  apartmentId?: string; ip?: string; city?: string; country?: string; device?: string;
}
const LOGS = 'sharedLinkLogs';
/** A link's log, newest first (read when the office opens it — not live). */
export async function loadSharedLog(linkId: string): Promise<SharedLogEntry[]> {
  const rows = (await fsGetWhere(LOGS, { linkId })) as unknown as SharedLogEntry[];
  return rows.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** The outside pins on one apartment, live (only while its plan is on screen). */
export function useSharedPins(projectId: string, apartmentId: string): SharedPin[] {
  const [pins, setPins] = useState<SharedPin[]>([]);
  useEffect(() => {
    setPins([]);
    if (!isFirebaseConfigured || !apartmentId) return;
    return fsListenWhere(PINS, { projectId, apartmentId }, rows => setPins(rows as unknown as SharedPin[]));
  }, [projectId, apartmentId]);
  return pins;
}
