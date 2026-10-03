// Minimal WAV I/O (PCM 16/24/32, float32) to Float32 channel arrays; writes float32 WAV.
import { readFileSync, writeFileSync } from 'node:fs';

export function readWav(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`);
  let fmt = null, data = null;
  for (let p = 12; p + 8 <= b.length; ) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, Math.min(b.length, p + 8 + size));
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt/data`);
  const bytes = fmt.bits / 8;
  const n = Math.floor(data.length / (bytes * fmt.ch));
  const ch = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < fmt.ch; c++) {
      const o = (i * fmt.ch + c) * bytes;
      let v;
      if (fmt.tag === 3) v = data.readFloatLE(o);
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error(`${file}: ${fmt.bits}-bit unsupported`);
      ch[c][i] = v;
    }
  }
  return { sr: fmt.sr, ch, n };
}

/** Float32 WAV; `ch` = array of equal-length Float32Arrays. */
export function writeWav(file, ch, sr = 48000) {
  const n = ch[0].length, nc = ch.length;
  const buf = Buffer.alloc(44 + n * nc * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * nc * 4, 28); buf.writeUInt16LE(nc * 4, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * nc * 4, 40);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < nc; c++, o += 4) buf.writeFloatLE(ch[c][i], o);
  writeFileSync(file, buf);
}
