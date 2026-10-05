import { isNewerThanBuild } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { sha256 } from './hash';

/**
 * A document's content as the engine compares it: the text `stringifyWorksheet` writes
 * and its hash. Local and remote copies are compared after the same round trip, so a
 * file the other computer wrote byte-for-byte differently but meaning the same links.
 */
export interface Content {
  worksheet: Worksheet;
  text: string;
  hash: string;
  schemaVersion: number;
  /** Written by a build newer than this one (§ `isNewerThanBuild`): opens read-only. */
  newer: boolean;
}

export function contentOf(worksheet: Worksheet): Content {
  const text = stringifyWorksheet(worksheet);
  return {
    worksheet,
    text,
    hash: sha256(text),
    schemaVersion: worksheet.schemaVersion,
    newer: isNewerThanBuild(worksheet),
  };
}

/** Throws on text that is not a document. */
export function contentOfText(text: string): Content {
  return contentOf(parseWorksheet(text));
}
