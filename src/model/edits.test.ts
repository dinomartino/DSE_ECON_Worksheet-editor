import { describe, expect, it } from 'vitest';
import {
  MIN_BLOCK_WIDTH_PX,
  applyDeleteTarget,
  applyEditTarget,
  applyFormatTarget,
  applyResizeBlock,
  applyRunFormatTarget,
  blockSize,
  describeDelete,
  formatOfTarget,
  isFormattable,
  targetQuestionId,
  textOfTarget,
} from './edits';
import { createDiagramBlock } from './factories';
import { bi, isBiTextEmpty, plain } from './text';
import type {
  ContentBlock,
  McqQuestion,
  StructuredQuestion,
  TableBlock,
  Worksheet,
} from './types';
import { renderWorksheet } from '@/render/worksheet';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import type { EditTarget, TextNode } from '@/render/ir';

/**
 * In-place editing: clicking text on the previewed page writes back to the model.
 *
 * The contract these tests pin down is that an `EditTarget` emitted by the IR
 * resolves to exactly the field the text was rendered from, and that writing it
 * cannot damage anything else — in particular the other language.
 */

const EDIT = bi('EDITED', '已編輯');

describe('edit targets resolve to the field they were rendered from', () => {
  it('writes the worksheet title and instructions', () => {
    const worksheet = buildAcceptanceWorksheet();
    const titled = applyEditTarget(worksheet, { kind: 'worksheetTitle' }, EDIT);
    expect(plain(titled.title.en)).toBe('EDITED');

    const instructed = applyEditTarget(titled, { kind: 'worksheetInstructions' }, EDIT);
    expect(plain(instructed.instructions!.zh)).toBe('已編輯');
  });

  it('writes a section heading by id, leaving other sections alone', () => {
    // A section heading is a layout element now, so it is reached by the same
    // `layoutText` target as a free heading — there is no `sectionHeading` kind.
    const worksheet = buildAcceptanceWorksheet();
    const [first, second] = worksheet.layout.filter((element) => element.kind === 'section');
    const next = applyEditTarget(worksheet, { kind: 'layoutText', elementId: second.id }, EDIT);

    const headingText = (doc: Worksheet, id: string) => {
      const element = doc.layout.find((entry) => entry.id === id);
      return element && element.kind === 'section' ? plain(element.text.en) : undefined;
    };
    expect(headingText(next, second.id)).toBe('EDITED');
    expect(headingText(next, first.id)).toBe(headingText(worksheet, first.id));
  });

  it('writes a paragraph block at any depth — stem, part and sub-part', () => {
    const worksheet = buildAcceptanceWorksheet();
    const structured = worksheet.questions[5] as StructuredQuestion;

    const stemId = structured.blocks[0].id;
    const partId = structured.parts[0].blocks[0].id;
    const subId = structured.parts[1].subParts![0].blocks[0].id;

    let next = worksheet;
    for (const blockId of [stemId, partId, subId]) {
      next = applyEditTarget(next, { kind: 'blockText', blockId }, EDIT);
    }

    const paragraphText = (block: ContentBlock) =>
      block.kind === 'paragraph' ? plain(block.text.en) : undefined;

    const after = next.questions[5] as StructuredQuestion;
    expect(paragraphText(after.blocks[0])).toBe('EDITED');
    expect(paragraphText(after.parts[0].blocks[0])).toBe('EDITED');
    expect(paragraphText(after.parts[1].subParts![0].blocks[0])).toBe('EDITED');
  });

  it('writes a table cell and a caption by block id', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;
    const table = mcq.blocks.find((block) => block.kind === 'table') as TableBlock;
    const cellId = table.rows[0].cells[1].id;

    const withCell = applyEditTarget(
      worksheet,
      { kind: 'tableCell', blockId: table.id, cellId },
      EDIT,
    );
    const withCaption = applyEditTarget(
      withCell,
      { kind: 'blockCaption', blockId: table.id },
      EDIT,
    );

    const after = withCaption.questions[1] as McqQuestion;
    const afterTable = after.blocks.find((block) => block.kind === 'table') as TableBlock;
    expect(plain(afterTable.rows[0].cells[1].text.en)).toBe('EDITED');
    expect(plain(afterTable.caption!.en)).toBe('EDITED');
    // Neighbouring cells are untouched.
    expect(plain(afterTable.rows[0].cells[0].text.en)).toBe('Price ($)');
  });

  it('writes MCQ options, statements and the explanation', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;

    let next = applyEditTarget(
      worksheet,
      { kind: 'mcqOption', questionId: mcq.id, optionId: mcq.options[2].id },
      EDIT,
    );
    next = applyEditTarget(next, { kind: 'mcqStatement', questionId: mcq.id, index: 1 }, EDIT);
    next = applyEditTarget(next, { kind: 'mcqExplanation', questionId: mcq.id }, EDIT);

    const after = next.questions[1] as McqQuestion;
    expect(plain(after.options[2].text.en)).toBe('EDITED');
    expect(plain(after.statements![1].en)).toBe('EDITED');
    expect(plain(after.explanation!.en)).toBe('EDITED');
    // The answer index — and the untouched options — survive.
    expect(after.answerIndex).toBe(mcq.answerIndex);
    expect(plain(after.options[0].text.en)).toBe('Price rises');
  });

  it('writes part and sub-part answers', () => {
    const worksheet = buildAcceptanceWorksheet();
    const structured = worksheet.questions[5] as StructuredQuestion;
    const part = structured.parts[1];

    let next = applyEditTarget(
      worksheet,
      { kind: 'partAnswer', questionId: structured.id, partId: structured.parts[0].id },
      EDIT,
    );
    next = applyEditTarget(
      next,
      {
        kind: 'subPartAnswer',
        questionId: structured.id,
        partId: part.id,
        subPartId: part.subParts![2].id,
      },
      EDIT,
    );

    const after = next.questions[5] as StructuredQuestion;
    expect(plain(after.parts[0].answer!.en)).toBe('EDITED');
    expect(plain(after.parts[1].subParts![2].answer!.en)).toBe('EDITED');
    expect(plain(after.parts[1].subParts![0].answer!.en)).toBe('Income.');
  });

  it('drops a stale edit rather than corrupting the document', () => {
    const worksheet = buildAcceptanceWorksheet();
    const next = applyEditTarget(worksheet, { kind: 'blockText', blockId: 'gone' }, EDIT);
    expect(JSON.stringify(next)).toBe(JSON.stringify(worksheet));
  });
});

