/**
 * A before/after diff for the review card (k-0549): English by words, 中文 by characters,
 * longest common subsequence. Display only.
 */

export interface DiffPart {
  text: string;
  op: 'same' | 'del' | 'ins';
}

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;

/** Words with their trailing space, or single characters for Chinese. */
export function tokens(text: string): string[] {
  return CJK.test(text) ? (text.match(/[A-Za-z0-9$%.,]+|\s+|[^]/g) ?? []) : (text.match(/\S+\s*|\s+/g) ?? []);
}

export function diffText(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  // Too long for a quadratic table: one deletion and one insertion.
  if (a.length * b.length > 250_000) return [{ text: before, op: 'del' }, { text: after, op: 'ins' }].filter((p) => p.text) as DiffPart[];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffPart[] = [];
  const push = (text: string, op: DiffPart['op']) => {
    const last = out.at(-1);
    if (last?.op === op) last.text += text;
    else out.push({ text, op });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i], 'same');
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(a[i++], 'del');
    else push(b[j++], 'ins');
  }
  while (i < a.length) push(a[i++], 'del');
  while (j < b.length) push(b[j++], 'ins');
  return out;
}
