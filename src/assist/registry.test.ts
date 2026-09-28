import { beforeEach, describe, expect, it } from 'vitest';
import { registerVerb, resetVerbsForTest, verbById, verbs } from './registry';
import type { AiVerb, VerbGroup } from './types';

const verb = (id: string, group: VerbGroup, order: number): AiVerb => ({
  id,
  group,
  order,
  needsKey: false,
  label: () => id,
  available: () => ({}),
  run: async () => ({ kind: 'nothing', summary: '' }),
});

describe('verb registry', () => {
  beforeEach(() => resetVerbsForTest());

  it('sorts by group (translate, check, write, create) then order', () => {
    registerVerb(verb('create.a', 'create', 0));
    registerVerb(verb('check.b', 'check', 2));
    registerVerb(verb('translate.a', 'translate', 5));
    registerVerb(verb('check.a', 'check', 1));
    registerVerb(verb('write.a', 'write', 0));
    expect(verbs().map((v) => v.id)).toEqual(['translate.a', 'check.a', 'check.b', 'write.a', 'create.a']);
  });

  it('is idempotent by id', () => {
    registerVerb(verb('x', 'check', 1));
    registerVerb(verb('x', 'check', 9));
    expect(verbs()).toHaveLength(1);
    expect(verbById('x')?.order).toBe(9);
    expect(verbById('nope')).toBeUndefined();
  });
});
