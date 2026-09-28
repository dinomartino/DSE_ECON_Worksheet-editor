import { describe, expectTypeOf, it } from 'vitest';
import type { Glossary, TermCheck } from '@/glossary/types';
import type { TermSummary } from '@/model/paperHealth';
import type { TextPath, TextSlot, TranslationWrite } from '@/model/textSlots';
import type { RichText, Worksheet } from '@/model/types';
import { createRunDeps } from './deps';
import { defaultTranslateOptions, planFromSlots, planTranslation, slotInScope } from './plan';
import { runTranslation, translateOne, writesFor } from './run';
import { buildTermCheck, termFixWrites, termSummary } from './termCheck';
import type { RunDepsResult, TermRow, TranslateOptions, TranslateScope, TranslationPlan } from './types';

/**
 * The contract between the engine (producer) and the dialog and entry points
 * (consumers). A change here goes back through WP-0, never a local workaround type.
 */
describe('translation contracts', () => {
  it('pins the Check terms signatures', () => {
    expectTypeOf(buildTermCheck).toEqualTypeOf<
      (ws: Worksheet, glossary: Glossary, scope: TranslateScope) => TermRow[]
    >();
    expectTypeOf(termFixWrites).toEqualTypeOf<
      (rows: readonly TermRow[], accepted: ReadonlyMap<TextPath, ReadonlySet<number>>) => TranslationWrite[]
    >();
    expectTypeOf(termSummary).toEqualTypeOf<(ws: Worksheet, glossary: Glossary) => TermSummary>();
  });

  it('pins the TermRow and TermSummary shapes', () => {
    expectTypeOf<TermRow>().toEqualTypeOf<{
      path: TextPath;
      slot: TextSlot;
      en: RichText;
      zh: RichText;
      checks: TermCheck[];
    }>();
    expectTypeOf<TermSummary>().toEqualTypeOf<{
      warn: number;
      questionIds: readonly string[];
      outsideQuestions: number;
    }>();
  });

  it('pins the planning and run entry points', () => {
    expectTypeOf(slotInScope).parameters.toEqualTypeOf<[TextSlot, TranslateScope]>();
    expectTypeOf(defaultTranslateOptions).returns.toEqualTypeOf<TranslateOptions>();
    expectTypeOf(planFromSlots).returns.toEqualTypeOf<TranslationPlan>();
    expectTypeOf(planTranslation).parameters.toEqualTypeOf<[Worksheet, TranslateScope, TranslateOptions]>();
    expectTypeOf(runTranslation).parameter(0).toEqualTypeOf<TranslationPlan>();
    expectTypeOf(writesFor).returns.toEqualTypeOf<TranslationWrite[]>();
    expectTypeOf(translateOne).parameter(1).toEqualTypeOf<'toZh' | 'toEn'>();
    expectTypeOf(createRunDeps).returns.toEqualTypeOf<Promise<RunDepsResult>>();
  });
});
