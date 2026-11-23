import { useStudio } from '@/questionStudio/live';
import { MAX_EXAMPLES, type SourceQuestion } from '@/questionStudio/types';

/**
 * "✦ Write like this": a bank question becomes an example in the studio's session (the
 * screen itself opens through the start screen). The key point it names is chosen for the
 * teacher only when none is chosen yet; they can change it.
 */
export type WriteLikeResult = 'added' | 'already' | 'full';

export function writeLikeThis(source: SourceQuestion, keyPoint?: string): WriteLikeResult {
  const studio = useStudio.getState();
  const { examples } = studio.form;
  if (examples.some((e) => e.id === source.id)) return 'already';
  if (examples.length >= MAX_EXAMPLES) return 'full';
  studio.addExample(source);
  if (keyPoint && !studio.form.keyPoint) studio.setForm({ keyPoint });
  return 'added';
}
