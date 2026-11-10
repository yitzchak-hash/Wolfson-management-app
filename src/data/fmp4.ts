/**
 * A FRAGMENTED MP4 MADE INTO AN ORDINARY ONE (owner, 2026-11-10: inspection and site videos at full quality with real
 * sound).
 *
 * Recording inside the page (MediaRecorder) on an iPhone writes a FRAGMENTED MP4: a moov that says "length 0" and holds
 * no sample tables, then ~one moof+mdat pair a second. A player cannot know how long such a file is, or where any
 * second of it lives, until it has read the whole thing — the 173 MB inspection film "took forever" to start. Newer
 * Chrome writes the same kind of file.
 *
 * This walks the file's boxes, gathers every fragment's samples (trun, with tfhd and trex defaults), and writes one
 * ordinary moov — real durations, full stts / ctts / stss / stsz / stsc / stco tables — in FRONT of one mdat (faststart),
 * so the length is known from the first kilobytes and a player can seek straight away.
 *
 * Memory: only the small boxes (ftyp, moov, each moof) are read into memory. The picture and sound bytes are never
 * copied: the new file is a Blob made of the new header plus SLICES of the original Blob, which the browser stitches
 * from the same storage. A file that is not fragmented comes back unchanged.
 */

type Box = { type: string; start: number; headerSize: number; size: number };

const td = new TextDecoder('latin1');
const fourcc = (b: Uint8Array, o: number) => td.decode(b.subarray(o, o + 4));

/** The boxes laid one after another inside `b` from `from` to `to` (top level of a container's payload). */
function childBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = dv.getUint32(o);
    const type = fourcc(b, o + 4);
    let hs = 8;
    if (size === 1) { size = Number(dv.getBigUint64(o + 8)); hs = 16; } else if (size === 0) size = to - o;
    if (size < hs || o + size > to) break;
    out.push({ type, start: o, headerSize: hs, size });
    o += size;
  }
  return out;
}
const child = (b: Uint8Array, parent: Box, type: string) =>
  childBoxes(b, parent.start + parent.headerSize, parent.start + parent.size).find(c => c.type === type);
const children = (b: Uint8Array, parent: Box, type: string) =>
  childBoxes(b, parent.start + parent.headerSize, parent.start + parent.size).filter(c => c.type === type);

/**
 * Whether the bytes are a fragmented MP4: a moof among the top-level boxes, or an mvex inside the moov. The bytes may be
 * the whole file or just its head (the first box or two is enough when the moov comes first).
 */
export function isFragmented(bytes: Uint8Array): boolean {
  for (const box of childBoxes(bytes, 0, bytes.length)) {
    if (box.type === 'moof') return true;
    if (box.type === 'moov' && child(bytes, box, 'mvex')) return true;
  }
  // A head cut short inside a moov: childBoxes refuses a box that runs past the end, so look for the moov's header by hand.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  while (o + 8 <= bytes.length) {
    let size = dv.getUint32(o); const type = fourcc(bytes, o + 4);
    if (size === 1 && o + 16 <= bytes.length) size = Number(dv.getBigUint64(o + 8));
    if (type === 'moov') {
      const end = Math.min(bytes.length, o + size);
      for (let i = o + 8; i + 4 <= end; i++) if (bytes[i] === 0x6d && fourcc(bytes, i) === 'mvex') return true;
      return false;
    }
    if (type === 'moof') return true;
    if (size < 8) return false;
    o += size;
  }
  return false;
}

// ── writing boxes ────────────────────────────────────────────────────────────

class Out {
  parts: Uint8Array[] = [];
  len = 0;
  push(u: Uint8Array) { this.parts.push(u); this.len += u.length; }
  u8(v: number) { this.push(Uint8Array.of(v & 0xff)); }
  u32(v: number) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0); this.push(a); }
  i32(v: number) { const a = new Uint8Array(4); new DataView(a.buffer).setInt32(0, v | 0); this.push(a); }
  u64(v: number) { const a = new Uint8Array(8); new DataView(a.buffer).setBigUint64(0, BigInt(Math.max(0, Math.round(v)))); this.push(a); }
  bytes() { const r = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { r.set(p, o); o += p.length; } return r; }
}
function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const len = 8 + payload.reduce((s, p) => s + p.length, 0);
  const r = new Uint8Array(len);
  new DataView(r.buffer).setUint32(0, len);
  for (let i = 0; i < 4; i++) r[4 + i] = type.charCodeAt(i);
  let o = 8; for (const p of payload) { r.set(p, o); o += p.length; }
  return r;
}
function fullBox(type: string, version: number, flags: number, body: Out): Uint8Array {
  const h = new Out(); h.u8(version); h.u8(flags >> 16); h.u8(flags >> 8); h.u8(flags); return box(type, h.bytes(), body.bytes());
}

