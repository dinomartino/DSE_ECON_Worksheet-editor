# Diagram coverage audit: which common HKDSE Economics figures the editor and its AI can draw (k-0583)

> **Copy in the repo (k-0590, 2026-11-27; user u-lze6 agreed).** Written as `DIAGRAM-COVERAGE.md` in `Outbox/k-0583/`; the text below is unchanged. Here `FABLE-REVIEW.md` is [`COVERAGE-2026-11-FABLE-REVIEW.md`](./COVERAGE-2026-11-FABLE-REVIEW.md) and `pictures/` is [`COVERAGE-2026-11-pictures/`](./COVERAGE-2026-11-pictures/). `evidence/` (classified figures, raw screener output, probe specs, scripts) stays in `Outbox/k-0583/evidence/` and is not in the repo. A snapshot at `origin/develop` 8369cd4b: counts and ratings age as `src/diagramGen/` changes. "Decisions for you" were open questions then, and its item 7 (the report lives only in Outbox) is now out of date.

2026-11-27 · audit base `origin/develop` 8369cd4b (studio graphs round 3 included) · read only: no source file was changed · asked for by u-6nbo · includes an independent Fable review (`FABLE-REVIEW.md`, saved unedited).

## Summary

- **34 common figure types.** The rule is the brief's: a type counts if it appears in at least 2 papers (HKDSE, HKCEE or HKALE), or is a textbook figure the brief names. 32 types pass on paper evidence (28 of them in at least 2 HKDSE papers; the others pass only through HKCEE papers or textbook status: marked †); 2 more (externality, cost curves) are in no paper and counted because the brief's list names them. One-paper figures are listed separately. Evidence: all 1,759 past-paper MCQs of the bank (725 are HKDSE Paper 1 across 17 papers; 143 of them, 20 %, carry a picture) and the 248 Paper 2 requirement entries of `docs/Diagram_Requirements/` (75 distinct HKDSE questions in 16 Paper 2s).
- **By hand** the editor draws 32 of the 34 fully, 2 partly, 0 not at all (the two flow figures: no dashed arrows, no triangle layout). These ratings come from the template list and my probes of the flow chart; I did not drive the editor.
- **The AI today** (the studio's diagram maker): **15 supported, 14 partial, 5 missing.** Supported = a spec route draws it with the question's own labels. Partial = only a fixed-label template, or a route that lacks a feature the figures need, or one the prompt does not lead a model to. Missing = no route. 9 of the 34 types have a typed scene (11 scenes in the catalogue).
- **What stands out.** (1) **Wrong figures that pass.** At least seven specs compile with status ok and draw a wrong figure; six share one cause, two things drawn on the same spot (stacked brackets, two marks, two same-shape lines, labels printed into each other); picture 4. One guard (task A2) closes six. (2) **Routing.** Money market is in 13 HKDSE papers (level with AD–AS short run) and the prompt sends it, and Lorenz, import quota, PPF trade and monopoly, to fixed-label templates, although kind curves already draws money market (picture 2), a single Lorenz curve and the import-quota brace. The price controls are sent to scenes that draw one state and one price line. (3) **No flow figures.** No spec field carries boxes and arrows: GDP value-added chains (6 HKDSE papers, every other year), the circular flow and the production-stage charts (4 papers). The editor already draws chains, so the chain is an AI-side task; the other two need editor work. Naming template `flow` compiles and draws a stock bakery chain. (4) **The electives dominate Paper 2:** PPF / CPF trade in 11 papers and monopoly in 10 (floors), both template-only.

### Top 10 gaps (ranked by HKDSE papers × severity ÷ effort)

| # | Gap | HKDSE papers (P1 / P2) | Today | Effort | Score | Task |
|---|---|---|---|---|---|---|
| 1 | A guard: two things drawn on the same spot pass every check (stacked brackets, two `on` marks, two same-shape graph lines for a tax pair or two Lorenz curves) | 10 (7 / 3) | wrong figure, status ok (probes e-two-brackets, x-marks-along, x-taxpair-two, y-lorenz-place) | S | 10.00 | A2 |
| 2 | Money market and single money-demand shifts: the prompt sends them to a fixed-label template, though kind curves draws them exactly | 13 (13 / 0) | partial: template only (labels Ms, Md, E; adds an Ms line the question lacks) | S | 6.50 | A1 |
| 3 | Two-state or two-line control figures: lowered ceiling with the DWL band, a floor with two lines or changed, quota changed or demand rising under a quota, floor + supply shift, second shortage bracket | 16 (6 / 10) | partial: the scenes draw one state and one price line, the prompt forbids curves for them; fixed-label templates | M | 4.00 | B |
| 4 | GDP value-added chains (boxes, $ on arrows, branches) | 6 (6 / 0) | missing: no spec field; naming template `flow` draws the stock bakery chain | M | 3.00 | D1 |
| 5 | PPF / CPF trade figures: numeric intercepts, linear PPFs, trade line, consumption point, brackets (Elective 2) | 11 (0 / 11) | partial: fixed-label templates; concave frontier only in curves | M | 2.75 | C |
| 6 | Monopoly: free labels, MR derived from D, MC shift with old and new DWL (Elective 1) | 10 (0 / 10) | partial: fixed-label templates; an improvised MR passes the checks (probe f-monopoly-try) | M | 2.50 | C |
| 7 | Two lettered points on one curve (movement along), with or without an arrow | 5 (5 / 0) | partial: `marks` stacks them; the working recipe (two blank guide levels) is not in the prompt | S | 2.50 | A1 |
| 8 | AD–AS answers: output-gap bracket Y→Yf, an SRAS that must land on LRAS, numbered arrows; a price line through a crossing | 9 (1 / 8) | partial: E1 can come out off the LRAS with status ok (probe e-self-adjust) | M | 2.25 | A3 |
| 9 | Two Lorenz curves of different depth with a numbered grid; the business-cycle wave with a point at a chosen phase | 6 (6 / 0) | partial: fixed-label templates; one Lorenz curve already draws in curves | M | 1.50 | E |
| 10 | Old vs new tax schedule: allowance and cap move independently | 3 (3 / 0) | partial: a shift moves the whole line; same-shape lines coincide (probes g-tax-pair, x-taxpair-two) | S | 1.50 | A3 |

Severity: wrong figure that passes 1.0, missing 1.0, partial 0.5. Effort: S = 1, M = 2, L = 4 (my estimate from reading the code; the reviewer thinks the first version of task A was too small, so it is now split into A1 to A3). The score is a sorting aid: it adds Paper 1 question figures to Paper 2 answer figures (the studio writes MCQs today, so read the P1 / P2 split) and it knows nothing about how often a model would take the bad route, because no model was run.

### Proposed build tasks (in the order I suggest)

| Task | What | HKDSE papers it touches | Effort |
|---|---|---|---|
| **A1** Prompt routing (no code change but the prompt and fixtures) | Money market and single money-demand shifts to kind curves; the movement-along recipe (two blank guide levels); the import-quota brace via curves and a labelled gap; a price fixed in the seller's currency as a `horizontal` curve (the revenue box then draws). Re-run the 20 live cases and re-record the fixtures. | 16 | S, about 1 to 2 days plus a live run |
| **A2** Coincidence guard | Fail (so the repair turn runs) when two curves, two marks or two brackets are drawn on the same spot, when a label is printed into another, and when a data template (`flow`, `pie`) is named. One check closes six of the seven silent wrong figures. | 10 | S, about 1 to 2 days |
| **A3** Spec additions | A `through` constraint (an SRAS or a price line that must pass through a crossing) and a quantity-gap bracket for the output gap; start and cap for the broken tax-graph shapes; a pie in kind chart; a `subsidyChange` scene copied from `taxChange`. | 13 | M, about 3 to 5 days |
| **B** Two-state and two-line control scenes (hand to the studio-graphs session) | Generalise the round-3 `ceilingDemandRise` into a `stage` and a second price line: lowered / raised control with the DWL band, a floor with two lines, quota changed or demand rising under a quota, floor + supply shift, before / after shortage brackets, with corner letters and the key worked out from the drawing. | 16 | M, about 3 to 5 days |
| **D1** Value-added chains for the AI | A spec kind `flow` (nodes, arrows, unboxed notes) compiled to the editor's existing flow chart; checks that every label and number the question names is on the figure. No editor change. | 6 | M, about 3 to 5 days |
| **E** Curved-line figures | Two Lorenz curves of different depth with a numbered grid and no forced equality line; the business-cycle wave with a point at a chosen phase. | 6 | M, about 3 to 4 days |
| **D2** Circular flow and stage charts | Dashed and two-way arrows and a non-column layout in the editor's flow chart (new stored fields: the saved-document compatibility rules apply), then the AI kind from D1 extended to them. | 4 | L, about 1.5 to 2 weeks |
| **C** Elective scenes: monopoly, PPF / CPF trade, import quota | Typed scenes with the question's own labels (MR derived from D, MC variants, DWL bands; linear or concave PPF with numeric intercepts, world-price line, CPF, consumption point, brackets; kinked S with quota rent), including "given figure + the student's answer layer". Waits for your answer on Paper 2. | 14 | L, about 2 to 3 weeks for three scenes |

**Who did what.** The main session (Sonnet 5.5) read the code, ran the probes and wrote this report. Seven Sonnet subagents screened the evidence (about 1.29 million tokens in all): six looked at the 338 bank pictures of the 235 pictured questions, one classified the 248 Paper 2 entries. One Fable subagent (about 0.20 million tokens) reviewed the draft independently and changed several findings: see "Fable review". On your question whether a stronger model should screen and review: screening with Sonnet was accurate enough (24 of 24 random picks right; four mis-tags among the 31 I opened because they looked doubtful, all one vocabulary confusion), and the stronger model earned its cost as the reviewer, where it overturned a claim, two ratings and the count of wrong figures. I would keep that split.

## How to read the tables

- **HKDSE papers**: distinct HKDSE-family papers (HKDSE years, practice and sample papers; Paper 1 and Paper 2 count separately). **All papers** adds HKCEE and HKALE. **Qs P1 / P2**: distinct HKDSE questions drawn from a Paper 1 picture / a Paper 2 requirement entry. † fewer than 2 HKDSE papers (common through HKCEE papers or textbook status). ‡ the brief's textbook rule, no paper evidence.
- **Paper 2 entries are answer diagrams**: of the 248 cards, 185 ask the student to draw the whole figure, 59 give a figure the student completes, 4 only interpret a given figure. Paper 1 pictures are question figures. The spec has one placement per figure, so "given figure + the student's answer layer on it" is two specs today.
- **By hand**: can a teacher draw it with the diagram tool today (a template, or a short recipe of the existing tools). **Scene**: a typed scene in `src/diagramGen/sceneCatalogue.ts`.
- **AI today** uses four routes: *scene* (11 typed scenes), *curves* (straight lines by role, shifts, levels, points, brackets, the Shade presets, a concave frontier, plain-graph lines), *chart* (bar and line) and *template* (the 58 of the editor's 81 templates the model is offered: 16 are replaced by scenes, 7 are blank or data figures hidden from the menu; labels are fixed). Evidence mark: **L** = a live run drew it (the 20 frozen cases of `evals/graphs/cases.ts`, or the live tax-graph run of k-0554); **O** = compiled offline here (probe specs in `evidence/probes/`) or by the repo's tests; **T** = template only. An offline compile proves the route can draw it, not that a model will take it.
- **Needs** are the drawing features at least 35 % of the type's figures use (from the screeners' feature tags).
- **Syllabus** is read from `src/syllabus/hkdse2025.data.ts`: "NOT required" is the guide's own exclusion list.

### What the model is told (`src/diagramGen/prompt.ts`, the DECIDE block)

| Figures | The prompt says | So a model goes to |
|---|---|---|
| price ceiling, floor, minimum wage, quota, tax, subsidy, surplus, tariff | `kind "scene" … ALWAYS use a scene for these … never compose them from curves` | a scene: one state, one price line |
| Lorenz, money market, import quota, PPF with trade, monopoly | `kind "template" … when neither a scene nor kind "curves" can draw it (an import quota, monopoly, money market, Lorenz curve, PPF with trade). Its labels are fixed` | a fixed-label template |
| movement along a curve, AD–AS | `kind "curves"`, with nothing on either | whatever the model improvises (marks stack; an SRAS misses the LRAS) |

## Table 1. Evidence: how often each figure appears and what it needs

| # | Type | HKDSE papers | Qs P1 / P2 | All papers | Example (HKDSE) | Needs |
|---|---|---|---|---|---|---|
| | **Supply and demand** | | | | | |
| 1 | Plain S and D (equilibrium, intercepts) (`sd-equilibrium`) | 2 | 2 / 0 | 4 | DSE2024/P1/Q21 | dashed drops |
| 2 | Single shift of demand or supply in one market (new equilibrium, arrows) (`sd-demand-shift`) | 11 | 6 / 5 | 27 | DSE2023/P1/Q19 | shifts, dashed drops, shading |
| 3 | D and S both shift: 3×3 lattice with five named crossings, 4-point grids, option panels (`sd-double-shift`) | 14 | 14 / 1 | 30 | DSE2019/P1/Q13 | shifts, lettered points, dashed drops |
| 4 | One curve with two lettered points (movement along vs shift) (`sd-movement-vs-shift`) | 4 | 4 / 0 | 5 | DSE2022/P1/Q14 | lettered points |
| 5 | Two markets side by side (substitute, complement, derived demand) (`sd-related-markets`) † | 0 | 0 / 0 | 3 | CE1992/P1/Q2 (CE) | shifts, dashed drops, two markets, lettered points |
| 6 | Labour market: derived demand, imported labour (S local / S local + imported), minimum wage (`labour-market`) | 4 | 1 / 3 | 14 | DSE2024/P1/Q11 | shifts, dashed drops, brackets, horizontal line |
| 7 | Elasticity read off curves (flat vs steep, extremes) (`elasticity-ped`) † | 1 | 0 / 1 | 2 | DSE2020/P2/Q10 | dashed drops, lettered points, numbers, horizontal line, vertical line |
| 8 | Total revenue / expenditure boxes (+ and − rectangles) (`revenue-tr`) | 10 | 0 / 10 | 34 | DSE2019/P2/Q11 | shading, dashed drops, lettered areas, shifts |
| 9 | Vertical supply (tunnel, rent, tickets) with D shift or price (`fixed-supply`) | 6 | 2 / 4 | 20 | DSE2014/P1/Q15 | vertical line, horizontal line, dashed drops, brackets, shifts |
| 10 | Price fixed away from equilibrium: shortage / surplus bracket, revenue P × short side (`fixed-price-gap`) | 7 | 0 / 7 | 24 | DSE2022/P2/Q10 | horizontal line, brackets, dashed drops, shifts, vertical line |
| 11 | Price ceiling: shortage, quantity traded, DWL, CS change (single or two-state) (`price-ceiling`) | 7 | 4 / 3 | 13 | DSE2015/P1/Q19 | horizontal line, dashed drops, shading, lettered areas |
| 12 | Price floor / minimum wage: surplus, unemployment, wage bill, DWL (`price-floor`) | 10 | 4 / 6 | 12 | DSE2020/P1/Q20 | horizontal line, dashed drops, shading |
| 13 | Quota drawn as a kinked or vertical supply (domestic, export, or an import quota without a world price): quota change, D shift under a quota (`quota-domestic`) | 7 | 4 / 3 | 12 | DSE2013/P1/Q19 | vertical line, shifts, kinked lines, dashed drops |
| 14 | Per-unit tax / tariff as a tax: incidence, revenue, DWL, CS loss (`tax-per-unit`) | 8 | 3 / 5 | 11 | DSE2018/P1/Q22 | shifts, dashed drops, shading, lettered points, lettered areas |
| 15 | Per-unit subsidy: consumer / producer benefit, cost, DWL (`subsidy-per-unit`) | 5 | 3 / 2 | 9 | DSE2025/P1/Q20 | shifts, dashed drops |
| 16 | Consumer / producer / total surplus (`surplus-cs-ps`) | 4 | 0 / 4 | 4 | DSE2020/P2/Q10 | lettered areas, dashed drops, shading, horizontal line, shifts |
| | **Tax, income and flows** | | | | | |
| 17 | Tax payment / rate against income (progressive, proportional, regressive; grids and options) (`tax-schedule`) | 8 | 9 / 0 | 20 | DSE2023/P1/Q36 | horizontal line, curved lines |
| 18 | Lorenz curves (two curves, two country panels, 0–100 grid) (`lorenz`) | 4 | 4 / 0 | 4 | DSE2022/P1/Q23 | curved lines, numbers, grid (1)–(4) |
| 19 | Circular flow of income (two-sector; real flow solid, money flow dashed) (`circular-flow`) † | 1 | 1 / 0 | 7 | DSE2026/P1/Q5 | boxes and arrows |
| 20 | GDP value-added chain (boxes, $ on arrows, branches to export and local sales) (`production-chain`) | 6 | 6 / 0 | 13 | DSE2021/P1/Q23 | boxes and arrows, numbers |
| 21 | Three production stages / firm expansion (two-way arrows, labelled X and Y) (`flowchart`) | 3 | 3 / 0 | 7 | DSE2024/P1/Q6 | boxes and arrows |
| | **Macro and money** | | | | | |
| 22 | AD–AS, short run: AD or SRAS shifts (`adas-sr`) | 13 | 9 / 6 | 13 | DSE2021/P1/Q27 | shifts, dashed drops |
| 23 | AD–AS with vertical LRAS: output gap, self-adjustment, growth (`adas-lr`) | 24 | 20 / 11 | 24 | DSE2018/P1/Q28 | vertical line, shifts, lettered points, dashed drops |
| 24 | Money market: Md / Ms (Ma, Mt), interest rate, 3×3 lattice with lettered crossings (`money-market`) | 13 | 14 / 0 | 19 | DSE2017/P1/Q32 | shifts, vertical line, lettered points |
| 25 | Growth-rate lines against time (money supply, price level, inflation) (`quantity-theory`) | 4 | 4 / 0 | 5 | DSE2018/P1/Q37 | time axis, horizontal line, option panels |
| 26 | Business cycle: growth-rate wave around an average line, point A at a phase (`business-cycle`) | 3 | 3 / 0 | 4 | DSE2021/P1/Q39 | curved lines, horizontal line, time axis, lettered points |
| | **Trade and electives** | | | | | |
| 27 | Small open economy with a world price: tariff or free trade (Pw, Pw + t, imports, areas) (`tariff-soe`) | 8 | 7 / 1 | 10 | DSE2014/P1/Q45 | horizontal line, dashed drops, brackets |
| 28 | Import quota: kinked S at the world price, quota brace, quota rent (`quota-import`) | 5 | 4 / 1 | 11 | DSE2022/P1/Q44 | dashed drops, horizontal line, kinked lines, shifts, brackets |
| 29 | PPF / CPF: opportunity cost, comparative advantage, trade line, consumption point, growth (Elective 2) (`ppf-trade`) | 11 | 0 / 11 | 12 | DSE2017/P2/Q15 | lettered points, numbers, curved lines, brackets |
| 30 | Monopoly: D, MR, MC, Qm, Pm, DWL; MC shifts; lump-sum tax (Elective 1) (`monopoly`) | 10 | 0 / 10 | 10 | DSE2019/P2/Q13 | dashed drops, shading, shifts |
| | **Data figures** | | | | | |
| 31 | Line chart of data (CPI, GDP deflator, growth rates, exchange rate) (`data-line`) | 8 | 10 / 0 | 18 | DSE2024/P1/Q25 | time axis, numbers |
| 32 | Pie charts (shares of employment, GDP, tax revenue) (`data-pie`) † | 1 | 1 / 0 | 3 | DSE2012/P1/Q35 | pie, numbers, grid (1)–(4) |
| | **Textbook list (no past-paper evidence)** | | | | | |
| 33 | Externality: MPC / MSC, MPB / MSB, market vs efficient output, DWL (`externality`) ‡ | 0 | - | - | DSE2016/P2/Q11 (S labelled MSC; a price-ceiling figure) | - |
| 34 | Cost curves: TC, MC, AC, AVC, LRAC (`cost-curves`) ‡ | 0 | - | - | - | - |

## Table 2. Coverage: by hand, scene, AI today, what is missing

| # | Type | By hand | Scene | AI today | What is missing (with evidence) | Syllabus | Effort · task |
|---|---|---|---|---|---|---|---|
| | **Supply and demand** | | | | | | |
| 1 | `sd-equilibrium` | supported · `supply-demand` | - | **supported** · curves · L |  | required (C.equilibrium) |  |
| 2 | `sd-demand-shift` | supported · `demand-shift`, `supply-shift` | - | **supported** · curves + shift · L |  | required (C.equilibrium) |  |
| 3 | `sd-double-shift` | supported · `simultaneous-shifts`, `double-shift-grid`; lattice = shift copies + anchored points | - | **supported** · curves: 2 curves, 4 shifts, 5 named points; option panels = figure sets · O | Corner labels sit close to the lines in the lattice (the layout check raised nothing) | required (C.equilibrium) |  |
| 4 | `sd-movement-vs-shift` | supported · manual points and arrows | - | **partial** · the prompt's tool for lettered points on a curve, `marks`, stacks two `on` marks on one spot, status ok (probe x-marks-along); what works is two blank `guide` levels as anchors, which no prompt line teaches [O] | No recipe in the prompt; an arrow along the curve (DSEPP/P1/Q23) | required (C.equilibrium) | S · A1 |
| 5 | `sd-related-markets` | supported · insert the template twice | - | **partial** · one figure per spec; sets exist only for a stem grid or option panels | Two answer diagrams for one part (CE papers only, 3) | required (C.equilibrium) |  |
| 6 | `labour-market` | supported · `labour-importation`, `minimum-wage`, retitled shift templates | priceFloor (market labour) | **supported** · curves with wage axes; scene for a minimum wage · L |  | required (C, B.factors) |  |
| 7 | `elasticity-ped` | supported · `elastic-revenue`, `inelastic-revenue`, `unit-elastic-revenue` | - | **supported** · curves: slope flat/steep, role horizontal/vertical · O | Unit-elastic hyperbola (CE1993, CE1995, CE1998): template only | required (C.ped) |  |
| 8 | `revenue-tr` | supported · `elastic-revenue` etc. + Shade › Revenue | - | **supported** · curves + revenueGain / revenueLoss shades · L | A price fixed in the seller's currency with the demand curve shifting (DSE2014/P2/Q11, DSE2023/P2/Q9): draws correctly when the price line is a `horizontal` curve (probe x-fixedrev-horizS) but FAILS when it is a level ("revenueGain needs two equilibria"): a prompt recipe, not a spec change | required (C.ped) | S · A1 |
| 9 | `fixed-supply` | supported · `fixed-supply` | - | **supported** · curves: role vertical · L |  | required (C) |  |
| 10 | `fixed-price-gap` | supported · `shortage-change`, `fixed-price-revenue`, brackets | (priceCeiling `gap` draws one bracket) | **partial** · curves: one bracket works · O | Second bracket after a shift ("ex. dd0 / ex. dd1"): the two brackets stack on one spot and the check says ok (probe e-two-brackets); needs before/after state | required (C) | M · B |
| 11 | `price-ceiling` | supported · `price-ceiling`, `ceiling-lowered`, `ceiling-demand-falls`, `ineffective-ceiling`, `ceiling-cs-change` | priceCeiling, ceilingDemandRise (new, round 3) | **partial** · scene for one state [L]; two-state only via fixed-label templates [T] | Lowered ceiling with the increase in DWL (DSE2015/P1/Q19, DSE2021/P1/Q17, DSE2012/P2/Q5): template only; ceiling plus a supply shift (DSE2026/P1/Q16); the round-3 scene covers one two-state case | required (C.intervention) | M · B |
| 12 | `price-floor` | supported · `minimum-wage`, `minimum-wage-bill`, `price-floor-dwl` | priceFloor (goods or labour) | **partial** · scene priceFloor draws ONE price line [L]; the prompt says "ALWAYS use a scene… never compose them from curves" | Two price lines or a changed floor (DSE2020/P1/Q20, DSE2023/P1/Q17, DSE2013/P1/Q14; P2: DSE2014/Q3, DSE2024/Q13) and a supply shift after a minimum wage (DSE2013/P2/Q10, DSE2018/P2/Q10) | required (C.intervention) | M · B |
| 13 | `quota-domestic` | supported · `domestic-quota`, `quota-enlarged`, `quota-demand-increase`, `quota-revenue` | quota | **partial** · scene for one state, kinked S [L]; vertical line via a curves level; two-state only via templates [T] | Quota enlarged or abolished, demand rising under a quota with the DWL band D0–D1 (DSE2015/P2/Q3, DSE2016/P2/Q9, DSE2024/P2/Q3, DSE2020/P1/Q16): template only | required (C.intervention) | M · B |
| 14 | `tax-per-unit` | supported · `per-unit-tax`, `tax-efficiency`, `tax-net-revenue`, tax presets | unitTax, taxChange (t1→t2, corner letters) | **supported** · scene; horizontal D via curves role horizontal · L |  | required (C.intervention) |  |
| 15 | `subsidy-per-unit` | supported · `per-unit-subsidy`, `subsidy-efficiency` | unitSubsidy | **supported** · scene · L | Subsidy raised $5→$10 with three parallel S curves and corner letters (DSE2024/P1/Q20, 1 paper): no `subsidyChange` scene | required (C.intervention) | S · A3 |
| 16 | `surplus-cs-ps` | supported · `surplus`, CS / PS presets | surplus | **supported** · scene · L |  | required (C.surplus#diagram) |  |
| | **Tax, income and flows** | | | | | | |
| 17 | `tax-schedule` | supported · `proportional-tax`; kinked and curved lines drawn by hand | - | **partial** · curves role graph draws single graphs and grids [L] (origin, linear, convex, concave, flat, the broken shapes); options as figure sets | Old vs new schedule (4 of the 9 HKDSE questions: DSE2013/P1/Q36, DSE2016/P1/Q36, DSE2026/P1/Q40; CE2001/P1/Q35): a shift moves the whole line, and two lines of one shape coincide whatever place or slope they are given, status ok (probes g-tax-pair, x-taxpair-two) | not listed in src/syllabus (DSE2026 asks three) | S · A3 |
| 18 | `lorenz` | supported · `lorenz`; curved lines (the numbered 0–100 grid of DSE2019 Q19 and 2025 Q23 takes about ten thin lines) | - | **partial** · template `lorenz` only: fixed labels (A before tax, B after tax), always draws the line of equality · T | A single Lorenz curve already draws in curves (role graph, convex, plus an origin line; probe x-lorenz-graph) but the prompt sends Lorenz to the template; two curves of one shape coincide, status ok (probe y-lorenz-place); no numbered 0–100 grid or equality-free layout | required (E.equity#measuring) | M · E |
| 19 | `circular-flow` | partial · flow-chart variant draws a one-way ring of four boxes (probe h-circular-flow); no dashed arrows, so real and money flows look alike; no second loop | - | **missing** · no spec field carries boxes and arrows; the flow template is hidden from the menu, but naming it compiles ok and draws the stock bakery chain (probe x-tmpl-flow) | Whole type; and the editor cannot dash an arrow or draw two flows between one pair | required (A.circular-flow) | L · D2 |
| 20 | `production-chain` | supported · `flow` template (boxed stages, labelled arrows) | - | **missing** · none: no spec field carries boxes; naming template `flow` draws the stock bakery chain, not the question's (probe x-tmpl-flow) | Whole type (6 HKDSE papers, every other year); the editor already draws it, including unboxed notes such as "increase in inventory" (`boxed: false`) | required (F.national-income) | M · D1 |
| 21 | `flowchart` | partial · the flow chart lays boxes out by column only: a triangle of three stages comes out as one row with an arrow running through the middle box (probe h-three-stage) | - | **missing** · none (as above) | Whole type; the editor needs a non-column layout and two-way arrows | required (B.production-types, B.expansion) | L · D2 |
| | **Macro and money** | | | | | | |
| 22 | `adas-sr` | supported · `ad-shift`, `sras-shift`, `ad-sras-left` | - | **supported** · curves: roles ad, sras · L |  | required (G.equilibrium) |  |
| 23 | `adas-lr` | supported · 11 templates: gaps, `self-adjustment`, `lras-growth`, `shock-recovery` | - | **partial** · curves draw the MC options and the shifts [O]; answers needing a gap bracket or a curve through a crossing are not expressible | Output-gap bracket Y→Yf (gap0 / gap1) and "SRAS shifts until AD meets LRAS" (8 HKDSE P2 papers): E1 can come out OFF the LRAS and still pass, and no shift size lands on it (probe e-self-adjust); the labels "LRAS" and "SRAS_0" print into each other; numbered arrows 1, 2 (DSE2013/P2/Q4) | required (G) | M · A3 |
| 24 | `money-market` | supported · `money-market`, `money-supply-shift`, `money-demand-shift`, `money-rate-change` | - | **partial** · the prompt sends it to a fixed-label template; kind curves draws it fully (probes a-money-market, c-money-grid) · O | Two forms: the 3×3 lattice with Ms (7 Paper 1 questions) and one money-demand curve shifting with no Ms at all (6: 2013 Q27, 2015 Q28, 2016 Q29, 2018 Q29, 2020 Q28, 2023 Q29). For the second the template adds an Ms line and r0, r1 the question does not have (probe y-tmpl-moneyD) while curves draws Ma1→Ma2 exactly (probe y-md-shift). No live case | required (H.interest) | S · A1 |
| 25 | `quantity-theory` | supported · manual lines and axis titles | - | **supported** · curves role graph (probe f-quantity-theory); options as figure sets · O |  | required (I.inflation#quantity-theory) |  |
| 26 | `business-cycle` | supported · `business-cycle` | - | **partial** · template only: point A fixed on the upswing · T | Point at the peak / below the average (DSE2021, DSE2025); no wave role in curves | required (I.cycles) | M · E |
| | **Trade and electives** | | | | | | |
| 27 | `tariff-soe` | supported · `tariff`, `tariff-welfare`, tariff presets | tariff | **supported** · scene; free-trade-only figure via curves (probe f-free-trade) · L | Numbers as proportional values (DSE2018/P1/Q41, DSE2021/P1/Q44): labels only, not to scale. DSE2020/P1/Q43 is the no-tariff form (price before and after trade); curves draws it (probe f-free-trade) | required (J.trade#barriers); welfare areas NOT required |  |
| 28 | `quota-import` | supported · `import-quota`, `import-quota-demand`, `import-quota-increase` | - | **partial** · the prompt sends it to the template (labels P_A, Q_A, S with quota) [T]; the brace form (DSE2016 Q42, DSE2019 Q43) also draws in curves with a world-price level and a labelled gap (probe y-iq-brace-nopts) [O]; the kinked-S form (DSE2017 Q42, DSE2022 Q44) needs the template | Free labels for the kinked-S form; options with a kinked vs a vertical S (DSE2017/P1/Q42) | required (J.trade#barriers); welfare areas NOT required | M · C |
| 29 | `ppf-trade` | supported · `ppc`, `ppf-linear-trade`, `ppf-two-countries`, `ppf-concave-trade`, `ppf-shift`, `ppf-growth-trade` | - | **partial** · curves: concave PPC + marks + shifts [L]; the trade versions are fixed-label templates [T] | Numeric intercepts (0,4)–(10,0), linear PPFs, CPF parallel to the world-price line, export / import brackets, given figure the student completes (11 HKDSE P2 papers) | elective only (EL2.trade-theory#ppf); compulsory use NOT required | M · C |
| 30 | `monopoly` | supported · 8 `monopoly*` templates (MC flat, zero, rising, U-shaped; cost fall / rise; lump sum) | - | **partial** · fixed-label templates only; improvising MR in curves passes every check while wrong (probe f-monopoly-try) · T | Free labels (Q0, Q1, P0), MR derived from D, MC shift with old and new DWL, given figure the student completes (10 HKDSE P2 papers) | elective only (EL1.pricing); compulsory MR / MC analysis NOT required | M · C |
| | **Data figures** | | | | | | |
| 31 | `data-line` | supported · line-chart variant (≤ 4 series, ≤ 12 categories) | - | **supported** · kind chart (line); schematic freehand lines via role graph · O | At most 12 categories and 4 series (DSE2025/P1/Q45 is a daily series of about 25 points); axis break and callouts (CE only) | required (F.hk-trends) |  |
| 32 | `data-pie` | supported · pie variant | - | **missing** · kind chart draws bar and line only; naming template `pie` draws a stock pie | Whole type (1 HKDSE paper, 2 CE) | required (F) | S · A3 |
| | **Textbook list (no past-paper evidence)** | | | | | | |
| 33 | `externality` | supported · `externality-overproduction` (negative production); the other three by hand | externality (four kinds) | **supported** · scene [L] | None to build: do not extend (syllabus: examples only) | examples only; graphical analysis beyond CS / PS NOT required (E.efficiency) |  |
| 34 | `cost-curves` | supported · manual curved lines; `monopoly-u-mc` has a U-shaped MC | - | **missing** · no role for a U-shaped curve | Whole type, but not examinable: the syllabus excludes the TC / MC / AC relationships; 16 profit-maximisation and 44 market-structure questions have no picture | NOT required (B.costs, B.objectives) |  |

## Gaps, all of them

| Gap | HKDSE papers (P1 / P2) | Today | Effort | Score | Task | Note |
|---|---|---|---|---|---|---|
| A guard: two things drawn on the same spot pass every check (stacked brackets, two `on` marks, two same-shape graph lines for a tax pair or two Lorenz curves) | 10 (7 / 3) | wrong figure, status ok (probes e-two-brackets, x-marks-along, x-taxpair-two, y-lorenz-place) | S | 10.00 | A2 | six of the seven silent cases share this one cause |
| Money market and single money-demand shifts: the prompt sends them to a fixed-label template, though kind curves draws them exactly | 13 (13 / 0) | partial: template only (labels Ms, Md, E; adds an Ms line the question lacks) | S | 6.50 | A1 | no live case; probes a-money-market, c-money-grid, y-md-shift |
| Two-state or two-line control figures: lowered ceiling with the DWL band, a floor with two lines or changed, quota changed or demand rising under a quota, floor + supply shift, second shortage bracket | 16 (6 / 10) | partial: the scenes draw one state and one price line, the prompt forbids curves for them; fixed-label templates | M | 4.00 | B | round 3 added one such scene (ceilingDemandRise); hand B to that session |
| GDP value-added chains (boxes, $ on arrows, branches) | 6 (6 / 0) | missing: no spec field; naming template `flow` draws the stock bakery chain | M | 3.00 | D1 | the editor already draws it, unboxed notes included: AI side only |
| PPF / CPF trade figures: numeric intercepts, linear PPFs, trade line, consumption point, brackets (Elective 2) | 11 (0 / 11) | partial: fixed-label templates; concave frontier only in curves | M | 2.75 | C | mostly a given figure the student completes; the paper count is a floor (no elective entries for 2021–2024 in the requirement summary) |
| Monopoly: free labels, MR derived from D, MC shift with old and new DWL (Elective 1) | 10 (0 / 10) | partial: fixed-label templates; an improvised MR passes the checks (probe f-monopoly-try) | M | 2.50 | C | mostly a given figure the student completes; the count is a floor |
| Two lettered points on one curve (movement along), with or without an arrow | 5 (5 / 0) | partial: `marks` stacks them; the working recipe (two blank guide levels) is not in the prompt | S | 2.50 | A1 | probes b-movement-along, y-move-blank work; x-marks-along stacks |
| AD–AS answers: output-gap bracket Y→Yf, an SRAS that must land on LRAS, numbered arrows; a price line through a crossing | 9 (1 / 8) | partial: E1 can come out off the LRAS with status ok (probe e-self-adjust) | M | 2.25 | A3 | needs a `through` constraint and a quantity-gap bracket: real compiler work |
| Two Lorenz curves of different depth with a numbered grid; the business-cycle wave with a point at a chosen phase | 6 (6 / 0) | partial: fixed-label templates; one Lorenz curve already draws in curves | M | 1.50 | E | panels of one curve each (DSE2025, SP) are untested through the figure-set route |
| Old vs new tax schedule: allowance and cap move independently | 3 (3 / 0) | partial: a shift moves the whole line; same-shape lines coincide (probes g-tax-pair, x-taxpair-two) | S | 1.50 | A3 | give the broken graph shapes their own start and cap |
| Circular flow and production-stage charts (dashed arrows, two-way arrows, non-column layout) | 4 (4 / 0) | missing: no spec field; the editor itself cannot dash an arrow or lay out a triangle | L | 1.00 | D2 | touches the saved-document shape: backward-compatibility rules apply |
| Revenue box at a price fixed in the seller's currency while demand shifts | 2 (0 / 2) | partial: draws when the price line is a `horizontal` curve (probe x-fixedrev-horizS); fails when it is a level | S | 1.00 | A1 | a prompt recipe |
| Import quota, brace form (a gap labelled "Import quota" at the world price) | 2 (2 / 0) | partial: the prompt sends it to the template; curves draws it (probe y-iq-brace-nopts) | S | 1.00 | A1 | a prompt recipe |
| Pie chart | 1 (1 / 0) | missing: kind chart has bar and line only; naming template `pie` draws a stock pie | S | 1.00 | A3 | 1 HKDSE paper, 2 CE; the editor already has a pie variant |
| Import quota, kinked-S form with free labels | 3 (2 / 1) | partial: fixed-label template only | M | 0.75 | C | tariff and quota welfare areas are NOT required in the 2025 syllabus |
| Subsidy raised $5→$10: three parallel supply curves with corner letters | 1 (1 / 0) | partial: no `subsidyChange` scene (taxChange exists) | S | 0.50 | A3 | copy taxChange |

Papers per gap are counted from the explicit question lists in `evidence/gaps.json`.

## Outside the common list

**Special or one-paper figures (out of scope).**

- DSE2024/P1/Q33: Nested sets: M1 inside M2 (boxes, no axes)
- DSE2015/P1/Q22: Vertical S with a diagonal that partitions total surplus into regions W, X, Y, Z
- CE2011/P2/Q12: S and D on printed graph paper, numbered axes
- CE1997/P2/Q6: Four option panels captioned by time of day
- DSE2026/P1/Q26: Three straight growth-rate lines (population, nominal GDP, price index), no numbers
- `cost-shift-tss` (MC rises, loss of total social surplus): one HKDSE paper (DSE2023/P2/Q5); the scene `costRise` already draws it.

**Other textbook figures with no paper evidence.**

| Figure | In papers | Syllabus | By hand | AI today |
|---|---|---|---|---|
| Horizontal summation of individual demand / supply | none | required (C.market-demand#summation, C.market-supply#summation) | manual lines | partial: three lines, but nothing checks the sum |
| Credit creation / banking multiplier | 72 questions, none with a picture: a balance-sheet table and a calculation | required (H.money-supply#credit-creation) | table block | not a figure |
| Comparative advantage as a table | 59 questions (`in-trade-concept`, `in-trade-calculation`), none with a picture: input / output tables | PPF illustration NOT required in the compulsory part | table block | not a figure |

**The textbook list from the brief, mapped to the rows above.**

| In the brief's list | Where it lands |
|---|---|
| PPF | `ppf-trade`: the single-economy PPC is supported [L]; the trade versions are templates (partial) |
| S and D shifts | `sd-demand-shift`, `sd-double-shift`: supported; `sd-movement-vs-shift`: partial |
| tax / subsidy wedge | `tax-per-unit`, `subsidy-per-unit`: supported (scenes) |
| price ceiling / floor | both partial (two-state, two lines) |
| quota | domestic: partial (two-state); import: partial (template, or the brace form in curves) |
| elasticity | `elasticity-ped`, `revenue-tr`: supported |
| externalities | `externality`: supported (four scenes); in no paper; the syllabus asks for examples only |
| cost curves | `cost-curves`: missing; in no paper; the syllabus excludes the TC / MC / AC relationships |
| Lorenz | `lorenz`: partial |
| AD–AS short and long run | `adas-sr` supported; `adas-lr` partial |
| money market and deposit creation | `money-market` partial (routing); deposit creation is a table and a calculation, not a figure |
| comparative advantage / trade | `ppf-trade` for the PPF form; 59 questions give input / output tables instead |
| tariff | `tariff-soe`: supported |
| the circular flow | `circular-flow`: missing for the AI, partial by hand |

**Where the paper gives a table instead of a figure** (screeners' counts; the headline ones recounted against the bank index): tax per unit 43 questions, 1 pictured; per-unit subsidy 16, 4 pictured; price floor 11, 3 pictured; deposit creation 72, none; tax schedules 13 questions as tables beside 22 pictured; GDP: 14 expenditure tables beside 13 value-added chains; data series (GDP, CPI, trade, exchange rate) mostly tables beside 24 line charts. For these the editor's table block is the right tool, not a diagram. The studio will also write MCQs whose figure never existed in a paper (a tax MCQ, for example); that demand is not measured here.

**Outside the HKDSE syllabus (set aside).** IS-LM (3 papers, HKALE), Keynesian cross (2), consumption function (1), indifference curves (1): HKALE only, never HKDSE. The Phillips curve never appears and the syllabus excludes it.

## Fable review: what it changed

The reviewer (Fable 5.2) wrote its own list of common figures first (37 types; it found no frequent figure missing from this report), then checked the first draft against the code, the pictures and 40 probes. The full review is `FABLE-REVIEW.md`, saved unedited. Its findings, what I checked myself, and what changed here (type ids instead of row numbers, because rows moved):

| Finding | My check | Change |
|---|---|---|
| `sd-movement-vs-shift` and `price-floor` were rated supported: too generous. | Re-ran probe x-marks-along (two `on` marks stack on one spot, status ok). Read the prompt: scenes are "ALWAYS" and "never compose them from curves", and the `priceFloor` scene has one price line; three HKDSE floor figures carry two lines or a changed floor. | Both now partial; the AI totals in the Summary are the corrected ones (the first draft said 18 / 11 / 4). |
| "A revenue box at a fixed price fails" was too strong. | Re-ran x-fixedrev-horizS: the Gain box draws when the price line is a `horizontal` curve; it fails only when the price is a level. | Reworded as a prompt recipe (task A1); `revenue-tr` stays supported. |
| Seven silent wrong figures, not three; six share one cause (coincident geometry). | Re-ran x-marks-along, x-taxpair-two, y-lorenz-place and x-tmpl-flow: all reproduce with status ok. | New gap and task A2 (one guard); Summary point 1. |
| "No route to any flow figure" is false as written: the compiler accepts template `flow` (and `pie`) by id and draws a stock figure. | Read the template branch of `compile.ts` (any id but `blank`); x-tmpl-flow draws the bakery chain. | Reworded in the flow rows and the Summary; the guard covers it. |
| Value-added chains are 6 of the 9 flow papers and the editor already draws them; only the circular flow and the stages need editor work. | Checked `FlowNode.boxed` (unboxed notes exist) and my probes of the ring and the three-stage chart. | Task D split into D1 (AI side, M) and D2 (editor and AI, L). |
| "No curve role for a bow" is wrong for a single Lorenz curve; "import quota: template only" is wrong for the brace form. | Re-ran x-lorenz-graph and y-iq-brace-nopts: both draw in curves. | Rows reworded as routing gaps; the brace form moved to task A1. |
| Money market is two figures: the 3×3 lattice with Ms, and one money-demand curve with no Ms. | Compared the reviewer's probes y-md-shift (exact) and y-tmpl-moneyD (template adds an Ms line). | Both forms described in the row; kept as one row. |
| Miscount: DSE2013/P1/Q14 is a price-floor figure, so price floor is 10 HKDSE papers, not 9. | Looked at the picture: vertical S, floor raised from P2 to P1. | Added to `price-floor` and to the two-line gap. |
| DSE2015/P1/Q22 was counted in a row and listed as a special. | Checked. | Kept only in the specials. |
| Externality is in the brief's list and should count; the headline should be 35. | The syllabus asks for examples only, but the brief's rule names it. | Externality and cost curves added as rows; the two single-shift rows merged; headline now 34. |
| Task A was three tasks and 4 to 6 days was too low; B belongs with the studio-graphs session; order A1, A2, D1, B, A3, E, D2, C. | Agreed after checking what each item touches (prompt, schema or compiler). | Tasks and order replaced. |
| The score adds Paper 1 to Paper 2, gives a wrong figure the same 0.5 as a template, and ignores how often a model takes the bad route. | Agreed. | P1 / P2 columns added; a wrong figure that passes has severity 1.0; stated as a limit. |
| Method limits: pictured questions only, the Paper 2 summary lacks the 2021–2024 electives, one model family, offline probes prove "can" not "does", the probe bypasses the reply parser, syllabus and recency. | Agreed. | Added to Method and checks. |

Where I kept my position: `ppf` stays merged into `ppf-trade` and money market stays one row (the sub-forms are in the text); the † rows stay because the brief's rule counts HKCEE papers; `tax-schedule` I also moved to partial (the reviewer called it borderline: 4 of its 9 HKDSE questions are the old / new pair). The hand-drawing ratings are still not verified in the editor, as the reviewer also says, and `sd-related-markets` (AI partial) is read from the code only: neither of us probed it. I re-ran all 40 of its probe specs; the 22 I compared in detail matched, and I looked at 8 of the pictures. I did not re-open its 8 contact sheets of 155 questions.


## Method and checks

- **Screening.** Every picture of the bank was extracted (1,759 questions, 235 with pictures, 338 pictures) and classified by Sonnet subagents into a fixed vocabulary of 50 figure types and 20 feature tags (`evidence/VOCAB.md`). One record per (question, distinct type).
- **Paper 2.** The bank holds Paper 1 only, so Paper 2 evidence is `docs/Diagram_Requirements/00_ALL_Diagram_Requirements.md`: 248 `Diagram type:` entries parsed by script (171 distinct question sources; the same question repeats across the by-topic, reference and round-paper files, so papers are counted once). It is a compiled summary, not the papers, and has no monopoly or PPF entries for 2021–2024 although both electives are set every year.
- **Checks on the screeners' output.** A script confirmed every pictured question (235 of 235) and every Paper 2 card (248 of 248) is accounted for, every type and feature tag is in the vocabulary and every source tag exists in the bank. I opened 31 pictures myself (the ones the screeners flagged as ambiguous and the ones behind a finding) and a seeded random sample of 24 more: the random sample matched 24 of 24; the flagged ones turned up four mis-tags (four HKCEE quota questions whose stems say import quota but whose drawing is the kinked-supply quota figure with no world price; re-typed as domestic quota, `evidence/CORRECTIONS.md`); 12 random Paper 2 cards matched their rows. The reviewer opened about 155 first pictures and found two slips (a miscounted price floor, a tariff tag on a no-tariff figure), both fixed or noted here.
- **AI ratings** come from reading `src/diagramGen/` (`types.ts`, `prompt.ts`, `compile.ts`, `scene*.ts`) and from offline probes that compile a hand-written spec with the real compiler and checks, then draw it (`evidence/probes/INDEX.md`). No model was called: nothing here measures how often a model picks the right route, and the probe bypasses the reply parser, so a strict schema might reject a spec a probe accepts (not verified for `pie`). Live evidence is the sibling session's 20-case eval (k-0577) and k-0554's live tax-graph run, where marked L.
- **Limits.** Pictured questions only: a figure described in words or given as a table is not counted. Counts are distinct papers, not marks or recency (circular flow has one HKDSE paper, but it is 2026). Effort sizes are estimates. HKDSE papers include the practice and sample papers. One model family did the screening and wrote the vocabulary. HKCEE and HKALE papers lift the all-papers column for figures the HKDSE has dropped; rank by the HKDSE column. The 2025 syllabus excludes the welfare analysis behind two "supported" rows; the figures the 2025 guide adds are not examined here.

## Pictures (`pictures/`)

1. `1-ai-draws-well-today.png`: one figure from each typed scene (what the AI draws well).
2. `2-curves-route-reproduces.png`: HKDSE figures next to what kind curves draws for them (the 3×3 lattice, the money-market grid).
3. `3-gaps-no-route-or-template-only.png`: HKDSE figures next to the editor's closest output (value-added chain, Lorenz, import quota, business cycle).
4. `4-ai-route-wrong-or-limited.png`: figures the AI route draws wrongly or cannot vary, next to the editor's correct template.
5. `5-flow-figures-by-hand-limits.png`: the circular flow and the three-stage chart as the editor's flow chart draws them.

## Files

`FABLE-REVIEW.md` (the review, unedited), `evidence/merged.json` (every classified figure: source tag, type, variant, features; no question text), `evidence/screeners/` (the raw subagent outputs), `evidence/gaps.json`, `evidence/registries.json` (the 81 templates, 23 Shade presets, scenes), `evidence/probes/` (the probe specs, `INDEX.md`, and the test that runs them), `evidence/VOCAB.md`, `evidence/CORRECTIONS.md`, `evidence/scripts/` (merge, verify and build scripts; paths are this server's).

## Decisions for you

1. **Which build tasks to start, and in what order.** My order, after the review: A1, A2, D1, B (with the studio-graphs session), A3, E, D2, C. A1 and A2 are a few days together and fix the wrong figures that pass today; D1 is the largest missing block that needs no editor change (6 HKDSE papers); B is the biggest group of partial figures; C and D2 are the large ones.

2. **Do you want Paper 2 diagrams from the studio?** Task C (monopoly, PPF / CPF trade), and the answer-figure part of A3 and B, only pay off if the studio will write Paper 2 long questions with model-answer diagrams. Today it writes MCQs. The Paper 2 counts are floors (the requirement summary has no elective entries for 2021–2024).

3. **Syllabus scope.** Under the 2025 guide, tariff and quota welfare areas, MR / MC analysis and PPF (in the compulsory part), externality graphs and cost curves are not examinable, yet the first three appear in 2012–2024 papers (externality graphs and cost curves appear in none). I suggest keeping what exists and extending none of it. Confirm.

4. **A-level figures** (IS-LM, Keynesian cross, consumption function, indifference curves) stay out of scope. Confirm.

5. **Live evidence for the offline-only rows.** Several supported or partial rows were only compiled offline (money market, AD–AS with LRAS, the lattice, tax pairs, quantity theory and others). A live run of about ten cases costs roughly 20 to 25 credits a figure, about 250 credits, and the test account was low at the last report. Say yes and I will add the cases to `evals/graphs/cases.ts`.

6. **Coordinate with the studio-graphs session (k-0577).** B generalises its `ceilingDemandRise` and edits its catalogue; A1 to A3 touch `prompt.ts`, `compile.ts` and the schema it owns. Tell it before any of them starts.

7. **Where the report lives.** It is in Outbox only and I committed nothing. Say so if you want a copy in `docs/` (for example `docs/design/diagram-coverage.md`).
