/**
 * The teacher's own arrangement of the Past paper bank (k-0556, users u-dqw8 + u-o86n):
 * every question under its syllabus part and bank topic, in an order the teacher sets, and
 * questions moved from one topic to another. It is the teacher's view only: the bank's files
 * never change, and nothing here is a document.
 *
 * A question is known by its key (its source tag, `DSE2024/P1/Q38`, unique across the bank).
 * The arrangement stores, per topic the teacher changed, that topic's questions in their
 * order; every other topic keeps the bank's order. A question listed under a topic is in that
 * topic, wherever the bank files it. So:
 *  - a question the bank adds later goes to the end of its own topic (or into the bank's order
 *    there when the teacher never changed that topic);
 *  - a question the bank drops is dropped from the lists when read;
 *  - a topic the bank drops gives its questions back to their own topics.
 */

/** One question of the bank, in the bank's order: its key and the topic the bank files it under. */
export interface ArrangeRow {
  key: string;
  topicId: string;
}

/** What is stored: per changed topic, its questions' keys in the teacher's order. */
export interface Arrangement {
  topics: Record<string, string[]>;
}

export const EMPTY_ARRANGEMENT: Arrangement = { topics: {} };

/** The topics' questions in the bank's own order (topics in `topicIds` order, each present). */
export function defaultLists(rows: readonly ArrangeRow[], topicIds: readonly string[]): Map<string, string[]> {
  const lists = new Map<string, string[]>(topicIds.map((id) => [id, []]));
  for (const row of rows) lists.get(row.topicId)?.push(row.key);
  return lists;
}

/**
 * Every topic's questions as the teacher arranged them: the stored lists first (keys the bank
 * no longer has, or already placed, dropped), then each question no list claims in its own
 * topic, in the bank's order. Every topic of `topicIds` is in the map; every row lands once.
 */
export function arrangeLists(rows: readonly ArrangeRow[], topicIds: readonly string[], arrangement: Arrangement): Map<string, string[]> {
  const known = new Set(rows.map((row) => row.key));
  const claimed = new Set<string>();
  const lists = new Map<string, string[]>();
  for (const id of topicIds) {
    const stored = arrangement.topics[id];
    if (!stored) {
      lists.set(id, []);
      continue;
    }
    const list: string[] = [];
    for (const key of stored) {
      if (!known.has(key) || claimed.has(key)) continue;
      claimed.add(key);
      list.push(key);
    }
    lists.set(id, list);
  }
  for (const row of rows) {
    if (claimed.has(row.key)) continue;
    const list = lists.get(row.topicId);
    if (!list) continue;
    claimed.add(row.key);
    list.push(row.key);
  }
  return lists;
}

/** The lists as an arrangement: only the topics whose list differs from the bank's. */
export function storedFrom(lists: ReadonlyMap<string, readonly string[]>, defaults: ReadonlyMap<string, readonly string[]>): Arrangement {
  const topics: Record<string, string[]> = {};
  for (const [id, list] of lists) {
    const home = defaults.get(id) ?? [];
    const same = list.length === home.length && list.every((key, i) => key === home[i]);
    if (!same) topics[id] = [...list];
  }
  return { topics };
}

/**
 * The lists with `keys` taken out of wherever they are and put, in the order given, into
 * topic `to` before the question `before` (at the end when absent, or when `before` is one of
 * the keys moved or not in that topic).
 */
export function moveKeys(
  lists: ReadonlyMap<string, readonly string[]>,
  keys: readonly string[],
  to: string,
  before?: string,
): Map<string, string[]> {
  const moving = new Set(keys);
  const next = new Map<string, string[]>();
  for (const [id, list] of lists) next.set(id, list.filter((key) => !moving.has(key)));
  const target = next.get(to);
  if (!target) return new Map([...lists].map(([id, list]) => [id, [...list]]));
  const at = before === undefined || moving.has(before) ? -1 : target.indexOf(before);
  target.splice(at < 0 ? target.length : at, 0, ...keys);
  return next;
}

/**
 * One topic back to the bank's order: its stored list goes, questions moved into it go back to
 * their own topics, and its own questions moved elsewhere come back.
 */
export function resetTopic(arrangement: Arrangement, topicId: string, rows: readonly ArrangeRow[]): Arrangement {
  const own = new Set(rows.filter((row) => row.topicId === topicId).map((row) => row.key));
  const topics: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(arrangement.topics)) {
    if (id === topicId) continue;
    topics[id] = list.filter((key) => !own.has(key));
  }
  return { topics };
}

/**
 * The lists after a keyboard move of `keys` one place up (-1) or down (+1) among `visible`
 * (the keys shown, in screen order, across topics): the block goes before the shown question
 * above it, or after the one below it. Past the first or last question of a topic it crosses
 * into the next topic shown (`topicOrder` gives each topic's shown keys). Undefined at the
 * very top or bottom.
 */
export function stepKeys(
  lists: ReadonlyMap<string, readonly string[]>,
  shown: ReadonlyArray<{ topicId: string; keys: readonly string[] }>,
  keys: readonly string[],
  direction: -1 | 1,
): Map<string, string[]> | undefined {
  if (keys.length === 0) return undefined;
  const moving = new Set(keys);
  const flat = shown.flatMap(({ topicId, keys: list }) => list.map((key) => ({ topicId, key })));
  const positions = flat.flatMap((entry, i) => (moving.has(entry.key) ? [i] : []));
  if (positions.length === 0) return undefined;
  const ordered = positions.map((i) => flat[i].key);
  if (direction < 0) {
    const first = positions[0];
    const topicId = flat[first].topicId;
    const above = flat.slice(0, first).reverse().find((entry) => !moving.has(entry.key));
    // The first question of a topic goes to the end of the topic shown above.
    const topicStart = flat.findIndex((entry) => entry.topicId === topicId);
    if (first === topicStart || !above || above.topicId !== topicId) {
      const at = shown.findIndex((s) => s.topicId === topicId);
      const prev = shown.slice(0, at).reverse()[0];
      if (!prev) return undefined;
      return moveKeys(lists, ordered, prev.topicId);
    }
    return moveKeys(lists, ordered, topicId, above.key);
  }
  const last = positions[positions.length - 1];
  const topicId = flat[last].topicId;
  const below = flat.slice(last + 1).find((entry) => !moving.has(entry.key));
  if (!below || below.topicId !== topicId) {
    // The last question of a topic goes to the top of the topic shown below.
    const at = shown.findIndex((s) => s.topicId === topicId);
    const next = shown[at + 1];
    if (!next) return undefined;
    const head = next.keys.find((key) => !moving.has(key));
    return moveKeys(lists, ordered, next.topicId, head);
  }
  // After the question below: before the one after it in its topic's whole list.
  const list = lists.get(topicId) ?? [];
  const after = list.slice(list.indexOf(below.key) + 1).find((key) => !moving.has(key));
  return moveKeys(lists, ordered, topicId, after);
}

/** Read a stored value tolerantly: anything unknown or malformed drops only itself. */
export function parseArrangement(raw: unknown): Arrangement {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { topics: {} };
  const topicsRaw = (raw as { topics?: unknown }).topics;
  if (typeof topicsRaw !== 'object' || topicsRaw === null || Array.isArray(topicsRaw)) return { topics: {} };
  const topics: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(topicsRaw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    topics[id] = list.filter((key): key is string => typeof key === 'string' && key !== '');
  }
  return { topics };
}
