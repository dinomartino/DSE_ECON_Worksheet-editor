import { beforeEach, describe, expect, it } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { withFlow } from '@/test/fixtures';
import { createMcqQuestion, createWorksheet } from './factories';
import {
  addOptionAfterLast,
  lastOptionEnter,
  MAX_OPTION_COUNT,
  optionLimit,
  removeEmptyLastOption,
  STANDARD_OPTION_COUNT,
} from './mcqOptionEnter';
import { migrate, serializeWorksheet } from './migrations';
import { createWorksheetFrom } from './newWorksheet';
import { bi, plain } from './text';
import type { McqQuestion, Worksheet } from './types';

/**
 * k-0263: Enter on the last MC option starts the next one (E, F…) up to the paper's limit, as
 * at the end of a list in Word; Enter on an empty one it added takes it back and finishes.
 * The keys are driven in Chrome by `scripts/word-typing-verify.mjs` (options part).
 */

function paper(base: Worksheet = createWorksheet()): { worksheet: Worksheet; question: McqQuestion } {
  const question = createMcqQuestion();
  question.blocks = [{ kind: 'paragraph', id: 'stem', text: bi('Which is a public good?', '以下哪項是公共財品？') }];
  question.options = ['Street lighting', 'Bus rides', 'Parks', 'Food'].map((en, i) => ({
    id: `o${i}`,
    text: bi(en, ['街燈', '巴士', '公園', '食物'][i]),
  }));
  question.answerIndex = 0;
  return { worksheet: withFlow(base, [question]), question };
}
const optionsOf = (worksheet: Worksheet) => (worksheet.questions[0] as McqQuestion).options;
const last = (worksheet: Worksheet) => optionsOf(worksheet).at(-1)!.id;

