import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEMINI_LIGHT_MODEL, LIGHT_FEATURES, modelForJob } from './lightJobs';
import { presetFor } from './providers';

/** DSEcon Mentor's job → model map, when its repo sits beside this one (the Zo workspace). Read only. */
const MENTOR_MODELS = join(__dirname, '../../../DSE_Mentor/src/lib/ai-credits/models.ts');
const MENTOR_FROM_WORKTREE = join(__dirname, '../../../../../../DSE_Mentor/src/lib/ai-credits/models.ts');
const mentorFile = [MENTOR_MODELS, MENTOR_FROM_WORKTREE].find((p) => existsSync(p));

describe('Flash-Lite for simple jobs on an own Gemini key (u-zso2)', () => {
  it('moves translate and test only; the key-point pick and the import check never move', () => {
    expect([...LIGHT_FEATURES].sort()).toEqual(['test', 'translate']);
    expect(modelForJob('gemini-4-hydrogen', GEMINI_LIGHT_MODEL, 'translate')).toBe(GEMINI_LIGHT_MODEL);
    expect(modelForJob('gemini-4-hydrogen', GEMINI_LIGHT_MODEL, 'test')).toBe(GEMINI_LIGHT_MODEL);
    for (const feature of ['studio.pick', 'importCheck', 'studio.write', 'answers', 'polish', 'coverage', 'other'] as const) {
      expect(modelForJob('gemini-4-hydrogen', GEMINI_LIGHT_MODEL, feature), feature).toBe('gemini-4-hydrogen');
    }
    expect(modelForJob('gemini-4-hydrogen', GEMINI_LIGHT_MODEL, undefined)).toBe('gemini-4-hydrogen');
    expect(modelForJob('gemini-4-hydrogen', undefined, 'translate')).toBe('gemini-4-hydrogen');
  });

  it('runs Flash-Lite at minimal thinking, as Mentor does', () => {
    expect(presetFor('gemini').models.find((m) => m.id === GEMINI_LIGHT_MODEL)?.extra).toEqual({ thinkingLevel: 'minimal' });
  });

  it.skipIf(!mentorFile)("matches DSEcon Mentor's light model and job list", () => {
    const source = readFileSync(mentorFile!, 'utf8');
    expect(/DEFAULT_LIGHT_MODEL\s*=\s*'([^']+)'/.exec(source)?.[1]).toBe(GEMINI_LIGHT_MODEL);
    const list = /DEFAULT_LIGHT_FEATURES[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...LIGHT_FEATURES].sort());
    expect(/LIGHT_THINKING_LEVEL\s*=\s*'([^']+)'/.exec(source)?.[1]).toBe('minimal');
  });
});
