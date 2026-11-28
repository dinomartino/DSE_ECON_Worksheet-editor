import type { BiDraft } from '@/generate/types';
import type { AiTurn, Chat, Note, Step, Turn, UserTurn } from '../chat/chatTypes';
import { lean } from './redact';
import type { CallEvent, ChatNotes, PromptRef, TraceEvent, TurnTrace } from './types';

/**
 * "Export for review" (k-0598): the files of one export, as text by path, built from the chats,
 * their review records, the teacher's notes and the long texts the records point to. Pure: the
 * button (`ExportReview.tsx`) reads the stores and zips what this returns.
 *
 *   HOW-TO-READ.md            for the agent that reads it: layout, what each part means
 *   index.md                  every chat in the export, with its counts and notes
 *   prompts/<id>.txt          a long text (system prompt, schema) kept once, pointed to by id
 *   chats/NN-<slug>/conversation.md   turns in order, the teacher's note under each reply,
 *                                     what happened behind it folded under it
 *   chats/NN-<slug>/raw.json          everything, for agents
 *
 * The files are for the teacher and agents, not a teacher's interface: English throughout, the
 * teacher's own words as they wrote them. No keys (`redact.ts`), no picture data.
 */

export const REVIEW_FORMAT = 'econ-studio-review/1';

export interface ExportChat {
  chat: Chat;
  /** The studio screen's chats, or the editor's ✦ Write panel's. */
  list: 'studio' | 'panel';
}

export interface ExportInput {
  chats: readonly ExportChat[];
  traces: readonly TurnTrace[];
  notes: ReadonlyMap<string, ChatNotes>;
  prompts: ReadonlyMap<string, string>;
  exportedAt: string;
  version: string;
}

const fence = (text: string, lang = '') => {
  const ticks = /```/.test(text) ? '````' : '```';
  return `${ticks}${lang}\n${text.replace(/\s+$/, '')}\n${ticks}`;
};

const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9㐀-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'chat';

const bi = (b: BiDraft | undefined) => [b?.en, b?.zh].filter((s): s is string => !!s && s.trim() !== '').join(' / ');

const LETTERS = 'ABCD';

/** The prompts every record points to. */
export function promptIdsOf(traces: readonly TurnTrace[]): Set<string> {
  const ids = new Set<string>();
  for (const t of traces)
    for (const e of t.events)
      if (e.t === 'call') {
        if (typeof e.system === 'object') ids.add(e.system.prompt);
        if (typeof e.schema === 'object' && e.schema) ids.add(e.schema.prompt);
      }
  return ids;
}

function stepLine(step: Step): string {
  const state = step.state === 'fail' ? ' (failed)' : step.state === 'run' ? ' (did not finish)' : '';
  switch (step.kind) {
    case 'read':
      return `Read the reference ${step.labels.join(', ')}${state}`;
    case 'pick':
      return `Key point picked by ${step.by}: ${step.picks.map((p) => `${p.code}${p.reason ? ` (${p.reason})` : ''}${p.basis ? ` [computer: ${p.basis.kind} ${'label' in p.basis ? p.basis.label : p.basis.hit}]` : ''}`).join('; ') || 'none'}${state}`;
    case 'refs':
      return `Found real questions to write like: ${step.labels.join(', ') || 'none'}${state}`;
    case 'write':
      return `Wrote ${step.count} draft(s)${state}`;
    case 'check':
      return `Checked the drafts${state}`;
    case 'diagram':
      return `Drew the diagrams${state}`;
    case 'change':
      return `Changed draft ${step.draftNo} (${step.how})${state}`;
    case 'understand':
      return `Read the message as: ${step.intent ?? '?'}${step.drafts?.length ? ` drafts ${step.drafts.join(', ')}` : ''}${step.by ? ` (by ${step.by === 'ai' ? 'the AI' : 'this computer'})` : ''}${state}`;
  }
}

