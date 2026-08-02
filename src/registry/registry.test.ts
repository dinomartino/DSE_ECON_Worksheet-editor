import { describe, expect, it } from 'vitest';
import { STEM_TEXT_INDENT } from '@/model/numbering';
import { readFileSync } from 'node:fs';
import { questionMarks } from '@/model/marks';
import { plain } from '@/model/text';
import type { Question } from '@/model/types';
import { collectListStreams, renderWorksheet } from '@/render/worksheet';
import { buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { getQuestionType, listQuestionTypes, requireQuestionType } from '.';

/**
 * §9 is an architectural acceptance criterion, so it gets asserted like one: a new
 * question type must need only a registry entry, and the shared plumbing must not
 * contain per-type branching.
 */
describe('question-type registry (§9)', () => {
  it('exposes a complete definition for every registered type', () => {
    const definitions = listQuestionTypes();
    expect(definitions.length).toBeGreaterThanOrEqual(2);

    for (const definition of definitions) {
      expect(definition.id, 'id').toBeTruthy();
      expect(plain(definition.displayName.en), `${definition.id} EN name`).toBeTruthy();
      expect(plain(definition.displayName.zh), `${definition.id} 中文 name`).toBeTruthy();
      expect(typeof definition.create, `${definition.id} factory`).toBe('function');
      expect(typeof definition.render, `${definition.id} renderer`).toBe('function');
      expect(definition.EditorPanel, `${definition.id} panel`).toBeTruthy();

      // The blank instance must be valid and self-consistent.
      const blank = definition.create();
      expect(blank.type).toBe(definition.id);
      expect(blank.id).toBeTruthy();
      expect(Array.isArray(blank.blocks)).toBe(true);
      expect(() => questionMarks(blank)).not.toThrow();
    }
  });

  it('renders every registered type through the one shared IR pipeline', () => {
    for (const definition of listQuestionTypes()) {
      const nodes = definition.render(definition.create(), {
        mode: { language: 'bilingual', version: 'teacher' },
        questionNumber: 1,
        questionId: 'q-test',
        questionStream: 'question:0',
      });
      expect(nodes.length, definition.id).toBeGreaterThan(0);
      // The question number must arrive as a list reference, never literal text.
      const numbered = nodes.find((node) => node.kind === 'text' && node.listRef?.level === 0);
      expect(numbered, `${definition.id} must emit a level-0 list reference`).toBeTruthy();
    }
  });

  it('carries the numbered paragraph\'s own formatting into the IR', () => {
    /*
     * The paragraph that carries the question number is built by hand rather than
     * through `renderContentBlocks`, so it is the one place a block's `format` can be
     * forgotten — and it was, in all four hand-built sites.
     *
     * It failed silently and asymmetrically: the *first* stem paragraph ignored
     * alignment while every later one honoured it, and because only the preview applies
     * alignment (as CSS) the page showed a right-aligned stem that exported with no
     * `w:jc` at all. A real worksheet in `real_life_reference/` hit exactly this.
     */
    for (const definition of listQuestionTypes()) {
      const question = definition.create();
      const first = question.blocks[0];
      if (!first || first.kind !== 'paragraph') continue;
      first.format = { align: 'right', fontSize: 14 };

      const nodes = definition.render(question, {
        mode: { language: 'en', version: 'student' },
        questionNumber: 1,
        questionId: 'q-test',
        questionStream: 'question:0',
      });

      const numbered = nodes.find((node) => node.kind === 'text' && node.listRef?.level === 0);
      expect(numbered, `${definition.id} numbered node`).toBeTruthy();
      expect(
        numbered && 'format' in numbered ? numbered.format : undefined,
        `${definition.id} must carry the block's format`,
      ).toMatchObject({ align: 'right', fontSize: 14 });
    }
  });

  it('indents stem continuation blocks to the stem’s own text column', () => {
    /*
     * A second stem block — the paragraph after a table, the sentence carrying the
     * marks — has no `1.` marker, so without an explicit indent it printed at the
     * page margin, hanging in the question number's gutter and out of line with
     * every other line of the question (§ STEM_TEXT_INDENT).
     */
    for (const definition of listQuestionTypes()) {
      const question = definition.create();
      const first = question.blocks[0];
      if (!first || first.kind !== 'paragraph') continue;
      question.blocks.push({
        kind: 'paragraph',
        id: 'continuation',
        text: { en: [{ text: 'And the paragraph after the table.' }], zh: [] },
      });

      const nodes = definition.render(question, {
        mode: { language: 'en', version: 'student' },
        questionNumber: 1,
        questionId: 'q-test',
        questionStream: 'question:0',
      });

      const continuation = nodes.find(
        (node) =>
          node.kind === 'text' &&
          node.edit?.kind === 'blockText' &&
          node.edit.blockId === 'continuation',
      );
      expect(continuation, `${definition.id} continuation node`).toBeTruthy();
      expect(
        continuation && 'indent' in continuation ? continuation.indent : undefined,
        `${definition.id} continuation must sit at the stem text column`,
      ).toBe(STEM_TEXT_INDENT);
    }
  });

  it('throws loudly on an unknown type instead of silently dropping a question', () => {
    expect(getQuestionType('nope')).toBeUndefined();
    expect(() => requireQuestionType({ type: 'nope' } as unknown as Question)).toThrow(/Unknown question type/);
  });

  it('keeps shared plumbing free of per-type branching', () => {
    // If numbering, marks totalling, export orchestration or persistence had to
    // change per type, these files would name the concrete type ids.
    const shared = [
      'src/model/numbering.ts',
      'src/render/worksheet.ts',
      'src/export/docx/index.ts',
      'src/export/docx/body.ts',
      'src/export/docx/numbering.ts',
      'src/export/clipboard.ts',
      'src/model/migrations.ts',
      'src/storage/index.ts',
    ];
    for (const path of shared) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${path} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });

  it('flows a brand-new question type through preview, docx and clipboard untouched', () => {
    // Simulate step 1-4 of §9 without editing any shared module: define a variant,
    // render it via the same IR, and confirm all three backends carry it.
    const worksheet = buildAcceptanceWorksheet();
    const definition = listQuestionTypes()[0];
    const extra = definition.create();
    worksheet.questions.push(extra);

    const rendered = renderWorksheet(worksheet, { language: 'en', version: 'student' });
    expect(rendered.questions.at(-1)!.questionId).toBe(extra.id);

    // Every stream the IR declares gets a concrete numbering instance in the docx.
    const streams = collectListStreams(rendered);
    const { numberingXml } = buildDocxParts(worksheet, { language: 'en', version: 'student' });
    expect((numberingXml.match(/<w:num w:numId=/g) ?? []).length).toBe(streams.length);

    // And the clipboard backend renders it too.
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('<p');
  });
});

describe('marks totalling is type-agnostic (§9)', () => {
  it('falls back to flat marks for any type that does not define parts', () => {
    for (const definition of listQuestionTypes()) {
      const blank = definition.create();
      expect(Number.isFinite(questionMarks(blank))).toBe(true);
    }
  });
});
