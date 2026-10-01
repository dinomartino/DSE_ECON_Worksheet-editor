/**
 * `CHANGELOG.md`, read as data. One parser for the app's "What's new" and for
 * `scripts/release-notes.mjs`, so the release body and the in-app notes never disagree.
 *
 * Each bullet and Earlier paragraph may carry its 繁體中文 as an HTML comment straight
 * after it (`<!-- zh: … -->`, wrapped like the English). English output never shows it.
 *
 * Pure and import-free: the release script loads this file through Node's type
 * stripping, so it may use only erasable TypeScript (no enums, no imports).
 * Never throws — a line it cannot place is reported in `problems`, not fatal.
 */

export type GroupTitle = 'Added' | 'Changed' | 'Fixed';

export const GROUP_TITLES: readonly GroupTitle[] = ['Added', 'Changed', 'Fixed'];

/** One bullet or paragraph, continuation lines joined; inline Markdown kept as written. */
export interface ChangelogText {
  en: string;
  /** Its `<!-- zh: … -->` comment, when the file gives one. */
  zh?: string;
}

export interface ChangelogGroup {
  title: GroupTitle;
  items: ChangelogText[];
}

export interface ChangelogSection {
  /** "0.3.0", or "Unreleased". */
  version: string;
  /** "2026-09-24"; absent on Unreleased. */
  date?: string;
  groups: ChangelogGroup[];
}

/** A `##` heading that names no version — the prose "Earlier" summary. */
export interface ChangelogProse {
  heading: string;
  paragraphs: ChangelogText[];
}

export interface Changelog {
  unreleased: ChangelogSection;
  /** Newest first, as written. */
  releases: ChangelogSection[];
  earlier: ChangelogProse[];
  /** Lines the format does not allow, with their line numbers. Empty for a good file. */
  problems: string[];
}

export const UNRELEASED = 'Unreleased';

/** `## 0.3.0 — 2026-09-24`; an en dash or hyphen is accepted, and a prerelease tag. */
const RELEASE_HEADING = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const UNRELEASED_HEADING = /^##\s+Unreleased\s*$/i;
const BULLET = /^[-*]\s+(.*)$/;
const ZH_OPEN = /^\s*<!--\s*zh:/;
const ZH_CLOSE = '-->';
/** CJK and full-width punctuation: a line break between two of these joins with no space. */
const WIDE = /[⺀-〿㐀-鿿豈-﫿︰-﹏＀-￯]/;

/** Wrapped lines re-flowed: one space between them, none inside Chinese text. */
function joinWrapped(parts: string[]): string {
  return parts.reduce((text, part) => {
    if (!part) return text;
    if (!text) return part;
    return WIDE.test(text.slice(-1)) && WIDE.test(part[0]) ? text + part : `${text} ${part}`;
  }, '');
}

type Block =
  | { kind: 'section'; section: ChangelogSection; group?: ChangelogGroup }
  | { kind: 'prose'; prose: ChangelogProse; open: boolean };

