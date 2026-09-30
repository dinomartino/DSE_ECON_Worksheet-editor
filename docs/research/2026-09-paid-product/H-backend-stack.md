# H — Backend stack and operating model for Econ Studio 經濟備課室

Research date: 2026-09-30. Prices are USD list prices from vendor pages or 2026 secondary
sources, cited inline. **[UNVERIFIED]** marks estimates or claims I could not confirm on a
primary source. Cost rows are *infrastructure only*; the AI bill is covered separately in
§1.3 because it dominates everything else.

---

## 0. The answer in one paragraph

**Keep the app a static export. Add one separate TypeScript API on Cloudflare Workers
(Hono), with Better Auth for accounts, D1 for relational data, R2 for document blobs,
Cloudflare AI Gateway in front of the model provider, Turnstile + the Workers
rate-limit binding for abuse, Stripe for subscriptions, Resend for email, Sentry for
errors, Better Stack for uptime/status.** It costs about $5/month flat until well past
10,000 teachers, has a Hong Kong edge PoP, streams AI responses with no wall-clock
limit, and — the deciding factor for an open-source client — makes the API the *only*
door to data, so there is no Row Level Security to get wrong. Runner-up: Supabase, if
the owner values "least code written" over "fewest ways to leak data".

---

## 1. End-to-end stack comparison

### 1.1 Assumptions for the cost model [UNVERIFIED — my own model]

Per teacher per month: ~2,000 API requests (auth refresh, debounced sync, AI calls),
~5 ms CPU per request, ~50 AI calls of ~20 s streaming, ~10 MB stored (worksheet JSON is
small; uploaded images dominate), ~1,000 DB reads and ~500 writes. At 10,000 teachers:
20 M requests, 100 GB blobs, a DB of a few GB.

### 1.2 Infrastructure cost (excludes AI tokens, Stripe fees, email)

