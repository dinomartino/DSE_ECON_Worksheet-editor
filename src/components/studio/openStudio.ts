import { useStudio } from '@/questionStudio/live';
import { MAX_EXAMPLES, type SourceQuestion } from '@/questionStudio/types';

/**
 * "✦ Write like this": a bank question becomes an example in the studio's session (the
 * screen itself opens through the start screen). No key point is set from it (k-0514): the
 * AI picks the key point from the question and the request, step 1 of every write.
 */
export type WriteLikeResult = 'added' | 'already' | 'full';

export function writeLikeThis(source: SourceQuestion): WriteLikeResult {
  const studio = useStudio.getState();
  const { examples } = studio.form;
  if (examples.some((e) => e.id === source.id)) return 'already';
  if (examples.length >= MAX_EXAMPLES) return 'full';
  studio.addExample(source);
  return 'added';
}
