import type { Messages } from '@/i18n/catalogue';
import type { Finding } from '@/questionStudio/types';
import type { STUDIO_FINDING_MESSAGES } from './findings.messages';

/**
 * A finding as a sentence: the engine's code and values, in the words of one language
 * (`m` = `useMessages(STUDIO_FINDING_MESSAGES)`). Every code the engine can report has an
 * entry (`findings.test.ts`); an unknown one reads as its own code, never as nothing.
 */

export type FindingMessages = Messages<typeof STUDIO_FINDING_MESSAGES>;

const str = (value: string | number | undefined): string => (value === undefined ? '' : String(value));
const num = (value: string | number | undefined): number => (typeof value === 'number' ? value : Number(value) || 0);

/** What a reference has that a draft cannot follow (k-0544): "4 diagrams and a table for each option". */
export function referenceWhat(p: Readonly<Record<string, string | number>>, m: FindingMessages): string {
  const parts = [
    num(p.pictures) >= 2 ? m.refWhatPictures(num(p.pictures)) : '',
    num(p.optionPictures) ? m.refWhatOptionPictures : '',
    num(p.optionTables) ? m.refWhatOptionTables : '',
  ].filter(Boolean);
  return parts.join(m.refWhatAnd);
}

export function findingText(finding: Finding, m: FindingMessages): string {
  const p = finding.params ?? {};
  const side = () => (p.side === 'zh' ? m.sideZh : m.sideEn);
  switch (finding.id) {
    case 'shape.stemEmpty':
      return m.shapeStemEmpty(side());
    case 'shape.optionCount':
      return m.shapeOptionCount(num(p.count));
    case 'shape.optionEmpty':
      return m.shapeOptionEmpty(side());
    case 'shape.optionsSame':
      return m.shapeOptionsSame(side());
    case 'shape.keyRange':
      return m.shapeKeyRange;
    case 'shape.statementEmpty':
      return m.shapeStatementEmpty(side());
    case 'shape.statementCount':
      return m.shapeStatementCount(num(p.count));
    case 'shape.notCombination':
      return m.shapeNotCombination(side());
    case 'shape.narrates':
      return m.shapeNarrates(side());
    case 'shape.figureFailed':
      return m.shapeFigureFailed;
    case 'shape.referenceForm':
      return m.shapeReferenceForm(referenceWhat(p, m));
    case 'key.differs':
      return m.keyDiffers(str(p.solver), str(p.key));
    case 'key.edited':
      return m.keyEdited;
    case 'check.edited':
      return m.checkEdited;
    case 'key.ambiguous':
      return m.keyAmbiguous;
    case 'numbers.differ':
      return m.numbersDiffer(str(p.en), str(p.zh));
    case 'terms.note':
      return m.termsNote(str(p.text));
    case 'syllabus.limited':
      return m.syllabusLimited(str(p.term), str(p.code));
    case 'lint.keyLongest':
      return m.lintKeyLongest;
    case 'lint.uneven':
      return m.lintUneven;
    case 'lint.allNone':
      return m.lintAllNone;
    case 'lint.negativeStem':
      return m.lintNegativeStem;
    case 'lint.shapeAsked':
      return m.lintShapeAsked(str(p.asked), str(p.got));
    case 'lint.keySpread':
      return m.lintKeySpread(str(p.letter), num(p.count), num(p.of));
    case 'copy.close': {
      const kind = ({ bank: m.copyKindBank, mine: m.copyKindMine, paper: m.copyKindPaper, example: m.copyKindExample, draft: m.copyKindDraft } as Record<string, string>)[str(p.with)] ?? m.copyKindBank;
      return p.verbatim ? m.copyVerbatim(kind) : m.copyClose(num(p.percent), kind);
    }
    case 'copy.reference':
      return m.copyReference(num(p.percent));
    case 'run.fewer':
      return m.runFewer(num(p.asked), num(p.got));
    case 'run.stopped':
      return m.runStopped;
    case 'run.keyNotChecked':
      return m.runKeyNotChecked;
    case 'run.referenceShape':
      return m.runReferenceShape(referenceWhat(p, m));
    default:
      return m.unknown(finding.id);
  }
}

/** Every code `findingText` knows, for the test that holds the engine to it. */
export const KNOWN_FINDINGS: readonly string[] = [
  'shape.stemEmpty', 'shape.optionCount', 'shape.optionEmpty', 'shape.optionsSame', 'shape.keyRange', 'shape.statementEmpty',
  'shape.statementCount', 'shape.notCombination', 'shape.narrates', 'shape.figureFailed', 'shape.referenceForm', 'key.differs', 'key.ambiguous', 'key.edited', 'check.edited', 'numbers.differ', 'terms.note', 'syllabus.limited',
  'lint.keyLongest', 'lint.uneven', 'lint.allNone', 'lint.negativeStem', 'lint.shapeAsked', 'lint.keySpread', 'copy.close', 'copy.reference',
  'run.fewer', 'run.stopped', 'run.keyNotChecked', 'run.referenceShape',
];