describe('deleting the selected element (Delete/Backspace on the page)', () => {
  it('removes a paragraph block, leaving its siblings behind', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;
    const before = mcq.blocks.length;
    const paragraph = mcq.blocks[0];

    const next = applyDeleteTarget(worksheet, { kind: 'blockText', blockId: paragraph.id });
    const after = next.questions[1] as McqQuestion;

    expect(after.blocks).toHaveLength(before - 1);
    expect(after.blocks.some((block) => block.id === paragraph.id)).toBe(false);
    // The table and image that shared the stem survive.
    expect(after.blocks.some((block) => block.kind === 'table')).toBe(true);
    expect(after.blocks.some((block) => block.kind === 'image')).toBe(true);
  });

  it('drops a statement so the rest renumber', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;
    expect(mcq.statements).toHaveLength(3);

    const next = applyDeleteTarget(worksheet, {
      kind: 'mcqStatement',
      questionId: mcq.id,
      index: 0,
    });
    const after = next.questions[1] as McqQuestion;

    expect(after.statements).toHaveLength(2);
    // What was (2) becomes (1) — numbering is derived, so nothing else to update.
    expect(plain(after.statements![0].en)).toBe('Nominal GDP rises');
  });

  it('clears a table cell rather than breaking the grid', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;
    const table = mcq.blocks.find((block) => block.kind === 'table') as TableBlock;
    const widthBefore = table.rows[0].cells.length;

    const next = applyDeleteTarget(worksheet, {
      kind: 'tableCell',
      blockId: table.id,
      cellId: table.rows[0].cells[1].id,
    });
    const after = next.questions[1] as McqQuestion;
    const afterTable = after.blocks.find((block) => block.kind === 'table') as TableBlock;

    expect(afterTable.rows[0].cells).toHaveLength(widthBefore);
    expect(plain(afterTable.rows[0].cells[1].text.en)).toBe('');
    expect(plain(afterTable.rows[0].cells[0].text.en)).toBe('Price ($)');
  });

  it('removes answers, explanations and captions', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[1] as McqQuestion;
    const structured = worksheet.questions[5] as StructuredQuestion;
    const table = mcq.blocks.find((block) => block.kind === 'table') as TableBlock;

    let next = applyDeleteTarget(worksheet, { kind: 'mcqExplanation', questionId: mcq.id });
    next = applyDeleteTarget(next, {
      kind: 'partAnswer',
      questionId: structured.id,
      partId: structured.parts[0].id,
    });
    next = applyDeleteTarget(next, { kind: 'blockCaption', blockId: table.id });

    const afterMcq = next.questions[1] as McqQuestion;
    const afterStructured = next.questions[5] as StructuredQuestion;
    const afterTable = afterMcq.blocks.find((block) => block.kind === 'table') as TableBlock;

    expect(afterMcq.explanation).toBeUndefined();
    expect(afterStructured.parts[0].answer).toBeUndefined();
    expect(afterTable.caption).toBeUndefined();
  });

  it('refuses to delete an MCQ option, which must always number four (§7.2)', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[0] as McqQuestion;

    const target: EditTarget = {
      kind: 'mcqOption',
      questionId: mcq.id,
      optionId: mcq.options[0].id,
    };
    expect(describeDelete(target)).toBeUndefined();

    const next = applyDeleteTarget(worksheet, target);
    expect((next.questions[0] as McqQuestion).options).toHaveLength(4);
  });

  /*
   * The title and instructions are emptied, never removed: `title` still names the
   * document in the outline, the saved-file list and the download filename, so the field
   * has to outlive the block printed on page 1.
   */
  it('clears the title and instructions rather than removing the field', () => {
    const worksheet = buildAcceptanceWorksheet();

    for (const target of [
      { kind: 'worksheetTitle' },
      { kind: 'worksheetInstructions' },
    ] as EditTarget[]) {
      expect(describeDelete(target)?.kind).toBe('clear');

      const next = applyDeleteTarget(worksheet, target);
      const field = target.kind === 'worksheetTitle' ? next.title : next.instructions;
      expect(field).toBeDefined();
      expect(isBiTextEmpty(field)).toBe(true);
    }
  });
});

