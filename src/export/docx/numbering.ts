import {
  DEFAULT_LIST_INDENTS,
  type ListIndentScheme,
} from '@/model/numbering';
import type { FontPair } from '@/model/types';
import { rFonts } from './runs';
import { XML_DECL } from './xml';

/**
 * numbering.xml (§7.2) — the part that makes the export a live Word list rather
 * than typed-in text.
 *
 * Three abstract definitions:
 *   0  questions   level 0: "1." decimal   level 1: "(a)" lowerLetter   level 2: "(i)" lowerRoman
 *   1  MCQ options "A." upperLetter
 *   2  statements  "(1)" decimal
 *
 * Concrete `w:num` instances are generated per stream. Options and statements use a
 * question-scoped stream, so each question instantiates its own `w:num` and its
 * lettering restarts at A / (1) without any manual override (§7.2).
 */

export const ABSTRACT_QUESTION = 0;
export const ABSTRACT_OPTION = 1;
export const ABSTRACT_STATEMENT = 2;

export type NumberingDefinition = 'question' | 'option' | 'statement';

const ABSTRACT_BY_DEFINITION: Record<NumberingDefinition, number> = {
  question: ABSTRACT_QUESTION,
  option: ABSTRACT_OPTION,
  statement: ABSTRACT_STATEMENT,
};

interface LevelSpec {
  level: number;
  format: 'decimal' | 'lowerLetter' | 'lowerRoman' | 'upperLetter';
  /** `%1` etc. refer to the counter at that 1-based level. */
  text: string;
  indent: number;
  hanging: number;
}

function levelXml(spec: LevelSpec, fonts: FontPair): string {
  return (
    `<w:lvl w:ilvl="${spec.level}">` +
    `<w:start w:val="1"/>` +
    `<w:numFmt w:val="${spec.format}"/>` +
    `<w:lvlText w:val="${spec.text}"/>` +
    `<w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${spec.indent}" w:hanging="${spec.hanging}"/></w:pPr>` +
    `<w:rPr>${rFonts(fonts)}</w:rPr>` +
    `</w:lvl>`
  );
}

/** Levels 3-8 are unused but must exist; Word expects nine levels per definition. */
function fillerLevels(from: number, fonts: FontPair): string {
  let out = '';
  for (let level = from; level < 9; level += 1) {
    out += levelXml(
      {
        level,
        format: 'decimal',
        text: `%${level + 1}.`,
        indent: 720 * (level + 1),
        hanging: 360,
      },
      fonts,
    );
  }
  return out;
}

function abstractNum(id: number, levels: LevelSpec[], fonts: FontPair): string {
  return (
    `<w:abstractNum w:abstractNumId="${id}">` +
    `<w:multiLevelType w:val="${levels.length > 1 ? 'multilevel' : 'singleLevel'}"/>` +
    levels.map((spec) => levelXml(spec, fonts)).join('') +
    fillerLevels(levels.length, fonts) +
    `</w:abstractNum>`
  );
}

export interface NumStream {
  stream: string;
  definition: NumberingDefinition;
}

/** Assign a concrete `w:numId` to every stream. numId 0 is reserved by Word. */
export function assignNumIds(streams: NumStream[]): Map<string, number> {
  const map = new Map<string, number>();
  streams.forEach((entry, index) => map.set(entry.stream, index + 1));
  return map;
}

export function buildNumberingXml(
  streams: NumStream[],
  fonts: FontPair,
  indents: ListIndentScheme = DEFAULT_LIST_INDENTS,
): string {
  /*
   * The geometry comes from `model/numbering.ts`, not from literals here.
   *
   * Word reads these values, the preview mirrors them to lay the paper out, and the
   * registry indents continuation paragraphs to match — three copies that must agree, so
   * there is one definition and all three read it (the exam paper substitutes its own
   * scheme, § `listIndentScheme`). Each level's marker starts where its parent's text
   * starts (§ `QUESTION_LIST_INDENTS`).
   */
  const questionFormats = ['decimal', 'lowerLetter', 'lowerRoman'] as const;
  const questionText = ['%1.', '(%2)', '(%3)'];
  const questionLevels: LevelSpec[] = indents.question.map((indent, level) => ({
    level,
    format: questionFormats[level],
    text: questionText[level],
    indent: indent.left,
    hanging: indent.hanging,
  }));
  const optionLevels: LevelSpec[] = [
    {
      level: 0,
      format: 'upperLetter',
      text: '%1.',
      indent: indents.option.left,
      hanging: indents.option.hanging,
    },
  ];
  const statementLevels: LevelSpec[] = [
    {
      level: 0,
      format: 'decimal',
      text: '(%1)',
      indent: indents.statement.left,
      hanging: indents.statement.hanging,
    },
  ];

  const LEVELS_BY_DEFINITION: Record<NumberingDefinition, LevelSpec[]> = {
    question: questionLevels,
    option: optionLevels,
    statement: statementLevels,
  };

  const numIds = assignNumIds(streams);
  let seenQuestionStream = false;

  const nums = streams
    .map((entry) => {
      const numId = numIds.get(entry.stream)!;
      const abstractId = ABSTRACT_BY_DEFINITION[entry.definition];

      // Several `w:num` instances sharing one abstract definition continue a single
      // counter by default, so per-question option streams would run A-D, E-H, I-L.
      // An explicit `w:startOverride` on every level forces an instance to begin
      // again at 1 (i.e. "A." / "(1)" / "1."), which is what §7.2 requires.
      //
      // Option and statement streams always restart (one stream per question). A
      // question stream restarts only when it is not the first one — the first
      // carries the paper's opening numbering, and each later stream exists
      // precisely because its section asked to restart at 1 (§4).
      let restart = true;
      if (entry.definition === 'question') {
        restart = seenQuestionStream;
        seenQuestionStream = true;
      }

      const overrides = restart
        ? LEVELS_BY_DEFINITION[entry.definition]
            .map(
              (spec) =>
                `<w:lvlOverride w:ilvl="${spec.level}">` +
                `<w:startOverride w:val="1"/>` +
                `</w:lvlOverride>`,
            )
            .join('')
        : '';

      return (
        `<w:num w:numId="${numId}">` +
        `<w:abstractNumId w:val="${abstractId}"/>` +
        overrides +
        `</w:num>`
      );
    })
    .join('');

  return (
    XML_DECL +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    abstractNum(ABSTRACT_QUESTION, questionLevels, fonts) +
    abstractNum(ABSTRACT_OPTION, optionLevels, fonts) +
    abstractNum(ABSTRACT_STATEMENT, statementLevels, fonts) +
    nums +
    '</w:numbering>'
  );
}
