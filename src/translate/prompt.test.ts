import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { loadGlossary } from '@/glossary/load';
import type { SlotKind } from '@/model/textSlots';
import { CONVENTIONS } from './conventions';
import { fakeGlossary } from './fakeGlossary';
import { buildRequest, fewShotTurns, maxOutputTokens, PROMPT_VERSION, systemPrompt } from './prompt';
import { FEWSHOT_TO_EN, FEWSHOT_TO_ZH } from './promptText';
import { evaluateItem, finalize } from './run';
import type { Chunk, Direction, TranslationJob } from './types';
import { decodeWire, encodeRuns } from './wire';

const RENDERED_SHA = '524879dfc2d23d29b6e026a7d1afe9c9a1819c43d7aaed691b51407a36bc4872';

function rendered(): string {
  return [
    systemPrompt('toZh'), systemPrompt('toEn'), systemPrompt('toZh', true),
    ...fewShotTurns('toZh').map((t) => t.content), ...fewShotTurns('toEn').map((t) => t.content),
  ].join('\n\u0000\n');
}

describe('prompt', () => {
  it('is pinned: a change needs a new PROMPT_VERSION and an eval run', () => {
    const sha = createHash('sha256').update(rendered()).digest('hex');
    expect(PROMPT_VERSION).toBe('e2.1');
    expect(sha, 'prompt changed: bump PROMPT_VERSION and re-run npm run eval:translate').toBe(RENDERED_SHA);
  });

  it('renders rule 12 from every CONVENTIONS row', () => {
    const rule12 = systemPrompt('toZh').split('\n').find((line) => line.startsWith('12.'))!;
    for (const row of CONVENTIONS) expect(rule12).toContain(row.promptLine);
    expect(systemPrompt('toZh')).not.toContain('{CONVENTIONS}');
  });

  it('appends the repair line only on the repair pass', () => {
    expect(systemPrompt('toZh')).not.toContain('"previous"');
    expect(systemPrompt('toZh', true).endsWith('changes only what the fix notes ask.')).toBe(true);
  });
});

function job(key: string, text: string, kind: SlotKind = 'part', direction: Direction = 'toZh'): TranslationJob {
  return { key, direction, kind, groupKey: 'q:1', where: 'Question 1', source: [{ text }], slots: [], replacing: false };
}

describe('buildRequest', () => {
  const jobs = new Map([
    ['t1', job('t1', 'Explain the deadweight loss of a price floor.')],
    ['t2', job('t2', 'Explain why market failure occurs.')],
  ]);
  const chunk: Chunk = {
    id: 'c1', direction: 'toZh', sourceChars: 79,
    groups: [{ groupKey: 'q:1', where: 'Question 1', context: [{ en: 'Refer to Figure 1.', zh: '參考圖1。' }], jobKeys: ['t1', 't2'] }],
  };
  const preset = presetFor('gemini');

  it('lays out system, few-shot pair, then the payload with pins', () => {
    const req = buildRequest(chunk, jobs, fakeGlossary(), preset, new AbortController().signal);
    expect(req.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    const payload = JSON.parse(req.turns[2].content);
    expect(payload.task).toBe('translate');
    expect(payload.glossary).toEqual([
      'deadweight loss → 效率損失',
      '[only if economic sense] price → 價格 / 物價',
      'market failure → 市場失效   (not 市場失靈)',
    ]);
    expect(payload.groups).toEqual([{
      where: 'Question 1',
      context: [{ en: 'Refer to Figure 1.', zh: '參考圖1。' }],
      items: [
        { key: 't1', kind: 'part', text: 'Explain the deadweight loss of a price floor.' },
        { key: 't2', kind: 'part', text: 'Explain why market failure occurs.' },
      ],
    }]);
    expect(req.maxOutputTokens).toBe(maxOutputTokens(79, 'toZh', preset));
  });

  it('sends only the repair items, with previous and fix', () => {
    const repair = new Map([['t2', { previous: '解釋市場失靈的原因。', fix: ['Use “市場失效” for “market failure”.'] }]]);
    const req = buildRequest(chunk, jobs, null, preset, new AbortController().signal, repair);
    const payload = JSON.parse(req.turns[2].content);
    expect(payload).toMatchObject({ task: 'repair', glossary: [] });
    expect(payload.groups[0].items).toEqual([{ key: 't2', kind: 'part', text: 'Explain why market failure occurs.', ...repair.get('t2') }]);
  });

  it('pins the import family in its 進口 form, the one rank exception', () => {
    const imports = new Map([['t1', job('t1', 'Explain the effect of an import quota on imports.')]]);
    const one: Chunk = { ...chunk, groups: [{ ...chunk.groups[0], jobKeys: ['t1'] }] };
    const payload = JSON.parse(buildRequest(one, imports, fakeGlossary(), preset, new AbortController().signal).turns[2].content);
    expect(payload.glossary).toEqual(['import quota → 進口配額', 'import → 進口']);
  });

  it('caps the output budget at the preset', () => {
    expect(maxOutputTokens(1_000_000, 'toEn', preset)).toBe(preset.outputCap);
  });
});

describe('few-shot answers pass the app’s own pipeline', async () => {
  // The real glossary once P-GLOSS is in the tree; the fake stands in until then.
  const real = await loadGlossary();
  const glossary = real.entries.length > 0 ? real : fakeGlossary();

  for (const [direction, shot] of [['toZh', FEWSHOT_TO_ZH], ['toEn', FEWSHOT_TO_EN]] as const) {
    it(`${direction}: zero fails, zero warns, zero warn-severity terms`, () => {
      const answers = new Map(shot.model.map((item) => [item.key, item.text]));
      for (const group of shot.user.groups) {
        for (const item of group.items) {
          // The user turn's text is the wire the app would send; rebuild its source runs.
          const source = decodeRoundTrip(item.text);
          const j: TranslationJob = { ...job(item.key, '', item.kind, direction), source, ...(item.note ? { note: item.note } : {}) };
          const pass = evaluateItem(j, answers.get(item.key)!, glossary);
          const result = finalize(j, pass, 1, glossary);
          expect(result.issues, `${item.key}: ${item.text}`).toEqual([]);
          expect(result.terms.filter((t) => t.severity === 'warn'), item.key).toEqual([]);
          expect(result.status, item.key).toBe('ready');
        }
      }
    });
  }
});

/** Wire → runs, through the app's own decoder (a source item is its own translation). */
function decodeRoundTrip(wire: string) {
  const blanks = (wire.match(/<blank\/>/g) ?? []).length;
  const codec = { ...encodeRuns([]).codec, blanks: Array(blanks).fill(12) };
  const decoded = decodeWire(wire, codec, 'en', 'paragraph');
  if (!decoded.ok) throw new Error(wire);
  return decoded.runs;
}
