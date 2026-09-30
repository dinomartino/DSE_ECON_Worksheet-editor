import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * An empty question reads as its shape: the stem keeps the full blue prompt, every field
 * under it (options, parts, statements, captions, answers) a short grey one. Asserted
 * against the source, like `emptyCellField.test.ts`, because the rule is a style list.
 */
const PREVIEW = readFileSync(new URL('./Preview.tsx', import.meta.url), 'utf8');
const INLINE_EDITABLE = readFileSync(new URL('./InlineEditable.tsx', import.meta.url), 'utf8');

const QUIET = PREVIEW.match(/QUIET_PROMPT_STYLES[^=]*= new Set<NodeStyle>\(\[([^\]]*)\]/)?.[1];

describe('quiet empty-field prompts', () => {
  it('keeps the full prompt on the stem and quiets what hangs under it', () => {
    expect(QUIET).toBeDefined();
    for (const style of ['MCQ Option', 'Statement', 'Sub-question', 'Sub-sub-question']) {
      expect(QUIET).toContain(`"${style}"`);
    }
    for (const style of ['Question Stem', 'Section Heading', 'Worksheet Title', 'Body']) {
      expect(QUIET).not.toContain(`"${style}"`);
    }
  });

  it('never quiets a table cell, which keeps its own compact prompt', () => {
    expect(PREVIEW).toContain('quietPlaceholder={quietPrompt && !compactPlaceholder}');
  });

  it('is still marked as an author prompt, so it never prints', () => {
    // One span, one marker: the quiet branch only changes the class list.
    expect(INLINE_EDITABLE.match(/data-empty-placeholder=/g)).toHaveLength(1);
    expect(INLINE_EDITABLE).toMatch(/quietPlaceholder\s*\n?\s*\? 'text-\[#[0-9a-f]{6}\]/);
  });
});
