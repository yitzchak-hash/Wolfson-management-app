/**
 * "A newer version is ready" (owner, 2026-10-18: he removed and re-added the
 * notebook and "didn't see" the week chips — his tab had been open since
 * before the update and was still running the old code).
 *
 * A tab never reloads itself, so an update only reaches a screen somebody
 * happens to refresh. Every ten minutes, and whenever the tab comes back into
 * view, this asks the server which bundle it serves now; when it is not the
 * one running here, a small note offers one press to reload. It never reloads
 * by itself — somebody may be half way through typing.
 *
 * The dev server has no /assets bundle, so in development it never shows.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useStore } from '../../data/store';

export async function servedBundleDiffers(): Promise<boolean> {
  const running = [...document.querySelectorAll('script[src*="/assets/index-"]')]
    .map(el => (el as HTMLScriptElement).getAttribute('src') || '')[0];
  if (!running) return false;
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const served = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
    return !!served && served !== running;
  } catch { return false; }
}

const EVERY_MS = 10 * 60_000;

export function NewVersionNote() {
  const isRtl = useStore(s => s.mainUiStrings.isRtl);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let dead = false;
    const check = () => { void servedBundleDiffers().then(d => { if (!dead && d) setReady(true); }); };
    const first = window.setTimeout(check, 30_000);
    const every = window.setInterval(check, EVERY_MS);
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!ready || dismissed) return null;
  return (
    <div data-new-version dir="ltr"
      className="fixed bottom-4 start-4 z-[90] flex items-center gap-2 rounded-full bg-[#1e3a5f] text-white shadow-lg ps-3 pe-1.5 py-1.5 text-[12.5px] font-semibold">
      <span>{isRtl ? 'גרסה חדשה של האפליקציה מוכנה' : 'A newer version of the app is ready'}</span>
      <button data-new-version-reload onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1 rounded-full bg-white text-[#1e3a5f] px-2.5 py-1 font-bold hover:bg-sky-50">
        <RefreshCw size={13} /> {isRtl ? 'רענון' : 'Reload'}
      </button>
      <button onClick={() => setDismissed(true)} title={isRtl ? 'אחר כך' : 'Later'}
        className="rounded-full p-1 text-white/70 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}
