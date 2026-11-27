# Independent review of DIAGRAM-COVERAGE.md (k-0583)

> **Copy in the repo (k-0590, 2026-11-27).** Written as `FABLE-REVIEW.md` in `Outbox/k-0583/`; the text below is unchanged. It reviews the first draft of [`COVERAGE-2026-11.md`](./COVERAGE-2026-11.md) (then `DIAGRAM-COVERAGE.md`), so its row numbers are the draft's, which moved; the report's "Fable review" section maps each finding by type id. The `/root/scratch/…` files and `evidence/` it cites stayed on the server that ran the review.

Reviewer: Fable 5.2, 2026-11-27. Code read at `origin/develop` 8369cd4b. No tracked file changed, no model called.

## Verdict

1. The report's evidence is sound: I re-checked 20 rows against the pictures and found two small miscounts and no wrong example.
2. Its four headline findings hold, but two are stated too strongly: "no route to a flow figure" and "a revenue box at a fixed price fails".
3. Two AI ratings are too generous (rows 5 and 13); corrected totals are **16 supported, 13 partial, 4 missing**.
4. There are at least seven silent wrong figures, not three. They share one cause: two things drawn on the same spot pass every check.
5. I would change the order: prompt routing and a "drawn alike" guard first, then the value-added chain on its own, then B together with the studio-graphs session.

## 1. Missed or misgrouped types

My own list (written before opening the draft: `/root/scratch/k0583/fable/phaseA.md`) had 37 types. The report misses no frequent figure. Differences:

| Change | Why |
|---|---|
| Split row 25 (money market) | 7 of its 14 Paper 1 questions are the three-Ms, three-Md figure with five lettered points (2017, 2019, 2021, 2022, 2025, 2026, PP). 6 are one money-demand curve shifting, with no Ms at all (2013 Q27, 2015 Q28, 2016 Q29, 2018 Q29, 2020 Q28, 2023 Q29). They need different fixes. |
| Split row 30 (PPF / CPF) | The single-economy PPC is a core compulsory figure and the AI draws it. Inside row 30 it reads as "partial, elective only". |
| Split gap 6 (flow figures) | Value-added chains are 6 of the 9 HKDSE papers and the editor's flow template already draws that exact figure. Circular flow and the stages triangle (1 + 3 papers) are the ones that need editor work. |
| Add externality as a row | The brief names it as a textbook figure that counts. The report keeps it out of the 33 and offers "35" as an alternative; the 35 is the right headline. One Paper 2 does give an MSC-labelled figure: DSE2016/P2/Q11(b), "Figure 1 (S = MSC and D)" (card line 1059). |
| Merge rows 2 and 3 | One figure, one route. |
| Not common by the report's own rule | Row 6 (two markets): no HKDSE paper, and it is a layout, not a figure type. Row 8 (elasticity read off curves): 1 HKDSE paper. Row 33 (pie): 1 HKDSE paper, 2012. |
| Listed twice | DSE2015/P1/Q22 is counted in row 17 and also under "special, out of scope". DSE2024/P1/Q6 is in row 22 and in the specials list of `merged.json`. |

## 2. Ratings

By hand: I agree with all 33 on the strength of the template list, but I did not drive the editor, so these are not verified. Three I doubt: row 32 (the line chart holds 12 categories; DSE2025/P1/Q45 is a daily series of about 25 points), row 19 (the 0–100 numbered grid of DSE2019 Q19 and 2025 Q23), row 21 (DSE2021 Q23 has a downward arrow to an unboxed "increase in inventory").

AI today. "Probe" means I compiled a spec with the real compiler and looked at the picture (`/root/scratch/k0583/fable/p1`, `p2`).

