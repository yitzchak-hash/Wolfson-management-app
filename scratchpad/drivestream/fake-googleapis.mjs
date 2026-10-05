import { Readable } from 'node:stream';
const BYTES = Buffer.alloc(1000, 7);
export const calls = [];
export const google = {
  auth: { GoogleAuth: class { constructor() {} } },
  drive: () => ({ files: { get: async (params, opts) => {
    calls.push({ params, opts });
    if (params.alt !== 'media') return { data: { id: params.fileId, name: 'film.mp4', mimeType: 'video/mp4', size: '1000' } };
    const range = opts?.headers?.Range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range); const a = +m[1]; const b = m[2] ? +m[2] : 999;
      return { status: 206, headers: { 'content-range': `bytes ${a}-${b}/1000`, 'content-length': String(b - a + 1) }, data: Readable.from([BYTES.subarray(a, b + 1)]) };
    }
    return { status: 200, headers: { 'content-length': '1000' }, data: Readable.from([BYTES]) };
  } } }),
};
