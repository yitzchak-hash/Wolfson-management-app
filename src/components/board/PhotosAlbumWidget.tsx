import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, RefreshCw } from 'lucide-react';
import { CanvasElement } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import { PhotosIcon } from '../ui/BrandIcons';

/**
 * A shared Google Photos album on the board.
 *
 * Paste the album's SHARE link and the widget wears the album's own cover
 * picture with the Photos mark on it; clicking it opens the album. The cover
 * comes through `/api/photos-cover`, which reads the share page's og:image on
 * the server (a browser cannot read a cross-origin page) — and the answer is
 * written back onto the node, which syncs, so one machine's lookup serves
 * every screen including the TV.
 *
 * The honest cases matter as much as the picture: an album that is NOT shared
 * has no public page, and the widget says so and says what to press in Google
 * Photos — a broken grey square would read as the widget's fault. A failed
 * fetch is a different sentence with a retry.
 *
 * `data.sample` is the shelf's door (the weather precedent): the store has no
 * business making network calls, and a card stuck on "reading the album…"
 * previews nothing — it draws a canned cover instead.
 */

interface Cover { for?: string; shared?: boolean; cover?: string; title?: string }

export function PhotosAlbumWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const album = String(data.album ?? '').trim();
  const saved = (data.cover as Cover | undefined);
  // A stored answer only counts for the link it was fetched for — changing
  // the link in the pencil must refetch, not show the old album's picture.
  const have = saved && saved.for === album ? saved : undefined;

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const fetching = useRef(false);

  const looksRight = (u: string) => /photos\.app\.goo\.gl|photos\.google\.com|goo\.gl/i.test(u);

  useEffect(() => {
    if (!album || have || data.sample || failed || fetching.current || c.readOnly) return;
    fetching.current = true;
    (async () => {
      try {
        const r = await fetch('/api/photos-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: album }),
        });
        if (!r.ok) { setFailed(true); return; }
        const j = await r.json();
        c.update({
          data: {
            ...d(el),
            cover: { for: album, shared: !!j.shared, cover: j.cover || '', title: j.title || '' },
          },
        });
      } catch {
        setFailed(true);
      } finally {
        fetching.current = false;
      }
    })();
  }, [album, have, failed]);

  const saveLink = (link: string) => {
    setFailed(false);
    c.update({ data: { ...d(el), album: link.trim(), cover: undefined } });
    setDraft(''); setEditing(false);
  };

  // ── paste / change the link ───────────────────────────────────────────────
  if (!album || editing) {
    return (
      <Frame title={String(data.title || 'Google Photos')} icon={PhotosIcon} tone="#34a853">
        <div className="h-full flex flex-col gap-1.5 min-h-0 justify-center">
          <div className="text-[10px] text-gray-500">
            In Google Photos open the album, press Share, Create link — and paste it here.
          </div>
          <input
            data-no-drag data-el-action data-photos-link
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && looksRight(draft)) saveLink(draft); }}
            placeholder="https://photos.app.goo.gl/…"
            className="w-full text-[11px] rounded-lg border border-gray-200 px-2 py-1.5
                       outline-none focus:border-[#34a853]"
          />
          <div className="flex gap-1">
            <button data-no-drag data-el-action data-photos-save
              onClick={() => saveLink(draft)}
              disabled={!looksRight(draft)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: '#34a853' }}>
              Show the album
            </button>
            {editing && (
              <button data-no-drag data-el-action onClick={() => { setEditing(false); setDraft(''); }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 border border-gray-200">
                Cancel
              </button>
            )}
          </div>
        </div>
      </Frame>
    );
  }

  // ── the shelf's canned cover ──────────────────────────────────────────────
  const sample = !!data.sample;
  const shared = sample ? true : have?.shared;
  const coverUrl = sample ? '' : have?.cover;
  const albumTitle = sample ? 'Site photos — Wolfson A1' : (have?.title || '');

  const body = (() => {
    if (!sample && !have && !failed) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400">
          Reading the album…
        </div>
      );
    }
    if (failed) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
          <div className="text-[11px] font-semibold text-gray-600">Couldn't reach Google Photos.</div>
          <button data-no-drag data-el-action data-photos-retry
            onClick={() => setFailed(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
            style={{ backgroundColor: '#34a853' }}>
            <RefreshCw size={11} /> Try again
          </button>
        </div>
      );
    }
    if (!shared) {
      return (
        <div data-photos-unshared
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
          <PhotosIcon size={26} />
          <div className="text-[11px] font-semibold text-gray-700">This album isn't shared.</div>
          <div className="text-[9.5px] text-gray-500 leading-snug">
            In Google Photos open the album, press Share, then Create link — and paste that link here.
          </div>
          <button data-no-drag data-el-action onClick={() => setEditing(true)}
            className="mt-0.5 px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 border border-gray-300">
            Change the link
          </button>
        </div>
      );
    }
    return (
      <a data-no-drag data-el-action data-photos-cover
        href={album} target="_blank" rel="noopener noreferrer"
        title="Open the album in Google Photos"
        className="absolute inset-0 block group/ph">
        {coverUrl
          ? <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, #cfe8ff 0%, #d9f3e0 45%, #fff3cd 100%)' }} />}
        {/* The Photos mark on a white plate — the standing badge idiom, so the
            picture says whose picture it is at a glance. */}
        <span className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 rounded-full
                         pl-1.5 pr-2 py-1 shadow" data-photos-mark>
          <PhotosIcon size={13} />
          <span className="text-[9px] font-bold text-gray-700">Photos</span>
        </span>
        <span className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 flex items-end gap-1.5"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.55))' }}>
          <span className="flex-1 text-[11px] font-bold text-white truncate">
            {albumTitle || 'Open the album'}
          </span>
          <ExternalLink size={12} className="text-white/80 flex-shrink-0" />
        </span>
      </a>
    );
  })();

  return (
    <Frame title={String(data.title || 'Google Photos')} icon={PhotosIcon} tone="#34a853">
      <div className="h-full min-h-0 relative rounded-lg overflow-hidden bg-gray-50 group/phbox">
        {body}
        {/* Change-the-link, revealed on hover (always visible on touch via the
            standing any-hover rule). */}
        {!sample && (
          <button data-no-drag data-el-action data-photos-edit
            title="Change the album link"
            onClick={() => setEditing(true)}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 shadow flex items-center
                       justify-center text-gray-500 opacity-0 group-hover/phbox:opacity-100">
            <Pencil size={11} />
          </button>
        )}
      </div>
    </Frame>
  );
}
