// The fragmented-MP4 remux (src/data/fmp4.ts) on a real file, in node.
// usage: node --experimental-strip-types scratchpad/fmp4check.mjs <in.mp4> <out.mp4>
// Then check the output with ffmpeg / ffprobe and play it in Chrome (see the report).
import { openAsBlob } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { progressiveMp4, isFragmented } from '../src/data/fmp4.ts';

const [inp, out] = process.argv.slice(2);
const blob = await openAsBlob(inp, { type: 'video/mp4' });
const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
console.log('fragmented (head):', isFragmented(head));
const t0 = performance.now();
const fixed = await progressiveMp4(blob);
console.log('remux ms:', Math.round(performance.now() - t0), 'in', blob.size, 'out', fixed.size, 'same object:', fixed === blob);
const fhead = new Uint8Array(await fixed.slice(0, 64 * 1024).arrayBuffer());
console.log('fragmented after (head):', isFragmented(fhead));
await writeFile(out, fixed.stream());
// unchanged when already progressive
const again = await progressiveMp4(await openAsBlob(out));
console.log('second pass leaves it alone:', again.size === fixed.size);
