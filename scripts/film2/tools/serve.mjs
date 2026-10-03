#!/usr/bin/env node
// Static server for the v2 stage: /film/ → scripts/film2, /assets/ → the v2 asset store,
// /assets-v1/ → scripts/film's store (footage both films share). Records missing files.
//   node scripts/film2/tools/serve.mjs [--port=8124]   then open /film/stage/index.html
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS as V1_ASSETS } from '../../film/paths.mjs';
import { FILM2_DIR, ASSETS } from '../paths.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

const inside = (root, rel) => {
  const p = normalize(join(root, rel));
  return p === root || p.startsWith(root + sep) ? p : null;
};
const fileAt = (p) => {
  try {
    const st = statSync(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
};

/** Starts the server; resolves { url, port, missing, close }. */
export function serve({ port = 0, quiet = true } = {}) {
  const missing = new Set();
  const roots = [['/film/', FILM2_DIR], ['/assets-v1/', V1_ASSETS], ['/assets/', ASSETS]];
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path === '/film' || path === '/film/') {
      res.writeHead(302, { Location: '/film/stage/index.html' });
      return res.end();
    }
    let file = null;
    for (const [prefix, dir] of roots) {
      if (!path.startsWith(prefix)) continue;
      const p = inside(dir, path.slice(prefix.length));
      if (p && fileAt(p)) file = p;
      else if (prefix !== '/film/') missing.add(path);
      break;
    }
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    const st = fileAt(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
    if (!quiet) console.log(req.method, path);
  });
  server.keepAliveTimeout = 60_000;
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      ok({ url: `http://127.0.0.1:${p}`, port: p, missing, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((a) => a.startsWith('--port='));
  const s = await serve({ port: arg ? Number(arg.slice(7)) : 8124, quiet: false });
  console.log(`stage: ${s.url}/film/stage/index.html`);
}
