# G. Market size, willingness to pay, pricing (2026-09-30)
Facts are cited; ESTIMATES are marked. FX assumed US$1 = HK$7.8. Prior research (docs/research/2026-09-competitive/ai.md, hk.md) already covers MagicSchool/Diffit/Eduaide/thinka/KongPaper/EdCity OQB; only new items and the price table are repeated here.

## 1. Market size
HKEAA registration statistics, Economics (school candidates / total incl. private):
- 2024: 12,317 / 13,295 (of 50,803 total candidates)
- 2025: 12,459 / 13,894 (of 55,781)
- 2026: 12,371 / 14,372 (of 58,576)
Sources: https://www.hkeaa.edu.hk/DocLibrary/Media/FactFigures/2026_HKDSE_registration_statistics.pdf (and the 2024/2025 files, same path pattern).
Finding: school-candidate Economics is FLAT (about 12.3-12.5k), not falling. Private candidates are rising (978 to 2,001), which suggests a self-study/tutor audience. I could not retrieve pre-2024 years (URL pattern 404s); "trending down" is not supported by the last three years.

Other 2026 school candidates (same PDF): Geography 8,394; BAFS 9,625; History 4,866; Chinese History 6,364; CSD (ex-Liberal Studies) 45,985 (compulsory); Ethics and Religious Studies 903; Tourism 4,605. BAFS is the nearest adjacent market (about 78% of Economics size), then Geography (68%).

