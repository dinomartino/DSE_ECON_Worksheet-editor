import { lookupCode } from '@/syllabus';
import type { Side } from '@/model/textSlots';
import type { Finding } from './types';

/**
 * The syllabus guard: terms the 2025 guide says are NOT required, found in a draft. The
 * guide states its limits as English sentences (`SyllabusKeyPoint.notRequired`: some name
 * a thing, some describe a method), so a scan can only use the ones that name a term.
 * This list is that subset, each tied to the key point whose limit it comes from;
 * `guard.test.ts` keeps every code in step with `src/syllabus`. A hit is a note to read,
 * never a block: a teacher may mean it. The same limits also go to the model in the brief.
 *
 * Chinese forms are the EDB glossary's (`src/glossary/data`) where it has the term, else
 * the usual Hong Kong form; a term with no confident Chinese form is scanned in English only.
 */

interface LimitedTerm {
  /** The key point whose NOT-required limit names this. */
  code: string;
  name: string;
  en: RegExp;
  zh?: RegExp;
  /** `topic`: out only inside that key point's topic (the guide limits it "in this topic"). */
  scope?: 'topic';
}

export const LIMITED_TERMS: readonly LimitedTerm[] = [
  { code: 'A.scarcity', name: 'present value', en: /\bpresent[- ]value\b/i, zh: /現值/ },
  { code: 'B.goods', name: 'impure public goods', en: /\bimpure\s+public\s+goods?\b/i },
  { code: 'B.objectives', name: 'shut-down point', en: /\bshut-?down\s+point\b/i },
  { code: 'B.objectives', name: 'break-even point', en: /\bbreak-?even\s+point\b/i },
  { code: 'C.law-of-demand', name: "Alchian's generalisation", en: /\balchian\b/i },
  { code: 'C.individual-demand', name: 'Giffen goods', en: /\bgiffen\b/i, zh: /季芬|吉芬|吉分/ },
  { code: 'C.surplus', name: 'indifference curves', en: /\bindifference\s+(?:curve|map)s?\b/i, zh: /無差異曲線/ },
  { code: 'C.surplus', name: 'marginal rate of substitution', en: /\bmarginal\s+rate\s+of\s+substitution\b|\bMRS\b/, zh: /邊際替代率/ },
  { code: 'C.surplus', name: 'marginal use value', en: /\bmarginal\s+use\s+value\b/i, zh: /邊際使用價值/ },
  { code: 'C.ped', name: 'point elasticity', en: /\bpoint\s+(?:price\s+)?elasticit/i, zh: /點彈性/ },
  { code: 'C.ped', name: 'cross elasticity', en: /\bcross(?:[- ]price)?\s+elasticit/i, zh: /交叉(?:價格)?彈性/ },
  { code: 'C.ped', name: 'income elasticity', en: /\bincome\s+elasticit/i, zh: /收入彈性/ },
  { code: 'C.ped', name: 'the second law of demand', en: /\bsecond\s+law\s+of\s+demand\b/i },
  { code: 'E.efficiency', name: 'Pareto efficiency', en: /\bpareto\b/i, zh: /巴列圖|帕累托/ },
  { code: 'E.efficiency', name: 'the Coase theorem', en: /\bcoase\b/i, zh: /高斯定理|科斯/ },
  { code: 'E.equity', name: 'the Lorenz curve', en: /\blorenz\b/i, zh: /洛倫茨/ },
  { code: 'E.equity', name: 'the Gini coefficient', en: /\bgini\b/i, zh: /堅尼|基尼/ },
  { code: 'E.equity', name: 'marginal revenue product', en: /\bmarginal\s+revenue\s+product\b|\bMRP\b/, zh: /邊際生產收入/, scope: 'topic' },
  { code: 'F.national-income', name: 'the Human Development Index', en: /\bhuman\s+development\s+index\b|\bHDI\b/i, zh: /人類發展指數/, scope: 'topic' },
  { code: 'F.national-income', name: 'net domestic product', en: /\bnet\s+domestic\s+product\b|\bNDP\b/, scope: 'topic' },
  { code: 'F.national-income', name: 'net national income', en: /\bnet\s+national\s+income\b|\bNNI\b/, scope: 'topic' },
  { code: 'G.as', name: 'the Phillips curve', en: /\bphillips\b/i, zh: /菲利普斯|菲力普斯|菲利浦/ },
  { code: 'G.equilibrium', name: 'the Quantity Theory of Money', en: /\bquantity\s+theory\s+of\s+money\b/i, zh: /貨幣數量論/, scope: 'topic' },
  { code: 'H.interest', name: 'loanable funds', en: /\bloanable\s+funds?\b/i, zh: /可貸資金/ },
  { code: 'I.unemployment', name: 'search theory', en: /\bsearch\s+(?:theory|unemployment)\b/i, zh: /搜尋理論|搜尋性失業/, scope: 'topic' },
  { code: 'EL2.growth', name: 'the aggregate production function', en: /\baggregate\s+production\s+function\b/i, zh: /總生產函數/ },
];

const topicOf = (code: string) => lookupCode(code)?.topic.code;

/**
 * Limited terms in the draft's text (`texts` per side, plain). `keyPoint` is the one the
 * draft was asked to test: a `topic`-scoped term counts only inside its own topic.
 */
export function scanLimited(texts: Readonly<Record<Side, string>>, sides: readonly Side[], keyPoint: string): Finding[] {
  const out: Finding[] = [];
  const here = topicOf(keyPoint);
  for (const term of LIMITED_TERMS) {
    if (term.scope === 'topic' && topicOf(term.code) !== here) continue;
    const hit = sides.some((side) => {
      const pattern = side === 'en' ? term.en : term.zh;
      return pattern?.test(texts[side]) ?? false;
    });
    if (hit) out.push({ id: 'syllabus.limited', params: { term: term.name, code: term.code } });
  }
  return out;
}
