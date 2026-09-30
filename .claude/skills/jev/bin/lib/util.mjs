// Shared helpers: paths, globs, stdin, data files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The checkout this copy of the skill lives in. */
export const ROOT = resolve(SKILL_DIR, '..', '..', '..');

export function loadData(name) {
  return JSON.parse(readFileSync(join(SKILL_DIR, name), 'utf8'));
}

/** Whole stdin as text; resolves '' after `ms` if nothing arrives. */
export function readStdin(ms = 2000) {
  return new Promise((resolveText) => {
    if (process.stdin.isTTY) return resolveText('');
    let text = '';
    const timer = setTimeout(() => resolveText(text), ms);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (text += chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolveText(text);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolveText('');
    });
  });
}

/** Glob to RegExp: `**`, `*`, `?`, `{a,b}`. Matched against repo-relative posix paths. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map();
export function matchesAny(path, globs = []) {
  return globs.some((glob) => {
    if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
    return globCache.get(glob).test(path);
  });
}

/**
 * Repo-relative posix path for an absolute file path, or null when it is outside the repo.
 * Strips `.claude/worktrees/<name>/` so agent worktrees match the same globs.
 */
export function repoPath(file, roots = []) {
  if (typeof file !== 'string' || !file) return null;
  const posix = file.split(sep).join('/');
  const wt = posix.match(/\/\.claude\/worktrees\/[^/]+\/(.*)$/);
  if (wt) return wt[1];
  for (const root of roots.filter(Boolean)) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel && !rel.startsWith('..') && !rel.startsWith('/')) return rel;
  }
  return posix.startsWith('/') ? null : posix;
}

export function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** The main checkout's root, even from inside a worktree. */
export function mainRoot(cwd = ROOT) {
  try {
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).trim();
    return dirname(common);
  } catch {
    return cwd;
  }
}

export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
