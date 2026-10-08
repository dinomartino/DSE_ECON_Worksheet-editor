import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { addToBank } from '@/library/bankDocs';
import { createWorksheet } from '@/model/factories';
import type { McqQuestion, Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { resolveMessages } from '@/i18n/catalogue';
import { IMPORT_MESSAGES } from './messages';
import {
  CHIP,
  FLAG_TEXT,
  PINNABLE,
  checkPlaces,
  nextPlace,
  optionIndexAt,
  pasteVerdict,
  readPaste,
  review,
  roleForKey,
  withPin,
  withoutPin,
} from './pasteSession';
import { materialize, previewBase, previewItems } from './previewDoc';

const fixture = (name: string) => readFileSync(path.resolve(__dirname, '../../import/fixtures', name), 'utf8');

const start = (plain: string) => review(readPaste({ plain }), [], 'auto');

describe('what can be reviewed', () => {
  it('says why an empty read or a scan is not reviewed, and offers OCR text with a warning', () => {
    expect(pasteVerdict(start(fixture('17-empty.txt')))).toBe('empty');
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const scan = review(readPaste({ plain: '', html: `<p><img src="${image}" width="600" height="800"></p>` }), [], 'auto');
    expect(pasteVerdict(scan)).toBe('scan');
    expect(pasteVerdict(start(fixture('08-ocr-mc.txt')))).toBe('ocr');
    expect(pasteVerdict(start(fixture('01-word-plain-mc.txt')))).toBe('ok');
  });
});

describe('fixes', () => {
  const paste = ['1.\tFirst stem.', 'a)\tone', 'b)\ttwo', '2.\tSecond stem.', 'a)\tthree', 'b)\tfour'].join('\n');

  it('a role fix re-solves, and spreads to every line of its label family', () => {
    const read = readPaste({ plain: paste });
    const before = review(read, [], 'auto');
    expect(before.analysis.outline.questions).toHaveLength(2);
    const pins = withPin([], { kind: 'role', line: 1, role: 'question' }, before.analysis);
    const after = review(read, pins, 'auto');
    // The pinned `a)` and its family elsewhere (line 4, untouched) are questions now.
    expect(after.analysis.roles[1]).toMatchObject({ role: 'question', pinned: true });
    expect(after.analysis.roles[4].role).toBe('question');
    expect(after.batch.builds.length).toBeGreaterThan(2);
  });

  it('replaces an older fix on the same line, toggles a new question, and undoes one at a time', () => {
    const { analysis } = start(paste);
    let pins = withPin([], { kind: 'role', line: 2, role: 'stem' }, analysis);
    pins = withPin(pins, { kind: 'role', line: 2, role: 'part' }, analysis);
    expect(pins).toEqual([{ kind: 'role', line: 2, role: 'part' }]);
    pins = withPin(pins, { kind: 'newQuestion', line: 5 }, analysis);
    expect(withPin(pins, { kind: 'newQuestion', line: 5 }, analysis)).toEqual([{ kind: 'role', line: 2, role: 'part' }]);
    // A join replaces a new question on the same line.
    expect(withPin(pins, { kind: 'join', line: 5 }, analysis).filter((p) => p.line === 5)).toEqual([{ kind: 'join', line: 5 }]);
    expect(withoutPin(pins, pins[0])).toEqual([{ kind: 'newQuestion', line: 5 }]);
    expect(pins.slice(0, -1)).toEqual([{ kind: 'role', line: 2, role: 'part' }]);
  });

  it('maps each shortcut key to its role', () => {
    expect(PINNABLE.map((p) => p.key).join('')).toBe('QPSOTMHN');
    expect(roleForKey('p')).toBe('part');
    expect(roleForKey('t')).toBe('statement');
    expect(roleForKey('x')).toBeUndefined();
  });
});

describe('answers and flags', () => {
  it('a click on an option in the preview sets that question’s answerIndex', () => {
    const read = readPaste({ plain: fixture('01-word-plain-mc.txt') });
    const first = review(read, [], 'auto');
    const items = previewItems(previewBase(), first.analysis, first.batch, new Map());
    const q0 = items.find((item) => item.question === 0)!;
    // The third option's node, as the preview wraps it (`data-node`).
    const nodeC = q0.nodes.findIndex((node) => node.kind === 'text' && node.edit?.kind === 'mcqOption' && optionIndexAt(q0.nodes, q0.nodes.indexOf(node)) === 2);
    expect(nodeC).toBeGreaterThan(-1);
    const index = optionIndexAt(q0.nodes, nodeC)!;
    const pins = withPin([], { kind: 'answer', line: first.analysis.outline.questions[0].start, index }, first.analysis);
    const after = review(read, pins, 'auto');
    expect((materialize(after.batch.builds[0]) as McqQuestion).answerIndex).toBe(2);
    expect(checkPlaces(after.analysis).noAnswer.map((p) => p.question)).not.toContain(0);
  });

  it('counts structural flags apart from MC without an answer, and steps through them', () => {
    const { analysis } = start(fixture('03-word-plain-structured.txt'));
    const places = checkPlaces(analysis);
    expect(places.check.length).toBeGreaterThan(0);
    expect(places.check.every((p) => p.flags.every((f) => f.kind !== 'noAnswer'))).toBe(true);
    const first = nextPlace(places.check, undefined)!;
    expect(nextPlace(places.check, first.line)).toBe(places.check[1] ?? first);
  });

  it('keeps unchanged questions between solves, so their previews do not re-render', () => {
    const read = readPaste({ plain: fixture('01-word-plain-mc.txt') });
    const cache = new Map();
    const base = previewBase();
    const a = review(read, [], 'auto');
    const first = previewItems(base, a.analysis, a.batch, cache);
    const pins = withPin([], { kind: 'answer', line: a.analysis.outline.questions[0].start, index: 1 }, a.analysis);
    const b = review(read, pins, 'auto');
    const second = previewItems(base, b.analysis, b.batch, cache);
    expect(second[0].nodes).not.toBe(first[0].nodes);
    expect(second[1].nodes).toBe(first[1].nodes);
  });
});

describe('insert and 題庫', () => {
  beforeEach(() => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
  });

  it('inserts the whole paste as one undo step', () => {
    const { batch } = start(fixture('14-shared-stem.txt'));
    const store = useWorksheetStore.getState();
    const before = store.worksheet;
    const report = store.insertQuestionBatch(batch.builds, { worksheetId: before.id, ...(batch.lead ? { lead: batch.lead } : {}) });
    if (!report.ok) throw new Error('refused');
    expect(report.questionIds).toHaveLength(batch.builds.length);
    expect(report.leadId).toBeDefined();
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet.questions).toEqual(before.questions);
    expect(useWorksheetStore.getState().worksheet.layout).toEqual(before.layout);
  });

  it('adds to a bank and skips what it already holds, from this paste or an earlier one', async () => {
    const map = new Map<string, Worksheet>();
    const store = {
      load: async (id: string) => map.get(id),
      save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)),
    } as unknown as WorksheetStore;
    const questions = (plain: string) => start(plain).batch.builds.map(materialize).filter((q): q is Question => Boolean(q));
    const paper = fixture('01-word-plain-mc.txt');
    const made = await addToBank(questions(paper), { name: 'Pasted' }, { store, openDocId: '' });
    expect(made.copied).toBe(4);
    expect(made.bank.questions.every((q) => q.lineage === undefined)).toBe(true);
    // The same paste again, plus one question twice in one paste.
    const again = await addToBank([...questions(paper), ...questions('1.\tA new one?\n2.\tA new one?')], made.bank.id, { store, openDocId: '' });
    expect(again.copied).toBe(1);
    expect(again.already).toHaveLength(5);
    expect(map.get(made.bank.id)!.questions).toHaveLength(5);
  });
});

describe('interface text', () => {
  it('words every role, flag and shortcut in English and Chinese', () => {
    for (const lang of ['en', 'zh-HK'] as const) {
      const m = resolveMessages(IMPORT_MESSAGES, lang);
      for (const key of [...Object.values(CHIP).map((c) => c.name), ...PINNABLE.map((p) => p.name)]) expect(m[key]).toBeTruthy();
      for (const key of Object.values(FLAG_TEXT)) {
        const text = key === 'flagOptionCount' ? m.flagOptionCount(3) : m[key];
        expect(text, key).toBeTruthy();
      }
    }
    const en = resolveMessages(IMPORT_MESSAGES, 'en');
    expect(en.questionCount(1)).toBe('1 question');
    expect(en.questionCount(38)).toBe('38 questions');
    expect(en.toCheck(3)).toBe('3 to check');
    expect(resolveMessages(IMPORT_MESSAGES, 'zh-HK').questionCount(38)).toBe('38 條題目');
  });
});
