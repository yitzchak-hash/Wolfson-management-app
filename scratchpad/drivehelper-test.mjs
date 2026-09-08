// The Drive folder helper, offline: one installer file, pure ASCII whatever
// the root holds, per-user registry, a UTF-8-decoding opener with the
// shared-drives fallback; and the pasted-path detector.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
globalThis.localStorage ??= { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const H = await server.ssrLoadModule('/src/data/tzviairHelper.ts');
const D = await server.ssrLoadModule('/src/data/drivePath.ts');

const { cmd } = H.windowsInstaller('G:');
check(!('reg' in H.windowsInstaller('G:')), 'Windows gets ONE file (no separate .reg)');
check(/^[\x00-\x7F]*$/.test(cmd), 'the installer is pure ASCII (safe in any code page)');
check(/HKCU\\Software\\Classes\\tzviair/.test(cmd) && !/HKEY_CLASSES_ROOT|ProgramData/.test(cmd), 'registers for the current user, no administrator');
check(/FromBase64String/.test(cmd) && /open-folder\.ps1/.test(cmd), 'writes the PowerShell opener from base64');
const b64 = cmd.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)?.[1];
const opener = b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
check(opener === H.windowsOpener('G:'), 'the embedded opener is exactly the opener');
check(/UnescapeDataString/.test(opener), 'the opener decodes the URL as UTF-8 (Hebrew folder names survive)');
check(opener.includes('Get-ChildItem -LiteralPath ($root + "\\") -Directory'), 'and tries every top folder under the root when "Shared drives" has another name');
check(opener.includes('.Replace("/", "\\").TrimEnd("\\")') && opener.includes('-join "\\"'), 'every PowerShell backslash survived the JS literal (the swallowed-backslash trap)');
check(cmd.includes('-File \\"%PS1%\\" \\"%%1\\""'), 'the registry command keeps its inner quotes escaped for reg add');
check(/StartsWith\(\$root\.ToLower\(\)\)/.test(opener), 'and still refuses a folder outside the root');
check(/Start-Process explorer\.exe/.test(opener) && !/Invoke-Expression|iex\b/.test(opener), 'it opens a folder and runs nothing');
const heb = H.windowsOpener('G:\\אחסון');
check(/אחסון/.test(heb) && /^[\x00-\x7F]*$/.test(H.windowsInstaller('G:\\אחסון').cmd), 'a Hebrew root rides inside the base64; the .cmd stays ASCII');

// The pasted-path detector
const w = D.parsePastedPath('G:\\אחסון שיתופי\\TzviAir\\Cohen, David - 5555\\Engineered Plans');
check(w && w.root === 'G:' && w.sharedName === 'אחסון שיתופי', 'a Hebrew Windows path gives the root and the localised shared-drives folder', JSON.stringify(w));
const w2 = D.parsePastedPath('"H:\\Shared drives\\TzviAir\\Levi"');
check(w2 && w2.root === 'H:' && w2.sharedName === 'Shared drives', 'quotes are stripped, any drive letter');
const m = D.parsePastedPath('/Users/esther/Library/CloudStorage/GoogleDrive-esther@tzviair.com/אחסון שיתופי/TzviAir/Levi');
check(m && m.root === '/Users/esther/Library/CloudStorage/GoogleDrive-esther@tzviair.com' && m.sharedName === 'אחסון שיתופי', 'a Mac path gives the CloudStorage root and the name after it');
check(D.parsePastedPath('hello world') === null, 'nonsense is refused');
// The composed path uses the localised name
const path = { segments: ['Cohen, David - 5555'], driveName: 'TzviAir', inSharedDrive: true };
check(D.composeLocalPath('G:', path, 'אחסון שיתופי') === 'G:\\אחסון שיתופי\\TzviAir\\Cohen, David - 5555', 'the copied path uses the folder name this computer really has');
check(D.composeLocalPath('G:', path, '') === 'G:\\Shared drives\\TzviAir\\Cohen, David - 5555', 'and "Shared drives" when nobody has pasted one (this container is not Hebrew)');
// The owner's REAL path (2026-09-08): the three-word Hebrew folder, the shared drive "TA Zoho Docs".
const real = D.parsePastedPath('G:\\תיקיות אחסון שיתופי\\TA Zoho Docs\\Potentials\\Yeshivat Chevron Haktana');
check(real && real.root === 'G:' && real.sharedName === 'תיקיות אחסון שיתופי' && real.sep === '\\',
  'the office\'s own Explorer path gives G: and "תיקיות אחסון שיתופי"', JSON.stringify(real));
const realPath = { segments: ['Potentials', 'Yeshivat Chevron Haktana'], driveName: 'TA Zoho Docs', inSharedDrive: true };
check(D.composeLocalPath('G:', realPath, real.sharedName) === 'G:\\תיקיות אחסון שיתופי\\TA Zoho Docs\\Potentials\\Yeshivat Chevron Haktana',
  'and composes back to exactly the path Explorer showed');
check(D.defaultSharedName('he-IL') === 'תיקיות אחסון שיתופי' && D.defaultSharedName('en-US') === 'Shared drives',
  'a Hebrew browser defaults to the Hebrew folder name before anybody pastes a path');
check(D.composeLocalPath('G:', realPath, D.defaultSharedName('he')) === 'G:\\תיקיות אחסון שיתופי\\TA Zoho Docs\\Potentials\\Yeshivat Chevron Haktana',
  'so the copied path opens on a Hebrew PC with no setup');
await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
