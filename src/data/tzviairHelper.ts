/**
 * The one-click helper, and why it is an install rather than a link.
 *
 * A page served over https cannot open File Explorer. Every route to it — a
 * `file://` link, a scripted navigation, `window.open` — is refused by the
 * browser, and refused silently. The only way to cross that line is for the
 * machine itself to volunteer: register a URL scheme, and the browser will hand
 * anything addressed to it over to a program that IS allowed to open folders.
 *
 * That is exactly how Slack, Zoom and Figma open their desktop apps from a web
 * page, so it is a well-trodden path rather than a trick.
 *
 * Two rules make it safe to install on somebody's work machine:
 *
 *  · It only ever opens a FOLDER, never runs anything. `explorer.exe <path>`
 *    and `open -R <path>` show a folder; they do not execute what is in it.
 *  · It refuses any path that is not under the Drive root it was installed
 *    with. A stray web page can address `tzviair://` — anything can — so the
 *    helper has to assume the request is hostile and check it.
 */

export type Platform = 'windows' | 'mac';

export function guessPlatform(): Platform {
  return /Mac/i.test(navigator.userAgent) ? 'mac' : 'windows';
}

/** Whether this machine has been told the helper is installed. Per machine. */
const INSTALLED_KEY = 'tzviair_helper_installed';

export const helperInstalled = (): boolean =>
  localStorage.getItem(INSTALLED_KEY) === '1';

export const setHelperInstalled = (v: boolean): void => {
  if (v) localStorage.setItem(INSTALLED_KEY, '1');
  else localStorage.removeItem(INSTALLED_KEY);
};

/** The address that asks the helper to open a folder. */
export const openUrl = (path: string): string =>
  `tzviair://open?path=${encodeURIComponent(path)}`;

/**
 * Windows: a registry file plus the script it points at.
 *
 * The registry entry cannot parse a URL on its own, so it hands the whole
 * thing to a small script which pulls the path out, checks it, and opens it.
 */
export function windowsInstaller(driveRoot: string): { reg: string; cmd: string } {
  const scriptPath = 'C:\\\\ProgramData\\\\TzviAir\\\\open-folder.cmd';
  const reg = `Windows Registry Editor Version 5.00

; Lets the TzviAir job board open a Drive folder in File Explorer.
; Opening a folder is all it can do — it never runs anything inside one.

[HKEY_CLASSES_ROOT\\tzviair]
@="URL:TzviAir"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\\tzviair\\shell\\open\\command]
@="\\"${scriptPath}\\" \\"%1\\""
`;

  const cmd = `@echo off
setlocal enabledelayedexpansion
rem  Opens a Google Drive folder in File Explorer for the TzviAir job board.
rem  Installed once per machine. It opens a folder and does nothing else.

rem  The whole URL arrives as one argument: tzviair://open?path=<encoded>
set "URL=%~1"
set "P=!URL:*path=!"
set "P=!P:~1!"

rem  Percent-decoding, for the characters a Windows path can actually contain.
set "P=!P:%%3A=:!"
set "P=!P:%%5C=\\!"
set "P=!P:%%2F=/!"
set "P=!P:%%20= !"
set "P=!P:%%2C=,!"
set "P=!P:%%27='!"
set "P=!P:%%26=&!"
set "P=!P:+= !"

rem  THE CHECK. Anything can address tzviair://, so a request is only honoured
rem  when it points inside the Drive root this was installed with.
set "ROOT=${driveRoot.replace(/\\/g, '\\\\')}"
echo !P! | findstr /b /i /c:"!ROOT!" >nul
if errorlevel 1 (
  echo Refused: that folder is not inside !ROOT!
  timeout /t 4 >nul
  exit /b 1
)

if not exist "!P!" (
  echo That folder is not on this computer yet: !P!
  echo Google Drive may still be syncing it.
  timeout /t 6 >nul
  exit /b 1
)

start "" explorer.exe "!P!"
`;
  return { reg, cmd };
}

/**
 * macOS: a tiny application bundle declared as the scheme's handler.
 *
 * Written as a shell script that builds the bundle, because a .app is a folder
 * and cannot be handed over as a single download.
 *
 * Deliberately uses no `${...}` brace expansion anywhere: this whole thing is
 * a TypeScript template literal, and `${` inside one is interpolation — the
 * first version of this quietly turned half the script into JavaScript. Plain
 * `$VAR` is safe, and the percent-decoding goes through python3, which every
 * Mac has, rather than through a bash expansion that would need braces.
 */
export function macInstaller(driveRoot: string): string {
  const root = driveRoot.replace(/"/g, '\\"');
  return [
    '#!/bin/bash',
    '#  Lets the TzviAir job board open a Drive folder in Finder.',
    '#  Run once:  bash install-tzviair.sh',
    '#  It opens a folder and does nothing else.',
    'set -e',
    '',
    'ROOT="' + root + '"',
    'APP="$HOME/Applications/TzviAir Folder Opener.app"',
    'mkdir -p "$APP/Contents/MacOS"',
    '',
    "cat > \"$APP/Contents/Info.plist\" <<'PLIST'",
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '  <key>CFBundleName</key><string>TzviAir Folder Opener</string>',
    '  <key>CFBundleIdentifier</key><string>com.tzviair.folderopener</string>',
    '  <key>CFBundleExecutable</key><string>opener</string>',
    '  <key>CFBundlePackageType</key><string>APPL</string>',
    '  <key>LSUIElement</key><true/>',
    '  <key>CFBundleURLTypes</key><array><dict>',
    '    <key>CFBundleURLName</key><string>TzviAir</string>',
    '    <key>CFBundleURLSchemes</key><array><string>tzviair</string></array>',
    '  </dict></array>',
    '</dict></plist>',
    'PLIST',
    '',
    '#  The opener. ROOT is baked in by this installer, so the check below is',
    '#  against the Drive folder on THIS Mac.',
    'cat > "$APP/Contents/MacOS/opener" <<OPENER',
    '#!/bin/bash',
    'ROOT="' + root + '"',
    'OPENER',
    "cat >> \"$APP/Contents/MacOS/opener\" <<'OPENER2'",
    'URL="$1"',
    '#  Pull the path out of tzviair://open?path=<encoded> and decode it.',
    'FOLDER=$(python3 -c \'import sys,urllib.parse; u=sys.argv[1]; print(urllib.parse.unquote(u.split("path=",1)[1]) if "path=" in u else "")\' "$URL")',
    '',
    '#  THE CHECK. Anything can address tzviair://, so only a folder inside the',
    '#  Drive root this was installed with is ever opened.',
    'case "$FOLDER" in',
    '  "$ROOT"*) ;;',
    '  *) osascript -e \'display notification "That folder is not inside your Drive." with title "TzviAir"\'; exit 1 ;;',
    'esac',
    '',
    'if [ ! -d "$FOLDER" ]; then',
    '  osascript -e \'display notification "Not on this Mac yet - Drive may still be syncing." with title "TzviAir"\'',
    '  exit 1',
    'fi',
    'open "$FOLDER"',
    'OPENER2',
    '',
    'chmod +x "$APP/Contents/MacOS/opener"',
    '#  Tell Launch Services the scheme now has a handler.',
    'LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    '"$LSREG" -f "$APP" 2>/dev/null || true',
    'echo "Installed. The job board\'s folder button will now open Finder."',
    '',
  ].join('\n');
}

/** Hand a generated file to the browser to save. */
export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