describe('in-place editing preserves the other language (§5.2)', () => {
  it('keeps zh when only en is written, and the reverse', () => {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[0] as McqQuestion;
    const optionId = mcq.options[0].id;
    const original = mcq.options[0].text;

    // This mirrors what the preview does: patch one side of the existing BiText.
    const enOnly = applyEditTarget(
      worksheet,
      { kind: 'mcqOption', questionId: mcq.id, optionId },
      { ...original, en: bi('Price soars', '').en },
    );
    const after = enOnly.questions[0] as McqQuestion;
    expect(plain(after.options[0].text.en)).toBe('Price soars');
    expect(plain(after.options[0].text.zh)).toBe('價格上升');
  });
});

/**
 * Formatting a range through an `EditTarget` — the store-facing half of per-run
 * formatting. The range maths itself is covered in `model.test.ts`; these pin that it
 * reaches the right field and writes back through the same target vocabulary.
 */
describe('formatting a character range inside a target', () => {
  it('formats only the selected characters of the named field', () => {
    const worksheet = buildAcceptanceWorksheet();
    const start = plain(worksheet.title.en).indexOf('Economics');
    expect(start).toBeGreaterThanOrEqual(0);

    const next = applyRunFormatTarget(
      worksheet,
      { kind: 'worksheetTitle' },
      'en',
      start,
      start + 'Economics'.length,
      { fontSize: 20, color: 'C00000' },
    );

    // The text is untouched; only the runs are split.
    expect(plain(next.title.en)).toBe(plain(worksheet.title.en));
    const sized = next.title.en.find((run) => run.fontSize === 20);
    expect(sized?.text).toBe('Economics');
    expect(sized?.color).toBe('C00000');
    // The Chinese side is left entirely alone.
    expect(next.title.zh).toEqual(worksheet.title.zh);
  });

  it('leaves the document unchanged when the target no longer resolves', () => {
    const worksheet = buildAcceptanceWorksheet();
    const next = applyRunFormatTarget(
      worksheet,
      { kind: 'blockText', blockId: 'gone' },
      'en',
      0,
      3,
      { bold: true },
    );
    expect(next).toBe(worksheet);
  });

  it('reads back the text of a target it can format', () => {
    const worksheet = buildAcceptanceWorksheet();
    expect(plain(textOfTarget(worksheet, { kind: 'worksheetTitle' })?.en)).toBe(
      plain(worksheet.title.en),
    );
    expect(textOfTarget(worksheet, { kind: 'blockText', blockId: 'gone' })).toBeUndefined();
  });
});

