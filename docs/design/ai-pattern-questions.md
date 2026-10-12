# Write a question like this one — design proposal

Status: proposal, 2026-10-12, against `develop` at `fecd5ed4`. Not built; queued after C9.
Copyright background: `docs/research/2026-09-question-bank.md` (HKEAA licence). The recipe
builder (§ Recipes) comes from `docs/research/2026-10-node-question-builder.md`. Not legal
advice; confirm with HKEAA or a lawyer before release.

The ask (the user): "recreate a question based on a past paper reference, by AI"; then, after
ComfyUI: connect the teacher's idea, pasted data, a 題庫 reference, the skill and topic, and
for MC the trap behind each wrong option, into one question.

## The rule that shapes everything

**The AI gets a pattern, never past-paper text.** A pattern says what a question tests and
how, without its wording: topic, type, marks, command words, stimulus kind, diagram. Copyright
protects the wording, figures and scenario; the HKEAA licence also forbids "use with AI
tools". A pattern built on the teacher's machine, with no AI, keeps both intact.

- Econ Studio ships no HKEAA text (`docs/IDEAS.md` § Deliberately not doing).
- The model is never told a year or question number: a citation invites a memorised copy.
- Every result passes a local near-copy check before it is inserted.

## Teacher stories

1. I imported my school's 2019 Paper 2 (Import, 0.8.0). In the 題庫 I select Q4(b) and press
   ✦ **Write one like this**. A new 4-mark price-ceiling question with a diagram, a new
   context and new figures lands under the same sub-topic.
2. In my paper I select an MC question and press ✦ **Write one like this** ×3: three new MC
   questions, same skill, inserted after it.
3. I'm on the 題庫's "Price ceiling" page with nothing selected: ✦ **Write a question** offers
   the patterns this sub-topic's questions share ("4–6 mark explain with a diagram, seen 5
   times"), and writes from the one I pick.

## The pattern

Derived, never stored in a document. One per question (a structured question: per part).

```ts
interface QuestionPattern {
  topics: string[];            // codes from tags, e.g. ['C.pc'] (model/topics.ts)
  kind: 'mcq' | 'structured';  // registry type id, read from the question, never branched on
  mcq?: { combination: boolean; options: number };      // "1 and 2 only" style or plain
  parts?: Array<{
    marks?: number;
    command: string[];         // 'explain', 'with the aid of a diagram', 'compare', ...
    diagram?: string;          // a Graph preset id (src/model/diagram.ts), not coordinates
  }>;
  stimulus: 'none' | 'text' | 'table' | 'figure' | 'source';  // what the stem leans on
  language: 'en' | 'zh' | 'bilingual';
}
```

- **Read locally** (`src/generate/pattern.ts`, pure, no AI): topics from tags; marks from the
  question; command words by a bilingual word list (`explain` / 解釋, `with the aid of a
  diagram` / 試繪圖, …); stimulus from the content blocks; diagram from the question's
  diagram preset. Untagged questions run `suggestTopics` first and use its top topic.
- **What leaves the machine:** the pattern, rendered as plain sentences. No stem, option,
  figure, table cell or answer text. A test feeds a real imported question through and
  fails if any 6-word run (or 8 CJK characters) of it reaches the prompt.
- **Shown before running?** No pre-insert review (AI door decision). The ✦ menu row names the
  pattern in one line ("4-mark explain with a diagram · Price ceiling") so the teacher sees
  what will be asked.

## Writing and checking

- **Engine:** the E3 engine (`src/generate/run.ts`, `build.ts`, `validate.ts`) with a new
  input: a pattern instead of a pasted source. `recipeFor` still limits what the paper can
  hold (a Paper 1 gets MC only). The prompt asks for an original question: new context,
  new figures, same skill, the paper's language sides.
- **Near-copy check** (`src/generate/nearCopy.ts`, local): shingle the result (6-word runs in
  English, 8-character runs in 中文) and compare it with every 題庫 row's text and the
  reference question. Over the limit (start at 30% containment, tune on evals) → one retry
  with "too close to an existing question", then fail with a plain notice. Never inserted.
- **Where it lands:** in the editor, after the reference (or at the selection); in the 題庫,
  in the one bank (`oneBank`), tagged with the pattern's topics. Lineage: an original (its
  own `rootId`), so it is never "another version" of the past-paper question.
- **Diagrams:** only from a preset (E6 rule: never raw model coordinates). If the pattern
  needs one the presets lack, the question is written with an empty diagram area for the
  teacher to draw.

## Marking HKEAA material

Without knowing which questions are HKEAA's, nothing can be warned or kept pattern-only.

- **Import detects it:** a file whose text says "HKDSE", "Hong Kong Examinations and
  Assessment Authority", 香港考試及評核局, "Licensed by copyright owner" or a DSE paper heading
  marks every question it brings in.
