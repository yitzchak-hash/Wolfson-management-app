// A Drive folder whose NAME holds a slash ("Building 3/17") must stay ONE folder in the local path.
import { createServer } from 'vite';
const v = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { composeLocalPath, localName } = await v.ssrLoadModule('/src/data/drivePath.ts');
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const path = { inSharedDrive: true, driveName: 'TA Zoho Docs', segments: ['Potentials', 'W Residence', 'Building A3', 'Building 3/17'] };
const w = composeLocalPath('G:\\', path, 'Shared drives', 'TA Zoho Docs');
console.log(w);
T(w.endsWith('Building A3\\Building 3 17'), 'Windows: the slash is a space, as Drive for desktop writes it (seen on the office PC)');
const m = composeLocalPath('/Users/z/GoogleDrive', path, 'Shared drives', 'TA Zoho Docs');
T(m.endsWith('Building A3/Building 3:17'), 'Mac: a slash in a name is ":" in the path');
T(localName('Plain name', '\\') === 'Plain name', 'a plain name is untouched');
console.log(`${ok} ok · ${bad} bad`); await v.close();