/*
 * A table cell formats like every other text element.
 *
 * It was the one editable surface on the page the toolbar refused: typing worked, but
 * bold, size and colour did not. That gap matters most in a table, because an HKDSE table
 * has no header row — per-cell formatting is the only mechanism a distribution table's
 * headings have (§tables).
 */
describe('formatting a table cell', () => {
  /** The first table in the acceptance fixture, with its address. */
  const firstCell = (worksheet: Worksheet) => {
    for (const question of worksheet.questions) {
      for (const block of question.blocks) {
        if (block.kind === 'table') {
          return { blockId: block.id, cellId: block.rows[0].cells[0].id };
        }
      }
    }
    throw new Error('fixture has no table');
  };

  const cellOf = (worksheet: Worksheet, address: { blockId: string; cellId: string }) => {
    for (const question of worksheet.questions) {
      for (const block of question.blocks) {
        if (block.kind === 'table' && block.id === address.blockId) {
          for (const row of block.rows) {
            const cell = row.cells.find((entry) => entry.id === address.cellId);
            if (cell) return cell;
          }
        }
      }
    }
    return undefined;
  };

  it('is formattable at all', () => {
    const worksheet = buildAcceptanceWorksheet();
    expect(isFormattable({ kind: 'tableCell', ...firstCell(worksheet) })).toBe(true);
  });

  it('writes an element-level override onto the cell', () => {
    const worksheet = buildAcceptanceWorksheet();
    const address = firstCell(worksheet);
    const target = { kind: 'tableCell' as const, ...address };

    const next = applyFormatTarget(worksheet, target, { bold: true, fontSize: 14 });
    expect(cellOf(next, address)?.format).toEqual({ bold: true, fontSize: 14 });
    // And the toolbar reads back what it just wrote, or its buttons would invert.
    expect(formatOfTarget(next, target)).toEqual({ bold: true, fontSize: 14 });
  });

  it('clears an override back to the style, leaving no husk', () => {
    const worksheet = buildAcceptanceWorksheet();
    const address = firstCell(worksheet);
    const target = { kind: 'tableCell' as const, ...address };

    let next = applyFormatTarget(worksheet, target, { bold: true });
    next = applyFormatTarget(next, target, { bold: undefined });
    expect(cellOf(next, address)?.format).toBeUndefined();
  });

  it('formats a character range inside a cell', () => {
    // Per-run formatting comes free from `textOfTarget` + `applyEditTarget` being the
    // read and write `applyRunFormatTarget` composes. `textOfTarget` did not know the
    // kind, so bolding a phrase inside a cell resolved to no text and did nothing.
    const worksheet = buildAcceptanceWorksheet();
    const address = firstCell(worksheet);
    const target = { kind: 'tableCell' as const, ...address };

    const before = textOfTarget(worksheet, target);
    expect(before).toBeDefined();
    const text = plain(before!.en);
    const start = text.indexOf('Price');
    expect(start).toBeGreaterThanOrEqual(0);

    const next = applyRunFormatTarget(worksheet, target, 'en', start, start + 5, {
      bold: true,
    });
    const runs = cellOf(next, address)!.text.en;
    expect(plain(runs)).toBe(text);
    expect(runs.find((run) => run.bold)?.text).toBe('Price');
  });

  it('leaves the document alone for a cell id that no longer resolves', () => {
    const worksheet = buildAcceptanceWorksheet();
    const address = firstCell(worksheet);
    expect(
      formatOfTarget(worksheet, { kind: 'tableCell', blockId: address.blockId, cellId: 'gone' }),
    ).toBeUndefined();
    expect(
      textOfTarget(worksheet, { kind: 'tableCell', blockId: 'gone', cellId: address.cellId }),
    ).toBeUndefined();
  });
});

