import type { CopyNamer } from './types';

/**
 * The fallback copy names, for tests and until the interface layer injects localised
 * ones from a messages catalogue. Format: "… (from Home Mac, 5 Oct 14:32)".
 */

/**
 * A provider's conflict copy, made canonical by whichever computer meets it first. One
 * bilingual name, whatever the interface language, so every computer makes the same copy.
 */
export const providerCopyName = (title: string) => `${title} (from another computer / 來自另一部電腦)`;

const MONTHS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

export function plainNamer(computer: string): CopyNamer {
  return {
    conflictCopy: (name, at) =>
      `${name} (from ${computer}, ${at.getDate()} ${MONTHS[at.getMonth()]} ${two(at.getHours())}:${two(at.getMinutes())})`,
    providerCopy: providerCopyName,
  };
}
