# A ComfyUI-style question builder: research

Date: 2026-10-12, against `develop` at `cf83cda2`. Research for the user's idea of building
economics questions by connecting nodes, the way ComfyUI builds images and videos. Reads
with `docs/design/ai-pattern-questions.md` (E7 Write one like this) and
`docs/research/2026-09-competitive/ai.md`. Not legal advice on the HKEAA licence.

## Summary

- ComfyUI is an open-source (GPL-3.0) node editor for diffusion models. A workflow is a graph
  of typed nodes; it saves as JSON and is also embedded in every image or video it makes, so
  dragging an output back in restores the exact graph and seed. Only nodes whose inputs
  changed re-run.
- A "look" is not copied from a reference. It is applied through a separate input: a LoRA
  (a trained style file), IPAdapter (style from one reference image) or ControlNet
  (structure from a reference: pose, edges, depth). That separation of look, structure and
  content maps well onto E7's rule: the reference contributes a *pattern*, never its wording.
- What transfers: typed inputs (a Reference node that physically cannot output text);
  caching so one option or one trap regenerates alone; variations by seed; recipes saved
  as files and shared; templates.
- What does not: the canvas itself, for most teachers. Every node tool surveyed (ComfyUI,
  Figma Weave, Krea, Dify, Opal) has added a form-style "App Mode" over the graph in
  2025 to 2026, because people who are not engineers do not wire graphs. One question
  is also small: 6 to 12 nodes. A form handles that.
- Top recommendation: build **recipes** (a saved, typed spec of inputs, as ComfyUI saves a
  workflow) shown as a **form**, with **per-option ✦ verbs** after insert. Leave the
  canvas as a later, advanced view only if teachers ask for it.

## What the user likely meant by "CAM files"