describe('every authored field on the page carries an edit target', () => {
  /** Collect the text nodes the preview would render. */
  const textNodes = (mode: Parameters<typeof renderWorksheet>[1]) => {
    const worksheet = buildAcceptanceWorksheet();
    const rendered = renderWorksheet(worksheet, mode);
    const nodes: TextNode[] = [];
    const push = (node: unknown) => {
      if (node && (node as TextNode).kind === 'text') nodes.push(node as TextNode);
    };
    push(rendered.title);
    push(rendered.instructions);
    for (const question of rendered.questions) question.nodes.forEach(push);
    for (const item of rendered.items) {
      if (item.type === 'layout') item.layout.nodes.forEach(push);
    }
    return { worksheet, nodes };
  };

  it('marks stems, options, statements and answers editable', () => {
    const { nodes } = textNodes({ language: 'bilingual', version: 'teacher' });
    const editable = nodes.filter((node) => node.edit);
    expect(editable.length).toBeGreaterThan(20);

    const kinds = new Set(editable.map((node) => node.edit!.kind));
    expect(kinds).toContain('worksheetTitle');
    // A section heading is reached through `layoutText` like every other element that
    // carries authored text; there is no `sectionHeading` kind any more.
    expect(kinds).toContain('layoutText');
    expect(kinds).toContain('blockText');
    expect(kinds).toContain('mcqOption');
    expect(kinds).toContain('mcqStatement');
    expect(kinds).toContain('partAnswer');
  });

  it('leaves derived text non-editable, since it has nowhere to be written', () => {
    const { nodes } = textNodes({ language: 'bilingual', version: 'teacher' });
    // Marks totals and the "Answer: C" line are computed (§3.5, §4).
    for (const node of nodes.filter((n) => n.style === 'Marks' || n.style === 'Answer')) {
      expect(node.edit, `${plain(node.text.en)} must not be editable`).toBeUndefined();
    }
  });

  it('resolves a rendered target back to the question that owns it', () => {
    const { worksheet, nodes } = textNodes({ language: 'bilingual', version: 'teacher' });
    const question = worksheet.questions[5];
    const stemBlockId = question.blocks[0].id;

    const node = nodes.find(
      (n) => n.edit?.kind === 'blockText' && n.edit.blockId === stemBlockId,
    );
    expect(node).toBeTruthy();
    expect(targetQuestionId(worksheet, node!.edit as EditTarget)).toBe(question.id);
  });
});

/**
 * Resizing a picture by dragging it on the page (§ResizableBlock).
 *
 * The contract: width is the only input, height follows the block's own aspect ratio,
 * and the model can never be driven to a size that would export as a damaged drawing.
 * These are the rules both resize surfaces — the sidebar number field and the page
 * handle — have to agree on, which is why they live here rather than in the component.
 */