// ── reading fragments ────────────────────────────────────────────────────────

type Trex = { sdi: number; dur: number; size: number; flags: number };
type Sample = { off: number; size: number; dur: number; flags: number; cto: number };
type Chunk = { first: number; count: number; off: number; sdi: number };
type Track = { id: number; samples: Sample[]; chunks: Chunk[]; firstTfdt: number | null; signedCto: boolean };

/** One moof's samples, each with its ABSOLUTE place in the original file. */
function readMoof(b: Uint8Array, moofAt: number, trex: Map<number, Trex>, tracks: Map<number, Track>) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const moof: Box = childBoxes(b, 0, b.length)[0];
  for (const traf of children(b, moof, 'traf')) {
    const tfhd = child(b, traf, 'tfhd'); if (!tfhd) continue;
    let o = tfhd.start + tfhd.headerSize;
    const tf = dv.getUint32(o) & 0xffffff; o += 4;
    const id = dv.getUint32(o); o += 4;
    const ex = trex.get(id) ?? { sdi: 1, dur: 0, size: 0, flags: 0 };
    let base = moofAt; // default-base-is-moof (0x20000) and the plain iso5 reading agree: offsets count from the moof
    if (tf & 0x1) { base = Number(dv.getBigUint64(o)); o += 8; }
    let sdi = ex.sdi, dDur = ex.dur, dSize = ex.size, dFlags = ex.flags;
    if (tf & 0x2) { sdi = dv.getUint32(o); o += 4; }
    if (tf & 0x8) { dDur = dv.getUint32(o); o += 4; }
    if (tf & 0x10) { dSize = dv.getUint32(o); o += 4; }
    if (tf & 0x20) { dFlags = dv.getUint32(o); o += 4; }
    let t = tracks.get(id);
    if (!t) { t = { id, samples: [], chunks: [], firstTfdt: null, signedCto: false }; tracks.set(id, t); }
    const tfdt = child(b, traf, 'tfdt');
    if (tfdt && t.firstTfdt === null) {
      const p = tfdt.start + tfdt.headerSize; const v = b[p];
      t.firstTfdt = v === 1 ? Number(dv.getBigUint64(p + 4)) : dv.getUint32(p + 4);
    }
    let next = base; // a trun with no data offset carries on where the last one's data ended
    for (const trun of children(b, traf, 'trun')) {
      let p = trun.start + trun.headerSize;
      const ver = b[p]; const fl = dv.getUint32(p) & 0xffffff; p += 4;
      const n = dv.getUint32(p); p += 4;
      let off = next;
      if (fl & 0x1) { off = base + dv.getInt32(p); p += 4; }
      let firstFlags: number | null = null;
      if (fl & 0x4) { firstFlags = dv.getUint32(p); p += 4; }
      if (ver === 1 && fl & 0x800) t.signedCto = true;
      const chunk: Chunk = { first: t.samples.length, count: 0, off, sdi };
      for (let i = 0; i < n; i++) {
        const dur = fl & 0x100 ? (p += 4, dv.getUint32(p - 4)) : dDur;
        const size = fl & 0x200 ? (p += 4, dv.getUint32(p - 4)) : dSize;
        let flags = fl & 0x400 ? (p += 4, dv.getUint32(p - 4)) : dFlags;
        if (i === 0 && firstFlags !== null) flags = firstFlags;
        const cto = fl & 0x800 ? (p += 4, ver === 1 ? dv.getInt32(p - 4) : dv.getUint32(p - 4)) : 0;
        t.samples.push({ off, size, dur, flags, cto });
        off += size;
      }
      chunk.count = n;
      if (n) t.chunks.push(chunk);
      next = off;
    }
  }
}

// ── the sample tables ────────────────────────────────────────────────────────

