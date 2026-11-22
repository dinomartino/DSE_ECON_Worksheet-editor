import type { Worksheet } from '@/model/types';
import type { VerbContext } from './types';

/**
 * Where a verb's context finds the open paper's set (k-0489). The set's papers are read by
 * the editor (`components/editor/setMembers.ts`, which installs itself here), not by the AI
 * code, so this file is the seam: no set until the editor says so.
 */
type Source = (worksheet: Worksheet) => VerbContext['paperSet'];

let source: Source = () => undefined;

export function setPaperSetSource(next: Source): void {
  source = next;
}

export const paperSetFor = (worksheet: Worksheet): VerbContext['paperSet'] => source(worksheet);
