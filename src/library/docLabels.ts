import type { BankRow } from './types';

/** What names a document in a list: its title, and what tells it from another of that title. */
export type DocIdentity = Pick<BankRow, 'docId' | 'docTitle' | 'usedOn' | 'classes'>;

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "12 Mar 2026" for a use date; empty when it will not parse. */
export function dayOf(usedOn: string): string {
  const when = Date.parse(usedOn);
  return Number.isNaN(when) ? '' : DAY.format(when);
}

/**
 * Each document's name as a list shows it. A title no other document shares is itself;
 * two papers both called "Quiz" add the day each was sat or made ("Quiz · 12 Mar 2026"),
 * then their classes, then a number, until no two read alike. Titles compare ignoring
 * case and spacing. Rows may repeat a document; the first row of each is read.
 */
export function distinctDocLabels(docs: Iterable<DocIdentity>): Map<string, string> {
  const byTitle = new Map<string, DocIdentity[]>();
  const seen = new Set<string>();
  for (const doc of docs) {
    if (seen.has(doc.docId)) continue;
    seen.add(doc.docId);
    const key = titleKey(doc.docTitle);
    byTitle.set(key, [...(byTitle.get(key) ?? []), doc]);
  }
  const out = new Map<string, string>();
  for (const same of byTitle.values()) {
    if (same.length === 1) {
      out.set(same[0].docId, same[0].docTitle);
      continue;
    }
    const withDay = same.map((doc) => ({ doc, parts: [dayOf(doc.usedOn)].filter(Boolean) }));
    const dayClash = new Set(
      withDay.filter((entry) => withDay.filter((other) => other.parts.join() === entry.parts.join()).length > 1).map((e) => e.doc.docId),
    );
    for (const entry of withDay) {
      if (dayClash.has(entry.doc.docId) && entry.doc.classes?.length) entry.parts = [...entry.parts, entry.doc.classes.join(', ')];
    }
    // Still alike: number them in a stable order (use date, then id).
    const sizes = new Map<string, number>();
    for (const entry of withDay) sizes.set(entry.parts.join(), (sizes.get(entry.parts.join()) ?? 0) + 1);
    const ordered = [...withDay].sort((a, b) => compare(a.doc.usedOn, b.doc.usedOn) || compare(a.doc.docId, b.doc.docId));
    const counts = new Map<string, number>();
    for (const entry of ordered) {
      const key = entry.parts.join();
      if ((sizes.get(key) ?? 0) > 1) {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        entry.parts = [...entry.parts, `(${n})`];
      }
      out.set(entry.doc.docId, [entry.doc.docTitle.trim(), ...entry.parts].join(' · '));
    }
  }
  return out;
}

function titleKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