describe('Enter on the last MC option', () => {
  it('starts option E after a D with words in it, empty on both sides; the key stays put', () => {
    const { worksheet, question } = paper();
    expect(lastOptionEnter(worksheet, question.id, 'o3', 'en')).toBe('add');
    const added = addOptionAfterLast(worksheet, question.id, 'oE');
    expect(optionsOf(added).map((option) => option.id)).toEqual(['o0', 'o1', 'o2', 'o3', 'oE']);
    expect(optionsOf(added)[4]).toEqual({ id: 'oE', text: { en: [], zh: [] } });
    expect((added.questions[0] as McqQuestion).answerIndex).toBe(0);
  });

  it('only on the last option: Enter in A–C still moves on (decided by fieldEnter)', () => {
    const { worksheet, question } = paper();
    for (const id of ['o0', 'o1', 'o2']) expect(lastOptionEnter(worksheet, question.id, id, 'en')).toBeUndefined();
  });

  it('goes on to F, and stops there: Enter on a full F finishes', () => {
    let { worksheet } = paper();
    const id = worksheet.questions[0].id;
    worksheet = addOptionAfterLast(worksheet, id, 'oE');
    expect(lastOptionEnter(worksheet, id, 'oE', 'en')).toBe('remove'); // still empty
    worksheet = withOptionText(worksheet, 'oE', 'Defence');
    expect(lastOptionEnter(worksheet, id, 'oE', 'en')).toBe('add');
    worksheet = withOptionText(addOptionAfterLast(worksheet, id, 'oF'), 'oF', 'Water');
    expect(optionsOf(worksheet)).toHaveLength(MAX_OPTION_COUNT);
    expect(lastOptionEnter(worksheet, id, 'oF', 'en')).toBeUndefined();
    expect(addOptionAfterLast(worksheet, id, 'oG')).toBe(worksheet);
  });

  it('on a Paper 1 the limit is A–D: Enter on D finishes, as it always did', () => {
    const { worksheet, question } = paper(createWorksheetFrom({ documentType: 'paper1' }));
    expect(optionLimit(worksheet)).toBe(STANDARD_OPTION_COUNT);
    expect(lastOptionEnter(worksheet, question.id, 'o3', 'en')).toBeUndefined();
    expect(addOptionAfterLast(worksheet, question.id, 'oE')).toBe(worksheet);
    expect(optionLimit(paper().worksheet)).toBe(MAX_OPTION_COUNT);
  });

  it('Enter on the empty option it added takes it away and finishes', () => {
    const { worksheet, question } = paper();
    const added = addOptionAfterLast(worksheet, question.id, 'oE');
    expect(lastOptionEnter(added, question.id, 'oE', 'en')).toBe('remove');
    const removed = removeEmptyLastOption(added, question.id, 'oE', 'en');
    expect(optionsOf(removed).map((option) => option.id)).toEqual(['o0', 'o1', 'o2', 'o3']);
  });

  it('never takes away one of the first four: an empty D on a new question finishes', () => {
    const { worksheet, question } = paper();
    const blankD = withOptionText(worksheet, 'o3', '', '');
    expect(lastOptionEnter(blankD, question.id, 'o3', 'en')).toBeUndefined();
    expect(removeEmptyLastOption(blankD, question.id, 'o3', 'en')).toBe(blankD);
  });

  it('bilingual: a word on either side keeps the option; "has words" is the side being typed', () => {
    const { worksheet, question } = paper();
    // E typed in English, then opened in 中文: empty there, but not an empty option.
    const englishE = withOptionText(addOptionAfterLast(worksheet, question.id, 'oE'), 'oE', 'Defence', '');
    expect(lastOptionEnter(englishE, question.id, 'oE', 'zh')).toBeUndefined();
    expect(removeEmptyLastOption(englishE, question.id, 'oE', 'zh')).toBe(englishE);
    // …while Enter in its English starts F, and a 中文-only E adds from the 中文 side.
    expect(lastOptionEnter(englishE, question.id, 'oE', 'en')).toBe('add');
    const chineseE = withOptionText(addOptionAfterLast(worksheet, question.id, 'oE'), 'oE', '', '國防');
    expect(lastOptionEnter(chineseE, question.id, 'oE', 'zh')).toBe('add');
    expect(lastOptionEnter(chineseE, question.id, 'oE', 'en')).toBeUndefined();
  });

  it('never takes away the option that is the answer, or one with a note, picture or pin', () => {
    const { worksheet, question } = paper();
    const added = addOptionAfterLast(worksheet, question.id, 'oE');
    const keyed = { ...added, questions: [{ ...(added.questions[0] as McqQuestion), answerIndex: 4 }] };
    expect(lastOptionEnter(keyed, question.id, 'oE', 'en')).toBeUndefined();
    const withNote = mapE(added, (option) => ({ ...option, rationale: bi('Not rival.', '') }));
    expect(lastOptionEnter(withNote, question.id, 'oE', 'en')).toBeUndefined();
    const pinned = mapE(added, (option) => ({ ...option, pinned: true }));
    expect(lastOptionEnter(pinned, question.id, 'oE', 'en')).toBeUndefined();
  });

  it('is one undo step each way, through the store', () => {
    const { worksheet, question } = paper();
    useWorksheetStore.setState({ worksheet, past: [], future: [], readOnly: false });
    const store = useWorksheetStore.getState();
    store.commit((draft) => addOptionAfterLast(draft, question.id, 'oE'));
    expect(optionsOf(useWorksheetStore.getState().worksheet)).toHaveLength(5);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet).toBe(worksheet);
    useWorksheetStore.getState().redo();
    const added = useWorksheetStore.getState().worksheet;
    useWorksheetStore.getState().commit((draft) => removeEmptyLastOption(draft, question.id, last(draft), 'en'));
    expect(optionsOf(useWorksheetStore.getState().worksheet)).toHaveLength(4);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet).toBe(added);
  });

  it('E prints, saves, reopens and reaches the .docx', async () => {
    const { worksheet, question } = paper();
    const withE = withOptionText(addOptionAfterLast(worksheet, question.id, 'oE'), 'oE', 'National defence', '國防');
    const reopened = migrate(JSON.parse(JSON.stringify(serializeWorksheet(withE))));
    expect(optionsOf(reopened).map((option) => plain(option.text.en))).toEqual([
      'Street lighting',
      'Bus rides',
      'Parks',
      'Food',
      'National defence',
    ]);
    const text = JSON.stringify(renderWorksheet(reopened, { language: 'bilingual', version: 'student' }));
    expect(text).toContain('National defence');
    expect(text).toContain('國防');
    const zip = await JSZip.loadAsync(await exportDocxBuffer(reopened, { language: 'en', version: 'student' }));
    expect(await zip.file('word/document.xml')!.async('string')).toContain('National defence');
  });
});

beforeEach(() => {
  useWorksheetStore.setState({ readOnly: false });
});

function mapE(worksheet: Worksheet, change: (option: McqQuestion['options'][number]) => McqQuestion['options'][number]): Worksheet {
  const question = worksheet.questions[0] as McqQuestion;
  return { ...worksheet, questions: [{ ...question, options: question.options.map((o, i, all) => (i === all.length - 1 ? change(o) : o)) }] };
}

function withOptionText(worksheet: Worksheet, id: string, en: string, zh = ''): Worksheet {
  const question = worksheet.questions[0] as McqQuestion;
  return {
    ...worksheet,
    questions: [{ ...question, options: question.options.map((option) => (option.id === id ? { ...option, text: bi(en, zh) } : option)) }],
  };
}
