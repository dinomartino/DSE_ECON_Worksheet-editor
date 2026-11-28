import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { buildUnderstandRequest } from '@/questionStudio/understand';
import { readLocally } from '@/components/studio/chat/intent';
import { PAGE, PHRASINGS } from '@/components/studio/chat/intentPhrasings';

/**
 * Not a check: writes the live prompt of every phrasing the computer is not sure of, so the
 * AI's answers can be recorded (`intentPhrasings.recorded.json`). Run with
 * `K0535_RECORD=/tmp/prompts.json npx vitest run scripts/intent.record.test.ts`,
 * send each `{system, user}` to the model, and keep its reply text by id.
 */
describe.skipIf(!process.env.K0535_RECORD)('record the reading prompts (k-0535)', () => {
  it('writes them', () => {
    const preset = presetFor('gemini');
    const out = PHRASINGS.filter((p) => {
      const local = readLocally(p.text, PAGE, { ...(p.chip ? { chip: p.chip } : {}), recent: p.recent });
      return !(local.sure && (local.kind === 'edit' || local.kind === 'another'));
    }).map((p) => {
      const local = readLocally(p.text, PAGE, { ...(p.chip ? { chip: p.chip } : {}), recent: p.recent });
      const chip = p.chip ?? (local.sure && local.kind === 'ask' && local.drafts.length === 1 ? local.drafts[0] : undefined);
      const req = buildUnderstandRequest(
        { text: p.text, examples: [], drafts: PAGE, recent: p.recent, ...(chip !== undefined ? { target: chip } : {}), picks: chip === undefined },
        preset,
        new AbortController().signal,
      );
      return { id: p.id, system: `${req.system}\n${req.shapeHint}`, user: req.turns[0].content };
    });
    writeFileSync(process.env.K0535_RECORD as string, JSON.stringify(out, null, 1));
  });
});