function noteLine(note: Note): string {
  switch (note.kind) {
    case 'written':
      return `Said: ${note.ok} draft(s) passed every check, ${note.look} to read, ${note.failed} with a red warning.`;
    case 'changed':
      return `Said: draft ${note.draftNo} changed (version ${note.version}).`;
    case 'figureKept':
      return `Said: the diagram of draft ${note.draftNo} could not be redrawn as asked; it is as it was.`;
    case 'another':
      return `Said: one more like it, draft ${note.draftNo}.`;
    case 'stopped':
      return 'Stopped by the teacher.';
    case 'noPick':
      return 'Said: no key point could be picked.';
    case 'pickChanged':
      return `The teacher changed the key point to ${note.code}.`;
    case 'kept':
      return 'The teacher kept the drafts.';
    case 'reply':
      return `Answered (draft ${note.draftNo}):\n\n${quote(note.text)}`;
    case 'noReply':
      return `No answer came back about draft ${note.draftNo}.`;
    case 'refShape':
      return `Said: the reference has a form the studio cannot write yet (pictures ${note.pictures}, option pictures ${note.optionPictures}, option tables ${note.optionTables}).`;
  }
}

function userLine(turn: UserTurn, chat: Chat): string {
  const about = turn.draftNos?.length ? ` (about drafts ${turn.draftNos.join(', ')})` : turn.draftNo !== undefined ? ` (about draft ${turn.draftNo})` : '';
  const said = turn.text || (turn.how ? `[button: ${turn.how}]` : turn.draftNo === undefined ? `[empty message: ${chat.settings.count} more like the reference]` : '');
  return `${said}${about}${turn.refs.length ? `\n\nReferences sent: ${turn.refs.join(', ')}` : ''}`;
}

interface DraftLike {
  id?: string;
  status?: string;
  attempt?: number;
  angle?: string;
  draft?: { stem: BiDraft; statements: BiDraft[]; options: BiDraft[]; answerIndex: number; explanation: BiDraft };
  checks?: Array<{ id: string; state: string; findings: Array<{ id: string; params?: Record<string, unknown> }>; value?: number }>;
  solve?: { answer: number; ambiguous: boolean; working?: string; tests?: string; onTopic?: boolean };
  diagram?: { status: string; issues?: unknown[] };
  diagramSet?: { figures: Array<{ status: string }>; issues?: unknown[] };
}

function draftBlock(d: DraftLike, label: string): string {
  const lines = [`**${label}**${d.status ? ` — status ${d.status}` : ''}${d.attempt === 2 ? ', rewritten once after a check failed' : ''}`];
  if (d.draft) {
    lines.push('', bi(d.draft.stem));
    d.draft.statements.forEach((s, i) => lines.push(`(${i + 1}) ${bi(s)}`));
    d.draft.options.forEach((o, i) => lines.push(`${LETTERS[i] ?? i + 1}. ${bi(o)}${i === d.draft?.answerIndex ? '  ← key' : ''}`));
    if (bi(d.draft.explanation)) lines.push('', `Explanation: ${bi(d.draft.explanation)}`);
  }
  if (d.angle) lines.push('', `Angle: ${d.angle}`);
  if (d.checks?.length) {
    lines.push('', 'Checks: ' + d.checks.map((c) => `${c.id} ${c.state}${c.value !== undefined ? ` ${c.value}%` : ''}`).join(', '));
    for (const c of d.checks) for (const f of c.findings) lines.push(`  - ${c.id}: ${f.id}${f.params ? ` ${JSON.stringify(f.params)}` : ''}`);
  }
  if (d.solve) lines.push(`Blind solve: answered ${LETTERS[d.solve.answer] ?? d.solve.answer}${d.solve.ambiguous ? ', found it ambiguous' : ''}${d.solve.tests ? `; says it tests "${d.solve.tests}"` : ''}${d.solve.onTopic === false ? ' (off the concept)' : ''}`);
  if (d.diagram) lines.push(`Diagram: ${d.diagram.status}${d.diagram.issues?.length ? `, issues ${JSON.stringify(d.diagram.issues)}` : ''}`);
  if (d.diagramSet) lines.push(`Diagrams: ${d.diagramSet.figures.map((f) => f.status).join(', ')}${d.diagramSet.issues?.length ? `, issues ${JSON.stringify(d.diagramSet.issues)}` : ''}`);
  return lines.join('\n');
}

