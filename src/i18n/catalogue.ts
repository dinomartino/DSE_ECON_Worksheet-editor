import type { UiLanguage } from '@/settings/language';

/**
 * Interface text catalogues. Each area keeps its own in a `messages.ts` beside its
 * components (`docs/RECIPES.md` § Translate an area's interface text). An entry holds both
 * languages; a function entry takes the same arguments on both sides.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any parameter list; CheckEntry pins both sides to one
type MessageFn = (...args: any[]) => string;
export type MessageEntry =
  | { readonly en: string; readonly zh: string }
  | { readonly en: MessageFn; readonly zh: MessageFn };
export type Catalogue = Readonly<Record<string, MessageEntry>>;
/** A label that may come from a catalogue: plain English, or an entry. */
export type UiText = string | { readonly en: string; readonly zh: string };

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** A mismatched entry turns into the shape it should have had, so the error names it. */
type CheckEntry<T> = T extends { en: infer E; zh: infer Z }
  ? E extends string
    ? Z extends string
      ? T
      : { en: string; zh: string }
    : E extends (...args: infer A) => string
      ? Z extends (...args: infer B) => string
        ? Same<A, B> extends true
          ? T
          : { en: E; zh: E & { readonly mismatch: 'zh must take the same arguments as en' } }
        : { en: E; zh: E }
      : never
  : never;

/** A catalogue resolved to one language: strings stay strings, functions keep their type. */
export type Messages<C extends Catalogue> = {
  readonly [K in keyof C]: C[K]['en'] extends string ? string : C[K]['en'];
};

/** The keys of a catalogue's plain-string entries, for tables of options: `label: TextKey<typeof M>`. */
export type TextKey<C extends Catalogue> = { [K in keyof C]: C[K]['en'] extends string ? K : never }[keyof C];

const registry: Catalogue[] = [];

/** Declares a catalogue; it also joins the registry the guard tests read. */
export function defineMessages<C extends Catalogue>(catalogue: C & { [K in keyof C]: CheckEntry<C[K]> }): C {
  registry.push(catalogue);
  return catalogue;
}

/** Every catalogue defined so far, in definition order (the guard tests' input). */
export function registeredCatalogues(): readonly Catalogue[] {
  return registry;
}

export type Side = 'en' | 'zh';
export const sideOf = (lang: UiLanguage): Side => (lang === 'zh-HK' ? 'zh' : 'en');

const resolved = new WeakMap<Catalogue, Partial<Record<Side, object>>>();

/** Memoised per catalogue and language, so the result keeps its identity across renders. */
export function resolveMessages<C extends Catalogue>(catalogue: C, lang: UiLanguage): Messages<C> {
  const side = sideOf(lang);
  let sides = resolved.get(catalogue);
  if (!sides) resolved.set(catalogue, (sides = {}));
  let out = sides[side];
  if (!out) {
    out = Object.fromEntries(Object.entries(catalogue).map(([key, entry]) => [key, entry[side]]));
    sides[side] = out;
  }
  return out as Messages<C>;
}

export function localize(text: UiText, lang: UiLanguage): string {
  return typeof text === 'string' ? text : text[sideOf(lang)];
}