describe('resizing an image or diagram block', () => {
  const imageBlockId = (worksheet: Worksheet) => {
    for (const question of worksheet.questions) {
      const image = question.blocks.find((block) => block.kind === 'image');
      if (image) return image.id;
    }
    throw new Error('fixture has no image block');
  };

  const findImage = (worksheet: Worksheet, blockId: string) => {
    for (const question of worksheet.questions) {
      const match = question.blocks.find((block) => block.id === blockId);
      if (match && match.kind === 'image') return match;
    }
    throw new Error('block not found');
  };

  it('keeps the aspect ratio locked, height following from width', () => {
    const worksheet = buildAcceptanceWorksheet();
    const blockId = imageBlockId(worksheet);
    // The fixture image is 200x150, so the ratio is 0.75.
    const next = applyResizeBlock(worksheet, blockId, 400);
    const image = findImage(next, blockId);

    expect(image.widthPx).toBe(400);
    expect(image.heightPx).toBe(300);
  });

  it('clamps to the minimum width, so a flick of the pointer cannot collapse it', () => {
    const worksheet = buildAcceptanceWorksheet();
    const blockId = imageBlockId(worksheet);

    for (const attempt of [0, -500, 1]) {
      const image = findImage(applyResizeBlock(worksheet, blockId, attempt), blockId);
      expect(image.widthPx).toBe(MIN_BLOCK_WIDTH_PX);
      // A zero height would export as a `w:drawing` Word reports as damaged.
      expect(image.heightPx).toBeGreaterThan(0);
    }
  });

  it('rounds to whole pixels, since a drag produces fractions', () => {
    const worksheet = buildAcceptanceWorksheet();
    const blockId = imageBlockId(worksheet);
    const image = findImage(applyResizeBlock(worksheet, blockId, 301.7), blockId);

    expect(Number.isInteger(image.widthPx)).toBe(true);
    expect(Number.isInteger(image.heightPx)).toBe(true);
  });

  it('takes the ratio from the intrinsic size, so repeated resizes do not drift', () => {
    const worksheet = buildAcceptanceWorksheet();
    const blockId = imageBlockId(worksheet);

    // Down to the floor and back out again. Deriving the ratio from the *current*
    // rounded size each time would compound the rounding error; the natural size does
    // not change, so the shape returns exactly.
    let next = worksheet;
    for (const width of [137, 41, 640, 200]) next = applyResizeBlock(next, blockId, width);

    const image = findImage(next, blockId);
    expect(image.widthPx).toBe(200);
    expect(image.heightPx).toBe(150);
  });

  it('leaves a block with no size alone rather than throwing', () => {
    const worksheet = buildAcceptanceWorksheet();
    const paragraph = worksheet.questions[0].blocks[0];

    expect(applyResizeBlock(worksheet, paragraph.id, 400)).toEqual(worksheet);
    // A drag against a block deleted mid-gesture is dropped, not an error.
    expect(applyResizeBlock(worksheet, 'gone', 400)).toEqual(worksheet);
  });

  it('reports the current size so a drag can start from it', () => {
    const worksheet = buildAcceptanceWorksheet();
    const blockId = imageBlockId(worksheet);

    expect(blockSize(worksheet, blockId)).toEqual({
      widthPx: 200,
      heightPx: 150,
      ratio: 0.75,
    });
    expect(blockSize(worksheet, 'gone')).toBeUndefined();
  });

  it('gives every image and diagram in the IR a blockId to address it by', () => {
    const worksheet = buildAcceptanceWorksheet();
    // The fixture carries an image but no diagram; both kinds have to be addressable,
    // so the diagram is added here rather than leaving the assertion vacuous for it.
    worksheet.questions[0].blocks.push(createDiagramBlock('ad-as'));

    const rendered = renderWorksheet(worksheet, { language: 'bilingual', version: 'teacher' });
    const pictures = rendered.questions
      .flatMap((question) => question.nodes)
      .filter((node) => node.kind === 'image' || node.kind === 'diagram');

    expect(pictures.map((picture) => picture.kind)).toEqual(
      expect.arrayContaining(['image', 'diagram']),
    );
    for (const picture of pictures) {
      // Without this the preview could only reach a picture through its caption.
      expect(blockSize(worksheet, picture.blockId)).toBeTruthy();
    }
  });

  it('resizes a diagram by width too, since geometry is stored in unit space', () => {
    const worksheet = buildAcceptanceWorksheet();
    const diagram = createDiagramBlock('ad-as');
    worksheet.questions[0].blocks.push(diagram);

    const next = applyResizeBlock(worksheet, diagram.id, 600);
    const resized = next.questions[0].blocks.find((b) => b.id === diagram.id);

    expect(resized?.kind).toBe('diagram');
    if (resized?.kind !== 'diagram') throw new Error('unreachable');
    expect(resized.widthPx).toBe(600);
    expect(resized.heightPx).toBe(Math.round(600 * (diagram.heightPx / diagram.widthPx)));
    // The geometry itself is untouched — only the box it renders into changed (§7.5).
    expect(resized.diagram).toEqual(diagram.diagram);
  });
});
