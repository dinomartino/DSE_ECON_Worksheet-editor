// Test helpers: a local stand-in for the TypeSafe API, and a way to run a hook script.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin');

/**
 * Mock /v1/systemone. `behave(body, n)` returns { status, json } or 'hang'.
 * Default: every question answers noul 0.5.
 */
export async function mockApi(behave = () => null) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push({ body, auth: req.headers.authorization });
      const out = behave(body, requests.length);
      if (out === 'hang') return;
      if (out && out.status && out.status !== 200) {
        res.writeHead(out.status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'mock' }));
      }
      if (typeof out?.raw === 'string') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(out.raw);
      }
      const answers =
        out?.answers ?? Object.fromEntries(Object.keys(body.questions ?? {}).map((id) => [id, { type: 'noul', noul: out?.noul?.(id, body) ?? 0.5 }]));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'jev-mock', answers, usage: { input_tokens: 100, output_tokens: 1 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    requests,
    close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(r))),
  };
}

/** Env for a child: a key pointing at `url`, or no key at all. */
export function env(url, { key = true } = {}) {
  const e = { ...process.env, JEV_ENV_FILE: '/nonexistent/jev.env', JEV_BASE_URL: url ?? 'http://127.0.0.1:9' };
  delete e.TYPESAFE_API_KEY;
  if (key) e.TYPESAFE_API_KEY = 'test-key';
  return e;
}

/** Run a hook script with `stdin`; resolves { code, stdout, stderr, ms }. */
export function runHook(script, stdin, childEnv) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(BIN, script)], { env: childEnv });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.end(stdin);
  });
}
