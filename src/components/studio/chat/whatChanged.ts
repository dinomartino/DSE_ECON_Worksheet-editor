import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { toRuns } from '@/generate/validate';
import type { ChangeAspect, SourceQuestion, StudioDraft } from '@/questionStudio/types';

/**
 * "What changed from the reference" (the side-by-side view, k-0516): a few plain facts the
 * computer can tell from the two questions, and the AI's own words on what the draft varies.
 * Codes only; the words are the catalogue's. The engine's own list (`StudioDraft.changes`, the
 * model's note per aspect, k-0520) goes first; these fill in the aspects it leaves out.
 */
export type Change =
  | { kind: 'note'; aspect: ChangeAspect; text: string }
  | { kind: 'varies'; text: string }
  | { kind: 'format'; from: 'plain' | 'combination'; to: 'plain' | 'combination' }
  | { kind: 'numbers'; same: boolean; from: string[]; to: string[] }
  | { kind: 'key'; from: string; to: string };

const LETTERS = 'ABCD';
const NUMBER = /\d+(?:[.,]\d+)?%?/g;

const words = (text: string): string => plain(toRuns(text)).trim();

function numbersOf(parts: readonly string[]): string[] {
  const out: string[] = [];
  for (const part of parts) for (const n of part.match(NUMBER) ?? []) if (!out.includes(n)) out.push(n);
  return out;
}

export function whatChanged(reference: SourceQuestion, draft: StudioDraft, sides: readonly Side[]): Change[] {
  const side: Side = sides[0] ?? 'en';
  const out: Change[] = [];
  const told = new Set<ChangeAspect>();
  for (const change of draft.changes ?? []) {
    const text = (change.note[side] || change.note.en || change.note.zh).trim();
    if (!text || told.has(change.aspect)) continue;
    told.add(change.aspect);
    out.push({ kind: 'note', aspect: change.aspect, text });
  }
  const computed: Change[] = [];
  if (draft.angle.trim()) computed.push({ kind: 'varies', text: draft.angle.trim() });

  const refShape = reference.statements.length >= 2 ? 'combination' : 'plain';
  const draftShape = draft.draft.statements.length >= 2 ? 'combination' : 'plain';
  computed.push({ kind: 'format', from: refShape, to: draftShape });

  const refText = [reference.stem, ...reference.statements, ...reference.options].map((t) => words(t[side] || t.en));
  const draftText = [draft.draft.stem, ...draft.draft.statements, ...draft.draft.options].map((t) => words(t[side] || t.en));
  const from = numbersOf(refText);
  const to = numbersOf(draftText);
  if (from.length || to.length) computed.push({ kind: 'numbers', same: from.length === to.length && from.every((n) => to.includes(n)), from: from.slice(0, 6), to: to.slice(0, 6) });

  if (reference.answerIndex >= 0) computed.push({ kind: 'key', from: LETTERS[reference.answerIndex] ?? '?', to: LETTERS[draft.draft.answerIndex] ?? '?' });
  return [...out, ...computed.filter((c) => c.kind === 'note' || !told.has(c.kind))];
}
