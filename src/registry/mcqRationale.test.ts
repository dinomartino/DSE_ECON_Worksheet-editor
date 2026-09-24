import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildAnswerKeyDocxParts, buildDocxParts, exportAnswerKeyDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { applyDeleteTarget, applyEditTarget, editTargetKey, textOfTarget } from '@/model/edits';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { listIndentScheme } from '@/model/numbering';
import { bi, emptyBiText, plain } from '@/model/text';
import type { LanguageMode, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { renderAnswerKey } from '@/render/answerKey';
import type { ColumnsNode, RenderNode, TextNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { mcqType } from './mcq';

/**
 * Per-option rationale and the provenance note (`McqOption.rationale`,
 * `McqQuestion.provenance`): teacher-only, so the student paper never changes.
 */

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

function mcq(texts: string[], answerIndex = 0): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [{ kind: 'paragraph', id: `${question.id}-stem`, text: bi('Stem', '題幹') }];
  question.options = texts.map((text, index) => ({ id: `${question.id}-${index}`, text: bi(text, text) }));
  question.answerIndex = answerIndex;
  return question;
}

/** Every MCQ given a rationale on every option and a source note. */
function annotated(worksheet: Worksheet): Worksheet {
  return {
    ...worksheet,
    questions: worksheet.questions.map((question) =>
      question.type !== 'mcq'
        ? question
        : {
            ...question,
            options: question.options.map((option, index) => ({
              ...option,
              rationale: bi(`Why ${index}`, `原因 ${index}`),
            })),
            provenance: bi('Modelled on DSE 2023 Q1', '改編自 2023 DSE 第 1 題'),
          },
    ),
  };
}

const rows = (nodes: RenderNode[]) =>
  nodes.filter((node): node is ColumnsNode => node.kind === 'columns' && node.style === 'Marking Scheme');

describe('the student paper never shows rationale or provenance', () => {
  const plain1 = buildAcceptanceWorksheet();
  const versioned: Worksheet = { ...plain1, versions: { count: 3, seed: 41 } };

  for (const base of [plain1, versioned]) {
    for (const language of LANGUAGES) {
      for (const variant of base.versions ? ['A', 'B', 'C'] : [undefined]) {
        const mode: OutputMode = { language, version: 'student', ...(variant ? { variant } : {}) };
        it(`renders identical IR, .docx and clipboard (${language}${variant ? `, version ${variant}` : ''})`, () => {
          const noted = annotated(base);
          expect(renderWorksheet(noted, mode)).toEqual(renderWorksheet(base, mode));
          expect(buildDocxParts(noted, mode).documentXml).toBe(buildDocxParts(base, mode).documentXml);
          expect(worksheetClipboardHtml(noted, mode)).toBe(worksheetClipboardHtml(base, mode));
        });
      }
    }
  }
});

describe('an untouched document', () => {
  it('prints the teacher version exactly as an empty note does, with no note rows', () => {
    const base = buildAcceptanceWorksheet();
    // Present-but-empty fields (a cleared field from an older save) print nothing too.
    const empty: Worksheet = {
      ...base,
      questions: base.questions.map((question) =>
        question.type !== 'mcq'
          ? question
          : {
              ...question,
              options: question.options.map((option) => ({ ...option, rationale: emptyBiText() })),
              provenance: emptyBiText(),
            },
      ),
    };
    for (const language of LANGUAGES) {
      const mode: OutputMode = { language, version: 'teacher' };
      const rendered = renderWorksheet(base, mode);
      expect(renderWorksheet(empty, mode)).toEqual(rendered);
      expect(rendered.questions.flatMap((question) => rows(question.nodes))).toEqual([]);
    }
  });

  it('keeps the key and an explanation exactly as they were', () => {
    const question = mcq(['w', 'x', 'y', 'z'], 2);
    question.explanation = bi('Because.', '因為。');
    const nodes = mcqType.render(question, {
      mode: { language: 'en', version: 'teacher' },
      questionNumber: 1,
      questionId: question.id,
      questionStream: 'q',
      indents: listIndentScheme('classroom'),
    });
    const tail = nodes.slice(-2) as TextNode[];
    expect(tail.map((node) => node.style)).toEqual(['Answer', 'Marking Scheme']);
    expect(tail[0].keepNext).toBe(true);
    expect(tail[1].keepNext).toBeUndefined();
  });
});

describe('the teacher version', () => {
  it('prints each rationale under the key, lettered as printed, then the source', () => {
    const question = mcq(['w', 'x', 'y', 'z'], 1);
    question.options[1].rationale = bi('x is right', 'x 正確');
    question.options[3].rationale = bi('z is wrong', 'z 錯誤');
    question.provenance = bi('DSE 2023 Q1', '2023 DSE 第 1 題');
    const worksheet: Worksheet = { ...createWorksheet(), questions: [question] };

    const nodes = renderWorksheet(worksheet, { language: 'en', version: 'teacher' }).questions[0].nodes;
    const notes = rows(nodes);
    expect(notes.map((row) => [row.cells[0].marker, plain(row.cells[0].text.en)])).toEqual([
      ['B.', 'x is right'],
      ['D.', 'z is wrong'],
      ['Source:', 'DSE 2023 Q1'],
    ]);
    expect(notes.every((row) => row.teacherOnly)).toBe(true);
    // Chained to the key so the notes never strand on the next page.
    expect(notes.slice(0, -1).every((row) => row.keepNext)).toBe(true);
    expect(notes[notes.length - 1].keepNext).toBeUndefined();
    expect(notes[0].cells[0].edit).toEqual({
      kind: 'mcqRationale',
      questionId: question.id,
      optionId: question.options[1].id,
    });
    expect(notes[2].cells[0].edit).toEqual({ kind: 'mcqProvenance', questionId: question.id });

    const zh = rows(renderWorksheet(worksheet, { language: 'zh', version: 'teacher' }).questions[0].nodes);
    expect(zh[2].cells[0].marker).toBe('出處：');
  });

  it('carries each rationale with its option through a shuffled version', () => {
    const question = mcq(['w', 'x', 'y', 'z'], 1);
    question.options.forEach((option, index) => {
      option.rationale = bi(`why ${'wxyz'[index]}`, `why ${'wxyz'[index]}`);
    });
    const worksheet: Worksheet = { ...createWorksheet(), questions: [question], versions: { count: 2, seed: 99 } };
    const mode: OutputMode = { language: 'en', version: 'teacher', variant: 'B' };
    const nodes = renderWorksheet(worksheet, mode).questions[0].nodes;
    const printed = nodes
      .filter((node): node is TextNode => node.kind === 'text' && node.style === 'MCQ Option')
      .map((node) => plain(node.text.en));
    expect(printed).not.toEqual(['w', 'x', 'y', 'z']);

    const notes = rows(nodes).map((row) => [row.cells[0].marker, plain(row.cells[0].text.en)]);
    expect(notes).toEqual(printed.map((text, index) => [`${String.fromCharCode(65 + index)}.`, `why ${text}`]));
  });
});

describe('the answer key', () => {
  const texts = (nodes: RenderNode[]) =>
    nodes
      .filter((node): node is ColumnsNode => node.kind === 'columns')
      .map((row) => row.cells.map((cell) => `${cell.marker ?? ''}${plain(cell.text.en)}`));

  it('lists rationale and source beneath each question, the number on the first line', () => {
    const first = mcq(['w', 'x', 'y', 'z'], 0);
    first.explanation = bi('Because.', '因為。');
    first.options[0].rationale = bi('w is right', 'w 正確');
    const second = mcq(['w', 'x', 'y', 'z'], 2);
    second.options[3].rationale = bi('z is wrong', 'z 錯誤');
    second.provenance = bi('DSE 2019 Q7', '2019 DSE 第 7 題');
    const worksheet: Worksheet = { ...createWorksheet(), questions: [first, second] };

    expect(texts(renderAnswerKey(worksheet, 'en'))).toEqual([
      ['1.', 'Because.'],
      ['', 'A.w is right'],
      ['2.', 'D.z is wrong'],
      ['', 'Source:DSE 2019 Q7'],
    ]);
  });

  it('letters rationale as Version A, and says so, when versions are on', () => {
    const question = mcq(['w', 'x', 'y', 'z'], 1);
    question.options[1].rationale = bi('x is right', 'x 正確');
    const worksheet: Worksheet = { ...createWorksheet(), questions: [question], versions: { count: 3, seed: 99 } };
    const nodes = renderAnswerKey(worksheet, 'en');
    expect(texts(nodes)).toContainEqual(['1.', 'B.x is right']);
    const headings = nodes
      .filter((node): node is TextNode => node.kind === 'text')
      .map((node) => plain(node.text.en));
    expect(headings).toContain('Explanations (option letters as in Version A)');

    // Explanation-only keys keep their old heading.
    const plainKey = renderAnswerKey(
      { ...worksheet, questions: [{ ...question, options: mcq(['w', 'x', 'y', 'z']).options, explanation: bi('E', 'E') }] },
      'en',
    );
    const plainHeadings = plainKey
      .filter((node): node is TextNode => node.kind === 'text')
      .map((node) => plain(node.text.en));
    expect(plainHeadings).toContain('Explanations');
  });

  it('exports a well-formed .docx carrying the notes, with no edit targets', async () => {
    const worksheet = annotated(buildAcceptanceWorksheet());
    for (const language of LANGUAGES) {
      const { documentXml } = buildAnswerKeyDocxParts(worksheet, language);
      if (language !== 'zh') expect(documentXml).toContain('Why 0');
      if (language !== 'en') expect(documentXml).toContain('原因 0');
      expect(documentXml).not.toMatch(/mcqRationale|mcqProvenance|data-edit/);
    }
    const { XMLValidator } = await import('fast-xml-parser');
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'bilingual'));
    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;
      const xml = await zip.file(path)!.async('string');
      expect(XMLValidator.validate(xml), path).toBe(true);
    }
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Modelled on DSE 2023 Q1');
  });
});