| Row | Report | Mine | Evidence |
|---|---|---|---|
| 1–3, 10, 15, 17, 23 | supported | agree | prompt: curves is for "demand and supply shifts, elasticity and revenue, fixed supply, AD-AS, the PPC and plain graphs". Probe `x-tax-horizD` (horizontal D, DSE2025 Q22) ok. Numeric ticks ok (`y-numbers`). |
| 4 | supported | agree | probe `d-lattice-3x3` ok, five named crossings |
| **5** | supported | **partial** | All four HKDSE figures are one curve with two lettered dots, no ticks (I opened 2015 Q15, 2019 Q17, 2022 Q14, 2024 Q17). The prompt's own tool for this is `marks` ("a lettered point inside / on / outside a curve"). Two `on` marks land on one spot, status ok (probe `x-marks-along`). The report's recipe works, and works cleanly with blank guide levels (`y-move-blank`), but no prompt line leads a model to it. The report rates row 25 partial for the same reason. |
| 6, 7, 8 | partial / supported | not verified | read only |
| 9 | supported | agree, gap overstated | see 4(d) |
| 11 | partial | agree | probe `e-two-brackets`: one bracket, both labels on it, ticks doubled, status ok |
| 12 | partial | agree | prompt: "ALWAYS use a scene for these… never compose them from curves"; the scene has one price line. `b-ceiling-lowered` in curves compiles, but P_b came out above P_a. |
| **13** | supported | **partial** | Same case as row 12. The `priceFloor` scene has one line (`sceneCatalogue.ts:292`). Two of the three HKDSE Paper 1 floor figures change the floor from P1 to P2 (2020 Q20, 2023 Q17), and 2013 Q14 does too. The prompt forbids the curves route the report cites. |
| 14 | partial | agree | scene `quota` ok (`x-quota-scene`); two-state only by template |
| 16 | supported | agree | gap (three S curves, 2024 Q20) correctly noted |
| 18 | supported | borderline | 4 of 9 HKDSE questions are the old / new pair, which cannot be drawn (4(e)). By the report's definition of partial this row qualifies. |
| 19 | partial | agree, note wrong | "No curve role for a bow" is wrong: role graph, shape convex, plus an `origin` line draws one Lorenz curve with free labels (`x-lorenz-graph`). Two bows cannot differ: they coincide, status ok (`y-lorenz-place`). |
| 20–22, 33 | missing | agree | see 4(a) |
| 24 | partial | agree | see 4(c) |
| 25 | partial | agree | see 4(b) |
| 26 | supported | not fully verified | lines of different shape are fine; two lines of the same shape coincide (see 4(e)), which DSE2025 Q39 (two flat lines) may hit. Not probed. |
| 27 | partial | agree | graph role has no wave (`x-biz-graph`) |
| 28 | supported | agree | scene ok |
| 29 | partial | agree, "template only" wrong | The brace figure of DSE2016 Q42 and 2019 Q43 draws in curves with a world level and a gap labelled "Import quota" (`y-iq-brace-nopts`, ok). Only the kinked-S form (2017 Q42, 2022 Q44) needs the template. |
| 30 | partial | agree | a frontier is always concave; no linear PPF (`x-ppf-linear2`) |
| 31 | partial | agree | see 4(c) |
| 32 | supported | agree | |

Where the prompt steers (`src/diagramGen/prompt.ts`, DECIDE block):

- Rows 25, 29, 19, 30, 31: `kind "template": … when neither a scene nor kind "curves" can draw it (an import quota, monopoly, money market, Lorenz curve, PPF with trade). Its labels are fixed`.
- Rows 11, 12, 13, 14: `kind "scene": … a price ceiling, a price floor or minimum wage, a quota … ALWAYS use a scene for these`. The quota scene adds `(an IMPORT quota is the template import-quota)`.
- Rows 5, 24: `kind "curves"`. Nothing on a movement along a curve. On AD-AS only: `LRAS vertical; a demand shock moves AD, a cost shock SRAS`.

## 3. Evidence

Rows re-checked against pictures or cards: 1, 4, 5, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29 (my contact sheets `fable/s1`–`s8`). Totals also check: 725 HKDSE questions, 143 pictured; 9 flow papers; 18 / 11 / 4; 58 offered templates.