const promptText = (p: string | PromptRef | undefined, prompts: ReadonlyMap<string, string>, max = 0) => {
  if (p === undefined) return '';
  if (typeof p === 'object') return `see prompts/${p.prompt}.txt${prompts.has(p.prompt) ? ` (${prompts.get(p.prompt)?.length ?? 0} characters)` : ' (not found)'}`;
  return max && p.length > max ? `${p.slice(0, max)}…` : p;
};

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function callBlock(e: CallEvent, i: number, prompts: ReadonlyMap<string, string>): string {
  const tokens = e.usage ? ` · tokens in ${e.usage.input ?? '?'}${e.usage.cached ? ` (cached ${e.usage.cached})` : ''}, out ${e.usage.output ?? '?'}${e.usage.thinking ? `, thinking ${e.usage.thinking}` : ''}` : '';
  const credits = e.charged !== undefined ? ` · ${e.charged} credits` : '';
  const head = `#### Call ${i}: ${e.feature ?? 'ai'} · ${e.provider}${e.model ? ` · ${e.model}` : ''} · ${e.mode} · started +${secs(e.at)}, took ${secs(e.ms)}${tokens}${credits}${e.error ? ` · FAILED ${e.error.kind}` : ''}`;
  const parts = [head, '', `System prompt: ${typeof e.system === 'object' ? promptText(e.system, prompts) : ''}`];
  if (typeof e.system === 'string') parts.push(fence(e.system));
  e.turns.forEach((t) => parts.push('', `${t.role === 'user' ? 'User' : 'Assistant (example)'} turn:`, fence(t.content)));
  if (e.pictures?.length) parts.push('', `Pictures sent: ${e.pictures.map((p) => `${p.id} (${p.kb} KB)`).join(', ')}`);
  if (typeof e.schema === 'object') parts.push('', `Output schema: ${promptText(e.schema, prompts)}`);
  else if (e.schema) parts.push('', 'Output schema:', fence(e.schema, 'json'));
  if (e.reply !== undefined) parts.push('', `Raw reply${e.finish ? ` (finish: ${e.finish}${e.dialect ? `, ${e.dialect}` : ''})` : ''}:`, fence(e.reply, /^\s*[[{]/.test(e.reply) ? 'json' : ''));
  if (e.error) parts.push('', `Error: ${e.error.kind}: ${e.error.message}${e.error.detail ? ` — ${e.error.detail}` : ''}`);
  return parts.join('\n');
}

function eventLine(e: TraceEvent): string | undefined {
  switch (e.t) {
    case 'stage':
      return `+${secs(e.at)} stage ${e.stage}${e.mode ? ` (${e.mode}, attempt ${e.attempt})` : ''}`;
    case 'decision':
      return `+${secs(e.at)} decision ${e.what}: ${JSON.stringify(e.what === 'pick' ? pickSummary(e.value) : e.value)}`;
    case 'request':
      return `+${secs(e.at)} asked the engine to ${e.kind}${e.target ? ` draft ${e.target.no ?? e.target.id}` : ''}: ${JSON.stringify({ request: e.request, ...(e.refinement ? { refinement: e.refinement } : {}) })}`;
    case 'outcome':
      return `+${secs(e.at)} ${e.kind} ${e.ok ? `came back: ${e.drafts?.length ?? 0} draft(s), model ${e.model ?? '?'}, notes ${JSON.stringify(e.notes ?? [])}` : `failed: ${e.error?.kind} ${e.error?.message}`}`;
    case 'decide':
      return `+${secs(e.at)} Jev (${e.feature}) took ${secs(e.ms)}${e.charged !== undefined ? `, ${e.charged} credits` : ''}: ${e.notOffered ? 'not offered by this Mentor' : e.error ? `failed ${e.error.kind}` : JSON.stringify(e.answers)}${e.fallback ? ' (Gemini fallback)' : ''}`;
    case 'info':
      return `+${secs(e.at)} ${e.text}${e.error ? `: ${e.error.kind} ${e.error.message}` : ''}`;
    case 'call':
      return undefined;
  }
}

function pickSummary(value: unknown): unknown {
  const v = value as { ok?: boolean; picks?: unknown; concept?: unknown; local?: boolean; turn?: unknown; model?: string; error?: { kind?: string } };
  if (!v || typeof v !== 'object') return value;
  return v.ok ? { picks: v.picks, concept: v.concept, local: v.local, turn: v.turn, model: v.model } : { error: v.error?.kind };
}

/** Sums over one record: calls, failed calls, seconds, credits. */
export function totalsOf(trace: TurnTrace | undefined) {
  const calls = (trace?.events ?? []).filter((e): e is CallEvent => e.t === 'call');
  const decides = (trace?.events ?? []).filter((e) => e.t === 'decide');
  const credits = [...calls, ...decides].reduce((n, e) => n + ((e as { charged?: number }).charged ?? 0), 0);
  const ms = trace?.endedAt ? Date.parse(trace.endedAt) - Date.parse(trace.startedAt) : Math.max(0, ...(trace?.events ?? []).map((e) => e.at + ((e as { ms?: number }).ms ?? 0)));
  return { calls: calls.length, failed: calls.filter((c) => c.error).length, decides: decides.length, credits: Math.round(credits * 100) / 100, ms };
}

function behind(trace: TurnTrace | undefined, prompts: ReadonlyMap<string, string>): string {
  if (!trace) return '_No behind-the-scenes record: this reply was made before the review tool existed, in a release build, or in a browser._';
  const t = totalsOf(trace);
  const lines = trace.events.map(eventLine).filter((l): l is string => !!l);
  const calls = trace.events.filter((e): e is CallEvent => e.t === 'call').sort((a, b) => a.at - b.at);
  return [
    '<details>',
    `<summary>Behind the scenes: ${t.calls} AI call(s)${t.failed ? ` (${t.failed} failed)` : ''}${t.decides ? `, ${t.decides} Jev read(s)` : ''}, ${secs(t.ms)}${t.credits ? `, ${t.credits} credits` : ''}</summary>`,
    '',
    '##### Timeline',
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    ...calls.map((c, i) => callBlock(c, i + 1, prompts) + '\n'),
    '</details>',
  ].join('\n');
}

/** The reply's drafts: from the record's outcome (exactly what came back), else the chat's current version. */
function draftsOf(turn: AiTurn, chat: Chat, trace: TurnTrace | undefined): string[] {
  const outcomes = (trace?.events ?? []).filter((e) => e.t === 'outcome' && e.ok);
  if (outcomes.length) return outcomes.flatMap((e) => ((e as { drafts?: DraftLike[] }).drafts ?? []).map((d, i) => draftBlock(d, `Draft written (${(e as { kind: string }).kind} ${i + 1})`)));
  return turn.draftIds
    .map((id) => chat.drafts.find((d) => d.id === id))
    .filter((d) => d !== undefined)
    .map((d) => draftBlock(d.entry.draft as DraftLike, `Draft ${d.no} (as it is now, version ${d.entry.draft.version ?? d.older.length + 1}; state ${d.state})`));
}

export function conversationMd(item: ExportChat, traces: ReadonlyMap<string, TurnTrace>, notes: ChatNotes | undefined, prompts: ReadonlyMap<string, string>, orphans: readonly TurnTrace[]): string {
  const { chat } = item;
  const first = chat.turns.find((t): t is UserTurn => t.role === 'user');
  const out: string[] = [
    `# ${first?.text || chat.refs[0]?.source.label || 'Studio chat'}`,
    '',
    `- Chat id: ${chat.id} (${item.list === 'panel' ? `editor ✦ Write panel, paper ${chat.paper ?? '?'}` : 'Question studio'})`,
    `- Started ${chat.createdAt}, last change ${chat.updatedAt}`,
    `- Settings: ${chat.settings.count} draft(s) a request, level ${chat.settings.level}, paper language ${chat.settings.language}`,
    `- Key point now: ${chat.picks.map((p) => p.code).join(', ') || 'none'}${chat.concept ? `; concept: ${bi(chat.concept)}` : ''}`,
    `- References: ${chat.refs.map((r) => `${r.source.label} (${r.who === 'you' ? 'picked by the teacher' : 'chosen by the studio'})`).join(', ') || 'none'}`,
    `- Drafts: ${chat.drafts.map((d) => `${d.no} ${d.state}`).join(', ') || 'none'}`,
    '',
  ];
  out.push('## The teacher\'s note on this chat', '', notes?.chat ? quote(notes.chat) : '_None._', '');
  out.push('## Turns', '');
  let n = 0;
  let replyNo = 0;
  for (const turn of chat.turns as Turn[]) {
    if (turn.role === 'user') {
      n += 1;
      out.push(`### ${n}. Teacher`, '', userLine(turn, chat), '');
      continue;
    }
    replyNo += 1;
    const trace = traces.get(turn.id);
    out.push(`### ${n}. Studio reply ${replyNo} (turn ${turn.id})`, '');
    turn.steps.forEach((s) => out.push(`- ${stepLine(s)}`));
    if (turn.steps.length) out.push('');
    turn.notes.forEach((note) => out.push(noteLine(note), ''));
    if (turn.ask?.kind === 'which') out.push(`Asked which draft: offered ${turn.ask.options.join(', ')}; answer: ${turn.ask.answer ?? 'not given'}`, '');
    if (turn.ask?.kind === 'rewrite') out.push(`Asked whether to rewrite on ${turn.ask.code}; answer: ${turn.ask.answer ?? 'not given'}`, '');
    if (turn.error) out.push(`Error shown: ${turn.error.kind}: ${turn.error.message}`, '');
    for (const block of draftsOf(turn, chat, trace)) out.push(block, '');
    const note = notes?.turns[turn.id];
    out.push(`**Teacher's note on this reply**${note?.tag ? ` — tagged **${note.tag}**` : ''}:`, '', note?.text ? quote(note.text) : '_None._', '');
    out.push(behind(trace, prompts), '');
  }
  if (orphans.length) {
    out.push('## Replies no longer in the chat', '', 'Records of replies the chat dropped (a Retry replaces the failed reply with a new one). Same layout as above.', '');
    for (const t of orphans) {
      const note = notes?.turns[t.turnId];
      out.push(`### Turn ${t.turnId}, started ${t.startedAt}`, '');
      if (note) out.push(`**Teacher's note**${note.tag ? ` — tagged **${note.tag}**` : ''}:`, '', note.text ? quote(note.text) : '_None._', '');
      out.push(behind(t, prompts), '');
    }
  }
  return out.join('\n');
}

export const HOW_TO_READ = `# How to read this export

An "Export for review" from the Econ Studio Question studio (a develop-only tool, k-0598). A
teacher used the studio's AI chat to write HKDSE Economics multiple-choice questions, wrote
notes on what they wanted and what went wrong, and exported it so an agent can improve the
studio. Read the teacher's notes first: they are the point of the export.

## Layout

- \`index.md\`: every chat in the export, newest first, with its counts and whether it has notes.
- \`chats/NN-<slug>/conversation.md\`: one chat, turns in order. Under each studio reply: the
  steps it showed, what it said, the drafts it wrote (every check's verdict, the blind solve),
  then **the teacher's note on that reply** (with a tag: good / wrong / unclear), then a folded
  "Behind the scenes" section: a timeline (decisions, engine stages, requests and outcomes) and
  every AI call with the exact prompt sent and the raw reply.
- \`chats/NN-<slug>/raw.json\`: everything in \`conversation.md\` and more, as data: the chat as
  stored (\`chat\`), the notes (\`notes\`), and one record per reply (\`traces\`, keyed by the AI
  turn's id), each a list of events in time order (\`at\` = ms since the reply started).
- \`prompts/<id>.txt\`: a long text (most often a system prompt, also output schemas) kept once.
  A call whose \`system\` or \`schema\` is \`{ "prompt": "<id>" }\` sent that file's text.

## Events in a record

- \`call\`: one AI request. \`feature\` (studio.pick, studio.write, studio.solve, studio.diagram,
  studio.quality, …), \`provider\`, \`model\` (the one that answered), \`system\`, \`turns\`
  (few-shot pairs, then the real payload last), \`schema\`, \`pictures\` (fingerprint + size only;
  the picture itself is never exported), \`reply\` (raw text), \`finish\`, \`usage\` (tokens),
  \`charged\`/\`balance\` (DSEcon Mentor credits from its receipt), \`ms\`, \`error\`.
- \`decide\`: a typed question to Jev through Mentor (the pre-router that reads a message once
  drafts exist): the state and questions sent, the answers.
- \`decision\`: what the chat decided. \`localRead\` = this computer's reading of the message;
  \`route\` = Jev's route (act now, or leave it to the main model); \`intent\` = the reading the
  reply acted on (new / edit / another / ask / unsure, and by whom); \`pick\` = the key point(s)
  and concept step 1 chose (and the message's intent when it was read with drafts).
- \`stage\`: the engine's progress (references, write, rewrite, solve, diagram). A \`write\` with
  attempt 2 or a \`rewrite\` stage means a draft failed a check and was written again.
- \`request\` / \`outcome\`: what was asked of the engine (key point, references by label, count,
  level, the teacher's words, the concept) and what came back (each draft with its checks).
- \`info\`: a failure or other note.

A reply with no record says "No behind-the-scenes record": it was made before this tool, or
where it does not record (a release build, a browser).

## What is not here

No API keys, tokens or sign-in (removed on the way in), no picture data, nothing from the
teacher's worksheets beyond what the chat itself sent.
`;

export interface BuiltExport {
  files: Map<string, string>;
  chats: number;
  replies: number;
  recorded: number;
  notes: number;
}

export function buildReviewFiles(input: ExportInput): BuiltExport {
  const files = new Map<string, string>();
  const byTurn = new Map(input.traces.map((t) => [t.turnId, t]));
  const ordered = [...input.chats].filter((c) => c.chat.turns.length > 0).sort((a, b) => b.chat.updatedAt.localeCompare(a.chat.updatedAt));
  const index: string[] = [`# Studio review export`, '', `Exported ${input.exportedAt} from Econ Studio ${input.version} (${REVIEW_FORMAT}). Start with HOW-TO-READ.md.`, '', '| # | Chat | Where | Replies | Recorded | Notes | Folder |', '|---|---|---|---|---|---|---|'];
  let replies = 0;
  let recorded = 0;
  let notesCount = 0;
  const usedPrompts = new Set<string>();
  ordered.forEach((item, i) => {
    const { chat } = item;
    const turnIds = new Set(chat.turns.map((t) => t.id));
    const mine = input.traces.filter((t) => t.chatId === chat.id);
    const orphans = mine.filter((t) => !turnIds.has(t.turnId)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const id of promptIdsOf(mine)) usedPrompts.add(id);
    const notes = input.notes.get(chat.id);
    const aiTurns = chat.turns.filter((t) => t.role === 'ai');
    const rec = aiTurns.filter((t) => byTurn.has(t.id)).length;
    const noteN = (notes?.chat ? 1 : 0) + Object.keys(notes?.turns ?? {}).length;
    replies += aiTurns.length;
    recorded += rec;
    notesCount += noteN;
    const first = chat.turns.find((t): t is UserTurn => t.role === 'user');
    const title = first?.text || chat.refs[0]?.source.label || 'Studio chat';
    const dir = `chats/${String(i + 1).padStart(2, '0')}-${slug(title)}`;
    const traceMap = new Map(mine.map((t) => [t.turnId, t]));
    files.set(`${dir}/conversation.md`, conversationMd(item, traceMap, notes, input.prompts, orphans));
    // The chat as stored (each picture named, never its data), with its records and notes.
    const stored = lean(chat);
    files.set(
      `${dir}/raw.json`,
      JSON.stringify(
        {
          format: REVIEW_FORMAT,
          exportedAt: input.exportedAt,
          version: input.version,
          list: item.list,
          recorded: rec === 0 && mine.length === 0 ? 'no behind-the-scenes record' : `${rec} of ${aiTurns.length} replies`,
          chat: stored,
          notes: notes ?? null,
          traces: Object.fromEntries(mine.map((t) => [t.turnId, t])),
        },
        null,
        1,
      ),
    );
    index.push(`| ${i + 1} | ${title.replace(/\|/g, '/').slice(0, 80)} | ${item.list === 'panel' ? '✦ Write panel' : 'studio'} | ${aiTurns.length} | ${rec === 0 ? 'no behind-the-scenes record' : `${rec}/${aiTurns.length}`} | ${noteN} | ${dir}/ |`);
  });
  for (const id of usedPrompts) {
    const text = input.prompts.get(id);
    if (text !== undefined) files.set(`prompts/${id}.txt`, text);
  }
  files.set('index.md', index.join('\n') + '\n');
  files.set('HOW-TO-READ.md', HOW_TO_READ);
  return { files, chats: ordered.length, replies, recorded, notes: notesCount };
}
