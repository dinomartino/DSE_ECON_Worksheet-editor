import { bool, oneOf } from '@/settings/validators';
import type { FieldValidator, SettingsSchema } from '@/settings/types';
import type { QuestionSourceFormat } from '@/model/types';

/**
 * Where the Past paper bank 歷屆試題庫 comes from (k-0443, plan k-0441 § 15).
 *
 * The bank is not in this repo and not in a teacher's documents: it is a set of static
 * files (`manifest.json` + `topics/<id>.json`) the editor downloads on demand from one
 * address. Two switches turn it off:
 *  - `BUILT_IN_SOURCE` below: the address every install uses. Empty = the feature is gone
 *    for every build made from here (no Library row, no tab, no download).
 *  - the data itself: `"enabled": false` in its `latest.json` (k-0447) or `manifest.json` turns
 *    it off for every user at their next opening of the bank, with no release.
 * And per computer, Settings → Past paper bank: Built-in, Off, or another address
 * (`PAST_PAPER_SETTINGS`), which is how a local export is tried before anything is public.
 */

/**
 * The public data repo, served raw (GitHub sends `Access-Control-Allow-Origin: *`).
 * Live since 2026-11-17 (user u-qbmp): `dinomartino/dse-econ-question-bank`, branch `main`.
 * If it is ever unreachable the screen says the bank can't be reached.
 *
 * Since k-0447 this address is the bank's *name* (what its downloads are kept under) and where
 * its tiny `latest.json` is read; the list and topics come from the commit `latest.json` names,
 * on jsDelivr first (`pinnedSource`). A repo without `latest.json` is read here as before.
 */
export const BUILT_IN_SOURCE = 'https://raw.githubusercontent.com/dinomartino/dse-econ-question-bank/main/';

/** A GitHub repo behind a raw address: `owner/repo` and the branch. */
export interface GitHubSource {
  repo: string;
  branch: string;
}

const RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/$/;

/** The repo and branch of a base like the built-in one (a repo's root on raw GitHub), else undefined. */
export function gitHubSource(base: string): GitHubSource | undefined {
  const match = RAW_GITHUB.exec(base);
  return match ? { repo: match[1], branch: match[2] } : undefined;
}

/** A full commit id, as `latest.json` must name it. */
export const isCommit = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

/**
 * Where `latest.json` is read, in order: GitHub raw on the branch (fresh at every opening, so a
 * publish or a switch-off is seen at once), then jsDelivr's copy of the branch (cached up to
 * 12 h; used only when GitHub can't be reached and nothing is kept).
 */
export const latestUrls = ({ repo, branch }: GitHubSource): [string, string] => [
  `https://raw.githubusercontent.com/${repo}/${branch}/latest.json`,
  `https://cdn.jsdelivr.net/gh/${repo}@${branch}/latest.json`,
];

/**
 * The bases a commit's files are read from, in order: jsDelivr (a public CDN mirroring GitHub;
 * a file at a commit never changes there, so it is cached for a year), then GitHub raw at the
 * same commit.
 */
export const pinnedSource = ({ repo }: GitHubSource, commit: string): string[] => [
  `https://cdn.jsdelivr.net/gh/${repo}@${commit}/`,
  `https://raw.githubusercontent.com/${repo}/${commit}/`,
];

export type PastPaperMode = 'builtIn' | 'off' | 'custom';

export interface PastPaperSettings {
  mode: PastPaperMode;
  /** Used only with `mode: 'custom'`. */
  url: string;
  /**
   * "Show source (year + question no.)" where picks go into a paper (user u-w7gs): a paper
   * that gets its first sourced questions this way prints their sources
   * (`Worksheet.showQuestionSources`). Remembered on this computer; off by default.
   */
  showSources: boolean;
  /**
   * How those sources print (user u-z6ft): full "(HKDSE 2019 Paper 1 Q12)", short
   * "(DSE2019/P1/Q12)" or short with a Roman paper "(DSE2019/I/Q12)"
   * (`Worksheet.questionSourceFormat`). Remembered on this computer; full by default.
   */
  sourceFormat: QuestionSourceFormat;
}

/**
 * A source address: https anywhere; http only on this computer (a local export served by
 * `npm run dev` or any static server); or a path on the app's own origin (`/pastpaper-bank/`).
 * No credentials, no query. Stored as typed; `sourceUrl` adds the trailing slash.
 */
export const sourceAddress: FieldValidator<string> = (raw) => {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (value === '') return '';
  if (value.length > 2048 || /[\s{}]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search) return undefined;
  if (url.protocol === 'https:') return value;
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return value;
  return undefined;
};

export const PAST_PAPER_SETTINGS: SettingsSchema<PastPaperSettings> = {
  section: 'pastPapers',
  version: 1,
  storageKey: 'econgen.settings.pastPapers',
  defaults: () => ({ mode: 'builtIn', url: '', showSources: false, sourceFormat: 'full' }),
  fields: {
    mode: oneOf<PastPaperMode>(['builtIn', 'off', 'custom']),
    url: sourceAddress,
    showSources: bool,
    sourceFormat: oneOf<QuestionSourceFormat>(['full', 'short', 'shortRoman']),
  },
};

/** The feature exists in this build at all. */
export const pastPapersBuiltIn = (builtIn: string = BUILT_IN_SOURCE) => builtIn.trim() !== '';

/**
 * The base address files are read from (always ending in `/`), or undefined when the bank is
 * off: switched off here, no address typed, or no built-in source in this build. A build
 * without a built-in source ignores a stored custom address too: one constant removes it all.
 */
export function sourceUrl(settings: Pick<PastPaperSettings, 'mode' | 'url'>, builtIn: string = BUILT_IN_SOURCE): string | undefined {
  if (!pastPapersBuiltIn(builtIn) || settings.mode === 'off') return undefined;
  const base = settings.mode === 'custom' ? settings.url.trim() : builtIn.trim();
  if (!base || sourceAddress(base) === undefined) return undefined;
  return base.endsWith('/') ? base : `${base}/`;
}

/** A file of the pack at `base` (`topics/x.json`), refusing paths that climb out of it. */
export function fileUrl(base: string, file: string): string | undefined {
  if (!file || file.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(file) || /^[a-z][a-z0-9+.-]*:/i.test(file) || file.includes('\\')) {
    return undefined;
  }
  return base + file;
}