| Finding | Detail |
|---|---|
| Miscount, row 13 | DSE2013/P1/Q14 ("raises the price floor from P2 to P1", vertical S) is filed only under fixed-supply. Price floor is 10 HKDSE papers, not 9. |
| Mis-tag, row 28 | DSE2020/P1/Q43 has no tariff: it is price before and after trade. Small; the report's note covers the figure. |
| CORRECTIONS.md | The reason given for CE1999/P2/Q45 ("fresh chicken") belongs to CE2009/P2/Q12; 1999 is US quota on garments. CE2006/P2/Q10's stem says "imported good". Moving both to domestic quota is right for the drawn form, but the reasons are wrong. |
| Elective counts | The requirement cards hold no monopoly or PPF entry for 2021–2024 (I searched the cards for DSE2021–2024 Q13–Q16: only 2024 Q13(c), a minimum wage). Both electives are set every year, so 10 and 11 papers are floors. I could not open the papers themselves. |
| Row 24 | 2015 Q27, 2021 Q36, 2024 Q29 appear in both AD-AS rows. I opened all four options of 2015 Q27 and 2024 Q29: each mixes SRAS-only and LRAS panels, so double filing is correct. |

## 4. Load-bearing claims

| Claim | Result | Evidence |
|---|---|---|
| (a) No AI route to any flow figure | **Confirmed in substance, false as written** | The menu hides data templates (`templateMenu()` filters `group !== 'data'`), and no spec field carries boxes. But `compile.ts:329–335` accepts any template id except `blank`: a spec `{kind:"template", template:"flow"}` compiles ok and draws the stock bakery chain (`x-tmpl-flow`). `pie` likewise. So the risk is a stock figure with the wrong content passing as ok. |
| (b) Money market steered to a template though curves draws it | **Confirmed** | Prompt quote above. `c-money-grid` ok and matches DSE2017 Q32. The single-curve case is stronger: curves draws M_a1 → M_a2 exactly (`y-md-shift`), while template `money-demand-shift` adds an Ms line and r0, r1 the question does not have (`y-tmpl-moneyD`). |
| (c) Three specs compile ok but draw a wrong figure | **Confirmed, all three** | `e-two-brackets`, `e-self-adjust` (E1 left of LRAS; no shift size lands on it: small undershoots, large overshoots), `f-monopoly-try`. The monopoly one is hypothetical: the prompt sends monopoly to a template, so a model has to disobey to produce it. |
| (d) Revenue box at a fixed price with a shifting demand fails | **Refuted as a limit** | It fails only when the price is a level. Drawn as a `horizontal` curve the same figure compiles ok with the gain box (`x-fixedrev-horizS`). This is a prompt recipe, not a spec change. |
| (e) Old / new tax schedule cannot be drawn | **Confirmed, and worse** | Two separate `zeroRisingFlat` lines with different `place` and `slope` draw as one line, status ok (`x-taxpair-two`, `x-taxpair-flat`). |
| (f) By hand: 31 supported, 2 partial | **Not verified** | Flow arrows have no dash field (`model/diagram.ts:425`), which supports the two partials. See my three doubts in section 2. |

More silent wrong figures the report does not list, all status ok: two `on` marks stacked (row 5); two same-shape graph lines coinciding (tax pair, Lorenz pair); a data template named by id; labels "LRAS" and "SRAS_0" printed into each other in every self-adjustment probe.

## 5. Ranking and build tasks

- **The score.** Papers × severity ÷ effort is a fair sorting aid, with three flaws. It adds Paper 1 question figures to Paper 2 answer figures, though the studio writes MCQs today. "Partial" scores 0.5 whether the AI draws a stock template or a wrong figure that passes. Nothing weighs how often a model would take the bad route, because no model was run.
- **Task A is three tasks, and 4–6 days is too low.** It holds about ten items across the prompt, the strict schema, the compiler, new checks and a new scene. Every prompt edit needs the 20 live cases re-run and fixtures re-recorded.
  - **A1, prompt only (first, about 1–2 days plus a live run):** money market and single money-demand shifts to curves; the movement-along recipe; the import-quota brace; a fixed price as a horizontal curve. No schema change.
  - **A2, one guard (second, small):** fail when two drawn things coincide (two curves, two marks, two brackets) and when a data template is named. This closes six of the seven silent cases at once. The `through` constraint for SRAS on LRAS is separate and is real compiler work.
  - **A3, spec additions:** tax-shape start and cap, quantity-gap bracket, pie, `subsidyChange`, arrow.
