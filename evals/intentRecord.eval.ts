import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { readLocally } from '@/components/studio/chat/intent';
import { PAGE, PHRASINGS } from '@/components/studio/chat/intentPhrasings';
import { buildStudioRead } from '@/questionStudio/jevRead';
import { buildUnderstandRequest } from '@/questionStudio/understand';
import { mentorConfig } from './studioRouter.eval';

/**
 * Records the studio's reads of `intentPhrasings.ts` (k-0535; re-recorded k-0567, u-5sy9) on
 * Mentor dev, for `intent.test.ts`: every phrasing the computer is not sure of, as the studio
 * sends it — the main model's read (`/ai/generate`, feature `studio.pick`, the live prompt) into
 * `intentPhrasings.recorded.json`, and Jev's (`/ai/decide`, feature `studio.read`) into
 * `intentPhrasings.jev.json`. Re-record after changing either prompt.
 *
 *   K0567_RECORD=1 npx vitest run --config vitest.eval.config.ts evals/intentRecord.eval.ts
 */

const DIR = path.join(__dirname, '../src/components/studio/chat');

describe.skipIf(!process.env.K0567_RECORD)('record the studio reads (k-0535, k-0567)', () => {
  it('records them', async () => {
    clearDialectCache();
    const config = mentorConfig();
    const client = createClient(config);
    const preset = presetFor('mentor')!;
    const replies: Record<string, string> = {};
    const jev: Record<string, unknown> = {};
    let model = '';
    for (const p of PHRASINGS) {
      const local = readLocally(p.text, PAGE, { ...(p.chip ? { chip: p.chip } : {}), recent: p.recent });
      if (local.sure && (local.kind === 'edit' || local.kind === 'another')) continue;
      const chip = p.chip ?? (local.sure && local.kind === 'ask' && local.drafts.length === 1 ? local.drafts[0] : undefined);
      const signal = new AbortController().signal;
      const res = await client.complete(buildUnderstandRequest({ text: p.text, examples: [], drafts: PAGE, recent: p.recent, ...(chip !== undefined ? { target: chip } : {}), picks: chip === undefined }, preset, signal));
      replies[p.id] = res.text;
      model = res.model;
      // The pre-router runs only when the draft isn't known yet (no chip).
      if (chip === undefined && local.kind !== 'new') {
        const read = await client.decide!(buildStudioRead({ text: p.text, drafts: PAGE, recent: p.recent }, signal));
        expect(read, 'Mentor dev offers studio.read').not.toBeNull();
        jev[p.id] = { model: read!.model, fallback: read!.fallback, answers: read!.answers };
      }
    }
    const at = new Date().toISOString().slice(0, 10);
    writeFileSync(
      path.join(DIR, 'intentPhrasings.recorded.json'),
      `${JSON.stringify({ _about: `Replies to the live k-0535 reading prompt, recorded ${at} through Mentor dev (feature studio.pick, model ${model}) by evals/intentRecord.eval.ts. Re-record after changing the prompt.`, replies }, null, 1)}\n`,
    );
    writeFileSync(
      path.join(DIR, 'intentPhrasings.jev.json'),
      `${JSON.stringify({ _about: `Jev's answers to the studio pre-router (k-0567, src/questionStudio/jevRead.ts), recorded ${at} through Mentor dev /ai/decide (feature studio.read) by evals/intentRecord.eval.ts, for every phrasing without a chip that the computer is not sure of. Re-record after changing jevRead.ts's questions.`, answers: jev }, null, 1)}\n`,
    );
  }, 1_800_000);
});
