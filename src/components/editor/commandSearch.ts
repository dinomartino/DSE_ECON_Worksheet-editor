/**
 * ⌘K's search (k-0201): a teacher's words against every command's name in both languages,
 * where it lives, and the Word words for it ("page break" finds New page). Pure, so the
 * ranking is tested without a page.
 */

export interface Bilingual {
  en: string;
  zh: string;
}

export interface SearchableCommand {
  id: string;
  label: Bilingual;
  /** Where it lives: "Setup › Page". Matched, weakly. */
  where?: Bilingual;
  /** Word's words and other ways to say it, any language, space-separated. */
  keywords?: string;
}

/** Lower case, full-width folded to half-width, "…" and punctuation runs to spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[…·›,.:;()（）「」『』、，。：；!?！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Has CJK: matched as a run of characters, not words. */
const CJK = /[㐀-鿿豈-﫿]/;

function wordStart(haystack: string, needle: string): boolean {
  if (haystack.startsWith(needle)) return true;
  if (CJK.test(needle)) return haystack.includes(needle);
  return haystack.includes(` ${needle}`) || haystack.includes(`.${needle}`) || haystack.includes(`(${needle}`);
}

/** How well `command` answers `query`; undefined when some word of the query is nowhere in it. */
export function scoreCommand(command: SearchableCommand, query: string): number | undefined {
  const q = normalize(query);
  if (!q) return 0;
  const labels = [normalize(command.label.en), normalize(command.label.zh)];
  const keywords = normalize(command.keywords ?? '');
  const where = command.where ? `${normalize(command.where.en)} ${normalize(command.where.zh)}` : '';
  let score = 0;
  for (const token of q.split(' ')) {
    let best = 0;
    for (const label of labels) {
      if (wordStart(label, token)) best = Math.max(best, 4);
      else if (label.includes(token)) best = Math.max(best, 2);
    }
    if (wordStart(keywords, token)) best = Math.max(best, 3);
    else if (keywords.includes(token)) best = Math.max(best, 1.5);
    if (best === 0 && where.includes(token)) best = 0.5;
    if (best === 0) return undefined;
    score += best;
  }
  // The whole phrase: a name it is, or starts with, or a Word word it is.
  if (labels.some((label) => label === q)) score += 6;
  else if (labels.some((label) => label.startsWith(q))) score += 3;
  if (` ${keywords} `.includes(` ${q} `)) score += 4;
  return score;
}

/** The commands that answer `query`, best first; every command, in order, for an empty one. */
export function searchCommands<C extends SearchableCommand>(commands: readonly C[], query: string): C[] {
  if (!normalize(query)) return [...commands];
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command, query) }))
    .filter((hit): hit is { command: C; index: number; score: number } => hit.score !== undefined)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((hit) => hit.command);
}
