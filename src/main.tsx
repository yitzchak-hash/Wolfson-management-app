import React from 'react'
import ReactDOM from 'react-dom/client'
import { bootPreview } from './data/previewMode'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import './index.css'

/**
 * A tab that outlives its deploy heals itself.
 *
 * Every deploy renames the hashed chunk files, so a tab still running
 * yesterday's bundle that lazy-loads the plan editor asks Vercel for a file
 * that no longer exists — "Failed to fetch dynamically imported module:
 * …/PlanAnnotator-XXXX.js", a crash screen over a task that did nothing
 * wrong. Vite announces exactly this failure; one reload fetches the current
 * bundle and the same click then works. Throttled through sessionStorage so
 * a genuinely broken network can never spin the page in a reload loop.
 */
window.addEventListener('vite:preloadError', event => {
  const KEY = 'chunk_reload_at';
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 30_000) return;   // let the real error surface
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

/**
 * A backup PREVIEW tab (previewMode.ts) loads the backup and seals itself off
 * BEFORE the app — and with it the store and the cloud connection — starts.
 */
const root = ReactDOM.createRoot(document.getElementById('root')!);

/**
 * THE SHARED VIEW (/s/<token>, owner 2026-11-18) is a different app: it never loads the office app, the store or
 * Firebase — only its own chunk, which gets everything from the server (src/shared, lib/sharedView.js).
 */
if (/^\/s\//.test(window.location.pathname)) {
  Promise.all([import('./shared/SharedViewerApp.tsx'), import('./shared/sharedApi.ts')])
    .then(([{ default: SharedViewerApp }, { tokenFromPath }]) => {
      root.render(
        <React.StrictMode>
          <SharedViewerApp token={tokenFromPath(window.location.pathname)} />
        </React.StrictMode>,
      );
    })
    .catch(() => {
      root.render(<div style={{ padding: 32, fontFamily: 'system-ui', color: '#7f1d1d' }}><h2>This page could not open</h2></div>);
    });
} else bootPreview((import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '')
  .then(() => import('./App.tsx'))
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch(e => {
    root.render(
      <div style={{ padding: 32, fontFamily: 'system-ui', color: '#7f1d1d' }}>
        <h2>The backup preview could not open</h2>
        <p>{String((e as Error)?.message ?? e)}</p>
      </div>,
    );
  });
