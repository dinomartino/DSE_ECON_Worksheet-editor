'use client';

import { useEffect, useState } from 'react';
import type { BankRow } from '@/library/types';
import type { Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';

/**
 * The document a bank row lives in, read once per saved version (`docUpdatedAt`) and kept
 * for the visit, so stepping back and forth through a paper's questions reads it once.
 * `null` = it could not be read.
 */
export function useOwningDocument(row: BankRow | undefined): { worksheet: Worksheet | undefined; failed: boolean } {
  const [docs, setDocs] = useState<ReadonlyMap<string, Worksheet | null>>(new Map());
  const key = row ? `${row.docId}@${row.docUpdatedAt}` : undefined;
  const docId = row?.docId;

  useEffect(() => {
    if (!key || !docId || docs.has(key)) return;
    let live = true;
    worksheetStore.load(docId).then(
      (worksheet) => live && setDocs((current) => new Map(current).set(key, worksheet ?? null)),
      () => live && setDocs((current) => new Map(current).set(key, null)),
    );
    return () => {
      live = false;
    };
  }, [key, docId, docs]);

  const found = key ? docs.get(key) : undefined;
  return { worksheet: found ?? undefined, failed: found === null };
}