| Stack | 100 teachers | 1,000 | 10,000 | Notes |
|---|---|---|---|---|
| (a) Supabase (Pro) | $25 | $25–30 | $30–80 (+$100 if PITR) | Free tier is unusable for a paid product: pauses after 1 week inactive, no backups, 1-day logs. Pro = $25, 100k MAU, 8 GB DB, 100 GB storage, 250 GB egress, daily backups 7 days, PITR $100/mo, $10 compute credit (Micro). [supabase.com/pricing](https://supabase.com/pricing) |
| (b) Vercel Functions + Neon + Better Auth/Clerk + Blob | $20–25 | $30–60 | $80–130 | Vercel Pro $20/seat incl. $20 usage credit ([pro plan](https://vercel.com/docs/plans/pro-plan), [credit changelog](https://vercel.com/changelog/included-pro-usage-is-now-credit-based)); hkg1 Active CPU $0.176/h, memory $0.0146/GB-h, invocations $0.60/M ([fluid pricing](https://vercel.com/docs/functions/usage-and-pricing)). Neon Launch $0.106/CU-h, $0.35/GB-mo, no minimum, Singapore region ([neon](https://neon.com/pricing), [regions](https://neon.com/docs/introduction/regions)). Clerk free to 50k MRU ([Clerk changelog](https://clerk.com/changelog/2026-02-05-new-plans-more-value)). Memory is billed during I/O, so long AI streams cost memory-time. |
| (c) Cloudflare Workers + D1 + R2 + DO | $5 | $5 | $10–20 | $5/mo incl. 10 M req + 30 M CPU-ms; $0.30/M req, $0.02/M CPU-ms over. D1: 25 B rows read, 50 M written, 5 GB included. R2 $0.015/GB-mo, zero egress. DO 1 M req + 400k GB-s included. ([workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)) |
| (d) Firebase (Blaze) | ~$0–5 | $5–15 | $25–60 | Auth free to 50k MAU (phone SMS excluded); Firestore ~$0.06/100k reads, $0.18/100k writes (US multi-region; single region cheaper) ([firebase pricing](https://firebase.google.com/pricing), [firestore pricing](https://cloud.google.com/firestore/pricing)). Budgets are alerts, not caps [secondary sources]. |
| (e) Convex | $0 | $0–25 | $25–50 | Starter free/PAYG (1 M calls, 0.5 GB DB); Professional $25/dev/mo, 25 M calls, 50 GB DB, 100 GB files ([convex pricing](https://www.convex.dev/pricing)). |
| (f) PocketBase on a VPS | $6–12 | $6–12 | $20–40 | One small VPS in SG/HK + S3 backup via Litestream ([pocketbase prod docs](https://pocketbase.io/docs/going-to-production/)). The real cost is the owner's time. [VPS prices UNVERIFIED] |

**Fixed costs that apply to every option** (approx.): domain ~$15/yr; Sentry Developer
free (5k errors/mo, 1 user), Team $26/mo ([sentry](https://last9.io/blog/sentry-pricing/));
Better Stack free (10 monitors + 1 status page) ([betterstack](https://betterstack.com/status-page));
Resend free 3k/mo (100/day), Pro $20 for 50k ([resend](https://resend.com/pricing)).

**Important side-finding: the current web app.** Vercel Hobby is "non-commercial personal
use only"; once teachers pay, the static site itself is commercial and needs Vercel Pro
($20/mo) ([Hobby plan](https://vercel.com/docs/plans/hobby),
[fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Check which plan
the project is on before charging anyone. (Alternative: serve `out/` from Cloudflare
Workers static assets on the same $5 account. Not required; just note it.)

### 1.3 The AI bill dominates

Infrastructure above is $5–130/month at 10k teachers. A hosted AI proxy at even
$0.30–$2.50 per teacher per month of tokens [UNVERIFIED, model-dependent] is
$3,000–25,000/month at 10k teachers. Consequences: price the plan against AI usage, meter
every token server-side, and put three independent hard caps on spend (§4).

### 1.4 Qualitative comparison

| | (a) Supabase | (b) Vercel+Neon+Auth lib | (c) Cloudflare | (d) Firebase | (e) Convex | (f) PocketBase/VPS |
|---|---|---|---|---|---|---|
| **AI streaming** | Edge Functions: 400 s wall clock (paid), 150 s idle timeout, 2 s CPU, 256 MB ([limits](https://supabase.com/docs/guides/functions/limits)). Fine for 1–2 min generations; streams can be cut if the worker retires. | Fluid compute streams well; long durations allowed; memory billed while waiting. | **No wall-clock limit for HTTP Workers while the client is connected; billed on CPU only** ([limits](https://developers.cloudflare.com/workers/platform/limits), [pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Best fit. | Cloud Functions 2nd gen stream OK; cold starts noticeable [UNVERIFIED magnitude]. | Actions can call LLMs; HTTP streaming supported but less idiomatic [UNVERIFIED]. | Whatever you build; no limits, no autoscale. |
| **Cold start** | Deno isolates, small | Fluid reuses instances; small | Isolates, ~0 | Container cold starts | Warm | None (always on) |
| **Region near HK** | Singapore / Tokyo / Seoul; **no HK** ([regions](https://supabase.com/docs/guides/platform/regions)) | Functions **hkg1**; Neon **Singapore** only in E/SE Asia ([srvrlss](https://www.srvrlss.io/provider/neon/)) | Worker runs at the **HK PoP**; D1 primary with `apac` location hint + optional global read replicas ([D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/), [read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)) | **asia-east2 = Hong Kong** for Firestore and Functions ([firestore locations](https://firebase.google.com/docs/firestore/locations), [functions locations](https://firebase.google.com/docs/functions/locations)) | US East, EU, Canada, **Sydney** — nearest is ~7,000 km away ([regions](https://docs.convex.dev/production/regions)) | Any VPS in HK/SG |
| **Lock-in** | Low–medium: it's Postgres; auth users exportable; Edge Functions are Deno | Low: Postgres + MIT auth lib | Medium: D1 is SQLite (portable data), bindings are CF-specific; Hono + Better Auth run elsewhere | **High**: Firestore NoSQL + proprietary SDKs | High: proprietary DB/query model (OSS self-host exists) | None, but you own everything |
| **Code the owner writes** | Least: auth UI flows, storage, DB API come free; write RLS policies + a few functions | Medium–high: API routes, auth wiring, DB layer, blob layer across 3–4 vendors | Medium: API routes (Hono), Better Auth config, SQL schema; all one repo/vendor | Low–medium; security rules instead of RLS | Low: reactive queries, auth built-in | Low to start, high to operate |
| **Security footgun** | **RLS**: the client talks straight to the DB with a public key; one table without a policy is public. CVE-2025-48757: 170 of 1,645 Lovable/Supabase apps exposed whole tables ([bleek](https://www.bleek.dev/cve-2025-48757), [superblocks](https://www.superblocks.com/blog/lovable-vulnerabilities)). Service-role key leaks = full bypass; new `sb_secret_` keys help, legacy keys deprecated by end-2026 ([api keys](https://supabase.com/docs/guides/getting-started/api-keys)). | Few: server-only DB; ordinary API authz bugs | Few: server-only DB; ordinary API authz bugs | Security Rules: same class of risk as RLS | Must check auth in every function; no DB exposed | Everything: OS patching, TLS, firewall |
| **Backups** | Daily, 7 days on Pro; PITR $100/mo | Neon PITR/branching (window depends on plan) [UNVERIFIED window] | **D1 Time Travel: any minute in last 30 days, free** ([D1 limits/release notes](https://developers.cloudflare.com/d1/platform/limits)); R2 versioning/manual | Managed export/PITR (GCP) | Built-in backups on paid [UNVERIFIED detail] | Litestream to S3 — you run restores |
| **Observability** | Dashboard logs (7 days Pro), reports | Vercel logs/Observability Plus ($1.20/M events) | Workers Logs + Tail; Sentry SDK for Workers | Cloud Logging | Dashboard logs | DIY |
| **Claude Code / AI tool familiarity** | Very high | Very high | High (Hono, Wrangler, D1 widely documented) | Very high | Medium–high | Medium |
| **One API for web + Tauri** | Yes (supabase-js works in Tauri; OAuth via PKCE + deep link — [example](https://medium.com/@nathancovey/supabase-google-oauth-in-a-tauri-2-0-macos-app-with-deep-links-f8876375cb0a)) | Yes | Yes | Yes | Yes | Yes |

**Verdicts**
- **(a) Supabase** — fastest to "accounts + DB + storage" working. The model (client queries
  the DB directly, security = RLS) is the wrong shape for a paid product with a
  **public** client: entitlements, quotas and the AI proxy all need server code anyway,
  and every new table is a chance to ship a public table. Choose it only if you route all
  writes through Edge Functions — at which point you're using it as "Postgres + Auth".
- **(b) Vercel API project** — good DX and in the Vercel ecosystem the owner already uses
  (Vercel now owns Better Auth, July 2026, library stays MIT —
  [Vercel blog](https://vercel.com/blog/vercel-acquires-better-auth)). But it's 3–4
  vendors (Vercel + Neon + Blob + maybe Clerk), the DB is in Singapore while functions
  are in HK, and it's the most expensive at scale.
- **(c) Cloudflare** — **recommended.** One vendor, one bill, one `wrangler.toml`; HK
  edge; streaming billed on CPU not wall time; native Turnstile, rate-limit binding
  (GA Sept 2025 — [changelog](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/)),
  and **AI Gateway spend limits that can budget per user in dollars** (public beta,
  June 2026 — [docs](https://developers.cloudflare.com/ai-gateway/features/spend-limits/),
  [blog](https://blog.cloudflare.com/ai-gateway-spend-limits/)). Weaknesses: D1 max 10 GB
  per database (fine: store documents in R2, metadata in D1), single-writer SQLite, and
  CF-specific bindings. Better Auth has a D1/Drizzle path and community Cloudflare
  integrations ([better-auth-cloudflare](https://github.com/zpg6/better-auth-cloudflare)).
- **(d) Firebase** — HK region is a genuine plus; but NoSQL lock-in, Security Rules have
  the same footgun as RLS, and no native spend cap on the GCP side.
- **(e) Convex** — lovely DX, but nearest region is Sydney and the data model is
  proprietary. Not for HK-latency-sensitive editing.
- **(f) PocketBase/VPS** — cheapest cash, most expensive in attention. A solo dev selling
  subscriptions should not also be the on-call sysadmin.

---

## 2. Static export + separate API, or a full Next.js server app?

**Keep the static export. Put the API on its own subdomain.** Reasons:

1. The Tauri app bundles `out/`; it cannot run Next.js server features (route handlers,
   server actions, middleware). Any logic moved into a Next server would have to be
   duplicated for desktop — the opposite of "one API for both".
2. A separate API decouples deploys: web `main` pushes stay static; the API can have its
   own staging/prod and its own rollback.
3. "Nothing reads process.env at runtime / browser-only" stays true for the client.

**Domains.** e.g. `app.econstudio.hk` (static) and `api.econstudio.hk` (Worker).
Being the same *site* (same registrable domain) matters: first-party cookies with
`SameSite=Lax` work between them.

**Auth transport — two paths, one server:**

| Client | Origin sent | Credential | Why |
|---|---|---|---|
| Web | `https://app.econstudio.hk` | httpOnly, Secure, SameSite=Lax session cookie scoped to `.econstudio.hk`; CORS `Access-Control-Allow-Credentials: true` with an exact origin | Token never touches JS → an XSS can't exfiltrate it |
| Desktop macOS | `tauri://localhost` | `Authorization: Bearer <session token>` stored in the OS keychain (Stronghold / keyring plugin), not localStorage | Cookies are not set on the non-standard `tauri://` origin ([tauri #5337](https://github.com/orgs/tauri-apps/discussions/5337)) |
| Desktop Windows | `http://tauri.localhost` (Tauri 2 default) | same bearer | same |

- Better Auth supports both at once: cookies by default plus the **bearer plugin**
  ([docs](https://better-auth.com/docs/plugins/bearer)); `trustedOrigins` must list the
  two Tauri origins, and there is a community Tauri plugin that remaps the custom scheme
  for CSRF checks ([better-auth-tauri](https://github.com/DreamsHive/better-auth-tauri), unofficial).
- CORS: an explicit allow-list of exactly those three origins. Never reflect arbitrary
  origins. Alternatively desktop can call the API through `@tauri-apps/plugin-http`
  (Rust reqwest, no CORS, URL scope allow-list — [docs](https://v2.tauri.app/plugin/http-client/)),
  loaded by dynamic import behind `isDesktop()` per the repo's rule.
- **Desktop sign-in:** never run Google OAuth inside the webview (Google blocks
  embedded user agents [well known; not re-verified here]). Use either
  (i) **email one-time code** (Better Auth email-OTP plugin) typed into the app — simplest,
  no deep links; or (ii) system browser + `econstudio://` deep link carrying a one-time
  code exchanged for a bearer (PKCE-style). Magic *links* are poor for desktop because they
  open the browser, not the app — prefer 6-digit codes for both clients.

---

## 3. Operational must-haves for a one-person paid service

| Need | Pick | Cost | Notes |
|---|---|---|---|
| Error tracking | Sentry (browser + Workers SDK; Tauri JS side) | Free → $26 | Scrub PII; tag `platform=web/desktop`, `appVersion`. |
| Uptime + status page | Better Stack | Free (10 monitors, 1 status page) | Monitor `GET api/health` (checks D1 + R2), the static site, and a synthetic AI call hourly. Status page at `status.econstudio.hk`. |
| Logs | Workers Logs + `wrangler tail`; optional Logpush | incl. | Log request id, user id hash, route, tokens used — never prompt text by default. |
| Rate limiting / abuse | Workers rate-limit binding (per IP, per user) + Turnstile on sign-up/OTP | incl. / free | Binding is per-location and approximate — use it for bursts; enforce *quotas* in D1 ([rate-limit docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)). Turnstile managed mode free, unlimited ([blog](https://blog.cloudflare.com/turnstile-ga/)). |
| Email | Resend (OTP codes, welcome, quota warnings); Stripe sends receipts itself | Free → $20 | Set SPF/DKIM/DMARC on the domain on day one. Postmark if deliverability becomes an issue ([postmark](https://postmarkapp.com/pricing)). |
| Payments | Stripe Billing: Checkout + Customer Portal + webhooks | ~3–4% + fixed per charge [UNVERIFIED HK rate] | Stripe is live in HK with AlipayHK/WeChat Pay HK; **FPS not supported** ([Stripe HK](https://stripe.com/resources/more/payments-in-hong-kong), [Statrys](https://statrys.com/guides/hong-kong/banking/best-payment-gateways)). School purchase orders → manual invoices via Stripe Invoicing later. (Payments detail is out of this topic's scope.) |
| Backups & restore drill | D1 Time Travel (30 days) + nightly `wrangler d1 export` to a *separate* R2 bucket/account; R2 object versioning or append-only revisions | ~free | **Quarterly drill**: restore last night's export into the staging DB, run a smoke test, write the time it took in `docs/`. An untested backup is not a backup. |
| Secrets | `wrangler secret put` per environment; nothing in repo; GitHub secret scanning + push protection on the public repo | free | One provider key per environment; rotate on any suspicion; document rotation steps. |
| Staging | Separate Worker env (`--env staging`), separate D1/R2, Stripe **test mode**, separate AI key with a $10 cap; web preview (develop branch) points at staging API | ~free | Matches the repo's develop→main model: `develop` = staging API, `main` = prod. |
| AI cost hard caps | 3 layers: (1) per-user token ledger in D1 (server-enforced), (2) AI Gateway spend limits per user + global daily, (3) provider-side cap: Gemini API **Project Spend Caps** (since Mar 2026 — [ppc.land](https://ppc.land/google-finally-adds-gemini-api-spend-caps-after-billing-chaos-hit-devs/), [billing docs](https://ai.google.dev/gemini-api/docs/billing)) or Anthropic **workspace spend limit** ([workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces)) | free | Caveat: a workspace cap reportedly cut traffic with no prior alert ([example issue](https://github.com/hrosspet/write-or-perish/issues/360)) — set your own 50/80% alerts below it so you learn first. |
| Cost alerts on infra | Cloudflare billing notifications; Vercel spend management (Pro: alerts at 75%, auto-pause at 100% — [pricing](https://vercel.com/docs/plans/pro-plan)) | free | |
| Incident plan | One-page runbook in the repo: how to (a) kill-switch AI (env flag → 503 with friendly message; offline app keeps working), (b) roll back a Worker (`wrangler rollback`), (c) restore D1 to a minute, (d) rotate each secret, (e) post on status page, (f) email affected users | — | The local-first design is the best incident plan: if the API is down, teachers still edit and export. Keep it that way — sync and AI must degrade, never block. |
| ToS + Privacy Policy | Required before taking money | — | HK PDPO applies: Personal Information Collection Statement at sign-up, purpose, retention, sub-processors (Cloudflare, Stripe, Resend, Sentry, AI provider), data access/correction requests. Cross-border rule (s.33) is still not in force, but PCPD guidance / model clauses are expected practice ([Baker McKenzie](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/hong-kong/topics/international-data-transfer), [PCPD guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/GN_crossborder_e.pdf)). State plainly whether prompt/worksheet text is sent to the AI provider and whether it is retained. Refund/cancellation terms. Get a HK lawyer to read it once. |

---

## 4. Security for a public open-source client

**Principle: the client is untrusted and fully readable. Every rule — who you are, what
you paid for, how much AI you may use, which documents you may read — is decided on the
server, from the server's own records.** No secret ships in the web bundle or the desktop
binary (the Tauri updater *public* key is fine).

| Threat | Mitigation |
|---|---|
| **Provider API key theft** | Key exists only as a Worker secret (or stored in AI Gateway BYOK). Client never sees it. Separate keys for staging/prod. Provider-side hard cap limits blast radius. GitHub push protection on the repo. Rotate quarterly. |
| **Quota abuse by a real account** | Per-user ledger row per request: reserve estimated tokens *before* the call, settle with the provider's reported usage *after*; reject when the plan's monthly budget is spent. Max input chars, `max_output_tokens`, one concurrent stream per user. AI Gateway per-user $ budget as a second line. |
| **Sign-up farming (free-tier multi-accounting)** | Free tier gets **no or tiny** hosted AI (the app already supports BYOK — keep it as the free path). Hosted AI = paid (or a short card-backed trial). If a free quota exists: verified email required, Turnstile on sign-up and OTP, disposable-domain blocklist, per-IP/per-/24 sign-up rate limit, quota granted only after email verification. |
| **Using the proxy as a free general LLM (prompt injection / jailbreak)** | Do **not** expose a raw "chat" endpoint. Expose *task* endpoints (`/ai/translate`, `/ai/mcq-distractors`, …) whose system prompt, model, temperature and output JSON schema are fixed server-side; the client sends only task inputs (e.g. text to translate + options). Validate output against the schema; drop non-conforming responses. Cap input length per task. Anything off-task costs the attacker their own quota, which is capped. |
| **Account sharing** | Session list per user; cap concurrent active devices (e.g. 3 — Better Auth lets you list/revoke sessions); flag accounts with many distinct IPs/countries per day; quota is per account, so sharing mostly hurts the sharer. Don't over-engineer — teachers sharing with a colleague is also a sales lead for the school plan. |
| **Broken object-level authorization** (user A reads doc of user B) | Every document query includes `WHERE owner_id = :session.userId` (or an org membership check). One helper, used everywhere, with a test that hits each route as the wrong user. This replaces RLS and is easier to test. |
| **Forged payment state** | Entitlements are written *only* by the Stripe webhook handler after signature verification, idempotent on `event.id`. The client's "I paid" is never trusted; after Checkout it just re-fetches `/me`. |
| **CSRF on the cookie path** | SameSite=Lax + exact-origin CORS + Better Auth's origin checks; state-changing routes are non-GET. |
| **Token theft on desktop** | Bearer in OS keychain, short-ish session with refresh, revocable server-side; don't log `Authorization` headers ([example fix](https://github.com/calimero-network/tauri-app/pull/307)). |

---

## 5. Recommended architecture

```
                    ┌──────────────────────────────┐
  Teacher browser → │ app.econstudio.hk            │  static `out/` (Vercel Pro, or CF static assets)
                    └──────────────┬───────────────┘
                                   │ fetch, cookie (SameSite=Lax), CORS exact origin
  Tauri desktop  ─────────────────┐│ fetch or plugin-http, Bearer from OS keychain
  (bundles `out/`,                ││ Origin: tauri://localhost | http://tauri.localhost
   works offline)                 ▼▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ api.econstudio.hk — Cloudflare Worker (Hono, TypeScript) │
                    │  • Better Auth (email OTP + Google; cookie + bearer)     │
                    │  • Turnstile verify on sign-up/OTP                       │
                    │  • rate-limit binding (per IP / per user)                │
                    │  • /me, /entitlements                                    │
                    │  • /docs sync (list, get, put-with-revision)             │
                    │  • /ai/<task> → SSE stream                               │
                    │  • /webhooks/stripe (signature + idempotency)            │
                    │  • Sentry, Workers Logs                                  │
                    └──┬──────────────┬───────────────┬──────────────┬─────────┘
                       │              │               │              │
                 ┌─────▼────┐   ┌─────▼─────┐  ┌──────▼───────┐ ┌────▼─────┐
                 │ D1 (apac)│   │ R2        │  │ AI Gateway   │ │ Resend   │
                 │ users,   │   │ doc blobs │  │ per-user $   │ │ OTP mail │
                 │ sessions,│   │ + revs,   │  │ spend limits,│ └──────────┘
                 │ plans,   │   │ images,   │  │ logs, retry  │
                 │ usage    │   │ nightly   │  └──────┬───────┘
                 │ ledger,  │   │ D1 export │         │ provider key (secret)
                 │ doc index│   └───────────┘  ┌──────▼──────────────────┐
                 └──────────┘                  │ Gemini / Claude API     │
                  Time Travel 30 d             │ + provider hard cap     │
                                               └─────────────────────────┘
      Stripe ──webhook──► /webhooks/stripe           Better Stack ──► /health, status page
```

**Sync must honour the repo's backward-compat rules.** The server stores each document as
*opaque bytes plus `schemaVersion`* and a monotonically increasing revision; it never
migrates or rewrites a document. Migration stays in the client (`MIGRATIONS`). A client
that pulls a document from a newer schema opens it read-only and never overwrites it — the
same rule as local files from a newer build. Keep old revisions (R2 key per revision) so a
bad client write is recoverable. The server-side document list is a second "index":
validate rows individually so one bad summary can't empty the list, mirroring
`econ-worksheet-index`. Conflicts: reject a `put` whose `baseRevision` is stale and let the
client save a "conflict copy" — never silently last-writer-wins over a teacher's work.

---

## 6. Phased rollout (MVP in weeks)

| Phase | Weeks | Ships | Exit criteria |
|---|---|---|---|
| 0. Groundwork | 0–1 | Domain + DNS on Cloudflare; Cloudflare Workers Paid ($5); Stripe account (HK entity) in test mode; confirm Vercel plan is Pro before charging; draft ToS/Privacy/PICS; Sentry + Better Stack accounts | Nothing user-facing |
| 1. Accounts | 1–3 | `api/` Worker (Hono) in the monorepo (or a sibling repo), Better Auth: email OTP + Google, cookie (web) + bearer (desktop); Turnstile; `/me`; CORS allow-list; staging + prod envs; Sentry; `/health` monitored | Sign in on web and on the desktop app (macOS + Windows); session revocation works; app still fully usable signed-out/offline |
| 2. Hosted AI | 3–5 | `/ai/<task>` SSE endpoints wrapping today's AI door tasks; server prompt templates + JSON schemas; D1 usage ledger; AI Gateway with per-user spend limit; provider hard cap; kill switch | Scripted abuse test (loop requests, oversized inputs, off-task prompts) is stopped by the ledger, not by the provider cap |
| 3. Paid plan | 5–7 | Stripe Checkout + Customer Portal; webhook → `entitlements`; plan gates AI quota; Resend emails; ToS/Privacy live; status page public | Test-mode lifecycle: subscribe, renew, fail payment, cancel, refund — entitlements follow each; **paid beta** to a handful of teachers |
| 4. Cloud sync | 8–12 | R2 blobs + D1 doc index; revisioned `put`; conflict copies; per-row index validation; nightly D1 export; first restore drill | Round-trips the frozen v1 corpus document byte-for-byte through the server; newer-schema doc opens read-only on an older client |
| 5. Schools | later | Better Auth organization plugin: departments, seats, shared folders, invoice billing | First school pays by invoice |

---

## 7. Sources (primary first)

- Supabase pricing — https://supabase.com/pricing
- Supabase Edge Function limits — https://supabase.com/docs/guides/functions/limits
- Supabase regions — https://supabase.com/docs/guides/platform/regions
- Supabase API keys (publishable/secret) — https://supabase.com/docs/guides/getting-started/api-keys
- CVE-2025-48757 write-ups — https://www.bleek.dev/cve-2025-48757 ; https://www.superblocks.com/blog/lovable-vulnerabilities
- Vercel fluid compute pricing (hkg1 rates) — https://vercel.com/docs/functions/usage-and-pricing
- Vercel pricing / Pro plan / Hobby / fair use — https://vercel.com/docs/pricing ; https://vercel.com/docs/plans/pro-plan ; https://vercel.com/docs/plans/hobby ; https://vercel.com/docs/limits/fair-use-guidelines
- Vercel acquires Better Auth (Jul 2026) — https://vercel.com/blog/vercel-acquires-better-auth
- Auth.js joins Better Auth — https://better-auth.com/blog/authjs-joins-better-auth
- Better Auth bearer plugin — https://better-auth.com/docs/plugins/bearer
- Cloudflare Workers pricing / limits — https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/workers/platform/limits
- D1 data location / read replication / limits — https://developers.cloudflare.com/d1/configuration/data-location/ ; https://developers.cloudflare.com/d1/best-practices/read-replication/ ; https://developers.cloudflare.com/d1/platform/limits
- Workers rate-limit binding GA — https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/
- Turnstile free — https://blog.cloudflare.com/turnstile-ga/
- AI Gateway spend limits — https://developers.cloudflare.com/ai-gateway/features/spend-limits/ ; https://blog.cloudflare.com/ai-gateway-spend-limits/
- Neon pricing / regions; Databricks acquisition — https://neon.com/pricing ; https://neon.com/docs/introduction/regions ; https://www.databricks.com/company/newsroom/press-releases/databricks-agrees-acquire-neon-help-developers-deliver-ai-systems
- Clerk 2026 plans — https://clerk.com/changelog/2026-02-05-new-plans-more-value
- Convex pricing / regions — https://www.convex.dev/pricing ; https://docs.convex.dev/production/regions
- Firebase pricing / locations — https://firebase.google.com/pricing ; https://firebase.google.com/docs/firestore/locations ; https://firebase.google.com/docs/functions/locations
- PocketBase production — https://pocketbase.io/docs/going-to-production/
- Tauri HTTP plugin; cookies on tauri:// — https://v2.tauri.app/plugin/http-client/ ; https://github.com/orgs/tauri-apps/discussions/5337
- Gemini spend caps — https://ai.google.dev/gemini-api/docs/billing ; https://ppc.land/google-finally-adds-gemini-api-spend-caps-after-billing-chaos-hit-devs/
- Anthropic workspaces — https://platform.claude.com/docs/en/manage-claude/workspaces
- Resend / Postmark / Sentry / Better Stack pricing — https://resend.com/pricing ; https://postmarkapp.com/pricing ; https://last9.io/blog/sentry-pricing/ ; https://betterstack.com/status-page
- Stripe in HK — https://stripe.com/resources/more/payments-in-hong-kong ; https://statrys.com/guides/hong-kong/banking/best-payment-gateways
- HK PDPO cross-border — https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/hong-kong/topics/international-data-transfer ; https://www.pcpd.org.hk/english/resources_centre/publications/files/GN_crossborder_e.pdf

**Unverified items to recheck before committing:** the per-teacher usage model and all
cost-at-scale figures; AI token cost per teacher; Stripe HK card fee; Firebase/Convex
cold-start and streaming details; Neon PITR window per plan; Google's embedded-webview
OAuth block (well known, not re-checked); AI Gateway spend limits are **public beta** and
its pricing for high log volume.