- ComfyUI has no `.cam` format; searches found none. The files that carry a ComfyUI setup
  are: the workflow `.json` (UI format, with layout), the API-format `.json` (execution
  only), and generated PNG, WebP, MP4 or WebM files with the workflow embedded in their
  metadata ([Comfy docs, workflow metadata](https://docs.comfy.org/development/api-development/workflow-metadata)).
- The "looks" are usually LoRA `.safetensors` files plus IPAdapter or ControlNet nodes.
- *Inferred:* "CAM" is most likely "Comfy" misheard, meaning the workflow `.json` or an
  image with the workflow embedded. Worth confirming with the user.

## 1. ComfyUI, concretely

**Graph model**

- Nodes connect by links between typed sockets; a link only joins matching types, and each
  type has a colour (conditioning, latent, image, mask)
  ([Comfy docs, nodes](https://docs.comfy.org/development/core-concepts/nodes)).
- Widgets are a node's own settings (seed, steps, text). Since the 2025 frontend's "widget
  input socket" model, every widget also has a socket: connect a link and it takes the
  linked value, no "convert to input" step
  ([ComfyUI Wiki FAQ](https://comfyui-wiki.com/en/faq/can-not-convert-widget-to-input),
  [frontend issue #5692](https://github.com/Comfy-Org/ComfyUI_frontend/issues/5692)).
- Primitive nodes hold one value that feeds several widgets. Reroute nodes tidy long links
  and are type-agnostic ([Comfy docs, Reroute](https://docs.comfy.org/built-in-nodes/Reroute)).
- Node modes: Always, Never (mute, `Ctrl+M`: as if deleted) and Bypass (`Ctrl+B`: skipped,
  inputs passed through to the next node)
  ([ComfyUI README](https://github.com/Comfy-Org/ComfyUI),
  [Comfy docs, nodes](https://docs.comfy.org/development/core-concepts/nodes)).
- Subgraphs (released 2025-08-07) bundle selected nodes into one reusable "super-node" with
  its own input and output slots, opened like a folder; they replaced the older group
  nodes ([Comfy blog](https://blog.comfy.org/p/subgraph-official-release)).

**Execution**

- Pressing Run queues the whole graph; runs are queued asynchronously.
- "Only parts of the graph that change from each execution to the next will be executed"
  ([README](https://github.com/Comfy-Org/ComfyUI)). The cache is keyed by a fingerprint of
  each node's inputs; change the last node and only it re-runs; run the same graph twice and
  nothing runs ([source tour](https://pyshine.com/ComfyUI-Node-Graph-Execution-Engine-Source-Tour/)).
  Nodes can force a re-run by returning a changing fingerprint (`IS_CHANGED`)
  ([discussion #12546](https://github.com/Comfy-Org/ComfyUI/discussions/12546)).
- Variations come from the seed widget and its "control after generate" setting: fixed,
  increment, decrement, randomize ([Comfy docs, Seed node](https://docs.comfy.org/built-in-nodes/SeedNode)).
  Fixed seed plus a changed prompt gives a controlled comparison; increment gives a series.
- Preview nodes show intermediate results; Save nodes write files.

**Workflow files and sharing**

- The UI format holds nodes (`id`, `type`, `pos`, `inputs`, `outputs`, `widgets_values`,
  `mode`), links and layout; it is specified as a versioned JSON Schema (v0.4, v1.0)
  with changes discussed in an RFC repo ([Comfy spec](https://docs.comfy.org/specs/workflow_json)).
- Every saved output can carry both `workflow` (UI graph) and `prompt` (execution graph):
  PNG text chunks, WebP EXIF, MP4/WebM container tags. "Dragging a generated png on the
  webpage ... will give you the full workflow including seeds"
  ([README](https://github.com/Comfy-Org/ComfyUI),
  [metadata docs](https://docs.comfy.org/development/api-development/workflow-metadata)).
- The weak point: metadata is lost when a site or optimiser re-encodes the file, so shared
  images often arrive without their workflow (same docs page).
- A Templates browser ships ready workflows and offers to download missing models
  ([Comfy docs, templates](https://docs.comfy.org/interface/features/template)).
- Custom nodes are Python packages installed through ComfyUI-Manager, now built into core
  ([Comfy docs, Manager](https://docs.comfy.org/manager/install)).

**How a reference steers without being copied**

- LoRA: a small trained file that shifts the model toward a style or character; repeatable.
- IPAdapter: encodes one reference image and injects it as extra conditioning; a weight
  slider sets how much it pulls.
- ControlNet: takes a structure map (pose, edges, depth) from a reference; the content
  and look come from elsewhere.
- Combined, look and structure come from different references and the subject from the
  prompt, each with its own strength
  ([InstaSD guide](https://instasd.com/post/sdxl-style-transfer-with-ipadapter-and-controlnet),
  [RunComfy IPAdapter workflow](https://www.runcomfy.com/comfyui-workflows/comfyui-ipadapter-plus-style-transfer-made-easy)).
- *Inferred analogy:* ControlNet is E7's pattern (structure: marks, command words, stimulus
  kind); a LoRA is a teacher's house style; the Idea node is the prompt.

**Simplification and direction**

- App Mode and App Builder (announced 2026-03-10; supported from frontend 1.41.13): the
  author clicks which node inputs and outputs to expose, and users see only a right-hand
  input panel and a Run button. Share links run on Comfy Cloud
  ([Comfy docs, App Mode](https://docs.comfy.org/interface/app-mode),
  [Gigazine](https://www.gigazine.net/gsc_news/en/20260312-comfyui-app-mode)).
- Nodes 2.0 (Dec 2025) moves node rendering from the LiteGraph canvas to Vue components;
  the old canvas had become a bottleneck where "even small UI changes" took days
  ([Comfy docs, Nodes 2.0](https://docs.comfy.org/interface/nodes-2),
  [Comfy blog](https://blog.comfy.org/p/comfyui-node-2-0)).
- Comfy Cloud: public beta 2025-11, out of beta 2026-03
  ([Comfy blog](https://blog.comfy.org/p/comfy-cloud-is-now-in-public-beta)).

**Pain points and criticism**

- A blank canvas of unfamiliar nodes; nothing pre-connected; large graphs (50+ nodes)
  become "spaghetti" ([Apatero](https://www.apatero.com/blog/why-comfyui-is-hard-to-learn-how-to-master-it-2025)).
  Comfy's own App Mode launch acknowledges the beginner problem.
- Shared workflows depend on custom nodes and models the recipient lacks ("missing node"
  state on import) ([Comfy docs, nodes](https://docs.comfy.org/development/core-concepts/nodes)).
- Security: custom nodes are arbitrary code. ComfyUI_LLMVISION (June 2024) stole browser
  passwords and card data through poisoned dependencies
  ([Gigazine](https://gigazine.net/gsc_news/en/20240611-comfyui-llmvision-malware),
  [Snyk Labs](https://labs.snyk.io/resources/hacking-comfyui-through-custom-nodes/)).
  Lesson for us: a shared recipe file must be data only, never code.

## 2. Node-based LLM and creative AI tools

| Tool | What it is | Pattern that helps non-engineers |
|---|---|---|
| Langflow, Flowise | Developer-leaning LLM graph builders | Little; reviewers rate them as needing LangChain concepts ([lowcode.agency](https://www.lowcode.agency/blog/n8n-vs-flowise-ai)) |
| n8n | Automation graphs with AI nodes | AI Workflow Builder (beta 2025-10): describe a goal, get a draft graph to edit ([n8n docs](https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder)); drafts still need hand finishing ([review](https://growwstacks.com/blog/n8n-ai-workflow-builder-review/)) |
| Dify | LLM app platform | A "User Input" start node defines form fields, and the workflow publishes as a web app; every app exports to a YAML DSL file; secrets stay in environment variables, out of the shared file ([Dify docs](https://docs.dify.ai/en/use-dify/getting-started/key-concepts)) |
| Rivet (Ironclad, MIT) | Prompt-graph IDE | Graphs stored as YAML so they diff and version; live run trace per node ([rivet.ironcladapp.com](https://rivet.ironcladapp.com/)) |
| ChainForge (CHI 2024) | Prompt comparison canvas | Runs prompt variants and models side by side, in a grid; users mostly explored, compared, then refined ([Arawjo et al.](https://arxiv.org/abs/2309.09128)) |
| Vellum | Commercial prompt and workflow platform | Side-by-side prompt comparison; test-case banks; a workflow can be the evaluator of another ([Vellum](https://www.vellum.ai/products/evaluation)) |
| Prompt flow (Microsoft) | Flow authoring for LLM apps | Retiring 2027-04-20, "no longer recommended for new development" ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry-classic/how-to/flow-develop)) |
| Google Opal | Mini-app builder (2025-07, global 2025-11) | Starts from a sentence, shows the graph, edit by graph or by more sentences; step-by-step run with errors pinned to the step ([SiliconANGLE](https://siliconangle.com/2025/07/25/google-debuts-no-code-opal-tool-building-ai-mini-apps/), [AlternativeTo](https://alternativeto.net/news/2025/10/google-expands-opal-ai-app-builder-to-15-more-countries-and-boosts-performance)) |
| Figma Weave (Weavy, acquired 2025-10/11) | Node canvas for image and video models | Compare models' outputs side by side; branch and remix; App Mode turns a graph into a form with a Generate button ([AlternativeTo](https://alternativeto.net/news/2025/11/figma-acquires-ai-content-platform-weavy-launching-node-based-image-and-video-editing-tool/), [everydev](https://www.everydev.ai/tools/figma-weave)) |
| Krea Nodes (2025-11) | Node canvas over 50+ media models | App builder (2025-11-21); Node Agent builds graphs from a description (2026-03-18) ([Krea release notes](https://www.krea.ai/release-notes)) |
| Freepik Spaces (2025-11-04) | Shared node canvas | Real-time co-editing, templates ([BusinessWire](https://www.businesswire.com/news/home/20251104023735/en/Freepik-Launches-Freepik-Spaces-to-Power-AI-Visual-Creation-and-Collaboration-in-Real-Time)) |

Patterns that lower the barrier, in order of how often they appear:

1. **A form over the graph** (ComfyUI App Mode, Weave App Mode, Krea app builder, Dify web
   app, Opal). The author exposes a few inputs; everyone else fills a form.
2. **Templates** (ComfyUI Templates, Freepik, Dify) instead of a blank canvas.
3. **Natural language to graph** (n8n, Opal, Krea Node Agent); drafts need finishing.
4. **Compare outputs side by side** (ChainForge, Vellum, Weave).
5. **Per-node run and regenerate** with a visible trace (Rivet, Opal step run, ComfyUI cache).
6. **The workflow is a plain file** (ComfyUI JSON, Dify YAML, Rivet YAML), with secrets kept out.

## 3. Education question generators

Prior survey: `docs/research/2026-09-competitive/ai.md` (MagicSchool, Brisk, Diffit,
Eduaide, QuestionWell, Khanmigo). New or confirmed here:

- **MagicSchool:** one form per tool: topic or text, grade level, question count; DOK is a
  separate tool ([MagicSchool](https://www.magicschool.ai/tools/multiple-choice-quiz-assessment)).
  New in 2026-05: teachers save a customised tool and share it by link, Public or Org Only;
  recipients save their own copy; admins promote one to the whole school
  ([MagicSchool help](https://help.magicschool.ai/en/articles/15483214-magicstudent-custom-tool),
  [blog](https://www.magicschool.ai/blog-posts/whats-new-may-2026)). The closest thing to a
  shared recipe in edtech.
- **Brisk:** source-first (the page or selection you are on), then grade, type and count;
  exports to Docs, Word, Forms, Kahoot ([Brisk](https://www.briskteaching.com/it/ai-tools/quiz-generator)).
- **Diffit:** source plus reading level and language; three MC questions by default, plus
  short and open questions ([TCEA](https://blog.tcea.org/leveled-texts-diffit/)).
- **QuestionWell:** objectives first, then items; free tier MC only; its own preprint says
  models keep making item-writing flaws, notably "the longest answer is correct"
  ([QuestionWell paper](https://questionwell.org/hubfs/Papers/mcq-paper-llncs-main.pdf?hsLang=en);
  vendor source).
- **Eduaide:** Assessment Builder with sections, count, points and an Easy/Medium/Hard bar
  (from the earlier survey; the site was rate-limited today).
- **Khanmigo:** 25+ teacher tools, each a short form (MC quiz, exit ticket, rubric)
  ([Khan Academy help](https://support.khanacademy.org/hc/en-us/articles/14799047733645)).
- **Wayground (formerly Quizizz):** MC generator from text; exports PDF and DOC
  ([Wayground](https://wayground.com/generators/multiple-choice-question-generator)).
- **Hong Kong:** no Aristo AI question tool found. EdCity lists general AI LMS tools
  (Plan4Teach) that issue curriculum-aligned questions, none HKDSE Economics specific
  ([EdCity](https://www.edcity.hk/home/en/edmarket/edtech-solutions/plan4teach-ai-powered-learning-management-system/)).
- **No node or canvas question builder for teachers exists** in any search. Every
  education tool is a form. None exposes traps or misconceptions per option as an input.

## 4. MCQ distractors and traps

**Item-writing guidance**

- Haladyna, Downing and Rodriguez (2002): 31 guidelines from 27 textbooks and 27 studies;
  among them, make every distractor plausible, build distractors from typical student
  errors, keep options similar in length, avoid or limit "none/all of the above"
  ([UMN record](https://experts.umn.edu/en/publications/a-review-of-multiple-choice-item-writing-guidelines-for-classroom/),
  [summary](https://bookdown.org/stefanmosjos/manualesitems/_book/haladyna-2002.html)).
- Rodriguez (2005), meta-analysis of 80 years: three options are usually optimal; dropping
  a non-functioning distractor costs little, dropping one at random hurts reliability
  ([summary](https://tipsforteachers.substack.com/p/research-bite-20-three-options-are)).
  HKDSE uses four (A to D), so a weak fourth option is a known cost.

**LLM distractor research, 2023 to 2026**

- Retrieval helps: giving the model similar items from a bank as examples made 53% of
  ChatGPT distractors usable as-is by teachers, beating zero-shot
  ([Bitew et al. 2023](https://arxiv.org/abs/2307.16338)).
- Valid but not real: LLM math distractors were mathematically valid but did not reliably
  match real student errors; kNN in-context examples worked best
  ([Feng et al., NAACL 2024 Findings](https://arxiv.org/abs/2404.02124)).
- Name the error first: DiVERT generates an error explanation, then the distractor from
  it; educators rated its error labels close to human ones
  ([DiVERT 2024](https://arxiv.org/abs/2406.19356)). LookAlike (BEA 2025) trains for
  error-to-distractor consistency.
- Overgenerate and rank: make many, rank by predicted student pick rate; teachers still
  preferred human distractors ([Scarlatos et al., BEA 2024](https://arxiv.org/abs/2405.05144)).
- LLMs' own wrong answers correlate moderately with students' (Feb 2025)
  ([Liu et al.](https://arxiv.org/abs/2502.15140)). Giving the model the correct solution
  in the prompt improved alignment with human distractors by 8% (2026-03)
  ([alphaXiv 2603.15547](https://www.alphaxiv.org/abs/2603.15547)).
- Failure modes: 49% of ChatGPT physiology items had item-writing flaws and 22% factual or
  conceptual errors, though 91% were a usable start
  ([Camarata et al. 2025](https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/LLM-Generated-Multiple-Choice-Practice-Quizzes-for/991022059818004721));
  longest-option-is-correct cue; a "distractor" that is also correct; options that
  differ only trivially ([BMC Med Educ review 2024](https://bmcmededuc.biomedcentral.com/counter/pdf/10.1186/s12909-024-05239-y.pdf)).
- Misconception libraries are the industry pattern: Eedi writes each distractor to expose
  one named misconception and ran a Kaggle contest (2024) to map them
  ([Eedi](https://www.eedi.com/news/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions)).

**Economics misconceptions (for a curated Trap list)**

- Price change "shifts demand" instead of moving along the curve
  ([Tutopiya](https://www.tutopiya.com/blog/how-cambridge-igcse-economics-students-can-use-demand-resources-without-confusing-a-movement-along-the-curve-with-a-shift/); teaching sources, not research).
- Elasticity read as slope; a straight demand line taken to have constant elasticity
  ([JFEE](https://libjournals.mtsu.edu/index.php/jfee/article/view/1461),
  [Saylor](https://learn.saylor.org/mod/page/view.php?id=72058)).
- Opportunity cost: even economists miss the textbook item (Ferraro and Taylor 2005); for
  students the difficulty is largely units and conversion, not the concept
  ([Polley 2014](https://ideas.repec.org/a/ebl/ecbull/eb-13-00210.html)).
- Preconceptions persist through a principles course even when test scores are good
  ([Busom et al., JEE 2017](https://ideas.repec.org/a/taf/jeduce/v48y2017i2p74-92.html)).
- *Inferred from teaching practice (to be checked by the user):* sunk cost counted in a
  decision; marginal vs average cost; total revenue always rises with price; tax burden
  falls on whoever pays the government; a price ceiling above equilibrium "binds"; minimum
  wage below the market wage causes unemployment; GDP counting transfer payments,
  second-hand or intermediate goods; nominal vs real; percentage vs percentage point;
  absolute vs comparative advantage; money vs wealth or income.

**HKDSE Economics MC forms (forms only, no HKEAA text)**

- Paper 1 is MC on the compulsory part, 30%, 1 hour, all compulsory; Paper 2 has short
  questions (26%), structured, essay and data-response (35%) and an elective (9%)
  ([HKEAA 2027 framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2027hkdse-e-econ.pdf)).
  Press reports give 45 items in Paper 1 and a rise in data-based MC
  ([Young Post](https://www.youngpostclub.com/yp/discover/news/hong-kong/article/3071768/dse-economics-exam-increases-number-data-based-mc)).
- Forms: single best answer A to D; combination items (numbered statements, options like
  "(1) and (2) only"), already modelled as `McqQuestion.statements`; data-based items on
  a table or graph; diagram items; calculation items; negative stems ("NOT").
- *Inferred* trap forms: a true statement that does not answer the stem's cause; reversed
  cause and effect; right conclusion, wrong reason; true in general but not under the
  stem's condition; wording that shifts the meaning (one tutor cited "zero marginal cost of
  production" vs "of using" a good ([SCMP Young Post](https://yp.scmp.com/education/exam-tips/article/106191/year%E2%80%99s-hkdse-economics-exam-required-understanding-current-issues?page=1))).
- Combination options are combinatorics: once each statement has a truth value, the four
  options and the key follow locally. The AI only has to write statements.

## 5. Canvas libraries

| Library | Licence | Notes |
|---|---|---|
| React Flow (`@xyflow/react` 12) | MIT | DOM nodes, so our React components and i18n work inside nodes; about 57 KB gzipped ([DepScope](https://mcp.depscope.dev/pkg/npm/@xyflow/react)); keyboard focus, Enter/Space select, arrow-key move, `ariaLabelConfig` for translating its labels ([a11y docs](https://reactflow.dev/learn/advanced-use/accessibility)). Shows an attribution badge; hiding it is asked to be paired with a Pro subscription, a request rather than a licence term ([docs](https://reactflow.dev/learn/troubleshooting/remove-attribution)) |
| Rete.js 2 | MIT | Framework-agnostic, React renderer, built-in dataflow engine; more setup ([GitHub](https://github.com/retejs/rete)) |
| litegraph.js (original) | MIT | Canvas2D, fast; no recent releases; canvas nodes are hard to make accessible (*inferred*) ([GitHub](https://github.com/jagenjo/litegraph.js)) |
| Comfy's litegraph fork | now in ComfyUI_frontend, GPL-3.0 | Archived 2025-08-05 and merged into the frontend monorepo ([GitHub](https://github.com/Comfy-Org/litegraph.js), [frontend](https://github.com/Comfy-Org/ComfyUI_frontend)) |

- ComfyUI and ComfyUI_frontend are GPL-3.0. Econ Studio is MIT. Copying their code into a
  distributed app would bring GPL obligations to the combined work. Ideas, interaction
  patterns and a file format's general approach are not copied code and are free to
  reuse (*inferred*; not legal advice).
- Touch and trackpad: React Flow has pinch zoom and scroll-to-pan options; worth a
  WebKit check in the Tauri shell before choosing (*inferred from its API*).

## Mapping to Econ Studio

### The idea in one line

A **recipe** is a saved, typed spec for one question: what goes in (idea, data, reference
pattern, topic, traps) and what comes out (MC or structured). Most teachers see it as a
form. The graph is the data model, and a canvas is optional.

### Node vocabulary

Socket types: `text` (teacher's own words), `data` (a table), `pattern` (E7's
`QuestionPattern`), `spec` (topic, skill, marks, command), `trap`, `stimulus`, `draft`.
The type system carries the licence rule: **a Reference node has only a `pattern` output**,
so past-paper wording cannot reach an AI node by any wiring.

Inputs (local, no AI):

| Node | Output | Notes |
|---|---|---|
| Idea | text | "HK minimum wage rises in 2026; link to unemployment." |
| Data | data | Pasted table or figures, parsed locally. The teacher's own data; source line kept |
| Reference (題庫) | pattern | Pick a bank question; `pattern.ts` derives the pattern locally (E7). Never text |
| Topic and skill | spec | Topic codes (`src/model/topics.ts`); skill from the HKEAA objectives (know, apply, interpret data, analyse, evaluate) |
| Command and marks | spec | Command words from E7's bilingual list; marks per part |
| Trap | trap | From a curated bilingual misconception list, or the teacher's own words. One per wrong option |
| Stimulus | stimulus | None, text, table, or a Graph preset id (`src/model/diagram.ts`), never coordinates |
| Language | spec | Defaults to the document's language mode |

Writers (AI):

| Node | Inputs | Output |
|---|---|---|
| Write stem | text, data, pattern, spec, stimulus | stem + key (+ correct reasoning) |
| Write wrong option | stem, key, one trap | one option + why it is wrong |
| Write statements | stem, spec, traps | 3 to 4 statements, each with true/false and why |
| Write part | stem, command, marks | part stem + marking points |
| Answers (E1) | draft | marking scheme; paused until evals pass |

Checks (local unless noted):

- Near-copy check against the 題庫 and the reference (E7 design).
- Item lint: longest option is the key; options of very uneven length; two options the same;
  "all/none of the above"; negative stem not bolded; combination options inconsistent with
  statement truth values; answer-letter balance across the paper.
- Quality check (E4, AI, paused).

Outputs: Insert MC, Insert structured, Add to 題庫 (tagged with the spec's topics).

Local, not AI: **combination options.** "Write statements" returns truth values; the four
options and the key are computed, so the key is always consistent.

### How a run executes

- Topological order, as in ComfyUI. Local nodes run instantly; AI nodes call the teacher's
  provider through the existing `src/ai/` client.
- **Compile the graph into few calls.** A default MC run is *one* structured-output call
  (stem, key, one option per trap, each with its reason), not one call per node. Per-node
  calls happen only on regenerate. Fewer calls is cheaper and keeps the options coherent.
- Cache each AI result by a hash of its inputs plus a variation number (ComfyUI's seed).
  Change one trap and only that option is rewritten; change the idea and everything is.
- Prompts follow the research: name the misconception before writing the option (DiVERT);
  give the model the key and the correct reasoning (2026 paper, +8%); ask for options of
  similar length. Examples from the teacher's own 題庫 questions would also help (Bitew),
  but only from questions not marked HKEAA, and only if the user allows full text later
  (E7 open question 1).

### Regenerate one option or one trap

- Results insert directly, then highlight, with one Undo (AI door rule). No review gate.
- After insert, regenerating is a ✦ verb on the selection, not a graph operation:
  select a wrong option → ✦ **Rewrite this wrong answer** (keeps its trap) or ✦ **Use a
  different trap** (menu of traps). Select a statement → ✦ **Rewrite statement**, and the
  combination options recompute locally. Each is one commit, one Undo.
- To make that work, the trap behind each option has to be known after insert. Two ways:
  - (a) Keep it in the session's run store only. No schema change; lost on reload.
  - (b) Store an optional teacher-only `trap` note on each option. New optional field:
    must go in `KNOWN_KEYS`, must never reach the student `.docx`, and could print in the
    teacher version as a "why each option is wrong" line (useful for item review and G1
    item analysis). Recommended: (a) first, (b) once teachers ask for it.

### Recipes as files

- A recipe is JSON with a `recipeVersion` from day one and a migration path, under the same
  backward-compatibility promise as documents (a teacher's saved recipe must keep opening).
- Data only, no code (the ComfyUI_LLMVISION lesson). No API keys (Dify's rule).
- A Reference node saves its **pattern**, plus the bank question id as a convenience. A
  recipe shared with a colleague carries the pattern, never the question text.
- Built-in recipes ship as templates, written by us: "MC with three traps",
  "Combination MC", "Data-response, 4 parts", "Like this question" (= E7).
- Sharing: a file in the desktop library folder (F8/F9 cloud-drive folder), like
  MagicSchool's shared custom tools but offline.
- **Embedding in the exported .docx** (ComfyUI's PNG trick): technically feasible, since the
  `.docx` is built by hand with JSZip; a `customXml` part with content type
  `application/xml` is the form Word most reliably keeps on re-save
  ([Aspose forum](https://forum.aspose.com/t/how-can-i-get-the-contenttype-of-the-customxmlpart/163127)).
  **Not recommended:** the `.docx` goes to students; trap notes reveal the answers; it
  breaks the leak-free export rule; and Word or school systems may strip it anyway, as image
  sites strip ComfyUI metadata. If wanted later: teacher version only, opt-in, recipe
  without traps.

### Form first, canvas later

- **Form mode (everyone):** ✦ **Write from a recipe...** opens a dialog: pick a recipe,
  fill its exposed fields (Idea, Data, Reference, Topic, Traps), Run. The recipe decides
  which fields show, like ComfyUI's App Builder. Defaults come from the document
  (`recipeFor` limits a Paper 1 to MC) and the selection (a selected bank question fills
  Reference).
- **Trap picker in the form:** for MC, three rows, one per wrong option, each a dropdown of
  misconceptions for the chosen topic plus "Let the AI choose" and "My own...". This is the
  user's "the traps, the skills and topic tested behind it", without a canvas.
- **Canvas (advanced, later):** a full-window workspace, not the sidebar (the sidebar shows
  one thing). React Flow; nodes are our React components, so i18n and tokens carry over.
  Only worth building if teachers ask to chain more than the form allows.

### Fit with what exists

- ✦ AI door: one new verb (Write from a recipe), plus per-option verbs. Same menu, same
  running bar, same insert-then-highlight, same Undo.
- E7 Write one like this becomes the simplest built-in recipe (one Reference input).
- E3 (source → items) is the Data node plus an output; E1 is the Answers node; E4 is the
  quality check. All stay behind `PAUSED_VERBS` until evals pass; recipes add no new
  route around the pause.
- Diagrams: the Stimulus node only takes Graph presets (E6 rule).
- Interface strings go in `messages.ts` with HK Chinese; the misconception list is
  paper-side content (Paper language), written by hand in both languages.

### Suggested stages

0. **Traps without recipes** (S): add a "Traps" field to E7 and the per-option ✦ verbs.
   Tests the core value cheaply.
1. **Recipe model + form + 3 built-in recipes** (M): typed nodes, local compile, cache.
2. **Save and share recipe files** (S to M): versioned, data only.
3. **Canvas** (L): only on demand.

## Risks and open questions for the user

1. **Complexity.** Every node tool needed a form mode for its non-expert users; no
   teacher tool uses a canvas. Is a form with a trap picker enough, or do you see teachers
   wiring nodes themselves? Recommended: form first.
2. **Cost per run.** One MC as a single structured call is roughly 1.5k to 3k tokens with
   BYOK (*inferred*, depends on provider and language sides; bilingual roughly doubles
   output). One call per node would multiply that by 4 to 6. Regenerating one option is
   one small call.
3. **HKEAA rule.** The Reference node outputs a pattern only, by type, for every question
   (E7 stage 1). Recipes shared between teachers carry patterns, never text. Should a
   school's own unmarked questions be allowed as full-text examples, given retrieval
   measurably improves distractors? Recommended: not in the first version.
4. **Quality.** Research says LLM distractors are valid but often not real misconceptions,
   and about half of generated items have item-writing flaws. Needs an eval set of
   invented reference questions and traps, scored on: does each wrong option express its
   trap; is exactly one option correct; longest-option cue; near-copy rate.
5. **The misconception list.** Who writes it, and how many per topic? It is paper-side
   content in both languages; it needs a teacher's review.
6. **Trap storage.** Session only (a) or a teacher-only field on each option (b)?
7. **"CAM files".** Confirm the user meant ComfyUI workflow `.json` / images with embedded
   workflows.
8. **Gemini in HK** still needs a VPN; each extra AI call is another chance to fail. One
   call per run keeps that low.

## Sources

ComfyUI
- https://github.com/Comfy-Org/ComfyUI
- https://docs.comfy.org/development/core-concepts/nodes
- https://docs.comfy.org/development/api-development/workflow-metadata
- https://docs.comfy.org/specs/workflow_json
- https://docs.comfy.org/interface/app-mode
- https://docs.comfy.org/interface/nodes-2
- https://docs.comfy.org/interface/features/template
- https://docs.comfy.org/manager/install
- https://docs.comfy.org/built-in-nodes/SeedNode
- https://docs.comfy.org/built-in-nodes/Reroute
- https://blog.comfy.org/p/subgraph-official-release
- https://blog.comfy.org/p/comfyui-node-2-0
- https://blog.comfy.org/p/comfy-cloud-is-now-in-public-beta
- https://comfyui-wiki.com/en/faq/can-not-convert-widget-to-input
- https://github.com/Comfy-Org/ComfyUI_frontend/issues/5692
- https://github.com/Comfy-Org/ComfyUI/discussions/12546
- https://pyshine.com/ComfyUI-Node-Graph-Execution-Engine-Source-Tour/
- https://www.gigazine.net/gsc_news/en/20260312-comfyui-app-mode
- https://instasd.com/post/sdxl-style-transfer-with-ipadapter-and-controlnet
- https://www.runcomfy.com/comfyui-workflows/comfyui-ipadapter-plus-style-transfer-made-easy
- https://www.apatero.com/blog/why-comfyui-is-hard-to-learn-how-to-master-it-2025
- https://gigazine.net/gsc_news/en/20240611-comfyui-llmvision-malware
- https://labs.snyk.io/resources/hacking-comfyui-through-custom-nodes/

Node tools
- https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder
- https://growwstacks.com/blog/n8n-ai-workflow-builder-review/
- https://www.lowcode.agency/blog/n8n-vs-flowise-ai
- https://docs.dify.ai/en/use-dify/getting-started/key-concepts
- https://rivet.ironcladapp.com/
- https://arxiv.org/abs/2309.09128
- https://www.vellum.ai/products/evaluation
- https://learn.microsoft.com/en-us/azure/foundry-classic/how-to/flow-develop
- https://siliconangle.com/2025/07/25/google-debuts-no-code-opal-tool-building-ai-mini-apps/
- https://alternativeto.net/news/2025/10/google-expands-opal-ai-app-builder-to-15-more-countries-and-boosts-performance
- https://alternativeto.net/news/2025/11/figma-acquires-ai-content-platform-weavy-launching-node-based-image-and-video-editing-tool/
- https://www.everydev.ai/tools/figma-weave
- https://www.krea.ai/release-notes
- https://www.businesswire.com/news/home/20251104023735/en/Freepik-Launches-Freepik-Spaces-to-Power-AI-Visual-Creation-and-Collaboration-in-Real-Time

Education tools
- https://www.magicschool.ai/tools/multiple-choice-quiz-assessment
- https://help.magicschool.ai/en/articles/15483214-magicstudent-custom-tool
- https://www.magicschool.ai/blog-posts/whats-new-may-2026
- https://www.briskteaching.com/it/ai-tools/quiz-generator
- https://blog.tcea.org/leveled-texts-diffit/
- https://questionwell.org/hubfs/Papers/mcq-paper-llncs-main.pdf?hsLang=en
- https://support.khanacademy.org/hc/en-us/articles/14799047733645
- https://wayground.com/generators/multiple-choice-question-generator
- https://www.edcity.hk/home/en/edmarket/edtech-solutions/plan4teach-ai-powered-learning-management-system/

Distractors and misconceptions
- https://experts.umn.edu/en/publications/a-review-of-multiple-choice-item-writing-guidelines-for-classroom/
- https://bookdown.org/stefanmosjos/manualesitems/_book/haladyna-2002.html
- https://tipsforteachers.substack.com/p/research-bite-20-three-options-are
- https://arxiv.org/abs/2307.16338
- https://arxiv.org/abs/2404.02124
- https://arxiv.org/abs/2405.05144
- https://arxiv.org/abs/2406.19356
- https://arxiv.org/abs/2502.15140
- https://www.alphaxiv.org/abs/2603.15547
- https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/LLM-Generated-Multiple-Choice-Practice-Quizzes-for/991022059818004721
- https://bmcmededuc.biomedcentral.com/counter/pdf/10.1186/s12909-024-05239-y.pdf
- https://www.eedi.com/news/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions
- https://libjournals.mtsu.edu/index.php/jfee/article/view/1461
- https://learn.saylor.org/mod/page/view.php?id=72058
- https://ideas.repec.org/a/ebl/ecbull/eb-13-00210.html
- https://ideas.repec.org/a/taf/jeduce/v48y2017i2p74-92.html
- https://www.tutopiya.com/blog/how-cambridge-igcse-economics-students-can-use-demand-resources-without-confusing-a-movement-along-the-curve-with-a-shift/
- https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/econ/2027hkdse-e-econ.pdf
- https://www.youngpostclub.com/yp/discover/news/hong-kong/article/3071768/dse-economics-exam-increases-number-data-based-mc
- https://yp.scmp.com/education/exam-tips/article/106191/year%E2%80%99s-hkdse-economics-exam-required-understanding-current-issues?page=1

Canvas libraries and file formats
- https://github.com/xyflow/xyflow
- https://reactflow.dev/learn/advanced-use/accessibility
- https://reactflow.dev/learn/troubleshooting/remove-attribution
- https://mcp.depscope.dev/pkg/npm/@xyflow/react
- https://github.com/retejs/rete
- https://github.com/jagenjo/litegraph.js
- https://github.com/Comfy-Org/litegraph.js
- https://github.com/Comfy-Org/ComfyUI_frontend
- https://forum.aspose.com/t/how-can-i-get-the-contenttype-of-the-customxmlpart/163127
