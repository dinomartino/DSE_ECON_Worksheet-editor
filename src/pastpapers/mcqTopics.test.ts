import { describe, expect, it } from 'vitest';
import { createMcqQuestion } from '@/model/factories';
import { viewCodesOf } from '@/model/mcqView';
import { parseManifest, withMcqTopicTag, type Manifest } from './pack';

/** The Past paper bank and the teacher's MCQ topics (k-0569). */
describe('past-paper topics that are MCQ topics', () => {
  it('are named as the editor names them, whatever an older export wrote', () => {
    const manifest = parseManifest({
      topics: [
        { id: 'tax', file: 'topics/tax.json', title: { en: 'Tax', zh: '稅' } },
        { id: 'not-an-mcq-topic', file: 'topics/x.json', title: { en: 'Kept', zh: '保留' } },
      ],
    }) as Manifest;
    expect(manifest.topics.map((topic) => topic.title)).toEqual([
      { en: 'Tax', zh: '稅項' },
      { en: 'Kept', zh: '保留' },
    ]);
  });

  it('file every question exactly: @mcq: only where its EDB codes do not already say the topic', () => {
    const tax = { ...createMcqQuestion(), tags: ['I.fiscal'] };
    expect(withMcqTopicTag(tax, 'tax').tags).toEqual(['I.fiscal', '@mcq:tax']);
    expect(viewCodesOf(withMcqTopicTag(tax, 'tax').tags)).toEqual(['@mcq:tax']);
    const ped = { ...createMcqQuestion(), tags: ['C.ped'] };
    expect(withMcqTopicTag(ped, 'elasticity')).toBe(ped);
    expect(withMcqTopicTag(ped, 'not-an-mcq-topic')).toBe(ped);
    // Untagged: it gains the topic's EDB codes too, so the coverage check and older builds see it.
    const bare = createMcqQuestion();
    expect(withMcqTopicTag(bare, 'quota').tags).toEqual(['C.intervention', '@mcq:quota']);
  });
});
