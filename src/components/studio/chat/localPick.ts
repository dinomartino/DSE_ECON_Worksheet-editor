import { SYLLABUS } from '@/syllabus';
import type { KeyPick, PickInput } from './engine';

/**
 * The computer's own key-point pick, used until the engine's AI pick (k-0514) is on develop,
 * and in tests. A reference question names its key point in its bank tags; typed words are
 * matched against the syllabus's key point and point names (English and 中文) and a few
 * abbreviations teachers use. At most two picks, the reference's first. Never a topic letter.
 */

const ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\bPED\b/, 'C.ped'],
  [/\bPES\b/, 'C.pes'],
  [/\b(PPC|PPF|PPB)\b/, 'A.scarcity'],
  [/\bCPI\b|deflator/i, 'F.price-level'],
  [/\bGDP\b|\bGNP\b/, 'F.national-income'],
  [/\bSRAS\b|\bLRAS\b/, 'G.as'],
  [/unit tax|unit subsidy|從量稅|從量津貼/i, 'C.intervention'],
  [/price ceiling|price floor|maximum price|minimum price|minimum wage|quota|價格上限|價格下限|配額/i, 'C.intervention'],
  [/deadweight|無謂損失/i, 'E.efficiency'],
];

const STOP = new Set(['and', 'the', 'of', 'in', 'on', 'a', 'an', 'to', 'for', 'with', 'its', 'their', 'between', 'by', 'as', 'or', 'at', 'from', 'into', 'about', 'types', 'type', 'brief', 'introduction', 'recent', 'trends']);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

interface Scored {
  code: string;
  score: number;
  hit: string;
}

function scoreText(text: string): Scored[] {
  const lower = text.toLowerCase();
  const asked = new Set(words(text));
  const out: Scored[] = [];
  for (const topic of SYLLABUS.topics) {
    for (const kp of topic.keyPoints) {
      let score = 0;
      let hit = '';
      const names = [kp, ...kp.points];
      for (const name of names) {
        // A whole name in the words (English or 中文) counts most.
        if (name.en && name.en.length > 3 && lower.includes(name.en.toLowerCase())) {
          score += 6;
          hit ||= name.en;
        }
        if (name.zh && name.zh.length >= 2 && text.includes(name.zh)) {
          score += 6;
          hit ||= name.zh;
        }
        const nameWords = words(name.en);
        const shared = nameWords.filter((w) => asked.has(w));
        if (shared.length) {
          score += shared.length / Math.max(2, nameWords.length);
          hit ||= shared.join(' ');
        }
      }
      for (const [pattern, code] of ALIASES) {
        const m = text.match(pattern);
        if (m && code === kp.code) {
          score += 8;
          hit = m[0];
        }
      }
      if (score > 0) out.push({ code: kp.code, score, hit });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function localPick(input: PickInput): KeyPick[] {
  const picks: KeyPick[] = [];
  const add = (code: string, basis: NonNullable<KeyPick['basis']>) => {
    if (!picks.some((p) => p.code === code) && picks.length < 2) picks.push({ code, reason: '', basis });
  };
  const text = input.text.trim();
  // A typed request wins over the reference (as the AI pick is told).
  if (text) {
    const best = scoreText(text)[0];
    if (best && best.score >= 1) add(best.code, { kind: 'words', hit: best.hit });
  }
  for (const example of input.examples) {
    const tagged = input.tagged?.[example.id];
    if (tagged) add(tagged, { kind: 'tag', label: example.label });
  }
  if (!picks.length && input.examples.length) {
    const fromWords = scoreText(input.examples.map((e) => `${e.stem.en} ${e.options.map((o) => o.en).join(' ')}`).join(' '))[0];
    if (fromWords) add(fromWords.code, { kind: 'example', hit: fromWords.hit });
  }
  return picks;
}
