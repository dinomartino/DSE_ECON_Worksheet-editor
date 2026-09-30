# F: Business model for an open-source app going paid (not legal advice)

## Repo facts
`git shortlog -sne --all`: 788 dinomartino <cuhk email>, 5 tino <gmail>, 2 Tino Martin <tinohermes0909>. All look like the owner (3 identities). No visible outside contributors => sole copyright holder (owner to confirm; also check any merged PRs from others, and that EDB glossary + fonts/assets are not owner-copyright). So no CLA needed today; add DCO/CLA before accepting external PRs if you want to keep relicensing freedom.

## Case studies (patterns)
- Open client + paid service: Joplin (Joplin Cloud from ~EUR2.4/mo, 2GB; app free; https://joplinapp.org/plans/), Standard Notes (client+server open, paid subscription ~$7.50/mo; small team), Excalidraw (MIT editor free; Excalidraw+ paid workspace ~$6/user/mo, https://plus.excalidraw.com/pricing), Plausible (AGPL, income solely from managed cloud, registered trademarks not licensed under AGPL; https://plausible.io/blog/open-source-licenses , https://plausible.io/trademark).
- Open core / split licence: AFFiNE (editor mostly MIT, backend source-available under enterprise licence; paid = cloud storage/AI/teams; https://affine.pro/blog/affine-vs-appflowy-vs-anytype), AppFlowy (AGPL cloud backend, paid hosted cloud).
- MIT -> AGPL: Immich moved to AGPLv3, "no paywalled features", optional $24.99 supporter licence (https://github.com/immich-app/immich/discussions/11186); Plausible same.
- Source-available: tldraw SDK 4.0 (Sept 2025) requires paid key for production, watermark on free tier (https://tldraw.dev/community/license). Only sensible for SDKs sold to developers; wrong for a teacher app.
- Going closed: Cal.com, April 2026, moved commercial code closed, MIT "Cal.diy" community edition, citing AI-scanning security (https://cal.com/blog/cal-com-goes-closed-source-why); drew criticism (https://itsfoss.com/news/cal-com-goes-proprietary/).
- Actual Budget: MIT, volunteer, no fees (counter-example: no monetisation).
- Obsidian (closed app, paid Sync/Publish), Bitwarden, Zed, Logseq, Anytype, Penpot: from memory, NOT re-verified this session. Pattern: free local product, paid sync/hosting/teams.
- Common pattern: what is paid is the operated service (sync, hosting, AI credits, support), never the local capability.

## Licensing
- Relicensing only affects new code: already-published MIT releases stay MIT forever for anyone who has them; a sole copyright holder may license new versions differently (sources: https://en.wikipedia.org/wiki/Software_relicensing ; project examples e.g. Plausible, Immich). Forks of old MIT versions are legitimate and cannot be revoked. Realistic: unavoidable and harmless (teachers don't fork).
- Options: AGPL-3.0 (OSI open; forces a re-hoster to publish their changes; but a rival can still host it, and AGPL is disliked by some orgs); FSL (non-compete, converts to Apache/MIT after 2 years; https://fsl.software/ , https://lucumr.pocoo.org/2024/9/23/fsl-agpl-open-source-businesses/) - directly blocks "competing use", not OSI open source; BSL similar but bespoke; Elastic/PolyForm (PolyForm Noncommercial/Shield) similar but less standard.
- Key insight: for this product the copyable thing is the client (worksheet editor), which is worth little without the hosted AI/account/storage backend. Licence choice matters less than (a) backend not being in the public repo, (b) trademark, (c) service value (keys, accounts, storage, support).
- Backend: keep in a PRIVATE repo (or source-available). Client only needs a documented API + auth; forks would have to run their own backend and pay their own AI costs. Secrets never in client.
- Trademark: protects name/logo/domain, not code. HK IPD fee HK$2,000 first class + HK$1,000 each additional class (https://www.ipd.gov.hk/en/trade-marks/apply-for-a-trade-mark/how-to-apply-to-register-a-trade-mark/index.html ; fee figure via Osome summary https://osome.com/hk/guides/trademark-registration/ - verify on IPD). Likely classes 9 (software), 42 (SaaS), maybe 41 (education). Register "Econ Studio" and "經濟備課室" separately (word marks) => roughly HK$4-8k for 2 marks x 2-3 classes, plus agent optional. Check clearance first ("Econ Studio" is generic-ish and may be refused/conflict; the Chinese name is more distinctive). Add a TRADEMARK.md saying the licence grants no name rights (Plausible model). Lawyer for clearance/filing advice.
- EDB glossary: keep the carve-out (not owner's to license); check EDB terms for commercial use before charging - LAWYER/EDB email needed since revenue now involved.
- Recommended licence for future client code: either stay MIT (simplest, goodwill, since no rival exists and forks are irrelevant) or AGPL-3.0 (deters closed SaaS re-hosting at low cost). Avoid FSL/BSL: source-available would alienate the "open" reputation and adds friction for little gain when backend is private.

## Open source vs selling to teachers/schools
- Teachers don't read GitHub; they buy convenience: no API key, sync, support, Chinese-language help. Open source is a secondary trust signal ("your files are local, code auditable", no lock-in: .docx output).
- Schools/procurement: openness helps privacy reviews somewhat (inspectable, local storage), but they still ask for a privacy policy, PDPO compliance, data location, who is the data processor (AI provider). Sources are general: https://arxiv.org/pdf/2405.11712 (edtech procurement trust), https://www.korte.co/2026/08/13/why-ai-makes-it-imperative-to-ban-proprietary-software-from-classrooms/ (opinion). HK-specific procurement claims: UNVERIFIED.
- Risk: Cal.com's argument (AI-assisted vuln scanning) is weak for a client-only app, real for backend => another reason to keep backend private.

## BYOK + local free
- Keep local storage + BYOK AI free forever: it is the moat of goodwill and costs you nothing; cannibalisation is small because target buyers are exactly those who won't manage an API key. Analogues: Obsidian free core/paid Sync, Joplin, Immich "never paywalled", Excalidraw free vs Plus.
- Pricing page pattern: "Free forever on your computer. Pay only if you want us to run it for you": Free (local, BYOK, all editor features, export) / Plus (cloud sync + backup, hosted AI credits monthly, priority support) / School (multi-seat, shared bank, invoicing). Sell credits/quota for AI (cost-driven), storage/sync for cloud. Do not gate editor or export features (would break the promise and invite forks).

## Recommendation
1. Client repo: stay MIT for what is published; for new code pick AGPL-3.0 only if you fear a re-hoster, otherwise keep MIT (my lean: keep MIT client, accept fork risk; add AGPL later - possible because you're sole copyright holder, provided you take a CLA/DCO from any contributors first).
2. Backend (accounts, billing, AI proxy, storage): new PRIVATE repo, never public. Client talks via a versioned API; store no secrets in client.
3. Register trademarks (EN + ZH) in HK, classes 9/42(/41); add trademark policy file. Budget ~HK$4-8k.
4. Free: local, BYOK, full editor, .docx export, glossary. Paid: sync/backup, hosted AI, school seats/support.
5. Lawyer needed for: EDB glossary commercial terms, HK PDPO/privacy policy + terms, trademark clearance, and verifying no third-party copyrights in repo.
