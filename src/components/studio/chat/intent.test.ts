import { describe, expect, it } from 'vitest';
import { parseTurn } from '@/questionStudio/understand';
import { decide, readLocally } from './intent';
import { PAGE, PHRASINGS } from './intentPhrasings';
import recorded from './intentPhrasings.recorded.json';

/**
 * k-0535 (u-yu7s): a teacher's message once drafts exist, in any wording (EN, 中文, mixed),
 * read as edit / another / ask / new / which-draft. Fast rows are clear enough for the computer;
 * the rest go through the AI's recorded answer to the live prompt.
 */

const replies = (recorded as { replies: Record<string, string> }).replies;
const nos = PAGE.map((d) => d.no);

function finalRead(p: (typeof PHRASINGS)[number]) {
  const local = readLocally(p.text, PAGE, { ...(p.chip ? { chip: p.chip } : {}), recent: p.recent });
  const fast = local.sure && (local.kind === 'edit' || local.kind === 'another');
  if (fast) return { read: local, fast };
  const reply = replies[p.id];
  return { read: decide(local, reply === undefined ? undefined : parseTurn(reply, nos)), fast, reply };
}

describe('reading a message with the drafts (k-0535): ~40 real phrasings', () => {
  it('has about forty, in English, Chinese and mixed', () => {
    expect(PHRASINGS.length).toBeGreaterThanOrEqual(40);
    for (const lang of ['en-', 'zh-', 'mx-']) expect(PHRASINGS.some((p) => p.id.startsWith(lang))).toBe(true);
  });

  it.each(PHRASINGS.map((p) => [p.id, p.text, p] as const))('%s %s', (_id, _text, p) => {
    const { read, fast, reply } = finalRead(p);
    // Fast rows cost no reading request; every other row has a recorded answer.
    expect(fast).toBe(Boolean(p.fast));
    if (!fast) expect(reply, 'record this row: intent.record.test.ts').toBeDefined();
    expect(read.kind).toBe(p.want.kind);
    if (p.want.drafts) expect(read.drafts).toEqual(p.want.drafts);
    if (read.kind === 'ask') expect(read.reply?.length ?? 0).toBeGreaterThan(10);
  });

  it('a Chinese question gets a Chinese answer', () => {
    const { read } = finalRead(PHRASINGS.find((p) => p.id === 'zh-06')!);
    expect(read.reply).toMatch(/[一-鿿]/);
  });

  it('with no AI read, an edit is never turned into new drafts (it edits or asks which)', () => {
    for (const p of PHRASINGS.filter((x) => x.want.kind !== 'new')) {
      const local = readLocally(p.text, PAGE, { ...(p.chip ? { chip: p.chip } : {}), recent: p.recent });
      expect(decide(local, undefined).kind, p.id).not.toBe('new');
    }
  });

  it('an AI "new" for a named draft and change words is asked about, not written', () => {
    const local = readLocally('the second one is too wordy', PAGE, { recent: [1, 2, 3] });
    expect(decide(local, { intent: 'new', drafts: [], how: 'change', parts: [], reply: '' }).kind).toBe('unsure');
  });

  it('no drafts: always new; added drafts are never targets', () => {
    expect(readLocally('make draft 2 harder', [])).toMatchObject({ kind: 'new', sure: true });
    const added = PAGE.map((d) => (d.no === 3 ? { ...d, state: 'added' as const } : d));
    expect(readLocally('make the last question harder', added, { recent: [] }).drafts).toEqual([2]);
    expect(readLocally('make draft 3 harder', added, { recent: [] }).kind).toBe('unsure');
  });

  it('Simplified Chinese reads like Traditional', () => {
    // 第二題太易 typed in Simplified characters (kept as escapes: no Simplified text in the source).
    expect(readLocally('\u7b2c\u4e8c\u9898\u592a\u6613', PAGE)).toMatchObject({ kind: 'edit', drafts: [2], how: 'harder', sure: true });
  });

  it('reads difficulty and what an edit touches', () => {
    expect(readLocally('Q2 太易', PAGE).how).toBe('harder');
    expect(readLocally('最後一題太難', PAGE).how).toBe('easier');
    expect(readLocally('Q3 的 diagram 要 shift supply', PAGE).parts).toContain('diagram');
    expect(readLocally('改第一題啲選項', PAGE).parts).toContain('options');
  });
});
