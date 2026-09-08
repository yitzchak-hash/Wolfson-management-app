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
 * Windows: ONE file, `install-tzviair-helper.cmd`, and why it is built this way.
 *
 * The first version handed over TWO files — a .cmd to be put in ProgramData by
 * hand and a .reg to double-click — and browsers block the second automatic
 * download more often than not, so people got one or the other and neither
 * worked alone ("sometimes it downloads a registry file, sometimes a command
 * file"). Worse, the .cmd decoded the path by hand for ASCII only and compared
 * it in cmd.exe's OEM code page: a client folder with a HEBREW name, or the
 * Hebrew name Drive gives "Shared drives" on a Hebrew Windows, never matched,
 * and the helper refused every real folder as "not inside G:".
 *
 * Now the installer:
 *  · registers the scheme for the CURRENT USER (HKCU\Software\Classes) — no
 *    administrator prompt, and browsers honour per-user handlers;
 *  · writes a small PowerShell opener into %LOCALAPPDATA%\TzviAir\ from a
 *    base64 string, so the .cmd itself stays pure ASCII whatever the path
 *    holds, and the opener decodes the URL as UTF-8 the way a browser encodes it;
 *  · the opener, when the composed path does not exist, swaps the "Shared
 *    drives" segment for whichever top folder under the root actually holds
 *    the rest of the path — so a Hebrew Windows works without anybody typing
 *    the Hebrew name.
 * It still opens a FOLDER and nothing else, and still refuses a path outside
 * the root it was installed with.
 */
export function windowsOpener(driveRoot: string): string {
  const root = driveRoot.replace(/[\\/]+$/, '').replace(/'/g, "''");
  return [
    'param([string]$Url)',
    "$root = '" + root + "'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'function Say($t) { [System.Windows.Forms.MessageBox]::Show($t, "TzviAir") | Out-Null }',
    '$i = $Url.IndexOf("path=")',
    'if ($i -lt 0) { Say("Nothing to open."); exit 1 }',
    '$p = [System.Uri]::UnescapeDataString($Url.Substring($i + 5)).Replace("/", "\\").TrimEnd("\\")',
    '# THE CHECK: anything can address tzviair://, so only a folder under the Drive root is ever opened.',
    'if (-not $p.ToLower().StartsWith($root.ToLower())) { Say("Refused: that folder is not inside " + $root); exit 1 }',
    'if (-not (Test-Path -LiteralPath $p)) {',
    '  # The app names the top folder "Shared drives"; a Hebrew Windows names it differently.',
    '  # Try every top folder under the root with the rest of the path.',
    '  $rest = $p.Substring($root.Length).TrimStart("\\")',
    '  $parts = $rest.Split("\\")',
    '  if ($parts.Length -ge 2) {',
    '    $tail = ($parts | Select-Object -Skip 1) -join "\\"',
    '    foreach ($d in Get-ChildItem -LiteralPath ($root + "\\") -Directory -ErrorAction SilentlyContinue) {',
    '      $cand = Join-Path $d.FullName $tail',
    '      if (Test-Path -LiteralPath $cand) { $p = $cand; break }',
    '    }',
    '  }',
    '}',
    'if (-not (Test-Path -LiteralPath $p)) { Say("Not on this computer yet: " + $p + "`n`nGoogle Drive may still be syncing it."); exit 1 }',
    'Start-Process explorer.exe -ArgumentList ("`"" + $p + "`"")',
    '',
  ].join('\r\n');
}

/** Base64 of UTF-8 text — what the installer carries the opener as. */
function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function windowsInstaller(driveRoot: string): { cmd: string } {
  const opener = b64(windowsOpener(driveRoot));
  const cmd = [
    '@echo off',
    'rem  TzviAir folder opener - installs for the current user, no administrator needed.',
    'rem  Lets the job board open a Google Drive folder in File Explorer. It opens a folder',
    'rem  and does nothing else, and refuses any folder outside your Drive.',
    'setlocal',
    'set "DIR=%LOCALAPPDATA%\\TzviAir"',
    'set "PS1=%DIR%\\open-folder.ps1"',
    'if not exist "%DIR%" mkdir "%DIR%"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$e = New-Object System.Text.UTF8Encoding($true); [IO.File]::WriteAllText($env:LOCALAPPDATA + \'\\TzviAir\\open-folder.ps1\', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(\'' + opener + '\')), $e)"',
    'if not exist "%PS1%" ( echo Could not write the opener. & pause & exit /b 1 )',
    'reg add "HKCU\\Software\\Classes\\tzviair" /ve /t REG_SZ /d "URL:TzviAir" /f >nul',
    'reg add "HKCU\\Software\\Classes\\tzviair" /v "URL Protocol" /t REG_SZ /d "" /f >nul',
    'reg add "HKCU\\Software\\Classes\\tzviair\\shell\\open\\command" /ve /t REG_SZ /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \\"%PS1%\\" \\"%%1\\"" /f >nul',
    'echo.',
    'echo Installed. Go back to the job board, tick "The one-click helper is installed here",',
    'echo and the folder button will open File Explorer.',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
  return { cmd };
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