- **Task B** is sized about right, but it should go to the studio-graphs session, not run beside it: it generalises that session's `ceilingDemandRise` and edits the same catalogue. Add the floor (row 13).
- **Task D should split.** D1, value-added chain: 6 HKDSE papers, no editor change, M. By the report's formula 6 × 1.0 ÷ 2 = 3.0, third in the list. D2, circular flow and stages: needs dashed and two-way arrows and a non-column layout. That adds fields to saved documents, so `KNOWN_KEYS` and the backward-compatibility rules apply; the report does not mention this.
- **Task E** is smaller than stated for Lorenz (a depth choice on the existing convex shape plus an end at the top corner), about right for the wave.
- **Task C** stays last and waits on the user's answer about Paper 2.

Order: A1, A2, D1, B (with studio-graphs), A3, E, D2, C.

## 6. Method biases and blind spots

- **Pictured questions only.** The studio will write MCQs whose figure never existed in a paper (a tax MCQ: 43 questions, 1 pictured). Demand for those is unmeasured.
- **Paper 2 is a summary, not the papers.** It repeats questions across files and has no electives for 2021–2024.
- **One model family screened everything**, and the same family wrote the vocabulary. The author's 24-of-24 sample is reassuring; mine found two slips in about 155 questions.
- **Offline probes prove "can", not "does".** Ratings marked O say a hand-written spec compiles. Only the 20 live cases say what a model returns. Money market, AD-AS with LRAS, the lattice and tax pairs have no live case.
- **The probe bypasses the reply parser** (it merges into `emptySpec`). My `chart.type: "pie"` probe drew a bar chart, but the strict schema may reject it first. Not verified.
- **CE and AL papers** lift "all papers" for types the HKDSE has dropped (row 6, hyperbola demand). The HKDSE column is the one to rank by, as the report does.
- **Syllabus.** `hkdse2025.data.ts` excludes tariff and quota welfare areas, yet row 28 is "supported" partly on the welfare scene. The reverse risk is unexamined: figures the 2025 guide adds.
- **The common rule** counts papers, not marks or recency. Circular flow has one HKDSE paper, but it is 2026.

## 7. Five statements I would change

1. "The AI cannot draw any flow figure … effort L" → the value-added chain (6 of 9 papers) is a medium task on the existing template; only circular flow and stages need editor work.
2. "18 supported, 11 partial, 4 missing" → 16, 13, 4 (rows 5 and 13 are partial), and 35 types with externality and cost curves.
3. "Three hand-written specs … draw a wrong figure" → at least seven, six of them one fault: coincident geometry passes the checks.
4. Gap 10, "the spec fails" → it draws when the fixed price is a horizontal curve; a prompt line fixes it.
5. "Import quota: template only" and "no curve role for a bow" → the brace form and a single Lorenz curve already draw in curves; like money market, these are routing gaps.

## What I verified and how

- Read whole: `prompt.ts`; `types.ts` to line 330; the `when:` lines and the `priceFloor` entry of `sceneCatalogue.ts`; the template, Shade and group lists in `registries.json`.
- Opened 8 contact sheets (`/root/scratch/k0583/fable/s1_flow.png` … `s8.png`): the first picture of 155 pictured questions, plus every option of 4 option sets. Read the stems of all 235 pictured questions.
- Ran 40 probes: 10 of the author's re-run, 30 of mine (`fable/specs-p1.json`, `specs-p2.json`; pictures `fable/p1/sheetA.png`, `sheetB.png`, `fable/p2/sheet.png`).
- Recounted from `evidence/merged.json`: per-type HKDSE question lists, the 9 flow papers, the 24 AD-AS papers, the supported / partial / missing totals.
- Not verified: the hand-drawing ratings in the editor UI; rows 6, 7, 8 and 26 for the AI; the Paper 2 papers themselves; anything about what a live model returns.
- I created no file in the worktree (I used the existing probe test) and edited nothing in Outbox but this file.
