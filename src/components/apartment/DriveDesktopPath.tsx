import React, { useEffect, useRef, useState } from 'react';
import { HardDrive, Check, Loader2, X, Download, FolderOpen } from 'lucide-react';
import {
  folderPath, composeLocalPath, getDriveRoot, setDriveRoot, guessRoot, separatorFor,
} from '../../data/drivePath';
import {
  guessPlatform, helperInstalled, setHelperInstalled, openUrl,
  windowsInstaller, macInstaller, download,
} from '../../data/tzviairHelper';

/**
 * The job's folder, on the architect's own machine — for opening the drawing.
 *
 * One small button on the Drive row. What it does depends on whether this
 * machine has the helper:
 *
 *  · with it, the folder opens in File Explorer or Finder — one press;
 *  · without it, the path goes on the clipboard to paste into the address bar.
 *
 * The copy path is not a lesser fallback, it is the one that always works: a
 * page served over https cannot open File Explorer by itself, and every
 * attempt is refused silently. The helper exists precisely so the machine can
 * volunteer to do what the page may not.
 */
export function DriveDesktopPath({ driveLink, onToast, variant = 'icon', onDone }: {
  driveLink: string;
  onToast?: (msg: string, type?: 'success' | 'error') => void;
  /**
   * `icon` is the button that sits on the Drive row. `row` is the same thing
   * as a line in a menu, where an unlabelled icon would be unreadable.
   *
   * One component rather than two, because the interesting half is not the
   * button — it is resolving the path, choosing between opening and copying,
   * and the settings panel behind it. Copying that would mean two places to
   * fix the next time the helper changes.
   */
  variant?: 'icon' | 'row';
  /** Lets a menu close itself once the press has been handled. */
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [panel, setPanel] = useState(false);
  const [root, setRoot] = useState(getDriveRoot);
  const [hasHelper, setHasHelper] = useState(helperInstalled);
  const [copied, setCopied] = useState('');
  const timer = useRef<number>(0);

  useEffect(() => () => clearTimeout(timer.current), []);
  if (!driveLink?.trim()) return null;

  const platform = guessPlatform();

  async function resolve(useRoot: string): Promise<string | null> {
    const path = await folderPath(driveLink);
    if (!path) { onToast?.('Could not work out where that folder sits in Drive.', 'error'); return null; }
    return composeLocalPath(useRoot, path);
  }

  async function go(useRoot: string) {
    setBusy(true);
    try {
      const full = await resolve(useRoot);
      if (!full) return;
      if (hasHelper) {
        // Handed to the machine's own handler. Nothing to await and nothing to
        // catch: if no handler is registered the browser does nothing at all,
        // which is why the copy stays one press away in the panel.
        window.location.href = openUrl(full);
        onToast?.('Opening the folder…');
      } else {
        try {
          await navigator.clipboard.writeText(full);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = full; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopied(full);
        onToast?.('Folder path copied');
      }
      setDone(true);
      onDone?.();
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  const press = () => {
    if (!getDriveRoot()) { setPanel(true); return; }
    go(getDriveRoot());
  };

  const label = hasHelper ? 'Open the folder on this computer' : 'Copy the folder path';

  const guess = guessRoot();
  const sep = separatorFor(root || guess.value);

  return (
    <>
      {variant === 'row' ? (
        <button
          type="button"
          onClick={press}
          onContextMenu={e => { e.preventDefault(); setPanel(true); }}
          disabled={busy}
          title="For opening the drawing in AutoCAD — right-click for settings"
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50
                     flex items-center gap-2.5 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin text-gray-400" />
            : done ? <Check size={14} className="text-green-600" />
            : hasHelper ? <FolderOpen size={14} className="text-gray-400" />
            : <HardDrive size={14} className="text-gray-400" />}
          {done ? (hasHelper ? 'Opening…' : 'Copied') : label}
        </button>
      ) : (
        <button
          type="button"
          onClick={press}
          onContextMenu={e => { e.preventDefault(); setPanel(true); }}
          disabled={busy}
          title={hasHelper
            ? "Open this job's folder on this computer, for AutoCAD — right-click for settings"
            : "Copy this job's folder path, for AutoCAD — right-click for settings"}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-[#1e3a5f]
                     hover:border-[#1e3a5f] flex items-center justify-center transition-colors
                     flex-shrink-0 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" />
            : done ? <Check size={13} className="text-green-600" />
            : hasHelper ? <FolderOpen size={13} />
            : <HardDrive size={13} />}
        </button>
      )}

      {panel && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
          onClick={() => setPanel(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[88vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <HardDrive size={17} className="text-[#1e3a5f]" />
              <h3 className="font-bold text-gray-900">Opening job folders on this computer</h3>
              <span className="flex-1" />
              <button onClick={() => setPanel(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={15} />
              </button>
            </div>
            {/*
              Said plainly, because it is what surprises people: this is not a
              shared setting. Each architect is a different Google user on their
              own machine, and on a Mac the path carries their own address, so
              one person's answer is wrong for everybody else.
            */}
            <p className="text-xs text-gray-500 mb-4 leading-snug">
              Both settings below are for <b>this computer only</b> — everyone's are different.
            </p>

            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Where Google Drive is
            </label>
            <input
              value={root}
              onChange={e => setRoot(e.target.value)}
              onBlur={() => setDriveRoot(root)}
              placeholder={guess.value}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                         outline-none focus:border-[#4aa8d8]"
            />
            <p className="text-[11px] text-gray-400 mt-1.5 mb-4 leading-snug">
              The folder containing <b>Shared drives</b> and <b>My Drive</b>. {guess.note}
            </p>

            <div className="rounded-xl border border-gray-200 p-3 mb-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={hasHelper} className="mt-0.5"
                  onChange={e => { setHasHelper(e.target.checked); setHelperInstalled(e.target.checked); }} />
                <span>
                  <span className="block text-xs font-semibold text-gray-700">
                    The one-click helper is installed here
                  </span>
                  <span className="block text-[11px] text-gray-400 leading-snug">
                    With it the button opens the folder outright. Without it, it copies the path for
                    you to paste — which always works and needs nothing installed.
                  </span>
                </span>
              </label>

              <button
                onClick={() => {
                  const r = (root || getDriveRoot()).trim();
                  if (!r) { onToast?.('Fill in where Drive is first.', 'error'); return; }
                  setDriveRoot(r);
                  if (platform === 'windows') {
                    const { reg, cmd } = windowsInstaller(r);
                    download('open-folder.cmd', cmd);
                    setTimeout(() => download('tzviair-helper.reg', reg), 400);
                    onToast?.('Two files downloaded — see the steps below');
                  } else {
                    download('install-tzviair.sh', macInstaller(r));
                    onToast?.('Installer downloaded — see the steps below');
                  }
                }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg
                           text-xs font-bold text-white"
                style={{ backgroundColor: '#1e3a5f' }}>
                <Download size={13} /> Get the helper for {platform === 'windows' ? 'Windows' : 'this Mac'}
              </button>

              <ol className="mt-2.5 text-[11px] text-gray-500 leading-snug list-decimal pl-4 space-y-0.5">
                {platform === 'windows' ? (
                  <>
                    <li>Put <span className="font-mono">open-folder.cmd</span> in
                      {' '}<span className="font-mono">C:\ProgramData\TzviAir\</span> (create the folder).</li>
                    <li>Double-click <span className="font-mono">tzviair-helper.reg</span> and say yes.</li>
                    <li>Tick the box above.</li>
                  </>
                ) : (
                  <>
                    <li>Open Terminal in your Downloads folder.</li>
                    <li>Run <span className="font-mono">bash install-tzviair.sh</span></li>
                    <li>Tick the box above.</li>
                  </>
                )}
              </ol>
              <p className="text-[10.5px] text-gray-400 mt-2 leading-snug">
                It only ever opens a folder — never runs anything — and refuses any folder that is not
                inside the Drive root above.
              </p>
            </div>

            {copied && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 mb-3">
                <div className="font-mono text-[10.5px] text-green-900 break-all leading-snug">{copied}</div>
                <div className="text-[10px] text-green-700 mt-1">
                  {sep === '\\'
                    ? "Paste it into File Explorer's address bar."
                    : 'In Finder press Cmd+Shift+G and paste it in.'}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setPanel(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
                Close
              </button>
              <button
                disabled={!root.trim()}
                onClick={() => { setDriveRoot(root); go(root.trim()); }}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#1e3a5f' }}>
                {hasHelper ? 'Open the folder' : 'Copy the path'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
