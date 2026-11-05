import { SYLLABUS } from '@/syllabus';

/**
 * The coverage check's words. `prompt.ts` sends them unchanged; bump `PROMPT_VERSION`
 * there with any edit. The mock provider recognises the request by `COVERAGE_MARKER`.
 */

export const COVERAGE_MARKER = 'HKDSE Economics syllabus tagger';

/** One line per key point and point: "C.ped  Price elasticity of demand" / "C.ped#arc  … · Arc elasticity". */
export function syllabusList(): string {
  const lines: string[] = [];
  for (const topic of SYLLABUS.topics) {
    const part = topic.part === 'elective' ? ` (Elective Part ${topic.code.slice(2)}, optional)` : '';
    lines.push(`# ${topic.code} ${topic.en}${part}`);
    for (const kp of topic.keyPoints) {
      lines.push(`${kp.code}  ${kp.en}`);
      for (const p of kp.points) if (p.en !== kp.en) lines.push(`${p.code}  ${kp.en} · ${p.en}`);
      else lines.push(`${p.code}  ${kp.en} (the whole key point)`);
    }
  }
  return lines.join('\n');
}

/** "C.ped: point, cross and income elasticity; …", one line per key point with limits. */
export function excludedList(): string {
  return SYLLABUS.topics
    .flatMap((topic) => topic.keyPoints)
    .filter((kp) => kp.notRequired.length > 0)
    .map((kp) => `${kp.code}: ${kp.notRequired.join('; ')}`)
    .join('\n');
}

export function systemCoverage(whyLanguage: 'en' | 'zh'): string {
  const language = whyLanguage === 'zh' ? 'Traditional Chinese as used in Hong Kong' : 'plain English';
  return `You are an ${COVERAGE_MARKER}. You read questions from a Hong Kong secondary (HKDSE) Economics paper and say which syllabus points each one TESTS: what a student must know or do to earn the marks, not words that merely appear in the text.

INPUT is a JSON object. "questions" lists questions of one paper in print order. Each has a "key", a "format", its "entries" in print order (role: stem; leadIn = data printed before a part; statement; option; part) with their printed words in "text", the "keyed": true option of a multiple-choice question, and "units": the places that earn marks, each with a "key", a "label" and its "marks". <b>…</b> is bold, <u>…</u> underlined. [Diagram …] and [Picture …] describe figures; "| a | b |" is a table row.

LIST holds the syllabus codes. A line "C.ped#arc" is a point inside the key point "C.ped". Use only codes from LIST. Prefer a point code; use a key-point code only when no single point inside it fits.

OUTPUT only a JSON object {"items":[…]} with one item per unit and syllabus code:
- "key": the unit's key, exactly as given.
- "code": a code from LIST.
- "weight": "main" for the one code the unit mostly tests (exactly one per unit), "also" for at most two more that the marks also need.
- "band": "know" (recall, state, define, identify), "apply" (calculate, explain, analyse, compare, draw or use a diagram) or "evaluate" (discuss, assess, judge, recommend, "do you agree").
- "conf": "high" when the unit cannot be answered without this code; "medium" when it fits but another could; "low" for a guess.
- "why": one short sentence in ${language} saying what the unit asks for.
- "outside": when earning the marks needs something EXCLUDED lists as not required, name it in a few words; otherwise "".
Give every unit at least one item. Do not tag a unit that has no words.

LIST
${syllabusList()}

EXCLUDED (the guide says these are NOT required)
${excludedList()}`;
}
