import type { CopyNamer } from './types';

/**
 * The fallback copy names, for tests and until the interface layer injects localised
 * ones from a messages catalogue. Format: "… (from Home Mac, 5 Oct 14:32)".
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

export function plainNamer(computer: string): CopyNamer {
  return {
    conflictCopy: (name, at) =>
      `${name} (from ${computer}, ${at.getDate()} ${MONTHS[at.getMonth()]} ${two(at.getHours())}:${two(at.getMinutes())})`,
    providerCopy: (name) => `${name} (from another computer)`,
  };
}