- **Stored per question** (it travels into the bank): an optional question field, e.g.
  `origin?: { by: 'hkeaa'; cite?: string }`, metadata to `contentKey` (add it to
  `src/library/contentKeyFields.test.ts`'s classification). New optional field, no
  migration; check it survives save, load, copy and sync like `lineage` does.
- **Teacher can set or clear it** in the question's Edit panel ("From an HKEAA paper").
- **What it changes:** Write one like this always sends the pattern only (as for every
  question in stage 1); ✦ Translate, Fill and Re-translate warn once per run that the HKEAA
  licence does not allow AI tools, and offer to skip those questions. Check terms is keyless
  and stays silent.
- Later, separately: print the licence's particulars line on copied HKEAA questions.

## Recipes: the ComfyUI idea, form first

ComfyUI builds an image from a graph of typed nodes, saved as a workflow file; a reference
steers the result through a separate input (LoRA, IPAdapter, ControlNet) without being
copied. The same split fits questions: the reference gives structure, the teacher gives
content. Research: `docs/research/2026-10-node-question-builder.md`.

- **A recipe** is a typed, versioned spec for one question. Inputs: Idea (the teacher's
  words), Data (a pasted table), Reference (a 題庫 question; output type `pattern` only, so
  no wiring can send its text), Topic and skill, Command and marks, Trap (one per wrong
  option), Stimulus (none, text, table, or a Graph preset), Language. Output: MC or
  structured, or Add to 題庫.
- **Form, not canvas, for teachers.** Every node tool studied added a form view over its
  graph for non-experts (ComfyUI App mode, Figma Weave, Krea, Dify, Opal); no teacher tool
  uses a canvas. ✦ **Write from a recipe…** opens a dialog with the recipe's fields; the
  graph is the data model. A React Flow canvas (MIT; never ComfyUI code, which is GPL-3.0)
  only if teachers ask.
- **One AI call per run**: the recipe compiles into one structured-output call (stem, key,
  each wrong option with its trap and why). Cheaper, and the options stay coherent.
- **Traps.** For MC, three rows, one per wrong option: a misconception for the topic from a
  curated bilingual list, "Let the AI choose", or "My own…". Prompts name the misconception
  before the option and give the model the key and reasoning (DiVERT 2024; both measurably
  improve wrong options). Combination items ("(1) and (2) only"): the model writes the
  statements and their truth; the four options and the key are computed locally.
- **Regenerate one part, like ComfyUI's cache.** After insert (no review gate), ✦ **Rewrite
  this wrong answer** keeps its trap, ✦ **Use a different trap** swaps it, ✦ **Rewrite
  statement** recomputes the combination options. One commit, one Undo each.
- **Item lint** (local) after every run: the key is the longest option, uneven option
  lengths, duplicate options, "all/none of the above", an unbolded negative stem, answer
  letters unbalanced across the paper. About half of AI-written items have such flaws.
- **Recipe files**: JSON with `recipeVersion` from day one and the documents' compatibility
  promise; data only, no keys; a Reference saves its pattern, never text. Shared through the
  library folder. Not embedded in the exported `.docx`: it goes to students and traps give
  the answers away.
- E7 Write one like this is the simplest built-in recipe; E3 is Data → MC; E1 and E4 are
  later nodes, all still behind `PAUSED_VERBS`.

## Stages

1. **Pattern + write + near-copy check + item lint**, ✦ Write one like this on a selected
   question (editor and 題庫), with a Traps field for MC and the per-option ✦ verbs.
   Pattern-only for every question. Behind `PAUSED_VERBS` until live evals pass (a fixed set
   of invented reference questions and traps, scored on: each wrong option shows its trap,
   exactly one key, no longest-option cue, near-copy rate; no HKEAA text in the repo).
2. **HKEAA marking** at import, the Edit panel switch, the ✦ Translate/Fill warning.
3. **Recipes**: the model, the form, 3 built-in recipes (MC with three traps, Combination
   MC, Data-response with parts), and the misconception list.
4. **Sub-topic patterns** in the 題庫 (story 3), and recipe files saved and shared.
5. Canvas, only on demand.

## Questions for the user

1. **Questions not marked HKEAA** (your school's own): pattern only too, or send the full
   text for a closer style? Recommended: **pattern only in stage 1**; full text is a later
   switch, since an unmarked question may still be HKEAA's.
2. **How many per press:** one, or a choice of 1/3/5? Recommended: **1, with ×3 in the
   menu** for MC.
3. **Answers:** should it also write the answer / marking scheme? Recommended: **yes for MC
   (the key), yes for structured** once E1 (answers) is unpaused; until then the question
   only.
4. **Form or canvas:** is the form with a trap picker enough, or will teachers wire nodes?
   Recommended: **form first**.
5. **The misconception list:** who writes it, how many per topic (both languages, paper-side)?
   Recommended: **AI drafts from topic names, you review**, about 5 per sub-topic.
6. **Where a trap is kept after insert:** this session only, or a teacher-only note on each
   option (new optional field, printed in the Teacher version as "why it is wrong")?
   Recommended: **session only first**.

## Risks

- Quality: a pattern carries less than the original; evals decide, as for E1/E3/E4. AI wrong
  options are usually valid but often not real misconceptions (Feng 2024), hence the trap list.
- A memorised past question can still come back without a citation; the near-copy check only
  sees what the 題庫 holds. If the teacher never imported that paper, it cannot catch it.
- Command-word lists miss phrasings; unknown commands fall back to the question's type alone.