function stbl(t: Track, isVideo: boolean, stsd: Uint8Array, mapOff: (o: number) => number, co64: boolean): Uint8Array {
  const s = t.samples;
  // stts: runs of equal durations
  const stts = new Out(); const runs: [number, number][] = [];
  for (const x of s) { const l = runs[runs.length - 1]; if (l && l[1] === x.dur) l[0]++; else runs.push([1, x.dur]); }
  stts.u32(runs.length); for (const [c, d] of runs) { stts.u32(c); stts.u32(d); }
  const parts: Uint8Array[] = [stsd, fullBox('stts', 0, 0, stts)];
  // ctts: only when some sample's picture is shown at another time than it is decoded
  if (s.some(x => x.cto !== 0)) {
    const ctts = new Out(); const cr: [number, number][] = [];
    for (const x of s) { const l = cr[cr.length - 1]; if (l && l[1] === x.cto) l[0]++; else cr.push([1, x.cto]); }
    ctts.u32(cr.length); for (const [c, v] of cr) { ctts.u32(c); if (t.signedCto) ctts.i32(v); else ctts.u32(v); }
    parts.push(fullBox('ctts', t.signedCto ? 1 : 0, 0, ctts));
  }
  // stss: the key frames (sample_is_non_sync_sample is bit 16 of the sample flags). Sound has none — every sample is one.
  if (isVideo) {
    const keys: number[] = []; s.forEach((x, i) => { if (!(x.flags & 0x10000)) keys.push(i + 1); });
    if (keys.length < s.length) { const ss = new Out(); ss.u32(keys.length); keys.forEach(k => ss.u32(k)); parts.push(fullBox('stss', 0, 0, ss)); }
  }
  // stsz
  const sz = new Out(); const same = s.length > 0 && s.every(x => x.size === s[0].size);
  sz.u32(same ? s[0].size : 0); sz.u32(s.length); if (!same) for (const x of s) sz.u32(x.size);
  parts.push(fullBox('stsz', 0, 0, sz));
  // stsc: runs of chunks with the same sample count and description
  const sc = new Out(); const scr: [number, number, number][] = [];
  t.chunks.forEach((c, i) => { const l = scr[scr.length - 1]; if (!l || l[1] !== c.count || l[2] !== c.sdi) scr.push([i + 1, c.count, c.sdi]); });
  sc.u32(scr.length); for (const [f, n, d] of scr) { sc.u32(f); sc.u32(n); sc.u32(d); }
  parts.push(fullBox('stsc', 0, 0, sc));
  const co = new Out(); co.u32(t.chunks.length);
  for (const c of t.chunks) { const o = mapOff(c.off); if (co64) co.u64(o); else co.u32(o); }
  parts.push(fullBox(co64 ? 'co64' : 'stco', 0, 0, co));
  return box('stbl', ...parts);
}

/** A version-0 or -1 mvhd / tkhd / mdhd with its duration set, widened to version 1 when the number needs it. */
function withDuration(b: Uint8Array, bx: Box, duration: number): Uint8Array {
  const p = bx.start + bx.headerSize; const ver = b[p];
  const body = b.subarray(p + 4, bx.start + bx.size);
  const flags = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
  const isTkhd = bx.type === 'tkhd';
  // field layout after version+flags: v0 = ctime4 mtime4 [mvhd/mdhd: timescale4 | tkhd: id4 res4] duration4 · v1 = 8 8 [4 | 4 4] 8
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (ver === 1) {
    const o = new Uint8Array(body); const odv = new DataView(o.buffer);
    odv.setBigUint64(isTkhd ? 24 : 20, BigInt(Math.round(duration)));
    const w = new Out(); w.push(o); return fullBox(bx.type, 1, flags, w);
  }
  if (duration <= 0xffffffff) {
    const o = new Uint8Array(body); new DataView(o.buffer).setUint32(isTkhd ? 16 : 12, duration);
    const w = new Out(); w.push(o); return fullBox(bx.type, 0, flags, w);
  }
  const w = new Out();
  w.u64(dv.getUint32(0)); w.u64(dv.getUint32(4));
  if (isTkhd) { w.push(body.subarray(8, 16)); w.u64(duration); w.push(body.subarray(20)); }
  else { w.push(body.subarray(8, 12)); w.u64(duration); w.push(body.subarray(16)); }
  return fullBox(bx.type, 1, flags, w);
}