Schools: 513 secondary day schools in 2025/26 (search summary of EDB pages; https://www.edb.gov.hk/en/edu-system/primary-secondary/secondary/index.html). I found NO official count of schools offering Economics or of Economics teachers.
ESTIMATES (labelled, not sourced):
- Schools offering DSE Economics: about 350-420 (12.4k candidates at 30-35 per school; most Band 1-2 schools offer it).
- Economics teachers: about 2-3 per school, so roughly 800-1,200 full-time, plus part-timers/tutors. Treat as ~1,000.
- Add tutorial-centre tutors (large HK market, see hk.md) as an unmeasured second segment.
- Macau/overseas: no data found; treat as negligible (<5%) for planning.
Implication: the reachable paid market is small. At 1,000 teachers, 10% paid conversion at HK$600/yr is about HK$60k/yr. School/department licensing and adjacent subjects (BAFS, Geography, +~2,000 teachers) matter more than individual sales.

## 2. Who pays in HK: the school, via grants
- Composite Information Technology Grant (CITG), recurrent: 2025/26 secondary rates from HK$409,775 (grammar, 18 or fewer classes) to HK$643,767 (37+ classes) per year. Eligible uses include "annual subscription/renewal fees for licences and software" and online learning resources. Source: https://www.edb.gov.hk/attachment/en/edu-system/primary-secondary/applicable-to-primary-secondary/it-in-edu/CITG/CITG_2526_en.pdf ; https://www.edb.gov.hk/en/edu-system/primary-secondary/applicable-to-primary-secondary/it-in-edu/citg.html
- AI for Empowering Learning and Teaching Funding Programme (QEF): one-off HK$500,000 per public-sector/DSS school (about HK$500m pool), applications from 16 Dec 2025, block funding by 30 Jun 2026, spendable through 31 Aug 2028; explicitly covers "purchase, subscription, or lease of AI-powered devices and services for teaching". Source: https://www.info.gov.hk/gia/general/202512/16/P2025121600261.htm . This is the strongest finding: schools have earmarked AI money now, with a deadline, and a hosted-AI teacher tool fits "AI for all subjects".
- Capacity Enhancement Grant and Life-wide Learning and Sister School Grant exist but are activity-oriented (https://www.edb.gov.hk/en/sch-admin/fin-management/subsidy-info/ref-capacity-enhancement-grant/index.html); rates not retrieved.
- Existing school-paid products: EdCity OQB/DFS whole-school annual subscription, quote only (hk.md); publisher e-resources gated to textbook-adopting schools. thinka sells "Premium School" on quote.
- Personal payment: ChatGPT Plus is US$20/mo and ChatGPT is still not officially available in HK (VPN plus gift-card payment workarounds, https://hkvpnschool.com/chatgpt-plus/). So a hosted-AI tool with no VPN and local payment (FPS/Alipay HK/card) has a real convenience edge. Canva for Education is free for verified K-12 teachers worldwide (https://www.canva.com/education/teachers/), which anchors "designer" tools at zero; only Word-fidelity, diagrams and bilingual AI can be charged for.
- Evidence gaps: I found no published data on how much individual HK teachers pay out of pocket, nor on department-level budgets. Treat "teacher pays personally" as low-probability at high prices; the tutor segment is likelier to self-pay.

## 3. Comparable pricing (2025-26)
| Tool | Free tier | Individual | School |
|---|---|---|---|
| MagicSchool | 80+ tools | Plus US$8.33/mo annual (US$99.96/yr), US$12.99 monthly | custom |
| Brisk | free tier w/ limits | Educator Pro US$99.99/yr | custom |
| Diffit | limited | US$14.99/mo or US$149.99/yr | custom |
| Eduaide | limited | (ai.md) US$7.50/mo annual | Teams US$6/user/mo |
| Curipod / Quizizz-Wayground | yes | Quizizz about US$5-10/mo | Team about US$50/mo for 30 users |
| Kahoot | yes | from US$228/yr | School Standard US$15/teacher/mo |
| Canva Education | fully free for K-12 | n/a | free |
| thinka (HK) | student free | Teacher Premium HK$390/mo, HK$1,990 per 6 mo, HK$2,990/yr | quote |
| KongPaper (HK) | yes | HK$38-628/mo (students) | batch API |
Sources: https://www.magicschool.ai/pricing ; https://slidespeak.co/blog/brisk-teaching-alternatives ; https://triviamaker.com/kahoot-pricing/ ; ai.md for the rest. Pattern: global teacher tools cluster at US$100-150/yr (HK$780-1,170), free tier generous, school plans by quote. Local HK exam-focused tools charge more (HK$3k/yr) because they include student-facing marking.

## 4. Recommended pricing (ESTIMATES, to be validated)
Principle: AI cost is the only variable cost, so gate on AI credits, never on the editor or .docx export (keeps the free/open-source promise and the growth loop).
- Free (forever): full editor, bilingual, diagrams, .docx/PDF export, local storage, BYO-key AI (existing). Optionally a small hosted-AI trial (for example 20 actions/month) to show value with no key.
- Teacher Plus: HK$48/mo or HK$468/yr (~US$60). Hosted AI with a fair monthly credit pool (say 300 actions), cloud sync across devices, backups, priority glossary updates. Undercuts MagicSchool/Diffit, is 1/6 of thinka.
- Founding Teacher: HK$298 first year, price-locked for life while subscribed, capped at first 200 sign-ups; announce as "launch price" and get testimonials.
- Department licence (up to 5 teachers): HK$1,680/yr with pooled credits, shared question bank/templates and shared cloud folder. Whole-school (up to 15 teachers, multi-subject once BAFS/Geography exist): HK$3,800-4,800/yr. Both are under 1-2% of CITG and easy to pay from CITG or the QEF AI grant. Provide a PDF quote, invoice with PO, and a one-page "how this fits the QEF AI grant / CITG" document. Rest-of-year prorating and a 60-day free school trial (mirrors DFS's 60-day trial).
- Price-anchoring: annual only in the schools tier; monthly only for individuals.
- Do not sell AI on HKEAA questions: the licence forbids AI use (IDEAS.md), so keep AI tied to teacher-authored or original content.
- Payment: FPS/PayMe/Alipay HK/card via Stripe or Paddle; RMB/HKD invoices; Simplified/Traditional not an issue.

## 5. Distribution channels (HK)
- Hong Kong Joint School Economics Association (HKJSEA): the only Economics-teacher body I found (LinkedIn https://www.linkedin.com/company/hkjsea , YouTube https://www.youtube.com/@HKJSEA , also Facebook). Name from search results; verify membership size, and contact for a workshop slot. My guess "HKEcA" did not verify.
- EDB Economics Curriculum Development / PSHE section resources page (https://www.edb.gov.hk/en/curriculum-development/kla/pshe/references-and-resources/economics/index.html), EDB seminars and network meetings (teacher-development seminars are where tools get shown).
- Facebook teacher groups and WhatsApp panel chairs (no source; standard HK practice, needs manual outreach). DSE ECON 經濟科 FB page exists (https://www.facebook.com/dseeconomics/) but is student/tutor facing.
- HK Learning & Teaching Expo (KongPaper demoed there, per ai.md) and EdCity edtech directory.
- The QEF AI grant timing is the strongest hook: a webinar "Spend your QEF AI grant on something you'll use every week".
- Exports carry an unobtrusive "made with Econ Studio" footer on free tier (opt-out on Plus) as organic spread; teachers share .docx files with colleagues.

## Key recommendation
Sell to departments/schools, not to individuals. Aim the paid tier at the CITG and the QEF AI grant (HK$500k per school, spendable through Aug 2028), price at HK$468/yr per teacher and HK$1,680-4,800/yr per department/school, keep the editor and .docx free, and expand to BAFS and Geography to lift the addressable teacher pool from about 1,000 to about 3,000. Validate with 10 department heads before building billing.
