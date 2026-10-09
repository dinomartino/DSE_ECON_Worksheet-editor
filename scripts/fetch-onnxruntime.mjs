#!/usr/bin/env node
// Vendors the static ONNX Runtime the desktop OCR links (src-tauri/src/ocr) for one Rust
// target: downloads the pinned archive, checks its SHA-256, unpacks it, and prints the
// directory to export as ORT_LIB_LOCATION. Same archives and hashes as ort-sys 2.0.0-rc.10's
// `download-binaries` (its dist.txt), so CI and local builds link the same bytes.
//   node scripts/fetch-onnxruntime.mjs <rust-target> <out-dir>
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VERSION = '1.22.0';
const BASE = `https://cdn.pyke.io/0/pyke:ort-rs/ms@${VERSION}`;
const ARCHIVES = {
  'aarch64-apple-darwin': '00fbfd6f08bac2a4e28c66723af900d58d1b4b1c73efba6290637cd3019883d5',
  'x86_64-apple-darwin': 'e0538783248bbb77d2e97556134b8cc47cfc35ac3d762067d51eaf8355c0f48e',
  'x86_64-pc-windows-msvc': '540d19b3379fda6fb8f7280d8c15efde20ed225a67a357a6dae38c4300fe190d',
};

const [target, outArg] = process.argv.slice(2);
const sha = ARCHIVES[target];
if (!sha || !outArg) {
  console.error(`usage: fetch-onnxruntime.mjs <${Object.keys(ARCHIVES).join('|')}> <out-dir>`);
  process.exit(2);
}
const dir = resolve(outArg, target);
const lib = join(dir, 'onnxruntime');
const stamp = join(dir, 'sha256');
const done = existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === sha;

if (!done) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `${BASE}/${target}.tgz`;
  let bytes;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      break;
    } catch (e) {
      if (attempt === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== sha) throw new Error(`${url}: SHA-256 ${got}, expected ${sha}`);
  const tgz = join(dir, 'ort.tgz');
  writeFileSync(tgz, bytes);
  execFileSync('tar', ['-xzf', 'ort.tgz'], { cwd: dir, stdio: 'inherit' });
  rmSync(tgz);
  writeFileSync(stamp, sha);
}
console.log(lib);
