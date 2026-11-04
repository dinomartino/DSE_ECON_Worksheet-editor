# Syllabus analysis for a "syllabus coverage check"

Status: research, 2026-11-04 (task k-0317, step 1; the user's uploads u-j7v4, and their addition u-d8lf that
the check must be built on the editor's AI framework, which is § 10). **Docs only: no app code.** Branch
docs/syllabus-analysis. Companion file: [`syllabus-2025.json`](./syllabus-2025.json), a draft data file that no
code reads yet.

The idea being prepared: a ✦ check that takes a mock or test and says what share of the whole syllabus (or of a
scope the teacher picks, e.g. the topics taught so far) it covers. This document does the groundwork: what the
syllabus actually is, what the exam weighs, what can honestly be measured, and how the AI part could work.

## 0. The short version

- **Structure.** The 2025 guide has 10 Compulsory topics, **A–J**, holding **49 key points** and **119
  points** (the guide's (i), (ii)… items, plus one implicit point for each of 10 key points that print none), plus two
  Elective Parts (4 key points, 11 points). `src/model/topics.ts` already has all 53 key points
  in the guide's order: **nothing missing, nothing extra.** What it lacks is everything *below* a key point (the
  130 points), the Compulsory/Elective split, lesson hours, skill flags and the guide's "NOT required" limits (§ 6).
- **Exam from 2028.** Paper 1 (MC) 30%, 1 h. Paper 2, 2 h 30: A short questions 26% and B structured/essay/data
  response 33%, both on the Compulsory Part; C Elective 11%, one of two parts. **The documents give no raw marks, no
  question counts and no topic weights** (§ 3).
- **Lesson time.** 194 h Compulsory, 24 h for one Elective Part, 32 h for enquiry activities: 250 in all (§ 4).
  Weighting by points or by hours moves a topic's share by up to 7 percentage points (C and I), so "% of the
  syllabus" needs a stated denominator.
- **What changed in 2025.** The PDFs carry **no revision marks**. The changes can only be read where the text says so:
  the Elective Part becomes optional, the 2028 weights, and a few dated notes (§ 7). A true before/after needs the
  pre-2025 guide, which was not provided.
- **Recommendation (§ 9, § 10).** A ✦ verb tags each *marked unit* (an MC question, or a part that carries marks)
  with key points and points, marks share, skill band, confidence and a one-line reason; the teacher accepts or edits.
  Key-point codes go into the existing per-part `tags`; the finer layer (points, shares, who tagged it) goes in **one new
  optional metadata field**, never in `tags` (the tag grammar allows one `.slug` only). Command-word bands, marks, scope maths and the grid are
  local and keyless. **Questions from HKEAA papers are never sent to a model.** Measure first: a small gold-labelled
  eval decides whether the AI is good enough before anything ships.
- Open questions for you are in § 11.

## 1. Sources, pages and quirks

### 1.1 What was read

| Id | File (under `Inbox/`) | PDF pages | Printed page = PDF page − | What it is |
|---|---|--:|--:|---|
| `guide` | `2026-11-04-Econ_C&A_Guide_E_with_updates_in_2025.pdf` | 98 | 6 | The C&A Guide (CDC and HKEAA), first issued 2007, updated 2014, 2015 and 2025 (effective from S4 in 2025/26) |
| `suppEn` | `2026-11-04-Econ_supplementary_doc_Eng_with_updates_in_2025.pdf` | 50 | 1 | Supplementary Document: the guide's tables plus an "Elaboration of the curriculum contents" column, and the exam page |
| `suppZh` | `2026-11-04-Econ_supplementary_doc_Chi_with_updates_in_2025.pdf` | 41 | 1 | The Chinese edition of the supplement (not the Chinese guide itself) |

`ECON-IllustrativeQuestions-E.pdf` was ignored as asked; nothing else was downloaded. **Page numbers in this
document are the printed ones**, so "guide p. 9" is the number at the foot of that page.

Where the guide matters: Chapter 2 (pp. 6–23: the syllabus tables pp. 9–22, lesson time p. 23); Chapter 3 § 3.2
(pp. 25–26: the order to teach in) and Appendices 1–2 (pp. 75–76: two example sequences); Chapter 5 (pp. 52–62:
assessment objectives p. 54, exam design pp. 60–61). Chapters 4 and 6 and Appendices 3–6 (pedagogy, resources) were
not read in full and are not used.

### 1.2 Words the guide uses (and one trap)

- **Topic** = A–J. The Elective Part has **no letters**: the guide says "Elective Part 1 / 2". `topics.ts` names them
  `EL1` and `EL2`.
- **Key Points** (學習要點) is the guide's column heading. In the Compulsory tables a block's first line (e.g. "Price
  elasticity of demand") heads the block and **is what `topics.ts` calls a fine topic** (`C.ped`). Inside it, the
  guide numbers items (i), (ii), (iii): those are what I call **points**.
- **Trap: the Elective tables are laid out differently.** There the guide's *Topic* column holds "Monopoly Pricing",
  "Anti-competitive Behaviours and Competition Policy", "Extension of Trade Theory" and "Economic Growth and
  Development", and the *Key Points* column holds the (i)/(ii) items. `topics.ts` treats the same four names as fine
  topics, so its fine level equals the guide's Key-Points headings for A–J but the guide's **Topic** column for the
  electives. Nothing is wrong; it just means "key point" is not one guide column across the whole syllabus.
- **The guide numbers no key point.** The repo's earlier note says "Key points are numbered (G(ii))"
  (`docs/research/2026-09-question-bank.md` § 3). In the tables only the Topics (A–J) and the items inside a key point
  carry labels, so "G(ii)" is not a unique address (Topic G has three key points, each with an (ii)). That is why the
  data file gives every key point and point its own code (§ 5).
- The user's "learning point" can mean either level: 學習要點 literally is the Key Points entry (53 of them, equal to
  the `topics.ts` fine topics), the finer layer is the numbered points (130). The data file has both; § 10 says which to
  tag at.

### 1.3 Quirks found while extracting

- **No revision marks.** I scanned the text colour of every page of all three PDFs: body text is black throughout (the
  only coloured text is the guide's page numbers and one e-mail address), and the pages I rendered (guide pp. 9, 61, 75,
  76; supplement EN p. 32) show no underline or highlight. I did not scan for strike-through. So "what the 2025 update
  changed" cannot be read off the PDFs (§ 7).
- **Printed typos and wording differences** (the data file stores the intended form and the verification accepts these
  printed ones):
  - Chinese supplement F `國民收入` item (i): prints 本地居**總收入** (the 民 is missing).
  - Chinese supplement, Topic D title: prints **巿** (U+5DFF) where 市 is meant, in 競爭與巿場結構. A Chinese keyword
    matcher must fold 巿 to 市; `topics.ts` has the correct 市.
  - EN supplement E "Measuring income **inequity**" (the guide says *inequality*).
  - EN supplement G "**Reasons** for an upward sloping short run AS curve" (the guide says *Reason*).
  - EN supplement I "fluctuations in **the** real GDP" (the guide says *in real GDP*).
- The EN supplement leaves four bullets of the Competition Ordinance (objectives, first and second conduct rule,
  exclusions) out of its key-points column; they appear only in its elaboration column. The Chinese supplement leaves
  them out of its key-points column too, and one bullet of B(i) is merged into the item's name. Five details therefore
  have no 中文 name in the data file.
- The EN and Chinese supplements paginate differently (49 and 40 printed pages); the data file keeps all three page
  references.

## 2. The syllabus structure

### 2.1 Levels and codes

| Level | Guide's own label | Count | Code in the data file |
|---|---|--:|---|
| Part | Compulsory Part · Elective Part (choose one of 1, 2) | 2 | `compulsory` · `elective` |
| Topic | A–J · "Elective Part 1/2" | 12 | `A` … `J`, `EL1`, `EL2` (`topics.ts` codes) |
| Key point | the heading of a block (A–J) or the Topic entry (electives) | 53 | the `topics.ts` fine code, e.g. `C.ped` |
| Point | the item (i), (ii)… (or the one printed bullet when a key point has no numerals) | 130 | `<key point>#<slug>`, e.g. `C.ped#arc`; label = the guide's "(i)" |
| Detail | a bullet inside a point | 81 | none (informational names) |

Ten key points have no printed items (e.g. "Law of Demand", "Specialization and exchange"): each is one *implicit*
point, code `<key point>#whole`. `J.bop` has two top-level bullets (current account; capital and financial account),
so two points. Point slugs are mine; they follow the repo's rule for fine codes (frozen once adopted, never renumber).
The `#` is deliberate: § 10.4 explains why a point code must never look like a topic code.

### 2.2 The topics

| Code | Topic | 中文 | Key points | Points | Lesson h | Guide p. | Suppl. EN p. | Suppl. 中 p. |
|---|---|---|--:|--:|--:|--:|--:|--:|
| **A** | Basic Economic Concepts | 基本經濟概念 | 6 | 10 | 12 | 9 | 2–5 | 2–5 |
| **B** | Firms and Production | 廠商與生產 | 7 | 20 | 30 | 10–12 | 5–12 | 5–11 |
| **C** | Market and Price | 市場與價格 | 11 | 28 | 32 | 12–14 | 12–19 | 11–16 |
| **D** | Competition and Market Structure | 競爭與市場結構 | 1 | 3 | 8 | 14 | 19–20 | 17 |
| **E** | Efficiency, Equity and the Role of Government | 效率、公平和政府的角色 | 3 | 9 | 18 | 15 | 21–24 | 17–20 |
| **F** | Measurement of Economic Performance | 經濟表現的量度 | 4 | 7 | 12 | 16 | 24–27 | 20–24 |
| **G** | National Income Determination and Price Level | 國民收入決定及價格水平 | 3 | 8 | 16 | 17 | 27–31 | 24–26 |
| **H** | Money and Banking | 貨幣與銀行 | 6 | 12 | 18 | 17–18 | 31–34 | 26–29 |
| **I** | Macroeconomic Problems and Policies | 宏觀經濟問題和政策 | 5 | 12 | 30 | 18–19 | 34–38 | 29–33 |
| **J** | International Trade and Finance | 國際貿易和金融 | 3 | 10 | 18 | 20 | 38–41 | 33–35 |
| **EL1** | Elective Part 1: Monopoly Pricing, Anti-competitive Behaviours and Competition Policy | 選修單元(一)：壟斷定價、反競爭行為及競爭政策 | 2 | 5 | 24 | 21 | 43–45 | 36–37 |
| **EL2** | Elective Part 2: Extension of Trade Theory, Economic Growth and Development | 選修單元(二)：貿易理論之延伸、經濟增長及發展 | 2 | 6 | 24 | 22 | 46–48 | 38–39 |
| | **Compulsory Part** | | **49** | **119** | **194** | | | |
| | **Elective Parts (both)** | | **4** | **11** | **24 (one part)** | | | |

The page columns are printed pages in the guide and in the two supplements. The full list with every key point,
point, 中文 name and page is **Appendix A**; the same data is in the JSON.

### 2.3 What a block looks like

Price elasticity of demand (`C.ped`, guide p. 13): three points, **(i) Arc elasticity**, **(ii) Relationship between
price elasticity and total revenue**, **(iii) Factors affecting price elasticity of demand**, and the limit
"(N.B. Point elasticity, cross elasticity and income elasticity NOT required)". The supplement then says what a student
must be able to do: (i) *calculate* the arc elasticity with the average-price-and-quantity method, (ii) *explain* the
link between price change, elasticity and total revenue, (iii) *explain* how substitutes, necessity, time and so on
affect it.

### 2.4 What the guide excludes ("NOT required")

35 of the 53 key points carry at least one explicit limit (76 items in the data file, summarised
in my words). They matter for a coverage check because a question can test something *near* the syllabus that the guide
rules out, and a name-matcher cannot tell. Examples: Giffen goods; point, cross and income elasticity; indifference
curves and the marginal rate of substitution; the term "Pareto condition" and the Coase theorem; the Phillips curve;
loanable-funds theory; the cash-deposit ratio in credit-creation sums; theories of business cycles; the Quantity Theory
of Money inside the AS-AD topic; illustrating comparative advantage with the PPF in the Compulsory Part (it returns in
Elective 2).

Four footnotes date from the 2016 HKDSE and are still in force (guide pp. 16, 17, 18, 20): the identity S − I ≡ NX is not
expected; imperfect adjustment of input and output prices is the *only* explanation of an upward-sloping SRAS; the
cash-deposit ratio is not manipulated in credit creation; tariff and quota effects on surplus and deadweight loss are not
analysed for a small open economy.

### 2.5 The order the guide suggests teaching in

The scope "topics taught so far" has no official definition, but the guide gives two example sequences (printed
pp. 75–76) and a progression (§ 3.2, pp. 25–26: concepts like cost, choice, production, firm and price first; GDP
measurement and AS-AD around late S4 or S5, then the more analytical micro such as efficiency; trade in late S5 or early
S6; the Elective Part in S6; "there is no one best learning and teaching sequence").

| | S4 | S5 | S6 |
|---|---|---|---|
| Sequence 1 (diverse abilities), p. 75 | A, B, D, F, G | C, H, I, E | J, Elective 1 *or* 2 |
| Sequence 2 (stronger foundation), p. 76 | A, B (Firms and Production **I**), C, F, G | H, I, D, E, B (Firms and Production **II**) | J, Elective 1 *or* 2 |

Sequence 2 **splits topic B in two**, so a "taught so far" scope must be pickable below topic level. The sequences
are in the JSON as `teachingSequences`.

## 3. The public exam: format and weighting

From the 2028 HKDSE (guide pp. 60–61; EN supplement p. 49; Chinese supplement p. 40; the three agree):

| Paper | Part | Covers | Weight | Time |
|---|---|---|--:|---|
| 1 | Multiple-choice questions | not stated | 30% | 1 hour |
| 2 | **A** Short questions, all compulsory | Compulsory Part | 26% | 2 hours 30 minutes for the paper |
| 2 | **B** Structured / essay-type / data-response, all compulsory | Compulsory Part | 33% | |
| 2 | **C** Structured / essay-type; answer the questions from **one of the two** Elective Parts | Elective Part | 11% | |

Total 100%. The guide adds that good performance on the Compulsory Part questions can earn Level 5, and that
**whether or not a student answers the Elective Part, the same score gives the same grade.** Item types named on p. 61:
multiple-choice, short, data-response and structured/essay-type.

Mapping to the editor's words: **MCQ** = Paper 1; **LQ** = Paper 2 B and C (A are the short questions);
**elective choice** = Section C, one of two parts, now optional to study (§ 7).

**Not stated in any of the three documents:** the number of questions, raw marks per paper or section, the syllabus
scope of Paper 1, and any weighting by topic. Only the four percentages above exist. (The repo's own census of real
papers counts 45 questions in Paper 1: `docs/design/format-settings.md`, `docs/design/paste-import.md`; the 2028 guide
does not say so.) What is certain: A + B = 59% of the marks are on the Compulsory Part and C = 11% on the Elective. Paper 1
is probably Compulsory-only (the Level-5 note and the 11% elective share fit that) but the guide never says it.

**Before 2028** (not from the three PDFs: the repo's earlier research, which cites the HKEAA 2026 document):
Paper 1 30%, A 26%, **B 35%, C 9%** (`docs/research/2026-09-question-bank.md` § 3). So from 2028 B loses 2 points and
C gains 2.

## 4. Suggested lesson time

Guide § 2.2.3, p. 23. "Suggested lesson time (hours)":

| Topic | h | | Topic | h |
|---|--:|---|---|--:|
| A Basic Economic Concepts | 12 | | G National Income Determination and Price Level | 16 |
| B Firms and Production | 30 | | H Money and Banking | 18 |
| C Market and Price | 32 | | I Macroeconomic Problems and Policies | 30 |
| D Competition and Market Structure | 8 | | J International Trade and Finance | 18 |
| E Efficiency, Equity and the Role of Government | 18 | | Elective Part 1 **or** 2 | 24 |
| F Measurement of Economic Performance | 12 | | **Sub-total 218** (194 Compulsory + 24) | |
| | | | Activities that integrate and apply topics, enquiry (not tied to a topic) | 32 |
| | | | **Total** | **250** |

The Elective Part is "around 10% of curriculum time" (p. 7). The guide gives hours **per topic only**, never per key
point. A topic's share of lesson hours is not its share of syllabus items:

| Topic | Lesson h | % of hours | Key points | % | Points | % | Points % − hours % |
|---|--:|--:|--:|--:|--:|--:|--:|
| A Basic Economic Concepts | 12 | 6.2 | 6 | 12.2 | 10 | 8.4 | +2.2 |
| B Firms and Production | 30 | 15.5 | 7 | 14.3 | 20 | 16.8 | +1.3 |
| C Market and Price | 32 | 16.5 | 11 | 22.4 | 28 | 23.5 | +7.0 |
| D Competition and Market Structure | 8 | 4.1 | 1 | 2.0 | 3 | 2.5 | -1.6 |
| E Efficiency, Equity and the Role of Government | 18 | 9.3 | 3 | 6.1 | 9 | 7.6 | -1.7 |
| F Measurement of Economic Performance | 12 | 6.2 | 4 | 8.2 | 7 | 5.9 | -0.3 |
| G National Income Determination and Price Level | 16 | 8.2 | 3 | 6.1 | 8 | 6.7 | -1.5 |
| H Money and Banking | 18 | 9.3 | 6 | 12.2 | 12 | 10.1 | +0.8 |
| I Macroeconomic Problems and Policies | 30 | 15.5 | 5 | 10.2 | 12 | 10.1 | -5.4 |
| J International Trade and Finance | 18 | 9.3 | 3 | 6.1 | 10 | 8.4 | -0.9 |
| **Compulsory** | **194** | 100 | **49** | 100 | **119** | 100 | |

So a coverage % is relative to a choice: counting every point equally makes C 7 points larger than its lesson hours say,
while weighting by hours makes I 5 points larger than its point count says. § 8.2 returns to this.

## 5. The machine-readable file

[`syllabus-2025.json`](./syllabus-2025.json): **12 topics, 53 key points, 130 points, 81 details**, each with EN and 中文
names as printed, printed page references in the three documents, and the `topics.ts` mapping. Top-level keys: `meta`
(levels, counts, vocabularies), `sources`, `assessment` (the 2028 table), `timeAllocation`, `teachingSequences`,
`topicsTsMapping`, `topics`.

Per key point: `code`, `en`, `zh`, `pages`, `topicsTs` (its `topics.ts` names and how they differ), `notRequired`
(the guide's limits, summarised), `updates` (dated or CSD/HKMA notes with their page), `points`. Per point: `code`,
`slug`, `label` (the guide's "(ii)"), `en`, `zh`, `details` (EN and 中文), `skills`, `pages`.

- **Names are the guide's, not mine.** Every EN name was checked to occur verbatim, in document order, at the start of a
  line of the guide's Key-Points (or, for the electives, Topic) column, and in the EN supplement where it lists the item;
  every 中文 name verbatim in the Chinese supplement. I broke the checker on purpose (a changed name, a changed 中文 name, a
  changed detail, two swapped key points, two swapped points, a changed elective name): each was caught. Page numbers are
  computed from where the names are found, not typed.
- **What is my reading, and needs a teacher's eye:** the point `slug`s; the `skills` flags (a flag is set only where the
  supplement's elaboration names the verb: *calculate / numerically / schedule*, *diagram / graphically / illustrate*,
  *interpret data*, and so on); the `notRequired` wording; which supplement notes count as `updates`. The supplement's
  elaboration text itself is **not** copied: the file keeps short names and summaries.
- **Not in the file:** the elaboration sentences, the guide's wording for aims and pedagogy, anything from the exam papers.
Skill flags in numbers (points carrying each flag):

| Topic | Points | recall | examples | explain | calculate | diagram | data | evaluate |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| A | 10 | 6 | 6 | 6 | 1 | 2 | 0 | 1 |
| B | 20 | 17 | 9 | 7 | 4 | 1 | 0 | 1 |
| C | 28 | 9 | 0 | 18 | 6 | 10 | 0 | 0 |
| D | 3 | 2 | 1 | 1 | 0 | 0 | 0 | 0 |
| E | 9 | 2 | 1 | 9 | 0 | 1 | 1 | 2 |
| F | 7 | 4 | 1 | 3 | 4 | 0 | 2 | 1 |
| G | 8 | 0 | 0 | 8 | 0 | 5 | 0 | 0 |
| H | 12 | 8 | 0 | 8 | 1 | 0 | 0 | 0 |
| I | 12 | 6 | 2 | 8 | 2 | 2 | 0 | 0 |
| J | 10 | 7 | 0 | 7 | 2 | 0 | 2 | 0 |
| EL1 | 5 | 4 | 2 | 2 | 1 | 1 | 0 | 0 |
| EL2 | 6 | 3 | 0 | 4 | 1 | 1 | 4 | 1 |
| **All** | **130** | **68** | **22** | **81** | **22** | **23** | **9** | **6** |

Calculation sits mainly in C, B and F; diagrams in C and G; data interpretation in Elective 2, F and J; evaluation is
rare (E has 2 of the 6). Flags are conservative: many AS-AD and market points would be examined with a diagram even
where the supplement does not use the word.

## 6. `topics.ts`: what it misses, names differently, has extra

Compared with `src/model/topics.ts` as on the `origin/develop` this branch was cut from; the comparison reads the file
itself, nothing is retyped.

| Check | Result |
|---|---|
| Coarse topics (A–J, EL1, EL2) | 12 of 12 present, same order, no extras |
| Fine topics | **53 of 53** present, same order, **none missing, none extra** |
| Names | 29 differences across 23 codes: 18 shortened, 6 reworded, 5 case only (table below); every other EN and 中文 name equals the printed one |

**Misses** (not an error; it is a different layer):

1. **The point layer**: 130 points (119 Compulsory, 11 Elective) and their 81 details. `topics.ts` stops at the
   key point.
2. **Part**: nothing says Compulsory vs Elective, and that from 2025/26 a student may skip the Elective Part (a coverage
   denominator needs it).
3. **Lesson hours** per topic, the **skill flags**, the guide's **"NOT required"** limits, page references, and the
   notes of § 7.
4. The guide's printed titles carry **depth cues** that short names drop: "*Brief introduction to* the balance of
   payments account", "Business cycles: a *description* of…", "…illustrated by examples *ONLY*" (`E.efficiency`
   (iii)), "Illustration by … schedules *only*" (`B.costs` (ii)).

**Extra** (not in the guide): `EL1` and `EL2`, the repo's codes for the two Elective Parts (the guide has no letters;
their names are the time-allocation row's), and the frozen slugs themselves (the guide has none). Both are fine and
needed. Not extra, but worth knowing: `C.equilibrium` / `G.equilibrium` and `F.unemployment` / `I.unemployment` share
a slug under different letters (the full codes stay unique).

**Names that differ** (18 shortened, 6 reworded, 5 case only). Most are harmless shortenings of a label; three are worth a look because the
dropped words say *what is meant*:

| Code | Field | `topics.ts` | Printed in the guide | Kind |
|---|---|---|---|---|
| `A.basic-problems` | EN | Three basic economic problems | The three basic economic problems | shortened |
| `A.circular-flow` | EN | Circular flow | Circular flow of economic activities | shortened |
| `B.production-types` | EN | Types and stages of production | Types/stages of production | reworded |
| `B.goods` | EN | Types of goods and services | Types of goods and services produced | shortened |
| `B.costs` | EN | Production and costs | Production and costs in the short run and long run | shortened |
| `B.objectives` | EN | Objectives of firms | The objectives of firms | shortened |
| `C.law-of-demand` | EN | Law of demand | Law of Demand | case only |
| `C.equilibrium` | EN | Demand, supply and price | Interaction between demand, supply and price | shortened |
| `D.structure` | EN | Perfect and imperfect competition | Perfect competition and imperfect competition (monopolistic competition, oligopoly and monopoly) | reworded |
| `D.structure` | 中文 | 完全競爭和不完全競爭 | 完全競爭和不完全競爭(壟斷性競爭、寡頭壟斷和壟斷) | shortened |
| `F.price-level` | EN | General price level | General price level as measured by Consumer Price Index and implicit price deflator of GDP | shortened |
| `F.price-level` | 中文 | 一般物價水平 | 以消費物價指數和本地生產總值內含平減物價指數量度一般物價水平 | shortened |
| `F.unemployment` | EN | Unemployment and underemployment rates | Unemployment and underemployment rates as measured in terms of the percentage of unemployed and underemployed persons in the labour force | shortened |
| `F.unemployment` | 中文 | 失業率及就業不足率 | 以失業及就業不足人士在勞動人口中所佔的百分比量度失業率及就業不足率 | shortened |
| `F.hk-trends` | EN | Recent Hong Kong trends | Recent trends of national income, general price level and unemployment in Hong Kong | reworded |
| `F.hk-trends` | 中文 | 香港近期趨勢 | 香港近期國民收入、一般物價水平和失業的趨勢 | reworded |
| `G.ad` | EN | Aggregate demand | Aggregate demand (AD) | shortened |
| `G.as` | EN | Aggregate supply | Aggregate supply (AS) | shortened |
| `G.equilibrium` | EN | Determination of output and price level | The determination of level of output and price | reworded |
| `H.banks` | EN | Banks | Banks: functions and services | shortened |
| `H.interest` | EN | Interest-rate determination | Determination of interest rate in the money market | reworded |
| `I.cycles` | EN | Business cycles | Business cycles: a description of the short run fluctuations in real GDP around the long run trend | shortened |
| `I.cycles` | 中文 | 經濟周期 | 經濟周期：描述實質本地生產總值圍繞長期趨勢作周而復始的短期波動 | shortened |
| `J.bop` | EN | Balance of payments | Brief introduction to the balance of payments account | shortened |
| `J.bop` | 中文 | 國際收支平衡表 | 國際收支平衡表簡介 | shortened |
| `EL1.pricing` | EN | Monopoly pricing | Monopoly Pricing | case only |
| `EL1.competition-policy` | EN | Anti-competitive behaviours and competition policy | Anti-competitive Behaviours and Competition Policy | case only |
| `EL2.trade-theory` | EN | Extension of trade theory | Extension of Trade Theory | case only |
| `EL2.growth` | EN | Economic growth and development | Economic Growth and Development | case only |

- `F.hk-trends` "Recent Hong Kong trends" hides that the trends are of **national income, the general price level and
  unemployment**; that is the content a matcher or tagger needs.
- `D.structure` "Perfect and imperfect competition" loses the parenthesis that names the three imperfect forms
  (monopolistic competition, oligopoly, monopoly).
- `J.bop` "Balance of payments" loses "*Brief introduction to*", the only place the guide signals the depth.
- `topics.ts` has `A.basic-problems` "Three basic economic problems" where the guide says "The three…"; and "Law of
  demand" / "Law of Demand" and the four Elective names differ in capitals only.

**Recommendation (for a later step, not done here):** leave `topics.ts` and every existing code exactly as they are
(documents store them). If the point layer is built, put it in a **new module generated from this JSON** (codes, EN and
中文 names, hours, flags, limits), so a later edition of the guide is a new data file, not an edit to frozen codes.
Showing the *printed* names in the coverage UI (rather than the short `topics.ts` ones) would carry the depth cues, at the
cost of longer labels.

## 7. What the 2025 update changed

**The PDFs do not mark it** (§ 1.3), so this is what the documents themselves say, with where, and what could not be
established.

| Change | Where it is stated | Note |
|---|---|---|
| The Elective Part becomes optional: from S4 in 2025/26 (the 2028 exam) a student "may choose to study only the Compulsory Part" | Guide p. 7 footnote 1; p. 24 (§ 3.1 g); pp. 26–27 (§ 3.3.2); p. 61 note | The biggest structural change for coverage: two denominators (Compulsory only; Compulsory + a chosen Elective) |
| Exam weights from the 2028 HKDSE: Paper 1 30%, A 26%, **B 33%, C 11%** | Guide p. 61; supplement EN p. 49, 中 p. 40 | Before, per the repo's earlier research (HKEAA 2026): B 35%, C 9%. The guide does not print the old figures |
| Purpose of the update: "the optimised measures … proposed in 2024", aligned with "the latest economic developments", and the Task Force on Review of School Curriculum's call to "create space and cater for learner diversity" | Guide p. 1 (§ 1.1) | Context only |
| 2023 HKMA proposal to merge deposit-taking companies into the restricted licence banks (two tiers, five-year transition). Teachers may introduce it, **but curriculum and assessment stay unchanged until it is fully implemented** | Supplement EN p. 32, 中 p. 27 (`H.banks`) | Dated 2023; the assessed content stays as it is until then |
| The Census and Statistics Department separated the capital and financial accounts in 2023 | Supplement EN p. 41, 中 p. 35 (`J.bop`) | Dated 2023; students need not tell the two apart for a transaction |
| Undated Department notes: real GDP by chain volume measures; "net external primary income flows" for net income from abroad; "trade balance" means visible trade balance although no longer published; the current account uses the change-of-ownership principle | Supplement EN pp. 25, 26, 40; 中 pp. 22, 34 | "Teachers are advised to introduce"; not new key points. The PDFs do not say which were added in 2025 and which in 2015 |
| `J` gains the balance of payments | Not in the PDFs. The repo's note cites EDB circular EDBCM24113C (`docs/research/2026-09-question-bank.md` § 3) | Not re-verified here. `topics.ts` already has `J.bop`; the guide's printed title is "*Brief introduction to* the balance of payments account" |
| Older changes still in force (2016 HKDSE), footnotes 3–6 | Guide pp. 16, 17, 18, 20 | Not 2025 changes, but they are already in the "NOT required" lists |

**Cannot be said without the 2015 guide:** which key-point wordings or items changed, whether the time allocation or the
assessment objectives changed, and which supplement notes are new. If you upload it I can diff the two; I did not download
it.

## 8. What can and cannot be measured

### 8.1 By dimension

| What you would report | How it is measured | Depends on | How far to trust it |
|---|---|---|---|
| **Topic** coverage (A–J, EL) | marks per topic, from tags rolled up to the coarse topic (`src/model/topics.ts:rollupTopic`) | any tagging | Highest: a mis-tag between two key points of one topic does not change it |
| **Key-point** coverage (49 + the chosen elective's 2) | marks per key point; "tested" = it has marks | per-part tags | Good if tags are teacher-confirmed or the AI passes the eval |
| **Point** coverage (119 + 5 or 6) | marks per point | AI or hand sub-point tags | Lowest: neighbouring points are easy to confuse (`C.ped#revenue` vs `#factors`); show it as detail, not the headline, until the eval says otherwise |
| **Marks** | exact marks of the paper, times the share of each marked unit | the paper + shares | Marks exact; shares are estimates for multi-topic units |
| **Section / paper weights** | the paper's own split vs 30 / 26 / 33 / 11 | the paper shape | Exact, but a mock need not follow the exam's split |
| **Skills (band)** | Know / Apply–Analyse / Evaluate from the command word, EN and 中文 (IDEAS C12) | a lexicon; no key | Good where a command word exists; "Do you agree?" style stems need the AI |
| **Diagrams, calculations, data** | presence in the paper (an answer graph or diagram block, a calculation verb, a table) set against the points flagged `diagram`, `calculate`, `data` in the data file (23, 22 and 9 of 130) | the flags + paper features | "Which diagram-eligible points had a diagram?" is answerable; the flags are conservative |
| **Out-of-syllabus** content | the question needs something the guide says is NOT required | AI + the limits list | Needs the AI; useful and risky, so stage it late |

The guide's assessment objectives (§ 5.3, p. 54) are nine statements (a)–(i). (a)–(g) describe skills (know, apply to
real situations "especially the Hong Kong economy", interpret information in various forms, use basic tools, analyse,
evaluate, present with diagrams and examples); (h) and (i) are about citizenship and "may not be applicable to public
assessment". **The guide gives no weights for them**, so a coverage check can show a distribution (bands, diagram and
calculation presence) but not "compliance".

### 8.2 The denominator problem

"% of the whole syllabus" is not one number. Three honest denominators, all derivable from the data file:

1. **Count of units**: 49 Compulsory key points (119 points). Treats every item as equal.
2. **Lesson hours**: 194 h Compulsory, spread over a topic's points (guide p. 23). Treats time as importance.
3. **A teacher scope**: any subset of units ("taught so far").

And two different questions: **breadth** (how many of the units in scope are touched at all) versus **balance** (how the
marks fall across them). A 45-question Paper 1 can touch at most 45 key points however well it is built, so even a full
exam cannot reach 100% of 119 points; "coverage" of the whole syllabus is a ceiling-limited number, and a scope or a
blueprint is the useful reference.

### 8.3 What cannot be measured

- **Difficulty or quality.** Coverage says what was asked, not whether it was fair or hard (item analysis is IDEAS G1).
- **An official topic target.** The exam publishes paper weights only, so there is no "correct" share per topic to
  compare with; only the teacher's blueprint (IDEAS C10) or lesson hours stand in.
- **"Taught so far".** It is the teacher's knowledge, not derivable from the paper.
- **What a question *really* tests,** with certainty. A keyword match fails here in both directions (a question can
  say "total spending" and test elasticity; it can say "price elasticity" and test an excluded point). It is a judgement,
  which is why § 10 uses the AI with a human check, and measures it.
- **HKEAA-sourced questions without a teacher's tags** (§ 10.6): they are never sent to a model, so they count only as
  well as the teacher tagged them.

## 9. Three ways a coverage check could work

All three read the paper through the registry (no question-type branching) and show the result in the planned C13 grid
(topic × band × marks, IDEAS § C).

| | **A. Tags + grid** | **B. AI tags per marked unit, then review** | **C. One whole-paper AI report** |
|---|---|---|---|
| How | Teachers tag parts by hand (the existing Topic row, bank tagging); the grid reads `tags`; keyless glossary suggestions help | ✦ verb proposes key points and points per marked unit; teacher accepts or edits; grid reads the result | One ✦ call reads the whole paper and returns a coverage list, like Check question quality |
| Sees what a question *tests* | Only as well as the teacher's tagging effort | Yes, with a measured error rate | Yes, one-shot, not auditable |
| Per-part marks and shares | Yes (equal split across a part's tags) | Yes, with an AI-suggested share | Rough |
| Stored / reusable (bank filters, blueprint C10, parallel paper C22) | Yes (already) | Yes | No: gone when the dialog closes |
| New schema | None | One optional metadata field, arriving with the verb (§ 10.4) | None |
| Needs a key | No | Yes (the tagging; the grid does not) | Yes |
| HKEAA questions | Teacher tags only | Never sent; teacher tags only | Never sent |
| Size (IDEAS scale) | S–M | M–L (verb, field, review, grid) | S |
| Main risk | Teachers will not tag; the grid shows "not tagged" | AI accuracy; cost of review | Cannot be checked or corrected |

**Recommendation: B**, built in stages (§ 10.10), starting with the eval. A is not a separate path: it is the floor B
stands on (key-point tags and the grid work with no key). C is a fine quick spike to see whether a model can do the
job at all, but it cannot become the feature. Name-matching alone (the `textTopics` approach) is kept only as a *clue*:
it cannot see what a question tests (§ 8.3), which is the user's point in u-d8lf.

## 10. AI tagging design

### 10.1 What it must fit

| Piece | Where | What the tagging verb takes from it |
|---|---|---|
| ✦ verb contract | `src/assist/types.ts:AiVerb` (id, group, `needsKey`, `available`, `sendsLine`, `run` → `VerbOutcome`); `src/assist/registry.ts:registerVerb`; one import in `src/assist/verbs/index.ts` | A new verb is one file. Five verbs exist; three (`write.answers`, `create.fromSource`, `check.quality`) are hidden by `src/assist/paused.ts:PAUSED_VERBS` until live evals pass: **the new one ships paused the same way** |
| Scope | `src/assist/scope.ts:scopeFromSelection` (paper, questions, flow items, texts, a block); bank runs `src/assist/bankRun.ts` (one question at a time, written into every identical copy by `src/library/sameCopies.ts`; Stop keeps what is done; Undo all) | Paper and selected-questions scope in the editor; a bank-wide run later |
| Reading a question without branching on its type | registry hooks `qualityView` (anchors with their words and marks) and `tagSlots` / `withSlotTags` in `src/registry/types.ts`; `src/quality/collect.ts:qualityQuestions` | The same view the quality check uses; per-part slots to write to |
| Talking to a model | `src/translate/deps.ts:createRunDeps`; `src/ai/client.ts` (`complete` with a **flat caller schema**, as `src/quality/prompt.ts:FINDINGS_SCHEMA`); chunking and workers as `src/quality/run.ts`; presets in `src/ai/providers.ts` (`concurrency`, `outputCap`) | Same transport, errors, provider choice, key handling |
| Per-part topics already exist | `Question.tags`, `QuestionPart.tags`, `QuestionSubPart.tags` + `tagsAt` (`src/model/types.ts`); `src/model/tagSlots.ts`; writes through `src/library/tagWrites.ts:retagQuestion`; design `docs/design/part-tags.md` | Key-point tags need no new storage |
| Keyless pieces | `src/library/termTopics.ts:textTopics` (EDB glossary term → topic); IDEAS C12 (command word → band, stimulus kind) | Clues and the skill band |
| Planned consumers | C10 blueprint, C13 grid, C14 lint, C15 provenance / HKEAA marking, C22 parallel paper, E7 patterns (`docs/design/ai-pattern-questions.md`) | They read the tags; they do not each need their own AI call |
| Eval convention | `evals/translate.eval.ts`, `vitest.eval.config.ts`, `npm run eval:translate` (live providers, keys from the environment, never part of `npm test`) | A tagging eval beside it |

### 10.2 The verb

**`check.syllabus`**, group `check`, labelled **"Tag topics"** / **「標註課題」** (the repo's terms are Tag 標籤 and Topic
課題, `docs/design/ui-language.md`; the finer layer would read 學習要點 as the guide does; wording for you to confirm).
It reads questions and files them, and writes only metadata, so it does not need a new menu group.

- **Scope:** the whole paper or the selected questions (as `check.quality`); a bank-wide run later (§ 10.10).
- **The unit it tags is the *marked unit*:** a question with no parts (an MC question), else the smallest part or
  sub-part that carries marks. Sub-parts that share one marks label (real papers do this; `QuestionSubPart.marks` is
  optional) are one unit, so marks are never invented for a sub-part. Its tags are what `src/model/tagSlots.ts` calls
  the slot's, and a parent's topics stay derived from its leaves.
- **Modes** (the menu runs the first; the others sit behind a chip): **Fill untagged** (default: only units with no tags
  of their own), **Refine to points** (key point known, pick points and shares inside it), **Re-check** (proposals shown
  as cards, never written over a teacher's tags).
- **What is sent per unit:** the question's context (stem, lead-in, source), the unit's own words, an MC question's
  options and key (and the teacher-only explanation if there is one), its marks, any teacher-only answer or scheme text,
  stimulus tables and diagram labels as text (the same serialisation `check.quality` uses), **one language side** (the
  paper's lead side; both only if one is empty: halves the tokens), the local clues (§ 10.5) and the existing tags.
- **What is never sent:** any question marked HKEAA (§ 10.6), student data (none exists in the app), the document's
  title, school or other questions.
- **`sendsLine`:** "Sends *n* questions to *Provider* with your key" as for the other verbs; the preset's `privacy` line
  already says who may keep the text (Gemini free keys, DeepSeek in mainland China): § 10.6.

**What the model returns** (flat: all fields required, no unions, as the client's ladder needs; one item per unit and
point, so several items share a `key` for a multi-label unit):

```jsonc
{ "items": [
  { "key": "q12.(b)(ii)",          // request-local, never an app id (as check.quality)
    "code": "C.ped#revenue",       // a code from the list, or a key-point code if the point is unclear, or "OUT"
    "weight": "main",              // "main" (one per unit) | "also" (at most two)
    "band": "apply",               // "know" | "apply" | "evaluate"
    "conf": "high",                // "high" | "medium" | "low"
    "why": "Asks what happens to total revenue after a price rise; needs the PED–revenue link." } ] }
```

- **Marks share** is computed locally, not asked for: *main* counts 2, *also* counts 1, shares = weight ÷ sum, applied to
  the unit's marks (shown to one decimal; an MC question is 1 mark split 2⁄3, 1⁄3). Language models are poor at
  percentages; two labels are easy to review and to edit.
- **Confidence** is three levels, not a number, defined in the prompt (high: the unit cannot be answered without it;
  medium: plausible, another point could fit; low: a guess). A model's own confidence is poorly calibrated, so it is
  **measured against the eval** (§ 10.9) before it drives anything; a *local* second signal is shown beside it: does a
  glossary clue or the teacher's existing tag agree?
- **`why`** is one short sentence in the paper's language, for the review card and for error analysis. It is **not
  stored** (§ 10.4): a stored reason goes stale the moment the question is edited.
- **Validation (local, never trusts the reply):** an unknown code is dropped; a key not sent is dropped; at most three
  items per unit, exactly one `main` (the first is promoted if none); `OUT` allowed only with a `why`; a reply that does
  not parse is retried once, then the chunk is split, as `src/quality/run.ts` does; a run that stops keeps what finished.
- **Prompt shape** (static first, so providers that cache a shared prefix can; the client does no explicit caching):

```
SYSTEM  You tag exam questions from a Hong Kong secondary Economics paper with the syllabus points they TEST.
        Tag what a student must know or do to earn the marks, not words that appear in the text.
        Use only codes from LIST. One "main" point per unit and at most two "also".
        OUT: earning the marks needs something EXCLUDED lists as not required (say which in "why").
        band: know = recall/state/define; apply = calculate/explain/analyse/draw; evaluate = discuss/judge/recommend.
        conf: high / medium / low as defined. Reply with the JSON object only.
LIST    C.ped#arc   Price elasticity of demand · Arc elasticity          (130 lines, ≈ 2.4k tokens)
EXCLUDED  C.ped: point, cross and income elasticity; the second law of demand; …   (from `notRequired`)
USER    {"units":[{"key":"q3.(b)","marks":4,"kind":"structured","context":"…","text":"…",
                   "clues":["total revenue"],"tagged":["C.ped"]}]}
```

**What the teacher sees.** Results are written straight away as *AI-proposed* (one commit, one ⌘Z; the AI door's rule),
and the review bar lists a card per unit: "Question 3 (b)(ii) · 4 marks → *Price elasticity of demand · Relationship
between price elasticity and total revenue* (main), *Arc elasticity* (also) · Apply · High · "Asks what happens to
total revenue…"". Cards are `inserted` for high confidence with a clue or tag that agrees, `look` for low or medium
confidence or a disagreement. Each card has **Accept**, **Edit** (opens the Topic row at that slot) and **Remove**; the
bar has **Accept all high**. Nothing a teacher typed is ever replaced by a run. A tag the teacher accepted or typed is
"confirmed"; the grid says how much of the paper is.

### 10.3 Why the AI is needed (and where keywords fail)

Six invented items, written for this document (not from any HKEAA paper), with what a name-matcher sees:

| # | Item | Gold | A glossary/name matcher says |
|---|---|---|---|
| 1 | MC. "The fare for a tram ride rises from $3 to $3.50 and daily passengers fall from 1 000 to 960. The company's fare revenue will ______." | `C.ped#revenue`; apply | Nothing: it never says "elasticity" or "total revenue" |
| 2 | Part (2 marks). "Explain why a rise in the price of coffee may increase the demand for tea." | `C.individual-demand#factors` (main), `#related-goods` (also); apply | Nothing: no "substitute" |
| 3 | Part (3 marks). "Using Table 1, calculate the growth rate of real GDP in 2024." | `F.national-income#gdp`; apply (calculate, data) | Probably `F.national-income` (the glossary knows GDP): an easy case |
| 4 | Part (6 marks). "Discuss whether the Government should run a deficit budget during a recession. Use an AD-AS diagram." | `I.fiscal#effects` (main), `G.equilibrium#changes` (also); evaluate | `I.fiscal` ("deficit budget") **and `I.cycles`** ("recession"); misses `G` |
| 5 | Part (2 marks). "The demand function is Q = 40 − 2P. Calculate the point elasticity of demand when P = 8." | `OUT` (point elasticity is NOT required; nearest `C.ped#arc`) | `C.ped` ("point elasticity" is in the table): **no sign it is excluded** |
| 6 | MC. "A unit tax is imposed on a good with perfectly inelastic demand. Which statement is correct? (1) Consumers bear the whole tax. (2) The quantity transacted falls. (3) …" | `C.intervention#tax-subsidy` | `C.intervention` ("unit tax") **and `C.ped`** ("perfectly inelastic demand") |

The right-hand column is read off the glossary-term table in `src/library/termTopics.ts` (I did not run the matcher). Items 1,
2 and 5 are the failures the keyword approach cannot avoid; item 4 shows both errors at once (a spurious `I.cycles`, a
missed `G`); item 6 is a labelling-rule question (the supplement lists "how elasticities affect the tax burden" *under* the
tax point, so a separate `C.ped` tag would be a false positive).
The eval's labelling guide has to settle such cases before accuracy means anything.

### 10.4 Where the result is stored

`Question.tags` is one list of strings with a **reserved grammar** (`src/model/topics.ts:TOPIC_CODE_PATTERN`,
`docs/design/question-library.md` § Tag grammar): a topic code is one capital or `EL`+number, then **at most one**
`.` + lower-case slug (`C`, `EL1`, `C.ped`); `::` makes a 題型; `@…` is a system tag; **anything else is a free tag.**

| Option | What is stored | Verdict |
|---|---|---|
| **1. Key points in `tags` only** | `C.ped` per part, through `withTagState` | Good as far as it goes: valid codes, per part, synced and read everywhere (bank, filters, Fill, topic cards). Cannot hold points, shares, confidence or "AI-proposed vs teacher-confirmed" |
| **2. Points in `tags` too** | `C.ped#arc` or `C.ped.arc` | **No.** A point code is not a topic code: it would read as a *free tag* in this and every published build, show up as a stray chip, be offered to teachers as a free tag, and be rewritten by Replace; widening the grammar to two segments is not backward compatible either (a published build's `isTopicCode` rejects a two-segment code, so it still reads it as a free tag). A flat string list also has no room for shares or status without encoding them in the string |
| **3. A sidecar outside the document** | codes keyed by `contentKey` in an app store | Edits to a question would detach tags (good) but the tags would not travel with the file, the bank copy or a colleague's copy |
| **4. Both: key points in `tags`, the refinement in one new optional field** | see below | **Recommended** |

**Recommendation (option 4):**

- **Key-point codes go in `tags`** (per part, via `tagSlots` and `retagQuestion`), so everything that exists keeps working
  with no change. They are written only where the unit has no tags of its own (or the teacher accepts a proposal).
- **Everything else goes in one new optional question-level field**, e.g. `Question.pointTags`, metadata only. It arrives
  **with the verb, not later**: without it an AI-proposed key-point tag is indistinguishable from a teacher's in `tags`,
  and the grid could not say how firm its numbers are. In stage 1 its entries hold key-point codes; stage 2 adds point codes.

```ts
interface PointTags {
  syllabus: 'hkdse-econ-2025';        // which data file the codes belong to; a later edition gets a new id
  at: string;                         // ISO time written (like tagsAt)
  ck?: string;                        // contentKey when tagged: edited since? → the grid marks it stale
  slots: Record<string, {             // key = TagSlotInfo.key (part rootId ?? id); '' = the question itself
    picks: Array<{ code: string; w: 1 | 2 }>;    // 'C.ped' (stage 1) or 'C.ped#arc' (stage 2); 2 = main, 1 = also
    band?: 'know' | 'apply' | 'evaluate';        // a teacher override of the derived band
    by: 'ai' | 'teacher';
    ok?: true;                        // a teacher accepted an AI proposal
    conf?: 'high' | 'medium' | 'low'; // AI only
  }>;
}
```

- **Consistency rule, so the two cannot disagree:** `tags` always wins. A slot's entries count only while their key points
  (the code before any `#`) are among the slot's effective tags; if the teacher changes the tags, the refinement is stale and ignored (the grid
  falls back to the tags, equal split) and the card says "tags changed since AI tagging".
- **Why a separate field and not just a richer `tags`:** the grammar (above); provenance (`by`, `ok`) and shares have no
  place in a string list; and `tags` has newest-copy-wins sync across copies (`src/library/sharedTags.ts:sharedState`)
  designed for teachers' edits, which a flood of AI proposals should not drive. In v1 `pointTags` is per copy, no sync.
- **Compatibility checklist** (`AGENTS.md`): optional, so no schema bump; nested, so no `KNOWN_KEYS` entry (that set is
  the worksheet's top-level keys, `src/model/migrations.ts`); classify it `metadata` in
  `src/library/contentKeyFields.test.ts` and add it to `IGNORED` in `src/library/contentKey.ts`, or identical copies
  split into false "versions"; keep it out of the IR, preview, clipboard and `.docx` (as `tags`: never printed; a test
  per backend); `src/feedback/anonymise.ts:KEPT_KEYS` is deny-by-default, so its strings are dropped from anonymised
  copies (right); `src/model/backwardCompat.test.ts` and the frozen v1 corpus are untouched. An older build that opens
  such a file keeps the field and does not update it: another reason for the `ck` stale check. Slot keys are root ids, so
  `copyQuestion` keeps them valid.
- **Not stored:** the reason text, the prompt version, the provider. They are session-only (the verb outcome "is not
  persisted"); the eval keeps its own record.
- **Sub-point codes** use `#` so that no point code can ever parse as a topic code (`isTopicCode('C.ped#arc')` is
  false); they must never be written to `tags`. (A teacher who typed one by hand would just create a free tag, which
  `freeTagIssue` in `src/model/patterns.ts` accepts: harmless, and `pointTags` never reads `tags` for points.)

### 10.5 What stays keyless and local, and what needs the AI

| Task | Where | Why |
|---|---|---|
| Marks, numbering, paper kind, section weights, scope maths, the grid, stale and "not tagged" counts | local | arithmetic over the model |
| Command word → band (Know / Apply–Analyse / Evaluate), EN and 中文 (IDEAS C12); stimulus kind; diagram or calculation presence | local lexicon + the registry | deterministic and testable; the AI only breaks ties where there is no command word |
| Glossary-term **clues** (`src/library/termTopics.ts:textTopics`) | local | offline suggestion chips for the Topic row; also passed to the model as a hint and used as a local second opinion on its answer. **Not** the tagger |
| Shortlist of candidate key points | **not needed** | the whole point list is ≈ 2.4k tokens (key-point list ≈ 0.6k), so send it all every time: a pre-filter would only add a way to miss the right answer, which is the failure being avoided |
| Deciding what a unit *tests*: key points, points, which is main | **AI** | the hard part; judgement over wording and context |
| The reason; "needs something the guide excludes" | **AI** | judgement |
| Validation, normalising shares, staleness | local | never trusts the reply |
| Scoring the eval | local | counts and F-scores |

Without a key the verb shows the usual setup card (`needsKey: true`), but the grid still works from teacher tags and the
derived bands, and the clues still suggest topics. The AI adds a better first guess, nothing structural.

### 10.6 HKEAA-sourced questions and the licence

What the repo already recorded (not legal advice; `docs/research/2026-09-question-bank.md` § 3,
`docs/design/ai-pattern-questions.md`, IDEAS C15): the HKEAA licence is per school and premises-only, every copied
question carries its particulars plus "Licensed by copyright owner: HKEAA", and the **cover sheet forbids use with AI
tools**.

- **Rule:** the verb **never sends an HKEAA-sourced question (or its answer or scheme) to any model**, whichever provider,
  including a local one (Ollama), until HKEAA or a lawyer says a local model is allowed. The design doc's "a pattern built
  on the teacher's machine, with no AI" is the model here: local processing is fine, an AI tool is not.
- **The gap:** nothing marks them today. There is no `origin` field and no licence guard in `src/` (checked);
  `Question.provenance` is a free-text, teacher-only note and *content*. The pattern doc's plan (`origin?: { by: 'hkeaa';
  cite?: string }` set at import and editable, plus IDEAS C15) is not built. **This verb should not ship before it.**
- **Until then (a warning, not a gate):** a keyless scan of `provenance`, the headers and footers and the title for
  "HKDSE", "Hong Kong Examinations and Assessment Authority", 香港考試及評核局 or "Licensed by copyright owner" (the pattern
  doc's import detection) marks a question as probably HKEAA; the run asks once, "Skip the questions that look like HKEAA
  papers?", and the teacher confirms that the rest are the school's own.
- **What those questions get instead:** the teacher's own tags (the Topic row, bank tagging) and the keyless clue chips.
  The grid counts them like any tagged unit, labelled *teacher-tagged*; untagged, they show as "not tagged: *n* marks". A
  mixed paper runs on the school's own questions, and the outcome says "*n* skipped (HKEAA)".
- **Confidentiality is the other half.** A school's *unreleased* test is also sensitive: sending it to a hosted model
  exposes it before it is sat. The preset `privacy` lines (`src/ai/providers.ts`) already say who may keep the text:
  Gemini free keys may be used to improve products; DeepSeek stores in mainland China; Ollama "nothing leaves this
  computer". The verb inherits the existing "Sends … to *Provider*" line and should add a first-run notice; Ollama is the
  privacy option, and is worth including in the eval.
- The syllabus data file is the EDB's names; the eval set (§ 10.9) is original items only. Neither contains HKEAA text.

### 10.7 Cost and latency per paper

**Estimates, not measurements: no model was called for this document.** Inputs: the point list is 9 412 characters (130
lines) ≈ 2.4k tokens, the key-point list 2 431 characters ≈ 0.6k (counted from the JSON; ≈ 4 characters per token); with
the system text and the exclusions the static prefix is about **3.5k tokens**. The repo's three demo MC questions average
195 English characters, which is short; I assume 300–600 characters (≈ 100–150 tokens) for a real item, one language
side, about 80 output tokens per unit. Chunking as `check.quality` (6 000 characters, 6 questions per request; MC lists can
take about 12).

| Job | Units | Requests | Input tokens | Output tokens | Wall time* |
|---|--:|--:|--:|--:|---|
| Paper 1 (45 MC) | 45 | ≈ 4 | ≈ 20k | ≈ 3.6k | ≈ 6–16 s |
| Paper 2 (≈ 10 questions, ≈ 30 marked units, stimulus-heavy) | ≈ 30 | ≈ 3 | ≈ 15k | ≈ 2.4k | ≈ 6–16 s |
| A bank of 500 questions | 500+ | ≈ 40 | ≈ 210k | ≈ 40k | see note |

\* rounds of requests (requests ÷ the preset's `concurrency`: Gemini 2, DeepSeek and Qwen 3, Ollama 1) × an assumed 3–8 s
each; on a single worker (Ollama) the same papers take about twice as long.
**Cost:** tens of thousands of tokens per paper is cents or less on the cheap presets and still under a dollar on the
premium ones at ordinary list prices (I did not look prices up; check them when the eval runs). The verb should record
`CompletionResult.usage` and `ms` per request so the eval turns these estimates into numbers. A prefix-caching provider
cuts the repeated 3.5k.

**Bank runs:** `src/assist/bankRun.ts` deliberately runs one question at a time (so Stop keeps what is done), which makes
500 questions one request each, roughly 25–50 minutes. A tagging run is independent per question, so it should batch by
paper instead (the bank's unit of storage), with the same Stop and Undo-all rules. That is design work for stage 3.

### 10.8 How the C13 grid then shows "% of the syllabus"

C13 (IDEAS § C) is the paper's 雙向細目表: topic × band × marks, with flags. With tags it grows a **Coverage** view:

- **Rows** are the data file's tree: topic → key point → point (collapsed to key point unless point tags exist). **Columns**
  are Know / Apply–Analyse / Evaluate (C12), then total marks and % of the paper. A cell is marks, drawn lighter where the
  tag is AI-proposed and not yet confirmed.
- **Scope chip:** *Whole syllabus* (all Compulsory units, plus the Elective the paper uses if it has a Section C) or a
  **teacher-chosen scope**: tick topics, key points or points; presets from the guide's two sequences (§ 2.5), which include
  "B part I / part II". The scope lives in the planned C10 `blueprint` (a top-level key, so a `KNOWN_KEYS` entry when built),
  with named presets in app settings; a *class's* scheme of work is a later extension.
- **Headline numbers**, each with its denominator named:
  1. **Breadth**: units in scope with marks ÷ units in scope ("*31 of 49 key points · 63%*; *52 of 119 points · 44%*").
  2. **Marks in scope**: marks on scope units ÷ all marks; **marks outside the scope are flagged**: "9 marks test topics not
     taught yet".
  3. **Gaps**: the units in scope with no marks, by topic (the actionable list).
  4. **Balance**: each topic's share of marks beside its share of lesson hours in scope (guide p. 23); C13's "one topic over
     40%" flag stays.
  5. **Skills**: the band split; diagram and calculation presence against the scope's `diagram` / `calculate` points.
  6. **How firm it is**: "78% of marks teacher-confirmed, 14% AI-proposed, 8% not tagged; 2 questions edited since tagged".
- **Why both breadth and marks:** breadth alone rewards one 1-mark question per topic; marks alone hide gaps.
- Teacher-facing only (`data-print-hide`); the export paper check can print the flags. A part with several tags splits its
  marks by the shares of § 10.2; shares are shown to one decimal, never as false precision.

### 10.9 A small eval set

The repo's convention (`evals/translate.eval.ts`): live providers, keys from the environment, a skipped provider with no
key, reports kept out of git. A tagging eval would be a new file beside it (say `tagging.eval.ts` in `evals/`), run by a new
`eval:tagging` script, with its items in a fixtures folder.

- **Size and shape:** about **120 items** (60 is the minimum that says something): ≥ 1 for each of the 49 Compulsory key
  points (49); 20 two-topic items (AD-AS with a policy; PED with a tax; …); 10 data-response parts with an HK extract;
  10 Elective items; **10 out-of-syllabus items** (Giffen, point elasticity, indifference curves, Phillips curve…);
  about 20 more by language: the same item as EN-only, 中文-only and bilingual. A 60/40 MC / structured mix.
- **Source:** **original items only**: the sample paper in `src/model/samplePaper.ts`, your school's own questions (with
  your say-so), and items drafted per key point and then reviewed. **No HKEAA text in the repo** (a standing rule). If
  an AI drafts items, a *different model family* from the tagger should, or accuracy is inflated by self-agreement.
- **Gold labels, by you (or a colleague):** per marked unit: one primary key point, up to two secondary, the primary
  point, band, and an `outOfSyllabus` flag. **Two labellers on 30 items** to measure agreement: that is the ceiling for any
  model, and it fixes the labelling guide (item 6 above is the kind of case it must settle). About two hours for 60 items.
- **Metrics:** primary key-point top-1; key-point and point micro-F1 (multi-label); marks-share error; band accuracy vs
  the keyless C12 band; **calibration** (precision by `conf`, so "high" can be trusted or not); out-of-syllabus recall and
  precision; **language consistency** (same primary across EN, 中, bilingual); **stability** (same primary over three runs);
  cost and latency from `usage` and `ms`.
- **Baselines:** the keyless `textTopics` clue alone (the "match the names" approach; the AI must beat it clearly); the
  prompt with and without clues; key-point-only vs point-level list; providers: Gemini 3.5 Flash-Lite, DeepSeek, Qwen, and
  Ollama for the privacy case.
- **Proposed gates (to agree with you):** primary key-point top-1 ≥ 85% (a score above the two labellers' agreement with each other would mean the labels, not
  the model, are the problem); point-level
  top-1 ≥ 70% or else ship key-point only; "high" confidence precision ≥ 92%; out-of-syllabus flag recall ≥ 70% or else
  do not surface it; language consistency ≥ 95%.
- Paused until it passes, like the three paused verbs.

### 10.10 Stages and risks

| Stage | What | Size |
|---|---|---|
| **0. Measure** | the gold set, the harness and the baselines; no app code beyond `evals/`. A go / no-go on accuracy, provider and prompt | S–M |
| **1. Key points** | a data module generated from this JSON; C12 lexicon and bands (keyless); `origin` and the HKEAA guard (C15); the verb writes key-point tags per part plus `pointTags` provenance; the grid at key-point level; shipped paused | M |
| **2. Points** | point codes in `pointTags`, review cards at point level, a point picker, the stale check; the grid at point level | M |
| **3. Scope and bank** | `blueprint` scope with the guide's sequences as presets (C10); a per-paper bank run; C22 and E7 read the tags | M |

Risks: model confidence is not calibrated (measure it); neighbouring points are confusable (headline at key-point level);
two-topic questions make shares noisy (show them as estimates); a reply can follow instructions inside a pasted
stimulus (the output schema and the validator limit the damage; it is the teacher's own content, so a small risk);
a syllabus edition change needs a new data file and a code map, not an edit; the flags in the data file are my reading;
the licence is not settled; provider privacy differs.

## 11. Open questions for you

Each has a recommendation; none blocks stage 0.

1. **Which numbers count?** Recommended: headline = key-point breadth and marks in scope, points as detail, until the eval
   shows the AI is reliable at point level. (§ 8.2, § 10.8)
2. **Which weight for "% of syllabus"?** Every point equal, or lesson hours (they differ by up to 7 points: C and I).
   Recommended: show breadth by count and balance by hours, say which.
3. **Scope:** per paper, with presets from the guide's two sequences (B split in two), later per class? Does your school
   teach in one of those orders?
4. **Elective:** count it only when the paper has a Section C, for the one chosen part? Recommended: yes.
5. **HKEAA:** confirm "never to any model, even a local one" until HKEAA says otherwise; is a mock *adapted* from a past paper
   HKEAA-sourced for this rule? Recommended: yes, mark it; and build `origin` (C15) before this verb.
6. **Gold labels:** will you (and a colleague for 30 items) label 60–120 original items, about two hours for 60?
   Alternative: I draft labels and you only review, faster but biased toward my reading.
7. **Provider and privacy:** which provider would you run this on, given the paper is unreleased? Is a hosted model
   acceptable for a test before it is sat, or only Ollama? (Gemini needs a VPN in Hong Kong; DeepSeek and Qwen do not.)
8. **Storage:** are you happy with key points in `tags` plus one new metadata field, `pointTags`, from the first verb release
   (it holds who tagged and whether you accepted, later the points)? And the wording: "Tag topics / 標註課題" with the
   finer layer as 學習要點?
9. **Out-of-syllabus flag** ("tests something the guide says is NOT required"): wanted, or leave it out of v1?

## Appendix A. Full structure (generated from the JSON)

Codes are `topics.ts` codes for key points and `<key point>#<slug>` for points; a key point with no printed items is one
point, `<key point>#whole`. "Guide p." is the printed page. Skills: rec = recall, ex = examples, expl = explain,
calc = calculate, diag = diagram, data = interpret data, eval = evaluate (my reading of the supplement, § 5). The JSON also
has the 中文 names of the details, page numbers in both supplements, the limits and the notes.

#### A Basic Economic Concepts · 基本經濟概念

12 lesson hours · guide p. 9 · supplement EN p. 2–5, 中 p. 2–5

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`A.social-science`** | – | **Economics as a social science** | **經濟學作為一門社會科學** | 9 | rec · ex |
| **`A.scarcity`** | | **Scarcity, choice and opportunity cost** | **稀少性，選擇和機會成本** | 9 | |
| `A.scarcity#scarcity` | (i) | The source of economic problems: scarcity <br>• Unlimited wants and limited resources <br>• Free and economic goods | 經濟問題的根源：稀少性 | 9 | rec · expl · ex |
| `A.scarcity#choice-cost` | (ii) | Choice and opportunity cost <br>• Economic decisions involving choices among alternatives <br>• Concept of cost in economics <br>• Interest as the cost of earlier availability of resources | 選擇和機會成本 | 9 | rec · expl · calc · ex |
| **`A.basic-problems`** | | **The three basic economic problems** | **三個基本經濟問題** | 9 | |
| `A.basic-problems#three-questions` | (i) | What to produce? How to produce? For whom to produce? | 生產甚麼？怎樣生產？為誰生產？ | 9 | rec · ex |
| `A.basic-problems#how-society` | (ii) | How society tackles the basic economic problems <br>• By society's customs and traditions <br>• By government decisions <br>• By the market mechanism | 社會怎樣處理三個基本經濟問題 | 9 | ex |
| `A.basic-problems#property-rights` | (iii) | Private property rights and its importance in a market economy | 私有產權及其在市場經濟中的重要性 | 9 | rec · expl |
| **`A.specialization`** | – | **Specialization and exchange** <br>• Exchange as a condition for specialization | **專門化及交易** | 9 | expl |
| **`A.circular-flow`** | | **Circular flow of economic activities** | **經濟活動的循環流程** | 9 | |
| `A.circular-flow#households-firms` | (i) | Consumption of households and production of firms | 住戶的消費與廠商的生產 | 9 | expl · diag |
| `A.circular-flow#production-income-expenditure` | (ii) | The relationship among production, income and expenditure | 生產、收入和支出的關係 | 9 | expl · diag |
| **`A.positive-normative`** | – | **Positive and normative statements** <br>• Distinction between positive statements and normative statements | **實證性和規範性的陳述** | 9 | rec · ex · eval |

#### B Firms and Production · 廠商與生產

30 lesson hours · guide p. 10–12 · supplement EN p. 5–12, 中 p. 5–11

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`B.ownership`** | | **Ownership of firms** | **廠商的所有權** | 10 | |
| `B.ownership#forms` | (i) | Forms of ownership <br>• Public ownership <br>• Private ownership: sole proprietorship, partnership and limited company | 所有權的形式 | 10 | rec · ex · eval |
| `B.ownership#liability` | (ii) | Limited and unlimited liability | 有限責任與無限責任 | 10 | rec |
| `B.ownership#shares-bonds` | (iii) | Shares and bonds as sources of capital | 股票和債券作為資本來源 | 10 | rec · expl |
| **`B.production-types`** | – | **Types/stages of production** <br>• Primary, secondary and tertiary production and their inter-relationship | **生產的種類/階段** | 10 | rec · ex |
| **`B.goods`** | | **Types of goods and services produced** | **物品和服務的種類** | 10 | |
| `B.goods#producer-consumer` | (i) | Producer and consumer goods | 生產者物品和消費品 | 10 | rec · ex |
| `B.goods#private-public` | (ii) | Private and public goods | 私用品及共用品 | 10 | rec · ex |
| **`B.division-of-labour`** | | **Division of labour** | **分工** | 10 | |
| `B.division-of-labour#types` | (i) | Types: simple, complex and regional | 種類：簡單、複雜和區域分工 | 10 | rec · ex |
| `B.division-of-labour#pros-cons` | (ii) | Advantages and disadvantages | 利與弊 | 10 | expl |
| `B.division-of-labour#limitations` | (iii) | Limitations | 限制 | 10 | rec |
| **`B.factors`** | | **Factors of production** | **生產要素** | 11 | |
| `B.factors#human` | (i) | Human resources <br>• Labour: supply, productivity, mobility and different methods of wage payments <br>• Entrepreneurship: risk-bearing and decision-making | 人力資源 | 11 | rec · expl · calc |
| `B.factors#natural` | (ii) | Natural resources <br>• Land: supply | 天然資源 | 11 | rec |
| `B.factors#man-made` | (iii) | Man-made resources <br>• Capital: accumulation and depreciation | 人造資源 | 11 | rec · expl |
| `B.factors#hk-features` | (iv) | The features of (i) to (iii) in Hong Kong | (i) 至 (iii) 項在香港的特色 | 11 | rec |
| **`B.costs`** | | **Production and costs in the short run and long run** | **短期和長期生產及生產成本** | 11 | |
| `B.costs#short-long-run` | (i) | Definition of short run and long run <br>• In terms of fixed and variable factors of production | 以固定和可變生產要素定義「短期」和「長期」生產 | 11 | rec · ex |
| `B.costs#diminishing-returns` | (ii) | Law of diminishing marginal returns <br>• Illustration by total product, average product and marginal product schedules only | 邊際回報遞減定律 | 11 | rec · calc |
| `B.costs#costs` | (iii) | Cost of production <br>• Fixed and variable costs <br>• Total, marginal and average cost of production | 生產成本 | 11 | rec · ex · calc |
| `B.costs#scale` | (iv) | Economies and diseconomies of scale <br>• Internal economies and diseconomies of scale <br>• External economies and diseconomies of scale | 規模經濟和規模負經濟 | 11 | rec · expl · diag |
| `B.costs#integration` | (v) | Expansion and integration of firms <br>• Types: vertical, horizontal, lateral and conglomerate <br>• Motives | 廠商的擴張與結合 | 11 | rec · ex · expl |
| **`B.objectives`** | | **The objectives of firms** | **廠商目標** | 12 | |
| `B.objectives#profit-max` | (i) | Profit maximization with given prices and marginal cost schedule <br>• Meaning of profit as the difference between total revenue and total cost <br>• Profit maximizing choice of output for individual firms with given prices and marginal cost schedule <br>• The marginal cost schedule as the supply schedule of individual firms | 利潤極大化的目標：在已知價格和邊際成本表的情況下，將利潤極大化 | 12 | expl · calc |
| `B.objectives#other-objectives` | (ii) | Other objectives: market share, provision of non-profit making services, corporate social responsibility, etc | 其他目標：市場佔有率、提供非牟利的服務、公司的社會責任等 | 12 | ex |

#### C Market and Price · 市場與價格

32 lesson hours · guide p. 12–14 · supplement EN p. 12–19, 中 p. 11–16

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`C.law-of-demand`** | – | **Law of Demand** | **需求定律** | 12 | rec · expl |
| **`C.individual-demand`** | | **Individual demand** | **個別需求** | 12 | |
| `C.individual-demand#factors` | (i) | Factors affecting individual demand | 影響個別需求的因素 | 12 | expl |
| `C.individual-demand#related-goods` | (ii) | Complements and substitutes, superior and inferior goods | 輔助品和代替品、優等物品和劣等物品 | 12 | rec |
| `C.individual-demand#schedule-cp` | (iii) | Individual demand schedule and importance of the ceteris paribus assumption | 個別需求表和其他因素不變的假設的重要性 | 12 | expl |
| `C.individual-demand#qd-vs-demand` | (iv) | Difference between change in quantity demanded and change in demand | 需求量改變和需求改變的分別 | 12 | expl |
| **`C.market-demand`** | | **Market demand** | **市場需求** | 12 | |
| `C.market-demand#summation` | (i) | Horizontal summation of individual demand curves | 個別需求曲線的橫向總和 | 12 | rec · calc · diag |
| `C.market-demand#factors` | (ii) | Factors affecting market demand | 影響市場需求的因素 | 12 | expl |
| **`C.individual-supply`** | | **Individual supply** | **個別供應** | 12 | |
| `C.individual-supply#factors` | (i) | Factors affecting individual supply | 影響個別供應的因素 | 12 | rec · expl |
| `C.individual-supply#schedule-cp` | (ii) | Individual supply schedule and importance of the ceteris paribus assumption | 個別供應表和其他因素不變的假設的重要性 | 12 | expl |
| `C.individual-supply#qs-vs-supply` | (iii) | Difference between change in quantity supplied and change in supply | 供應量改變和供應改變的分別 | 12 | expl |
| **`C.market-supply`** | | **Market supply** | **市場供應** | 13 | |
| `C.market-supply#summation` | (i) | Horizontal summation of individual supply curves | 個別供應曲線的橫向總和 | 13 | calc · diag |
| `C.market-supply#factors` | (ii) | Factors affecting market supply | 影響市場供應的因素 | 13 | expl |
| **`C.equilibrium`** | | **Interaction between demand, supply and price** | **需求、供應和價格的相互作用** | 13 | |
| `C.equilibrium#definition` | (i) | Definition of equilibrium: no tendency to change | 均衡的定義：並無作出改變的傾向 | 13 | rec |
| `C.equilibrium#price-quantity` | (ii) | Equilibrium price and quantity | 均衡價格及數量 | 13 | calc · diag |
| `C.equilibrium#shifts` | (iii) | Effects of change in demand and/or change in supply on equilibrium price and quantity | 需求改變和/或供應改變對均衡價格及數量的影響 | 13 | expl · diag |
| **`C.surplus`** | | **Consumer and producer surplus** | **消費者盈餘及生產者盈餘** | 13 | |
| `C.surplus#consumer` | (i) | Marginal benefit to consumers, willingness to pay, consumer surplus, demand curve and their relationship | 消費者邊際利益、願意付出的代價、消費者盈餘、需求曲線及其關係 | 13 | rec · diag |
| `C.surplus#producer` | (ii) | Marginal cost of firms, minimum supply-price, producer surplus, supply curve and their relationship | 廠商邊際成本、最低供應價格、生產者盈餘、供應曲線及其關係 | 13 | rec · diag |
| `C.surplus#diagram` | (iii) | Illustrate consumer surplus and producer surplus in a demand-supply diagram | 以需求供應圖說明消費者盈餘及生產者盈餘 | 13 | diag |
| **`C.price-functions`** | | **Functions of prices** | **價格的功能** | 13 | |
| `C.price-functions#rationing` | (i) | Rationing function: existing supplies are distributed to users with highest value | 配給功能：現存供應分配予願意付最高價值的用家 | 13 | expl |
| `C.price-functions#allocative` | (ii) | Allocative function: <br>• Demand is derived from marginal benefit, and supply is derived from marginal cost; the interaction between demand and supply then determines price and resources allocation <br>• Changes in relative prices and resource deployment | 分配功能： | 13 | expl |
| **`C.ped`** | | **Price elasticity of demand** | **需求價格彈性** | 13 | |
| `C.ped#arc` | (i) | Arc elasticity | 弧彈性 | 13 | calc |
| `C.ped#revenue` | (ii) | Relationship between price elasticity and total revenue | 價格彈性和總收入的關係 | 13 | expl |
| `C.ped#factors` | (iii) | Factors affecting price elasticity of demand | 影響需求價格彈性的因素 | 13 | expl |
| **`C.pes`** | | **Price elasticity of supply** | **供應價格彈性** | 14 | |
| `C.pes#arc` | (i) | Arc elasticity | 弧彈性 | 14 | calc |
| `C.pes#factors` | (ii) | Factors affecting price elasticity of supply | 影響供應價格彈性的因素 | 14 | expl |
| **`C.intervention`** | | **Market intervention** | **市場干預** | 14 | |
| `C.intervention#price` | (i) | Price intervention: price ceiling and price floor | 價格干預：價格上限和價格下限 | 14 | rec · expl · diag |
| `C.intervention#quota` | (ii) | Quantity intervention: quota <br>• Illustration of quota by a kinked supply curve | 數量干預：配額 | 14 | rec · expl · diag |
| `C.intervention#tax-subsidy` | (iii) | Unit tax and unit subsidy <br>• Determination of the share of the tax burden/subsidy between producers and consumers | 從量稅和從量津貼 | 14 | calc · expl · diag |

#### D Competition and Market Structure · 競爭與市場結構

8 lesson hours · guide p. 14 · supplement EN p. 19–20, 中 p. 17

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`D.structure`** | | **Perfect competition and imperfect competition (monopolistic competition, oligopoly and monopoly)** | **完全競爭和不完全競爭(壟斷性競爭、寡頭壟斷和壟斷)** | 14 | |
| `D.structure#market` | (i) | Definition of market | 市場的定義 | 14 | rec |
| `D.structure#features` | (ii) | General features <br>• Number of sellers <br>• Number of buyers <br>• Nature of product <br>• Ease of entry <br>• Availability of information <br>• Price taker/price searcher | 一般特徵 | 14 | rec · ex |
| `D.structure#monopoly-power` | (iii) | Sources of monopoly power | 獲得壟斷能力的原因 | 14 | expl |

#### E Efficiency, Equity and the Role of Government · 效率、公平和政府的角色

18 lesson hours · guide p. 15 · supplement EN p. 21–24, 中 p. 17–20

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`E.efficiency`** | | **Efficiency** | **效率** | 15 | |
| `E.efficiency#conditions` | (i) | Conditions for efficiency: Maximization of total social surplus; marginal benefit equals marginal cost | 達至效率的條件：總社會盈餘極大化；邊際利益等於邊際成本 | 15 | rec · expl |
| `E.efficiency#deviations` | (ii) | Deviations from efficiency: <br>• Price ceiling, price floor, tax, subsidy and quota <br>• Deadweight loss | 偏離效率: | 15 | rec · expl · diag |
| `E.efficiency#externalities` | (iii) | Divergence between private and social costs (benefits): market versus government solutions, illustrated by examples ONLY | 私人代價(利益)和社會代價(利益)的分歧：只須用例子說明市場與政府的解決辦法 | 15 | ex · expl |
| **`E.equity`** | | **Equity** | **公平** | 15 | |
| `E.equity#efficiency-equity` | (i) | Efficiency and equity in a market economy | 市場經濟中的效率與公平 | 15 | expl |
| `E.equity#measuring` | (ii) | Measuring income inequality: income distribution, Lorenz curve and Gini coefficient | 量度收入不均：收入分配、洛倫茨曲線及堅尼系數 | 15 | expl · data |
| `E.equity#sources` | (iii) | Sources of income inequality: human capital (e.g. skill differentials), discrimination and unequal ownership of capital, etc | 收入不均的緣由：人力資本(例如技術差異)，歧視及資本擁有權不平均等 | 15 | expl |
| **`E.policy`** | | **Policy concerns** | **政策的考慮** | 15 | |
| `E.policy#aims` | (i) | Equalizing income or equalizing opportunities | 收入均等化或機會均等化 | 15 | expl · eval |
| `E.policy#disincentives` | (ii) | Disincentive effects of taxes and transfers | 稅項及轉移的抑制作用 | 15 | expl |
| `E.policy#trade-off` | (iii) | Trade-off between equity and efficiency | 公平與效率之間的取捨 | 15 | expl · eval |

#### F Measurement of Economic Performance · 經濟表現的量度

12 lesson hours · guide p. 16 · supplement EN p. 24–27, 中 p. 20–24

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`F.national-income`** | | **National income** | **國民收入** | 16 | |
| `F.national-income#general-term` | (i) | National income as a general term for aggregates like Gross Domestic Product (GDP) and Gross National Income (GNI) | 國民收入是本地生產總值和本地居民總收入等總量的統稱 | 16 | rec |
| `F.national-income#gdp` | (ii) | Gross Domestic Product (GDP) <br>• The three approaches to measure GDP: production approach (value-added approach), income approach, expenditure approach <br>• Nominal and real GDP <br>• GDP at factor cost <br>• per capita GDP; growth rate of GDP | 本地生產總值(GDP) | 16 | rec · expl · calc · data |
| `F.national-income#gni` | (iii) | GNI as GDP plus net income from abroad | 本地居民總收入為本地生產總值及從外國所賺取淨收益的總和 | 16 | rec · ex · calc |
| `F.national-income#uses-limits` | (iv) | Uses and limitations of national income statistics as an indicator of economic welfare and for international comparison | 以國民收入統計數字作為經濟福利指標和作國際比較時的運用和限制 | 16 | expl · eval |
| **`F.price-level`** | – | **General price level as measured by Consumer Price Index and implicit price deflator of GDP** | **以消費物價指數和本地生產總值內含平減物價指數量度一般物價水平** | 16 | calc · expl |
| **`F.unemployment`** | – | **Unemployment and underemployment rates as measured in terms of the percentage of unemployed and underemployed persons in the labour force** | **以失業及就業不足人士在勞動人口中所佔的百分比量度失業率及就業不足率** | 16 | rec · calc |
| **`F.hk-trends`** | – | **Recent trends of national income, general price level and unemployment in Hong Kong** | **香港近期國民收入、一般物價水平和失業的趨勢** | 16 | data |

#### G National Income Determination and Price Level · 國民收入決定及價格水平

16 lesson hours · guide p. 17 · supplement EN p. 27–31, 中 p. 24–26

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`G.ad`** | | **Aggregate demand (AD)** | **總需求** | 17 | |
| `G.ad#slope` | (i) | Reasons for a downward sloping AD curve | 總需求曲線向右下傾斜的原因 | 17 | expl · diag |
| `G.ad#determinants` | (ii) | Determinants of aggregate demand: <br>• Private consumption expenditure, which in turn depends on disposable income, the desire to save, wealth (value of assets), interest rate, etc <br>• Investment expenditure, which in turn depends on business prospect, interest rate, etc <br>• Government expenditure <br>• Net export, which in turn depends on the economic conditions of trading partners, exchange rate, etc | 決定總需求的因素： | 17 | expl · diag |
| **`G.as`** | | **Aggregate supply (AS)** | **總供應** | 17 | |
| `G.as#sras` | (i) | Reason for an upward sloping short run AS curve | 短期總供應曲線向右上傾斜的原因 | 17 | expl |
| `G.as#lras` | (ii) | Reasons for a vertical long run AS curve | 長期總供應曲線垂直的原因 | 17 | expl |
| `G.as#factors` | (iii) | Factors affecting short run and long run AS | 影響短期及長期總供應的因素 | 17 | expl · diag |
| **`G.equilibrium`** | | **The determination of level of output and price** | **產出和價格水平的決定** | 17 | |
| `G.equilibrium#equilibrium` | (i) | Determination of the equilibrium level of output and price level in the AS-AD model | 運用總供應─總需求模型以決定均衡產出及價格水平 | 17 | diag · expl |
| `G.equilibrium#changes` | (ii) | Changes in the equilibrium level of output and price level caused by change(s) in the AD and/or AS | 總需求及/或總供應的轉變如何改變均衡產出及價格水平 | 17 | diag · expl |
| `G.equilibrium#employment-output` | (iii) | Relationship between employment and output level | 就業與產出之關係 | 17 | expl |

#### H Money and Banking · 貨幣與銀行

18 lesson hours · guide p. 17–18 · supplement EN p. 31–34, 中 p. 26–29

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`H.money`** | | **Money** | **貨幣** | 17 | |
| `H.money#definition` | (i) | Definition of money | 貨幣的定義 | 17 | rec |
| `H.money#functions` | (ii) | Nature and functions of money | 貨幣的性質及功能 | 17 | rec |
| **`H.banks`** | | **Banks: functions and services** | **銀行的功能和服務** | 18 | |
| `H.banks#commercial-central` | (i) | Commercial banks and central bank | 商業銀行和中央銀行 | 18 | rec · expl |
| `H.banks#hk-tiers` | (ii) | Licensed banks, restricted licence banks and deposit-taking companies in Hong Kong | 香港的持牌銀行、有限制牌照銀行和接受存款公司 | 18 | rec |
| `H.banks#hk-central-banking` | (iii) | How central banking functions are performed in Hong Kong | 中央銀行的功能在香港如何運作 | 18 | rec · expl |
| **`H.money-supply`** | | **Money supply** | **貨幣供應** | 18 | |
| `H.money-supply#definitions` | (i) | Definitions of money supply in Hong Kong | 香港貨幣供應的定義 | 18 | rec |
| `H.money-supply#credit-creation` | (ii) | Credit creation/contraction and the banking multiplier | 信貸創造/收縮和銀行乘數 | 18 | rec · expl · calc |
| **`H.money-demand`** | | **Money demand** | **貨幣需求** | 18 | |
| `H.money-demand#motives` | (i) | Meaning of transactions demand for money and asset demand for money | 交易性貨幣需求和資產性貨幣需求的意思 | 18 | rec · expl |
| `H.money-demand#interest-income` | (ii) | Money demand as a function of nominal interest rate and income | 名義利率和收入對貨幣需求的影響 | 18 | expl |
| **`H.interest`** | – | **Determination of interest rate in the money market** <br>• Interaction of money supply and money demand | **貨幣市場中利率的決定** | 18 | expl |
| **`H.financial-centre`** | | **Hong Kong as a financial centre** | **香港作為金融中心** | 18 | |
| `H.financial-centre#factors` | (i) | Factors contributing to its development as a financial centre | 促成香港發展成為金融中心的因素 | 18 | expl |
| `H.financial-centre#effects` | (ii) | Effects on the Hong Kong economy | 對香港經濟的影響 | 18 | expl |

#### I Macroeconomic Problems and Policies · 宏觀經濟問題和政策

30 lesson hours · guide p. 18–19 · supplement EN p. 34–38, 中 p. 29–33

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`I.cycles`** | – | **Business cycles: a description of the short run fluctuations in real GDP around the long run trend** | **經濟周期：描述實質本地生產總值圍繞長期趨勢作周而復始的短期波動** | 18 | rec |
| **`I.inflation`** | | **Inflation and deflation** | **通貨膨脹和通貨緊縮** | 18 | |
| `I.inflation#definitions` | (i) | Definitions of inflation and deflation | 通貨膨脹和通貨緊縮的定義 | 18 | rec |
| `I.inflation#real-interest` | (ii) | Relationship between nominal and real interest rates | 名義利率和實質利率的關係 | 18 | calc |
| `I.inflation#redistribution` | (iii) | Redistributive effects | 再分配效應 | 18 | expl · ex |
| `I.inflation#quantity-theory` | (iv) | Inflation and Quantity Theory of Money | 通貨膨脹及貨幣數量論 | 18 | expl · calc |
| **`I.unemployment`** | | **Unemployment** | **失業** | 19 | |
| `I.unemployment#meaning` | (i) | Meaning of unemployment | 失業的意思 | 19 | rec · expl |
| `I.unemployment#underemployment` | (ii) | Meaning of underemployment | 就業不足的意思 | 19 | rec |
| `I.unemployment#cost` | (iii) | Cost of unemployment | 失業的代價 | 19 | expl |
| **`I.fiscal`** | | **Fiscal policy** | **財政政策** | 19 | |
| `I.fiscal#meaning` | (i) | Meaning of fiscal policy <br>• Definition of budget; surplus budget, deficit budget and balanced budget <br>• Taxation > Principles <br>• Taxation > Classification of taxes > Direct and indirect taxes <br>• Taxation > Classification of taxes > Progressive, proportional and regressive taxes <br>• Public expenditure: classification by function | 財政政策的意思 | 19 | rec · ex · expl |
| `I.fiscal#effects` | (ii) | Effect of fiscal policy on the level of output and price | 財政政策對產出及價格水平的影響 | 19 | expl · diag |
| **`I.monetary`** | | **Monetary policy** | **貨幣政策** | 19 | |
| `I.monetary#meaning` | (i) | Meaning of monetary policy | 貨幣政策的意思 | 19 | rec · expl |
| `I.monetary#effects` | (ii) | Effect of monetary policy on the level of output and price | 貨幣政策對產出及價格水平的影響 | 19 | expl · diag |

#### J International Trade and Finance · 國際貿易和金融

18 lesson hours · guide p. 20 · supplement EN p. 38–41, 中 p. 33–35

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`J.trade`** | | **Free trade and trade barriers** | **自由貿易及貿易障礙** | 20 | |
| `J.trade#advantage` | (i) | Absolute advantage, comparative advantage and gains from trade | 絕對優勢、比較優勢和貿易獲益 | 20 | rec · expl · calc |
| `J.trade#hk-pattern` | (ii) | Using the pattern of trade in Hong Kong to illustrate the principle of comparative advantage | 以香港的貿易模式來說明比較優勢原理 | 20 | expl · data |
| `J.trade#hk-importance` | (iii) | Importance of trade to Hong Kong's economy | 貿易對香港經濟的重要性 | 20 | expl · data |
| `J.trade#barriers` | (iv) | Trade barriers <br>• Types <br>• Effects of tariff and quota on price and output for a small open economy <br>• Trade barriers faced by Hong Kong | 貿易障礙 | 20 | rec · expl |
| `J.trade#hk-response` | (v) | Hong Kong's attempts to overcome trade barriers <br>• Trade promotion <br>• Role of the HKSAR Government <br>• Role of international economic institutions (e.g. World Trade Organisation) | 香港嘗試克服貿易障礙的辦法 | 20 | rec |
| **`J.bop`** | | **Brief introduction to the balance of payments account** | **國際收支平衡表簡介** | 20 | |
| `J.bop#current-account` | •1 | Current account <br>• Main components of the current account: goods, services, income and current transfers | 經常賬戶 | 20 | rec · expl |
| `J.bop#capital-financial` | •2 | Capital account and financial account | 資本賬戶及金融賬戶 | 20 | rec · expl |
| **`J.exchange-rate`** | | **Exchange rate** | **匯率** | 20 | |
| `J.exchange-rate#meaning` | (i) | Meaning of exchange rate | 匯率的意思 | 20 | rec |
| `J.exchange-rate#price-effects` | (ii) | Effect of a change in the exchange rate on import price and export price | 匯率的改變對進口價格和出口價格的影響 | 20 | expl · calc |
| `J.exchange-rate#linked-rate` | (iii) | Brief introduction to the linked exchange rate system in Hong Kong | 香港聯繫匯率制度簡介 | 20 | rec |

#### Elective Part 1: Monopoly Pricing, Anti-competitive Behaviours and Competition Policy · 選修單元(一)：壟斷定價、反競爭行為及競爭政策

24 lesson hours · guide p. 21 · supplement EN p. 43–45, 中 p. 36–37

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`EL1.pricing`** | | **Monopoly Pricing** | **壟斷定價** | 21 | |
| `EL1.pricing#simple-monopoly` | (i) | Simple monopoly pricing <br>• Determination of price, output and monopoly profit <br>• Efficiency implications <br>• Circumstances under which monopoly may be beneficial to society | 簡單壟斷定價 | 21 | rec · expl · calc · diag |
| `EL1.pricing#price-discrimination` | (ii) | Price discrimination <br>• Meaning of price discrimination <br>• Conditions for price discrimination | 價格分歧 | 21 | rec · ex |
| **`EL1.competition-policy`** | | **Anti-competitive Behaviours and Competition Policy** | **反競爭行為及競爭政策** | 21 | |
| `EL1.competition-policy#forms` | (i) | Major forms of anti-competitive practices <br>• Horizontal agreements among competitors: agreements to restrict prices and output <br>• Vertical agreements between buyers and sellers <br>• Mergers: horizontal mergers, vertical mergers and potential competition mergers | 反競爭行為的主要形式 | 21 | rec · ex |
| `EL1.competition-policy#impact` | (ii) | The impact of anti-competitive practices | 反競爭行為的影響 | 21 | expl |
| `EL1.competition-policy#ordinance` | (iii) | The Competition Ordinance in Hong Kong <br>• The objectives of the Competition Ordinance in Hong Kong <br>• The first conduct rule covering agreements, concerted practices and decisions that prevent, restrict or distort competition <br>• The second conduct rule covering abuse of market power <br>• Exclusions and exemptions | 香港的競爭條例 | 21 | rec |

#### Elective Part 2: Extension of Trade Theory, Economic Growth and Development · 選修單元(二)：貿易理論之延伸、經濟增長及發展

24 lesson hours · guide p. 22 · supplement EN p. 46–48, 中 p. 38–39

| Code | Label | EN | 中文 | Guide p. | Skills |
|---|---|---|---|--:|---|
| **`EL2.trade-theory`** | | **Extension of Trade Theory** | **貿易理論之延伸** | 22 | |
| `EL2.trade-theory#ppf` | (i) | Illustration of comparative costs and gains from trade with the aid of production possibilities frontier | 以生產可能曲線輔助說明比較成本和貿易獲益 | 22 | expl · calc · diag |
| `EL2.trade-theory#globalization` | (ii) | Comparative advantage and its relation to globalization | 比較優勢及其與全球化之關係 | 22 | rec · expl |
| **`EL2.growth`** | | **Economic Growth and Development** | **經濟增長及發展** | 22 | |
| `EL2.growth#measurement` | (i) | Measurement of economic growth and development <br>• Changes in real GDP <br>• Changes in per capita real GDP <br>• Changes in Human Development Index | 經濟增長及發展之量度 | 22 | rec · data |
| `EL2.growth#factors` | (ii) | Factors affecting growth of an economy <br>• Inputs: physical capital, human capital, natural resources, technological change <br>• Policies: saving and investment, foreign direct investment, trade, education, population, property rights, research and development | 影響經濟增長的因素 | 22 | expl · data |
| `EL2.growth#desirability-costs` | (iii) | The desirability and costs of economic growth <br>• Trade-off between current and future consumption <br>• Growth, living standard and income distribution <br>• Resources exhaustion, pollution and sustainable development | 經濟增長的好處和代價 | 22 | expl · eval · data |
| `EL2.growth#comparison` | (iv) | International/regional comparison | 國際/地區比較 | 22 | data · rec |

## Appendix B. What was and was not checked

**Done:** the three PDFs read for the syllabus tables; the guide's Chapters 2, 3 and 5 (and the opening of Chapter 1);
the two example sequences (rendered and read); text-colour scan of all pages; every name in the JSON verified against the PDF text with a
mutation test of the checker; page numbers computed; `topics.ts` parsed for the comparison; every repo path cited here
checked to exist.

**Not done:** the pre-2025 guide (not provided, nothing downloaded), so no diff; the EDB circular and the HKEAA 2026
document (cited from the repo's earlier note); the HKEAA licence text itself (taken from the repo's research);
Chapters 4 and 6 and Appendices 3–6 of the guide; the Chinese C&A guide (only the Chinese supplement); no model was called
and no price was looked up, so § 10.7 is arithmetic on stated assumptions; the skill flags and `notRequired` summaries are
my reading and were not reviewed by a teacher.
