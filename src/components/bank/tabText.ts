import { MARK_BANDS, topicName, type TabFilters } from '@/library/tabFilters';
import { typeLabel } from './BankRow';

/** "MCQs", "structured questions": the registry's label, never a branch on the id. */
export function typePlural(typeId: string): string {
  if (!typeId) return 'questions';
  const label = typeLabel(typeId);
  return /[A-Z]$/.test(label) ? `${label}s` : `${label.toLowerCase()} questions`;
}

/** What the filters asked for, as the filtered-to-nothing line says it. */
export function emptySentence(filters: TabFilters, classLabel: string | undefined): string {
  const parts = [`No ${typePlural(filters.typeId)}`];
  if (filters.topic) parts.push(`in ${topicName(filters.topic)}`);
  const band = MARK_BANDS.find((entry) => entry.value === filters.marks);
  if (band?.range) parts.push(`worth ${band.label}`);
  if (filters.text.trim()) parts.push(`matching “${filters.text.trim()}”`);
  if (filters.notUsedWithClass && classLabel?.trim()) parts.push(`not used with ${classLabel.trim()}`);
  if (filters.from === 'banks') parts.push('in your banks');
  else if (typeof filters.from === 'object') parts.push('in that worksheet');
  return `${parts.join(' ')}.`;
}
