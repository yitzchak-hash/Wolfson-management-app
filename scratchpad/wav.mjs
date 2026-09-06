// A one-second spoken-shaped WAV as a data URL — a memo the harness can seed
// so a player has real bytes to decode (a waveform, a duration) without a
// microphone in the container.
export function memoDataUrl(seconds = 3, seed = 7, rate = 8000) {
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  // syllables: bursts of 90–220ms with gaps, so the bars read like speech
  const env = new Float32Array(n);
  let t = 0;
  while (t < n) {
    const len = Math.floor((0.09 + rnd() * 0.13) * rate), gap = Math.floor((0.03 + rnd() * 0.12) * rate);
    const amp = 0.3 + rnd() * 0.7;
    for (let i = 0; i < len && t + i < n; i++) env[t + i] = amp * Math.sin(Math.PI * i / len);
    t += len + gap;
  }
  for (let i = 0; i < n; i++) {
    const v = env[i] * (Math.sin(i * 0.09 * (1 + seed % 3)) * 0.6 + (rnd() - 0.5) * 0.8);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 20000))), 44 + i * 2);
  }
  return 'data:audio/wav;base64,' + buf.toString('base64');
}
