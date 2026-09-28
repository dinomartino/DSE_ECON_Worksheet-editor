/**
 * The privacy copy promises the app sends nothing except an AI request the teacher asked
 * for. So in shipped code under `src/`, every network primitive appears only in
 * `src/ai/http.ts` (§ AI translation, glossary and app Settings).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const ALLOWED = new Set(['ai/http.ts']);
const NETWORK = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bsendBeacon\b/, /\bnew\s+WebSocket\b/, /\bnew\s+EventSource\b/];

function shipped(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shipped(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('network calls', () => {
  it('appear only in src/ai/http.ts', () => {
    const found = shipped(SRC).flatMap((file) => {
      const rel = relative(SRC, file).split(sep).join('/');
      const text = readFileSync(file, 'utf8');
      return ALLOWED.has(rel) ? [] : NETWORK.filter((p) => p.test(text)).map((p) => `${rel}: ${p.source}`);
    });
    expect(found).toEqual([]);
  });

  it('really are in src/ai/http.ts, so the scan sees them', () => {
    expect(readFileSync(join(SRC, 'ai', 'http.ts'), 'utf8')).toMatch(NETWORK[0]);
  });
});