/** mvhd / mdhd timescale (the same place in both). */
function timescaleOf(b: Uint8Array, bx: Box): number {
  const p = bx.start + bx.headerSize; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return dv.getUint32(p + 4 + (b[p] === 1 ? 16 : 8));
}
function trackIdOf(b: Uint8Array, tkhd: Box): number {
  const p = tkhd.start + tkhd.headerSize; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return dv.getUint32(p + 4 + (b[p] === 1 ? 16 : 8));
}

/** The new moov, every offset pushed through mapOff. */
function buildMoov(m: Uint8Array, tracks: Map<number, Track>, mapOff: (o: number) => number, co64: boolean): Uint8Array {
  const moov = childBoxes(m, 0, m.length)[0];
  const mvhd = child(m, moov, 'mvhd')!;
  const movieScale = timescaleOf(m, mvhd);
  const out: Uint8Array[] = [];
  let movieDur = 0;
  const trakBoxes: Uint8Array[] = [];
  for (const trak of children(m, moov, 'trak')) {
    const tkhd = child(m, trak, 'tkhd'); const mdia = child(m, trak, 'mdia');
    if (!tkhd || !mdia) continue;
    const t = tracks.get(trackIdOf(m, tkhd));
    if (!t || !t.samples.length) continue; // a track that never got a sample is left out rather than written empty
    const mdhd = child(m, mdia, 'mdhd')!; const hdlr = child(m, mdia, 'hdlr');
    const minf = child(m, mdia, 'minf'); const stblBox = minf && child(m, minf, 'stbl');
    const stsd = stblBox && child(m, stblBox, 'stsd');
    if (!hdlr || !minf || !stblBox || !stsd) continue;
    const scale = timescaleOf(m, mdhd);
    const mediaDur = t.samples.reduce((a, x) => a + x.dur, 0);
    const lead = t.firstTfdt ?? 0; // a track whose first sample starts late keeps its place against the other track
    const trackDur = Math.round(((mediaDur + lead) * movieScale) / scale);
    movieDur = Math.max(movieDur, trackDur);
    const handler = fourcc(m, hdlr.start + hdlr.headerSize + 8);
    const raw = (bx: Box) => m.subarray(bx.start, bx.start + bx.size);
    const minfParts = childBoxes(m, minf.start + minf.headerSize, minf.start + minf.size)
      .map(c => (c.type === 'stbl' ? stbl(t, handler === 'vide', raw(stsd), mapOff, co64) : raw(c)));
    const mdiaParts = childBoxes(m, mdia.start + mdia.headerSize, mdia.start + mdia.size)
      .map(c => (c.type === 'mdhd' ? withDuration(m, c, mediaDur) : c.type === 'minf' ? box('minf', ...minfParts) : raw(c)));
    const trakParts: Uint8Array[] = [];
    for (const c of childBoxes(m, trak.start + trak.headerSize, trak.start + trak.size)) {
      if (c.type === 'tkhd') {
        trakParts.push(withDuration(m, c, trackDur));
        // The recorder's own edit list (if any) described a file of unknown length; it is replaced by the plain answer.
        const el = new Out(); const entries: [number, number][] = [];
        if (lead > 0) entries.push([Math.round((lead * movieScale) / scale), -1]);
        // With pictures shown later than decoded (unsigned composition offsets), the first one SHOWN starts the track.
        const shift = t.signedCto ? 0 : t.samples.reduce((a, x) => Math.min(a, x.cto), Infinity);
        entries.push([Math.round((mediaDur * movieScale) / scale), Number.isFinite(shift) ? shift : 0]);
        el.u32(entries.length);
        for (const [d, mt] of entries) { el.u32(d); el.i32(mt); el.u32(0x00010000); }
        trakParts.push(box('edts', fullBox('elst', 0, 0, el)));
      } else if (c.type === 'edts') continue;
      else if (c.type === 'mdia') trakParts.push(box('mdia', ...mdiaParts));
      else trakParts.push(raw(c));
    }
    trakBoxes.push(box('trak', ...trakParts));
  }
  for (const c of childBoxes(m, moov.start + moov.headerSize, moov.start + moov.size)) {
    if (c.type === 'mvhd') out.push(withDuration(m, c, movieDur));
    else if (c.type === 'trak') { if (trakBoxes.length) out.push(...trakBoxes.splice(0)); }
    else if (c.type === 'mvex') continue;
    else out.push(m.subarray(c.start, c.start + c.size));
  }
  return box('moov', ...out);
}

