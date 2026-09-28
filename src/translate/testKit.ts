/**
 * Test-only helpers for the translation pipeline: every BiText in the shipped data, and a
 * scripted AiClient. Never imported by app code.
 */
import { readFileSync } from 'node:fs';
import type { AiClient, CompletionRequest, CompletionResult } from '@/ai/types';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import type { BiText } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';

function isBiText(value: unknown): value is BiText {
  if (typeof value !== 'object' || value === null) return false;
  const { en, zh } = value as { en?: unknown; zh?: unknown };
  return Array.isArray(en) && Array.isArray(zh);
}

/** Every `{en, zh}` object reachable from `root`. */
export function allBiTexts(root: unknown): BiText[] {
  const out: BiText[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) {
      if (isBiText(value)) out.push(value);
      Object.values(value).forEach(visit);
    }
  };
  visit(root);
  return out;
}

/** The v1 corpus, read only. */
export function readCorpus(): unknown {
  return JSON.parse(readFileSync('src/test/corpus/v1-published.json', 'utf8'));
}

const DOCUMENT_TYPES: DocumentType[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];

/** Templates, presets, fixtures and the v1 corpus. */
export function shippedBiTexts(): BiText[] {
  return allBiTexts([
    readCorpus(),
    buildAcceptanceWorksheet(),
    buildMarkSchemeWorksheet(),
    DIAGRAM_TEMPLATES,
    ...DOCUMENT_TYPES.map((documentType) => createWorksheetFrom({ documentType })),
  ]);
}

type Reply = string | CompletionResult | Error | ((req: CompletionRequest) => string | CompletionResult);

/** Replies in order; a string is a stop-finished reply. Records every request. */
export function scriptedClient(replies: Reply[]): AiClient & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  let index = 0;
  return {
    requests,
    async complete(req) {
      requests.push(req);
      const next = replies[Math.min(index, replies.length - 1)];
      index += 1;
      if (next instanceof Error) throw next;
      const value = typeof next === 'function' ? next(req) : next;
      if (typeof value !== 'string') return value;
      return { text: value, finish: 'stop', dialect: 'openai-jsonSchema', model: 'fake', ms: 1 };
    },
    listModels: async () => [],
  };
}

/** The items of the last user turn (the real payload). */
export function payloadOf(req: CompletionRequest): {
  task: string;
  glossary: string[];
  groups: Array<{ where: string; items: Array<{ key: string; text: string; kind: string; fix?: string[]; previous?: string }> }>;
} {
  return JSON.parse(req.turns[req.turns.length - 1].content);
}

export const reply = (items: Array<[string, string]>): string =>
  JSON.stringify({ items: items.map(([key, text]) => ({ key, text })) });
