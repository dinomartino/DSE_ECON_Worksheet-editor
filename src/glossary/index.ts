// The glossary's public face. It never re-exports anything that imports the data file:
// the JSON is reached only through `load.ts`'s dynamic import.
export * from './types';
export { GLOSSARY_ATTRIBUTION } from './attribution';
export { loadGlossary } from './load';