/**
 * The whole job. Reads only the small boxes of `blob`; returns a new Blob (ftyp + moov + mdat) whose mdat is slices of
 * the original. An MP4 that is not fragmented, or anything that cannot be read as one, comes back as it was.
 */
export async function progressiveMp4(blob: Blob): Promise<Blob> {
  const read = async (a: number, b: number) => new Uint8Array(await blob.slice(a, b).arrayBuffer());
  const top: { type: string; start: number; size: number; headerSize: number }[] = [];
  let o = 0;
  while (o + 8 <= blob.size) {
    const h = await read(o, Math.min(blob.size, o + 16)); const dv = new DataView(h.buffer);
    let size = dv.getUint32(0); const type = fourcc(h, 4); let hs = 8;
    if (size === 1) { size = Number(dv.getBigUint64(8)); hs = 16; } else if (size === 0) size = blob.size - o;
    if (size < hs) break;
    if (o + size > blob.size) size = blob.size - o; // a recording cut short: keep what is there
    top.push({ type, start: o, size, headerSize: hs });
    o += size;
  }
  const ftyp = top.find(x => x.type === 'ftyp'); const moovAt = top.find(x => x.type === 'moov');
  if (!ftyp || !moovAt || !top.some(x => x.type === 'moof')) return blob;
  const moov = await read(moovAt.start, moovAt.start + moovAt.size);
  const moovBox = childBoxes(moov, 0, moov.length)[0];
  const trex = new Map<number, Trex>();
  const mvex = child(moov, moovBox, 'mvex');
  if (mvex) for (const tx of children(moov, mvex, 'trex')) {
    const dv = new DataView(moov.buffer, moov.byteOffset); const p = tx.start + tx.headerSize + 4;
    trex.set(dv.getUint32(p), { sdi: dv.getUint32(p + 4), dur: dv.getUint32(p + 8), size: dv.getUint32(p + 12), flags: dv.getUint32(p + 16) });
  }
  const tracks = new Map<number, Track>();
  for (const x of top) if (x.type === 'moof') readMoof(await read(x.start, x.start + x.size), x.start, trex, tracks);

  // The picture and sound bytes: every mdat's payload, in file order, laid end to end in the one new mdat.
  const mdats = top.filter(x => x.type === 'mdat').map(x => ({ from: x.start + x.headerSize, to: x.start + x.size }));
  const payload = mdats.reduce((s, x) => s + (x.to - x.from), 0);
  const placed: number[] = []; let acc = 0; for (const x of mdats) { placed.push(acc); acc += x.to - x.from; }
  // A sample outside every mdat would be read from the wrong place — such a file is left alone rather than broken.
  for (const t of tracks.values()) for (const s of t.samples) if (!mdats.some(x => s.off >= x.from && s.off + s.size <= x.to)) return blob;
  const ftypBytes = await read(ftyp.start, ftyp.start + ftyp.size);
  const big = payload + 16 > 0xffffffff;
  const mdatHeader = new Out();
  if (big) { mdatHeader.u32(1); mdatHeader.push(new TextEncoder().encode('mdat')); mdatHeader.u64(payload + 16); }
  else { mdatHeader.u32(payload + 8); mdatHeader.push(new TextEncoder().encode('mdat')); }
  const mh = mdatHeader.bytes();
  const mapper = (moovLen: number) => (off: number) => {
    const i = mdats.findIndex(x => off >= x.from && off < x.to);
    return ftypBytes.length + moovLen + mh.length + placed[i] + (off - mdats[i].from);
  };
  // The moov's length does not depend on the offsets' values, only on stco vs co64: measure it once, then write it for real.
  const co64 = ftypBytes.length + payload + mh.length + moov.length * 2 + 1_000_000 > 0xffffffff;
  const probe = buildMoov(moov, tracks, () => 0, co64);
  const newMoov = buildMoov(moov, tracks, mapper(probe.length), co64);
  if (newMoov.length !== probe.length) return blob;
  const parts: BlobPart[] = [ftypBytes as BlobPart, newMoov as BlobPart, mh as BlobPart];
  for (const x of mdats) parts.push(blob.slice(x.from, x.to));
  return new Blob(parts, { type: blob.type || 'video/mp4' });
}
