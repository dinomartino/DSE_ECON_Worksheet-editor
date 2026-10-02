import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { answerKeyView } from '@/render/answerKey';
import type { RenderNode } from '@/render/ir';
import { AnswerKeyPreview, keepTogetherRuns } from './AnswerKeyPreview';

const text = (keepNext?: boolean): RenderNode => ({
  kind: 'text',
  style: 'Body',
  text: { en: [{ text: 'x' }], zh: [] },
  ...(keepNext ? { keepNext } : {}),
});

describe('the Marking scheme view', () => {
  it('cuts the key where Word may break it: after every node that does not keep with the next', () => {
    expect(keepTogetherRuns([text(true), text(), text(), text(true), text(true), text()])).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 5 },
    ]);
    // A trailing keepNext has nothing to keep with: it still closes the last run.
    expect(keepTogetherRuns([text(), text(true)])).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 1 },
    ]);
  });

  it('draws every node of the key, on sheets inside #print-root, with a page-number footer', () => {
    const worksheet = buildMarkSchemeWorksheet();
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={worksheet} language="en" onEdit={() => {}} />,
    );
    expect(markup).toContain('id="print-root"');
    expect(markup).toContain('data-page-index="0"');
    expect(markup).toContain('class="paper paper-shadow');
    expect(markup).toContain('data-band-box="footer"');
    expect(markup).toContain('Taxation — structured question — Answer key');
    expect(markup).toContain('Supply decreases');
    expect(markup).toContain('Level 1: ');
    // Editable in place: the scheme's own text is a textbox; the paper's chrome is absent.
    expect(markup).toContain('role="textbox"');
    expect(markup).not.toContain('data-drag-grip');
    expect(markup).not.toContain('data-bank-ghost');
    // Each entry names its question, so a click selects it for the sidebar.
    expect(markup).toContain(`data-question-id="${worksheet.questions[0].id}"`);
  });

  it('read-only (print preview, a newer file) has no textbox', () => {
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={buildMarkSchemeWorksheet()} language="bilingual" />,
    );
    expect(markup).toContain('Supply decreases');
    expect(markup).not.toContain('role="textbox"');
  });

  it('opens the frozen v1 corpus', () => {
    const worksheet = migrate(structuredClone(v1Corpus)) as Worksheet;
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={worksheet} language="bilingual" onEdit={() => {}} />,
    );
    expect(markup).toContain('id="print-root"');
    const answered = answerKeyView(worksheet, 'bilingual').owners.filter(Boolean);
    expect(answered.length).toBeGreaterThan(0);
    for (const id of new Set(answered)) expect(markup).toContain(`data-question-id="${id}"`);
  });
});