export function parseChangelog(markdown: string): Changelog {
  const result: Changelog = {
    unreleased: { version: UNRELEASED, groups: [] },
    releases: [],
    earlier: [],
    problems: [],
  };
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let block: Block | undefined;
  let sawUnreleased = false;
  /** An open `<!-- zh:` comment: the entry it belongs to (none when misplaced) and its lines. */
  let zh: { target?: ChangelogText; parts: string[]; where: string } | undefined;

  const closeZh = () => {
    const text = joinWrapped(zh!.parts);
    if (!text) result.problems.push(`${zh!.where}: an empty zh comment`);
    else if (zh!.target) zh!.target.zh = text;
    zh = undefined;
  };
  /** One line of the open comment; `-->` closes it. */
  const zhLine = (text: string) => {
    const end = text.indexOf(ZH_CLOSE);
    zh!.parts.push((end === -1 ? text : text.slice(0, end)).trim());
    if (end !== -1) closeZh();
  };
  const unclosed = () => {
    result.problems.push(`${zh!.where}: a zh comment with no closing -->`);
    closeZh();
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const where = `line ${index + 1}`;

    if (zh) {
      if (!/^##\s/.test(line)) return zhLine(line);
      unclosed();
    }

    if (/^##\s/.test(line)) {
      if (UNRELEASED_HEADING.test(line)) {
        if (sawUnreleased) result.problems.push(`${where}: a second "## Unreleased"`);
        sawUnreleased = true;
        block = { kind: 'section', section: result.unreleased };
        return;
      }
      const release = RELEASE_HEADING.exec(line);
      if (release) {
        const section: ChangelogSection = { version: release[1], groups: [] };
        if (release[2]) section.date = release[2];
        else result.problems.push(`${where}: "${line}" has no date`);
        result.releases.push(section);
        block = { kind: 'section', section };
        return;
      }
      const prose: ChangelogProse = { heading: line.replace(/^##\s+/, ''), paragraphs: [] };
      result.earlier.push(prose);
      block = { kind: 'prose', prose, open: false };
      return;
    }

    // Before the first `##`: the file's own title and rules, not release notes.
    if (!block) return;

    if (ZH_OPEN.test(line)) {
      let target: ChangelogText | undefined;
      if (block.kind === 'prose') {
        block.open = false;
        target = block.prose.paragraphs[block.prose.paragraphs.length - 1];
      } else {
        target = block.group?.items[block.group.items.length - 1];
      }
      if (!target) result.problems.push(`${where}: a zh comment with no bullet or paragraph above it`);
      else if (target.zh !== undefined) result.problems.push(`${where}: a second zh comment for one entry`);
      zh = { target: target?.zh === undefined ? target : undefined, parts: [], where };
      return zhLine(line.replace(ZH_OPEN, ''));
    }

    if (block.kind === 'prose') {
      if (line.trim() === '') {
        block.open = false;
      } else if (block.open) {
        const last = block.prose.paragraphs.length - 1;
        block.prose.paragraphs[last].en += ` ${line.trim()}`;
      } else {
        block.prose.paragraphs.push({ en: line.trim() });
        block.open = true;
      }
      return;
    }

    const heading = /^###\s+(.*)$/.exec(line);
    if (heading) {
      const title = GROUP_TITLES.find((t) => t.toLowerCase() === heading[1].trim().toLowerCase());
      if (!title) {
        result.problems.push(`${where}: "${heading[1].trim()}" is not Added, Changed or Fixed`);
        block.group = undefined;
        return;
      }
      let group = block.section.groups.find((g) => g.title === title);
      if (!group) {
        group = { title, items: [] };
        block.section.groups.push(group);
      }
      block.group = group;
      return;
    }

    if (line.trim() === '') return;

    const bullet = BULLET.exec(line);
    const group = block.group;
    if (bullet) {
      if (group) group.items.push({ en: bullet[1].trim() });
      else result.problems.push(`${where}: a bullet outside Added, Changed or Fixed`);
      return;
    }
    // An indented line continues the bullet above it.
    if (/^\s/.test(raw) && group && group.items.length > 0) {
      group.items[group.items.length - 1].en += ` ${line.trim()}`;
      return;
    }
    result.problems.push(`${where}: "${line.trim()}" is not a bullet`);
  });
  if (zh) unclosed();

  // A group left with no bullets is not content.
  for (const section of [result.unreleased, ...result.releases]) {
    section.groups = section.groups.filter((g) => g.items.length > 0);
  }
  return result;
}

/** True when a section holds at least one bullet. */
export function hasEntries(section: ChangelogSection | undefined): boolean {
  return !!section && section.groups.some((g) => g.items.length > 0);
}

/** "v0.3.0" and "0.3.0" name the same release. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function findRelease(changelog: Changelog, version: string): ChangelogSection | undefined {
  const wanted = normalizeVersion(version);
  return changelog.releases.find((r) => r.version === wanted);
}

/**
 * A section's Markdown as written, without its `##` heading or its zh comments — the
 * GitHub release body. Undefined when no heading names that version.
 */
export function sectionMarkdown(markdown: string, version: string): string | undefined {
  const wanted = normalizeVersion(version);
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => {
    if (wanted.toLowerCase() === UNRELEASED.toLowerCase()) return UNRELEASED_HEADING.test(line.trimEnd());
    return RELEASE_HEADING.exec(line.trimEnd())?.[1] === wanted;
  });
  if (start === -1) return undefined;
  let end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  if (end === -1) end = lines.length;
  return withoutZh(lines.slice(start + 1, end)).join('\n').trim();
}

/** Drops each zh comment's lines, and a blank line it would leave doubled. */
function withoutZh(lines: string[]): string[] {
  const blank = (line: string | undefined) => line === undefined || line.trim() === '';
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!ZH_OPEN.test(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    let next = i;
    while (next < lines.length && !lines[next].includes(ZH_CLOSE)) next++;
    next++;
    if (out.length > 0 && blank(out[out.length - 1]) && blank(lines[next])) out.pop();
    i = next - 1;
  }
  return out;
}

/**
 * Compare two versions: negative when `a` is older. Numeric per part; a prerelease sorts
 * before its release. Unparseable input compares as equal, so it never triggers anything.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(normalizeVersion(v));
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4].localeCompare(pb[4], 'en', { numeric: true });
}
