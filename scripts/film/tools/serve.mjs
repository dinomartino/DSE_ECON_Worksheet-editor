#!/usr/bin/env node
// Static server for the stage: /film/ → scripts/film, /assets/ → the shared asset store,
// falling back to build/fake-assets (synthetic test assets). A clip falls back whole —
// never frame by frame — and only when the store has no clips/<name>.json. Every
// fallback hit is recorded so a render can warn that it used stand-ins.
//   node scripts/film/tools/serve.mjs [--port=8123]   then open /film/stage/index.html?ui
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILM_DIR, ASSETS, BUILD } from '../paths.mjs';

export const FAKE_ASSETS = resolve(BUILD, 'fake-assets');

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
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
};

function inside(root, rel) {
  const p = normalize(join(root, rel));
  return p === root || p.startsWith(root + sep) ? p : null;
}

function fileAt(p) {
  try {
    const st = statSync(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/** Starts the server; resolves { url, port, fallbackHits, missing, close }. */
export function serve({ port = 0, filmDir = FILM_DIR, assets = ASSETS, fallbacks = [FAKE_ASSETS], quiet = true } = {}) {
  const fallbackHits = new Set();
  const missing = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    let file = null;
    if (path === '/' || path === '/film' || path === '/film/') {
      res.writeHead(302, { Location: '/film/stage/index.html?ui' });
      return res.end();
    }
    if (path.startsWith('/film/')) {
      const p = inside(filmDir, path.slice(6));
      if (p && fileAt(p)) file = p;
    } else if (path.startsWith('/assets/')) {
      const rel = path.slice(8);
      const p = inside(assets, rel);
      const clip = /^clips\/([^/]+)\//.exec(rel);
      const realClip = clip && fileAt(join(assets, 'clips', `${clip[1]}.json`));
      if (p && fileAt(p)) file = p;
      else if (!realClip) {
        for (const fb of fallbacks) {
          const q = inside(fb, rel);
          if (q && fileAt(q)) {
            file = q;
            fallbackHits.add(rel.replace(/\/\d{5}\.jpg$/, '/*.jpg'));
            break;
          }
        }
      }
      if (!file) missing.add(rel);
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
      ok({
        url: `http://127.0.0.1:${p}`,
        port: p,
        fallbackHits,
        missing,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((a) => a.startsWith('--port='));
  const s = await serve({ port: arg ? Number(arg.slice(7)) : 8123, quiet: false });
  console.log(`stage: ${s.url}/film/stage/index.html?ui`);
}
