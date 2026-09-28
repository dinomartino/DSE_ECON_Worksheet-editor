import type { ProviderId } from './types';

/**
 * Runs before anything is sent: a key whose visible prefix belongs to another provider is
 * never sent without the teacher's "test anyway". Null when nothing looks wrong.
 */
export function keyShapeProblem(provider: ProviderId, key: string): { likely?: ProviderId; message: string } | null {
  // P-AI replaces this body
  void provider;
  void key;
  return null;
}