describe('editing the notes', () => {
  const question = mcq(['w', 'x', 'y', 'z']);
  const worksheet: Worksheet = { ...createWorksheet(), questions: [question] };
  const rationale = { kind: 'mcqRationale', questionId: question.id, optionId: question.options[2].id } as const;
  const provenance = { kind: 'mcqProvenance', questionId: question.id } as const;

  it('writes, reads back and clears a rationale by option id', () => {
    const text = bi('y is wrong', 'y 錯誤');
    const written = applyEditTarget(worksheet, rationale, text);
    expect(textOfTarget(written, rationale)).toEqual(text);
    expect((written.questions[0] as McqQuestion).options[2].rationale).toEqual(text);
    expect(editTargetKey(rationale)).toBe(`mcqRationale:${question.options[2].id}`);

    // A cleared note stores nothing (§ A field cleared to nothing stores nothing).
    const cleared = applyEditTarget(written, rationale, { en: [{ text: '' }], zh: [] });
    expect('rationale' in (cleared.questions[0] as McqQuestion).options[2]).toBe(false);
    const deleted = applyDeleteTarget(written, rationale);
    expect('rationale' in (deleted.questions[0] as McqQuestion).options[2]).toBe(false);
  });

  it('writes, reads back and clears the source note', () => {
    const text = bi('DSE 2023 Q1', '2023 DSE 第 1 題');
    const written = applyEditTarget(worksheet, provenance, text);
    expect(textOfTarget(written, provenance)).toEqual(text);
    expect('provenance' in applyDeleteTarget(written, provenance).questions[0]).toBe(false);
  });

  it('counts a half-translated note as missing a translation', () => {
    const noted = { ...question, provenance: bi('DSE 2023 Q1', ''), options: question.options.map((option) => ({ ...option })) };
    noted.options[0].rationale = bi('', '只有中文');
    expect(mcqType.countMissingTranslations!(noted)).toBe(mcqType.countMissingTranslations!(question) + 2);
  });
});
