import React, { useEffect, useRef, useState } from 'react';
import { HardDrive, Check, Loader2, Settings2, X } from 'lucide-react';
import {
  folderPath, composeLocalPath, getDriveRoot, setDriveRoot, guessRoot, separatorFor,
} from '../../data/drivePath';

/**
 * "Copy the folder path" — for opening the drawing in AutoCAD.
 *
 * The architects work from files in the shared drive, mirrored onto their own
 * machines by Google Drive for desktop. Getting there from the app meant
 * hunting through Explorer, which is the slow half of opening a drawing.
 *
 * It COPIES rather than opens, and that is not a shortcut. A page served over
 * https cannot open File Explorer: a `file://` link, a scripted navigation and
 * window.open are all refused, and refused silently — no error is thrown and
 * nothing happens, so a button that tried would read as broken rather than as
 * restricted. Copying and pasting into Explorer's address bar works on every
 * machine, needs nothing installed, and cannot fail quietly.
 *
 * The first press on a machine that has not been told where Drive lives asks,
 * once, rather than sending the office to a settings page to find out why
 * nothing happened.
 */
export function DriveDesktopPath({ driveLink, onToast }: {
  driveLink: string;
  onToast?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [asking, setAsking] = useState(false);
  const [root, setRoot] = useState(getDriveRoot);
  const [failed, setFailed] = useState('');
  const timer = useRef<number>(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!driveLink?.trim()) return null;

  const copy = async (useRoot: string) => {
    setBusy(true); setFailed('');
    try {
      const path = await folderPath(driveLink);
      if (!path) {
        setFailed('Could not work out where that folder sits in Drive.');
        return;
      }
      const full = composeLocalPath(useRoot, path);
      try {
        await navigator.clipboard.writeText(full);
      } catch {
        // Same fallback as everywhere else in the app: a copy that silently
        // does nothing is worse than one that asks for Ctrl+C.
        const ta = document.createElement('textarea');
        ta.value = full; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(full);
      onToast?.('Folder path copied');
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(''), 12_000);
    } finally {
      setBusy(false);
    }
  };

  const press = () => {
    const have = getDriveRoot();
    if (!have) { setAsking(true); return; }
    copy(have);
  };

  const guess = guessRoot();
  const sep = separatorFor(root || guess.value);
  const pasteHint = sep === '\\'
    ? 'Paste it into the address bar at the top of File Explorer and press Enter.'
    : 'In Finder press Cmd+Shift+G, paste it in and press Enter.';

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={press}
        disabled={busy}
        title="Copy this job's folder as it appears on your computer, for opening the drawing in AutoCAD"
        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500
                   hover:text-[#1e3a5f] transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" />
          : copied ? <Check size={12} className="text-green-600" />
          : <HardDrive size={12} />}
        {copied ? 'Path copied' : 'Copy folder path for AutoCAD'}
      </button>

      {copied && (
        <div className="mt-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2">
          <div className="font-mono text-[10.5px] text-green-900 break-all leading-snug">{copied}</div>
          <div className="text-[10px] text-green-700 mt-1">{pasteHint}</div>
          <button
            type="button"
            onClick={() => { setAsking(true); setCopied(''); }}
            className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-green-700">
            <Settings2 size={10} /> wrong path? change where Drive is on this computer
          </button>
        </div>
      )}

      {failed && (
        <div className="mt-1.5 text-[10.5px] text-amber-700">{failed}</div>
      )}

      {asking && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
          onClick={() => setAsking(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <HardDrive size={17} className="text-[#1e3a5f]" />
              <h3 className="font-bold text-gray-900">Where is Google Drive on this computer?</h3>
              <span className="flex-1" />
              <button onClick={() => setAsking(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={15} />
              </button>
            </div>
            {/*
              Said plainly, because it is the one thing about this that
              surprises people: the setting is not shared. Each architect is a
              different Google user on their own machine, and on a Mac the path
              contains their own address — one person's answer is wrong for
              everybody else.
            */}
            <p className="text-xs text-gray-500 mb-3 leading-snug">
              This is asked once per computer and stays on this computer — everyone's is different.
              Type the folder that contains <b>Shared drives</b> and <b>My Drive</b>.
            </p>

            <input
              autoFocus
              value={root}
              onChange={e => setRoot(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter' || !root.trim()) return;
                setDriveRoot(root); setAsking(false); copy(root.trim());
              }}
              placeholder={guess.value}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                         outline-none focus:border-[#4aa8d8]"
            />
            <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">{guess.note}</p>

            {!root.trim() && guess.value && (
              <button
                onClick={() => setRoot(guess.value)}
                className="mt-2 text-[11px] font-semibold text-[#4aa8d8]">
                use {guess.value}
              </button>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setAsking(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
                Cancel
              </button>
              <button
                disabled={!root.trim()}
                onClick={() => { setDriveRoot(root); setAsking(false); copy(root.trim()); }}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#1e3a5f' }}>
                Save and copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
