'use client';

import { statementLabel, optionLabel } from '@/model/numbering';
import { emptyBiText } from '@/model/text';
import type { BiText, McqOptionLayout, McqQuestion } from '@/model/types';
import { resolveOptionLayout, suggestOptionLayout } from '@/registry/mcq';
import type { EditorPanelProps } from '@/registry/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, Eyebrow, IconButton, NumberField, Segmented } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';

/** MCQ editor (§5.3): stem blocks, optional statements, 4 options, answer, explanation. */
export function McqEditorPanel({ question, onChange }: EditorPanelProps<McqQuestion>) {
  const statements = question.statements ?? [];
  const language = useWorksheetStore((s) => s.mode.language);
  const suggested = suggestOptionLayout(question, language);

  const setStatements = (next: BiText[]) =>
    onChange({ statements: next.length > 0 ? next : undefined });

  const moveStatement = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= statements.length) return;
    const next = [...statements];
    [next[index], next[target]] = [next[target], next[index]];
    setStatements(next);
  };

  return (
    <div className="space-y-5">
      <BlockEditor label="Stem" blocks={question.blocks} onChange={(blocks) => onChange({ blocks })} />

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Eyebrow>Statements</Eyebrow>
          <span className="text-[10px] text-ink-subtle">combination MCQ · optional</span>
          <span className="ml-auto">
            <Button
              size="sm"
              variant="subtle"
              onClick={() => setStatements([...statements, emptyBiText()])}
            >
              + Statement
            </Button>
          </span>
        </div>
        {statements.map((statement, index) => (
          <div key={index} className="group/row flex items-start gap-1.5">
            <span className="mt-1.5 w-6 shrink-0 text-[11px] font-medium tabular-nums text-ink-subtle">
              {statementLabel(index)}
            </span>
            <div className="min-w-0 flex-1">
              <BiTextField
                value={statement}
                rows={1}
                onChange={(value) =>
                  setStatements(statements.map((s, i) => (i === index ? value : s)))
                }
              />
            </div>
            <span className="flex shrink-0 items-center pt-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
              <IconButton
                label="Move statement up"
                disabled={index === 0}
                onClick={() => moveStatement(index, -1)}
              >
                <span aria-hidden>↑</span>
              </IconButton>
              <IconButton
                label="Move statement down"
                disabled={index === statements.length - 1}
                onClick={() => moveStatement(index, 1)}
              >
                <span aria-hidden>↓</span>
              </IconButton>
              <IconButton
                label="Delete statement"
                variant="danger"
                onClick={() => setStatements(statements.filter((_, i) => i !== index))}
              >
                <span aria-hidden>✕</span>
              </IconButton>
            </span>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Eyebrow>Options</Eyebrow>
          <span className="text-[10px] text-ink-subtle">
            select the correct answer — teacher version only
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented<McqOptionLayout>
            label="Option layout"
            value={resolveOptionLayout(question)}
            options={[
              { value: 'stacked', label: 'Stacked', title: 'One option per line' },
              { value: 'inline', label: 'Inline', title: 'All four options on one line' },
              { value: 'columns2', label: '2 columns', title: 'Two options per line' },
            ]}
            onChange={(optionLayout) => onChange({ optionLayout })}
          />
          {/* Only offered when it would actually change something, so it never reads as
              a no-op button. Stacked stays the default until a teacher chooses. */}
          {suggested !== resolveOptionLayout(question) && (
            <Button
              size="sm"
              variant="subtle"
              title={`These options fit better ${suggested === 'stacked' ? 'stacked' : `as ${suggested}`}`}
              onClick={() => onChange({ optionLayout: suggested })}
            >
              Fit to content
            </Button>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Correct answer"
          className="space-y-1.5"
        >
          {question.options.map((option, index) => {
            const isAnswer = question.answerIndex === index;
            return (
              <div
                key={option.id}
                className={`flex items-start gap-2 rounded-lg border p-1.5 transition-colors ${
                  isAnswer
                    ? 'border-ok-line bg-ok-soft'
                    : 'border-transparent'
                }`}
              >
                <label
                  className="mt-1 flex shrink-0 cursor-pointer items-center gap-1.5"
                  title={isAnswer ? 'This is the correct answer' : 'Mark as the correct answer'}
                >
                  <input
                    type="radio"
                    name={`answer-${question.id}`}
                    checked={isAnswer}
                    onChange={() => onChange({ answerIndex: index })}
                    aria-label={`Option ${optionLabel(index)} is the correct answer`}
                    className="accent-emerald-600"
                  />
                  <span
                    className={`text-[11px] font-semibold ${
                      isAnswer
                        ? 'text-ok'
                        : 'text-ink-subtle '
                    }`}
                  >
                    {optionLabel(index)}
                  </span>
                </label>
                <div className="min-w-0 flex-1">
                  <BiTextField
                    value={option.text}
                    rows={1}
                    onChange={(text) =>
                      onChange({
                        options: question.options.map((o, i) => (i === index ? { ...o, text } : o)),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2 border-t border-line pt-3 ">
        <NumberField
          label="Marks"
          value={question.marks ?? 1}
          onChange={(marks) => onChange({ marks })}
        />
        <BiTextField
          label="Explanation (teacher version)"
          value={question.explanation ?? emptyBiText()}
          onChange={(explanation) => onChange({ explanation })}
        />
      </section>
    </div>
  );
}
