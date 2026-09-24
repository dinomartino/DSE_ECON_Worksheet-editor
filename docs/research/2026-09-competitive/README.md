# Competitive research — September 2026

Five parallel research passes on 2026-09-24, browsing live sites (ego-browser, plus web
search where a page would not load). A snapshot: prices and features were true that day
and will drift. The ranked backlog drawn from them is [`docs/IDEAS.md`](../../IDEAS.md).

| Slice | File | Covers |
|---|---|---|
| Hong Kong | [hk.md](./hk.md) | EdCity OQB/DFS, HK publishers (Aristo, UPEP, OUP, Pearson), DSEconMentor, student apps, the 2028 syllabus |
| International builders | [intl.md](./intl.md) | Cambridge, OCR ExamBuilder, Pearson examWizard, AQA Exampro, IB Questionbank, Save My Exams, ExamView, TestGen, Respondus, LaTeX `exam` |
| AI tools | [ai.md](./ai.md) | MagicSchool, Brisk, Diffit, Eduaide, QuestionWell, MS Teach, Gemini in Classroom, HK AI tutors |
| Worksheet design | [design.md](./design.md) | Canva, Twinkl, LiveWorksheets, Wordwall, Kuta, Wayground, Kahoot, TpT, Forms |
| Workflow | [workflow.md](./workflow.md) | Gradescope, ZipGrade, Crowdmark, Akindi, item analysis, HKEAA marking conventions |

## Headlines

- **No HK tool does what we do.** The landscape is online MCQ platforms (EdCity OQB),
  publisher banks gated behind textbook adoption, student study apps, and thin AI
  generators. "Econ-editor" on aimakecoolstuff.com is our own product page, and
  `CY-Cheung/DSE-PAPER-editor` is a fork of this repo with no added features.
- **Word export is everyone's weak point.** International builders offer `.docx` as the
  lossy "editable" option (linked images, bitmap equations); ours is the faithful output.
- **The export dialog is the centre of every builder** — paper, mark scheme, both;
  answer space on/off; cover; versions with keys.
- **A tagged question library is the most common capability we lack.**
- **Nobody makes editable economics diagrams**, and nobody writes items in a specific
  exam board's format with bilingual text.
- **After the paper is sat**, tools that scan (ZipGrade, Gradescope) do not know the
  paper's structure; we do. That is the opening for answer-key export and item analysis.
- **AI tools** converge on: start from a source, set the shape first, review before
  insert, export flat documents. None keeps a structured item model through to Word.
