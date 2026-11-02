import { newId } from './factories';
import { createWorksheetFrom, type NewWorksheetOptions } from './newWorksheet';
import { partnerPaperName, setRoleOf, suggestedSetName, withPaperSet } from './paperSet';
import type { Worksheet } from './types';

/**
 * A new mock set from the New worksheet form (k-0311): the paper the teacher chose, and a
 * blank one of the other kind beside it, already linked as a set (step A's `paperSet`, no
 * new field). The blank paper is a real document of its shape (cover, sections, page
 * furniture) with no question in it, not even the sample a new paper is seeded with, so it
 * reads as "not started" on the start screen and in the editor strip (0 questions).
 *
 * Both take the form's choices (school, examination, language, paper, fonts); only the
 * shape and the name differ. The set is named from the chosen paper's name (`suggestedSetName`).
 */
export function createMockSet(
  options: NewWorksheetOptions & { documentType: 'paper1' | 'lqMock'; name: string },
  setId: string = newId(),
): { chosen: Worksheet; blank: Worksheet } {
  const chosenRaw = createWorksheetFrom(options);
  const role = setRoleOf(chosenRaw) ?? (options.documentType === 'paper1' ? 'paper1' : 'paper2');
  const blankRaw = createWorksheetFrom({
    ...options,
    documentType: options.documentType === 'paper1' ? 'lqMock' : 'paper1',
    name: partnerPaperName(options.name, role),
    seedSample: false,
  });
  const set = { id: setId, name: suggestedSetName(options.name) };
  return { chosen: withPaperSet(chosenRaw, set), blank: withPaperSet(blankRaw, set) };
}
