/**
 * The HKDSE Economics Paper 1 MC house style (k-0548): a fixed prompt block for any AI call
 * that writes or improves a Paper 1 question, and the deterministic check of the same rules.
 * Not tied to the Question studio: k-0549's wording enhancement reads the same module.
 */
export { DSE_STYLE_MARKER, DSE_STYLE_PROFILE, DSE_STYLE_PROFILE_VERSION } from './profile';
export { checkDseStyle, optionNumber, STYLE_FINDING_IDS } from './check';
export type { StyleFinding, StyleFindingId, StyleItem, StyleSide, StyleText } from './check';
export { styleItemOf, type BankQuestion } from './bank';
export { DSE_STYLE_MESSAGES, styleFindingText, type DseStyleMessages } from './messages';
