/**
 * The shared view's ONLY way to the data: the server route in lib/sharedView.js (through /api/share?sv=…).
 *
 * Nothing in src/shared may import the store or Firebase — this page is opened by people outside the office, and it
 * must never hold the database's keys or a copy of anything the server did not choose to send.
 */
import type { Apartment, Building, BoardSetting, Stage, ContractorPhoto } from '../types';

export type SharedApartment = Apartment & { planRef?: string; planByTzvi?: boolean };
export interface ViewerPin {
  id: string; apartmentId: string; planRef: string; page: number; xPct: number; yPct: number; text: string; createdAt: string;
}
export interface SharedViewData {
  link: { name: string };
  project: { id: string; name: string };
  buildings: Array<Pick<Building, 'id' | 'name'>>;
  board: BoardSetting;
  stages: Stage[];
  apartments: SharedApartment[];
  pins: ViewerPin[];
}
export interface DrivePhoto { ref: string; mimeType: string; folder: string }

export type Failure = 'gone' | 'busy' | 'offline';
export class SharedError extends Error {
  constructor(public kind: Failure) { super(kind); }
}

const API = '/api/share';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The token in the address (/s/<token>), or null when it is not one. */
export function tokenFromPath(path: string): string | null {
  const m = /^\/s\/([^/?#]+)\/?$/.exec(path);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

export function makeApi(token: string) {
  const headers = { 'x-share-token': token };
  async function get<T>(query: string): Promise<T> {
    let r: Response;
    try { r = await fetch(`${API}?${query}`, { headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch { throw new SharedError('offline'); }
    if (r.status === 404) throw new SharedError('gone');
    if (r.status === 429) throw new SharedError('busy');
    if (!r.ok) throw new SharedError('offline');
    return r.json() as Promise<T>;
  }
  return {
    data: () => get<SharedViewData>('sv=data'),
    media: (aptId: string) => get<{ photos: ContractorPhoto[] }>(`sv=media&apt=${encodeURIComponent(aptId)}`).then(r => r.photos),
    photos: (aptId: string) => get<{ photos: DrivePhoto[] }>(`sv=photos&apt=${encodeURIComponent(aptId)}`).then(r => r.photos),
    /** An address an <img> or <video> can use (they cannot send a header, so the token rides along). */
    fileUrl: (ref: string, w?: number) =>
      `${API}?sv=file&f=${encodeURIComponent(ref)}${w ? `&w=${w}` : ''}&t=${encodeURIComponent(token)}`,
    async fileBytes(ref: string, onProgress?: (got: number, total: number | null) => void): Promise<Blob> {
      let r: Response;
      try { r = await fetch(`${API}?sv=file&f=${encodeURIComponent(ref)}`, { headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
      catch { throw new SharedError('offline'); }
      if (r.status === 404) throw new SharedError('gone');
      if (!r.ok || !r.body) throw new SharedError('offline');
      const total = Number(r.headers.get('content-length')) || null;
      const type = r.headers.get('content-type') ?? 'application/octet-stream';
      const reader = r.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        onProgress?.(got, total);
      }
      return new Blob(parts as BlobPart[], { type });
    },
    async addPin(pin: { apartmentId: string; planRef: string; page: number; xPct: number; yPct: number; text: string }): Promise<ViewerPin> {
      let r: Response;
      try {
        r = await fetch(`${API}?sv=pin`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(pin),
          cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        });
      } catch { throw new SharedError('offline'); }
      if (r.status === 404) throw new SharedError('gone');
      if (r.status === 429) throw new SharedError('busy');
      if (!r.ok) throw new SharedError('offline');
      return (await r.json()).pin as ViewerPin;
    },
    async deletePin(id: string): Promise<void> {
      let r: Response;
      try {
        r = await fetch(`${API}?sv=pin&id=${encodeURIComponent(id)}`, { method: 'DELETE', headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      } catch { throw new SharedError('offline'); }
      if (r.status === 404) throw new SharedError('gone');
      if (!r.ok) throw new SharedError('offline');
    },
  };
}
export type SharedApi = ReturnType<typeof makeApi>;
