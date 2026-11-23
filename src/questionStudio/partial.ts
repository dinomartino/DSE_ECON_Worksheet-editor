import type { BiDraft } from '@/generate/types';

/**
 * Reading a structured reply while it is still arriving (k-0514): the write request's JSON
 * (`prompt.ts:STUDIO_QUESTIONS_SCHEMA`) cut off anywhere is closed off by hand and parsed, so
 * the question's words can be shown as they come. Pure; a reply that is not that shape gives [].
 */

/** `text` cut at any point, closed into valid JSON (open string, dangling key or colon, open brackets); undefined when it still does not parse. */
export function parsePartialJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  const source = text.slice(start);
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaped = false;
  for (const ch of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = source;
  if (inString) {
    if (escaped) out = out.slice(0, -1);
    out = out.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
    out += '"';
  }
  out = out.replace(/[\s,]+$/, '');
  // A key with no value yet (`{"a":1,"b"`) is dropped; a colon with no value gets null.
  if (stack[stack.length - 1] === '{') out = out.replace(/([{,])\s*"(?:[^"\\]|\\.)*"$/, (_, lead: string) => (lead === '{' ? '{' : ''));
  if (out.endsWith(':')) out += 'null';
  out = out.replace(/[\s,]+$/, '');
  for (let i = stack.length - 1; i >= 0; i -= 1) out += stack[i] === '{' ? '}' : ']';
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

/** A question as far as it has arrived. Strings may end mid-word until `complete`. */
export interface PartialDraft {
  /** Position in the reply (0-based). */
  index: number;
  stem: BiDraft;
  statements: BiDraft[];
  options: BiDraft[];
  /** The key (0–3) once the model has written it. */
  answer?: number;
  explanation: BiDraft;
  angle: string;
  /** No more of it is coming: the next question has started, or the reply ended. */
  complete: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bi = (value: unknown): BiDraft => {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { en: str(v.en), zh: str(v.zh) };
};
const list = (value: unknown): BiDraft[] => (Array.isArray(value) ? value.map(bi) : []);

/** The questions in a (partial) write reply; `finished` when the reply has ended. */
export function partialDrafts(text: string, finished = false): PartialDraft[] {
  const parsed = parsePartialJson(text);
  const questions = typeof parsed === 'object' && parsed !== null ? (parsed as { questions?: unknown }).questions : undefined;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((q, index): PartialDraft[] => {
    if (typeof q !== 'object' || q === null) return [];
    const r = q as Record<string, unknown>;
    return [
      {
        index,
        stem: bi(r.stem),
        statements: list(r.statements),
        options: list(r.options),
        ...(typeof r.answer === 'number' && Number.isInteger(r.answer) ? { answer: r.answer } : {}),
        explanation: bi(r.explanation),
        angle: str(r.angle),
        complete: finished || index < questions.length - 1,
      },
    ];
  });
}
