import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/registry';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildCommands, SETUP_INDEX, type Command } from './commands';
import { normalize, searchCommands } from './commandSearch';

const commands = (readOnly = false): Command[] =>
  buildCommands({ worksheet: useWorksheetStore.getState().worksheet, readOnly, labelFor: () => 'Q1' });
const top = (query: string, list = commands()) => searchCommands(list, query).map((command) => command.id);

beforeEach(() => {
  useWorksheetStore.setState({ worksheet: buildAcceptanceWorksheet(), readOnly: false, insertAnchorId: undefined });
});

describe('⌘K finds a command by the words a Word user types', () => {
  it.each([
    ['font', 'setup:fonts'],
    ['Fonts', 'setup:fonts'],
    ['page break', 'insert:pageBreak'],
    ['justify', 'setup:justifyText'],
    ['table', 'insert:table'],
    ['picture', 'insert:picture'],
    ['image', 'insert:picture'],
    ['print', 'export:exportPdf'],
    ['margins', 'setup:margins'],
    ['header', 'setup:tabFurniture'],
    ['landscape', 'setup:orientation'],
    ['multiple choice', 'insert:mcq'],
    ['ruled', 'insert:answerLines'],
    ['save', 'more:save'],
  ])('"%s" puts %s first', (query, id) => {
    expect(top(query)[0]).toBe(id);
  });

  it.each([
    ['字型', 'setup:fonts'],
    ['表格', 'insert:table'],
    ['列印', 'export:exportPdf'],
    ['分頁', 'insert:pageBreak'],
    ['頁首', 'setup:tabFurniture'],
    ['對齊', 'setup:justifyText'],
  ])('in 中文, "%s" puts %s first', (query, id) => {
    expect(top(query)[0]).toBe(id);
  });

  it('full-width letters and an ellipsis are folded, so they match too', () => {
    expect(normalize('Ｔａｂｌｅ…')).toBe('table');
    expect(top('Ｔａｂｌｅ')[0]).toBe('insert:table');
  });

  it('nothing matches gibberish; an empty box lists everything', () => {
    expect(top('xyzzy')).toEqual([]);
    expect(top('')).toHaveLength(commands().length);
  });

  it('every command is named in both languages, and says where it lives', () => {
    for (const command of commands()) {
      expect(command.label.en.trim(), command.id).not.toBe('');
      expect(command.label.zh.trim(), command.id).not.toBe('');
      expect(command.where.en.trim() && command.where.zh.trim(), command.id).toBeTruthy();
    }
    // The 中文 interface reads 中文 names.
    expect(commands().find((c) => c.id === 'setup:fonts')?.label.zh).toBe('字型');
    expect(commands().find((c) => c.id === 'insert:table')?.label.zh).toBe('表格…');
  });

  it('lists the Insert menu as the rail does: what a Paper 1 cannot hold is not offered', () => {
    expect(top('dotted').filter((id) => id.startsWith('insert:'))).toEqual(
      expect.arrayContaining(['insert:answerSpace', 'insert:answerSpaceFill']),
    );
    useWorksheetStore.setState({ worksheet: createWorksheetFrom({ documentType: 'paper1', seedSample: false }) });
    const ids = commands().map((c) => c.id);
    expect(ids).not.toContain('insert:answerLines');
    expect(ids).not.toContain('insert:answerSpace');
    expect(ids).toContain('insert:table');
  });

  it('a read-only paper offers views and exports, nothing that edits', () => {
    const ids = commands(true).map((c) => c.id);
    expect(ids.some((id) => id.startsWith('insert:') || id.startsWith('setup:'))).toBe(false);
    expect(ids).toContain('export:exportPdf');
    expect(ids).toContain('view:markingScheme');
    expect(ids).not.toContain('more:save');
  });
});

describe('the Setup index follows the Setup dialog', () => {
  /** Labels that name a part of a setting (its box, its aria name), not one to search for. */
  const PARTS = new Set(['classesAria', 'pageToEdit', 'targetMarks', 'targetTime', 'versionShown', 'versionsCount']);

  it('every setting labelled in Setup can be found by ⌘K', () => {
    const files = ['DocumentSettings.tsx', 'BetweenQuestionsField.tsx', 'StartEveryQuestionField.tsx', 'OptionLayoutField.tsx'];
    const labelled = new Set<string>();
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      for (const match of source.matchAll(/label=\{m\.([a-zA-Z]+)\}/g)) labelled.add(match[1]);
    }
    const indexed = new Set(SETUP_INDEX.map((entry) => entry.key as string));
    const missing = [...labelled].filter((key) => !PARTS.has(key) && !indexed.has(key));
    expect(missing, 'add them to SETUP_INDEX in commands.ts').toEqual([]);
  });
});
