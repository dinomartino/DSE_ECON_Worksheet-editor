# I. A zero-fixed-cost stack for paid AI (and optional sync)

Research date 2026-09-30. Quotes come from the primary pages listed; they were fetched today.
**[UNVERIFIED]** marks anything I could not confirm from a primary source. (My web-search
budget ran out partway through, so the later checks went straight to known URLs.)

## 0. Main findings

1. **Vercel Hobby cannot host the web app once it sells anything.** Vercel's definition
   explicitly includes "Any method of requesting or processing payment from visitors of the
   site" and "Advertising the sale of a product or service". A "Buy AI credits" button that
   links to Stripe counts. So the free, zero-cost route is to **move the static site off
   Vercel**, not to pay US$20 for Pro.
2. **Cloudflare's free plan allows commercial use, with one carve-out: you may not collect
   card data on the free property.** Stripe-hosted Checkout or Payment Links (the card is
   typed on stripe.com) keeps card data off the property. This is my reading of the terms,
   not legal advice.
3. **A Cloudflare Worker can proxy a 10–60 s Vertex call on the free plan.** The 10 ms limit
   counts CPU time only, and "Waiting on network requests (such as `fetch()` calls…) does
   **not** count toward CPU time". There is "no hard limit on duration" while the client
   stays connected.
4. **Google gives you no hard spending cap on Vertex.** Budgets only alert. The hard cap
   has to live in our own proxy, as a prepaid credit ledger plus a global daily ceiling.
   A budget alert that disables billing is the documented backstop, but it is slow.
5. **Recommended: Stack A.** Cloudflare Workers (static assets + API) + D1, with sign-in by
   emailed one-time code (Resend free), Stripe Payment Links, Vertex through an API key,
   and Sentry + UptimeRobot on their free plans. Fixed cost is HK$0. The first paid step is
   Workers Paid at **US$5/month**.

---

## 1. Can each free plan host something that takes payment?

| Host | Commercial use on the free plan? | Primary quote |
|---|---|---|
| **Vercel Hobby** | **No** | "**Hobby teams** are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." Commercial usage is "any Deployment that is used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project". Examples include "Any method of requesting or processing payment from visitors of the site" and "Advertising the sale of a product or service". "Asking for Donations **does not** fall under commercial usage." — https://vercel.com/docs/limits/fair-use-guidelines |
| **Cloudflare Workers / Pages Free** | **Yes, with a carve-out** | The Self-Serve Subscription Agreement does not bar commercial use. §2.2.1(h) forbids you to "process or collect personal or business credit card information on any web property that is receiving Free Services". §2.6: free services last until "termination of the Free Service by Cloudflare in our sole discretion. We will have no liability for any harm or damage arising out of or in connection with any Free Services." — https://www.cloudflare.com/terms/ |
| **Supabase Free** | Yes, as far as I found | Neither the pricing page nor the ToS has a commercial-use restriction. The limits that bite are pausing and the cap of 2 projects (§2). — https://supabase.com/pricing, https://supabase.com/terms |
| **Firebase Spark** | Yes, but Spark cannot run the proxy | "to deploy functions, your project must be on the Blaze pricing plan" — https://firebase.google.com/docs/functions/get-started. The pricing page lists Cloud Functions on Spark as "Not applicable". Blaze has no monthly fee and keeps the free quotas (2M invocations/month), but it has no spending cap. |
| **Netlify Free** | No restriction found **[UNVERIFIED: I checked the website terms and docs, not the Self-Serve Subscription Agreement]** | "300 credits/month with credit hard limit". "Once your credit balance is completely used up, all of your web projects (sites/apps) are paused and visitors … will find a `Site not available` page". A production deploy costs 15 credits and bandwidth costs 20 credits/GB, so about 20 deploys a month uses up the plan. — https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ |
| **GitHub Pages** | **No** for this use | "not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)". An app whose main purpose is free and open source, with an optional paid add-on, is a grey zone. Not recommended. — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits |

**What this means for the app:** the current web deploy on Vercel Hobby is fine *today*
(free, open source, no payment). The day the web build shows a buy button, it breaches
Hobby. Cloudflare serves static assets with "Requests to static assets are free and
unlimited" (https://developers.cloudflare.com/workers/platform/pricing/), and a Next static
export (`out/`) deploys there unchanged.

## 2. Free-tier limits that matter here

### Cloudflare Workers Free (https://developers.cloudflare.com/workers/platform/limits/, …/pricing/)
- Requests: "100,000/day", resetting at midnight UTC. Past the cap, each route either
  "Bypasses the Worker" (fails open) or "Returns a Cloudflare `1027` error page" (fails
  closed).
- CPU: "10 ms" per request. "Waiting on network requests (such as `fetch()` calls, KV reads,
  or database queries) does **not** count toward CPU time."
- Duration: "There is no hard limit on duration for HTTP-triggered Workers. As long as the
  client remains connected, the Worker can continue processing." `ctx.waitUntil()` extends
  "up to 30 seconds after the response is sent or the client disconnects".
- **Fitting a Vertex proxy:** awaiting a 10–60 s Vertex fetch uses almost no CPU. Passing
  the stream through (`new Response(upstream.body)`) is also cheap. What costs CPU is
  re-parsing every SSE chunk to count tokens. Read `usageMetadata` from the final chunk
  instead, then measure with `wrangler tail`. **[UNVERIFIED: real CPU ms per streamed call;
  measure it before launch.]**
- Subrequests "50/request". "up to six connections simultaneously waiting for response
  headers". Memory "128 MB". 100 Workers per account.
- Password hashing will not fit: Better Auth's default is scrypt ("slow and memory-intensive",
  https://www.better-auth.com/docs/authentication/email-password), and that CPU cost is
  exactly what the 10 ms limit counts. **[UNVERIFIED: exact ms on workerd]** Avoid
  passwords (§3).
- **D1 Free** (https://developers.cloudflare.com/d1/platform/pricing/, …/limits/):
  "5 million / day" rows read, "100,000 / day" rows written, "5 GB (total)" storage, "10"
  databases, "500 MB" maximum per database, 2 MB maximum per row, "50" queries per
  invocation, Time Travel "7 days". Past a daily limit, "D1 API will return errors".
- **KV Free** (https://developers.cloudflare.com/kv/platform/pricing/): 100,000 reads/day
  but only "1,000 / day" writes. That is too few for sync. Use KV only for cached tokens
  and config.
- **R2 Free** (https://developers.cloudflare.com/r2/pricing/): "10 GB-month / month",
  1M Class A and 10M Class B operations per month, egress "Free". **[UNVERIFIED: whether
  turning on R2 requires a payment method, and whether overage then bills automatically.
  My understanding is yes to both, which would break the zero-risk property. Prefer D1
  until you need more.]**
- **Durable Objects on Free**: "available both on Workers Free and Workers Paid plans".
  SQLite backend only. 100,000 requests/day, 13,000 GB-s/day, 5 GB
  (https://developers.cloudflare.com/durable-objects/platform/pricing/). Not needed:
  `D1.batch()` is enough for an atomic credit ledger.
- **Email**: Cloudflare "Email Sending Beta … Available on Workers Paid plan". On the free
  plan it can only send "to verified destination addresses in your account", so it cannot
  email teachers (https://developers.cloudflare.com/email-service/).

### Supabase Free (https://supabase.com/pricing, …/docs/guides/platform/billing-on-supabase)
- "500 MB database size (Shared CPU • 500 MB RAM)", "1 GB file storage", "50,000 monthly
  active users", "5 GB egress", "500,000" Edge Function invocations, "Limit of 2 active
  projects", "Automatic backups" "Not included".
- Edge Functions (https://supabase.com/docs/guides/functions/limits): wall clock "Free plan:
  150s", CPU "2s (… does not include async I/O)", idle timeout 150 s (then 504). **A Vertex
  proxy fits.**
- **Pausing** (https://supabase.com/docs/guides/platform/free-project-pausing): "Free
  projects are paused after 1 week of inactivity". Inactive means the project "does not
  receive sufficient user database activity over the past week". "a few user requests to the
  database each day over the previous week is enough to keep the project from being paused."
  They email a warning about a week ahead and confirm the pause. You can restore within 1
  year.
- **Keep-alive pings:** neither the docs nor the ToS say whether automated pings are allowed
  or forbidden **[UNVERIFIED: whether Supabase tolerates them]**. HK school holidays (July
  and August) are exactly when real activity drops to zero.
- Default SMTP: "2 messages per hour", and it sends only to team members. "We urge all
  customers to set up custom SMTP" (https://supabase.com/docs/guides/auth/auth-smtp). So
  Resend or SES is needed anyway.

### Firebase Spark (https://firebase.google.com/pricing, …/docs/auth/limits)
- No Cloud Functions, so it cannot call Vertex from Spark.
- Auth: "50K MAUs". Email limits per day: verification 1,000, password reset 150, **email-link
  sign-in only 5**. New accounts: 100 per hour per IP.
- Firestore: 1 GiB stored, 50K reads, 20K writes and 20K deletes per day.

### Google Cloud Run free tier (same billing account as Vertex) (https://cloud.google.com/run/pricing)
- Request-based billing: "First 180,000 vCPU-seconds free per month", "First 360,000
  GiB-seconds", "2 million requests free per month". "The free tier usage is aggregated across
  projects by billing account", "applied as a spending based discount using Tier 1 pricing".
  `asia-east2` (Hong Kong) is listed under "Subject to Tier 2 pricing", so the free tier
  covers less there.
- The whole wait on Vertex is billed instance time. At 0.25 vCPU and 30 s per call, that is
  about 24,000 calls/month free (at concurrency 1, more with concurrency). **[UNVERIFIED:
  Artifact Registry and Cloud Build image storage may cost a few cents a month.]**

## 3. Auth at zero cost for web + Tauri

| Option | Free allowance | Web + Tauri fit | Verdict |
|---|---|---|---|
| **Own email one-time code on a Worker** (6-digit code, HMAC-signed session JWT, D1 users table) | No auth vendor. Email via **Resend Free: "3,000" a month, "100 emails a day", 3 domains** (https://resend.com/pricing) | Best fit. Typing a code works the same in a browser and in a Tauri webview, with no OAuth redirect or deep link. No hashing, so no CPU problem. | **Recommended** |
| **Firebase Auth (Spark)** | 50K MAU, no pausing. Email/password hashing runs at Google. | Email/password works in a webview. Google sign-in inside an embedded webview is typically blocked (`disallowed_useragent`) **[UNVERIFIED for Tauri specifically]**. Email-link sign-in is capped at 5/day. The Worker verifies ID tokens against the JWKS (RS256 in WebCrypto). | Good alternative. No email vendor needed for verification. |
| **Supabase Auth Free** | 50K MAU | Works, but the project pauses after 1 week of low DB activity. Needs custom SMTP. | Only if the database is Supabase too |
| **Better Auth on Workers + D1** | Free library | Default scrypt passwords are a poor match for 10 ms CPU. Use its email-OTP or magic-link plugins instead. Needs `nodejs_compat` (https://www.better-auth.com/docs/integrations/hono). | OK if passwordless |
| **Clerk Hobby** | "50,000 MRU limit per app" | "Fixed, 7 day session lifetime". Customisation is paid, which is the source of the weekly re-login reports. Branding stays. (https://clerk.com/pricing) | Weekly re-login is bad UX for teachers |
| **WorkOS AuthKit** | "First 1M MAUs" free. Custom domain "$99/mo" (https://workos.com/pricing) | Hosted pages on a WorkOS domain | Viable, but adds a vendor |

**Email-sending fallback:** AWS SES charges "$0.10 / 1,000 emails", with no minimum
(https://aws.amazon.com/ses/pricing/). New accounts get up to US$200 in credits under a
6-month free plan.

## 4. Vertex AI: free allowances and cost control

- **No always-free Gemini on Vertex.** Express mode offers a "free tier … for up to 90 days,
  within the specified quotas" to new @gmail users with no billing. It "is separate from,
  and not available through, the Google Cloud Free Program". The 90-day free tier goes away
  once billing is on
  (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview).
  Good for development, not for production.
- **$300 Free Trial:** eligible if you have "never been a paying user of Google Cloud, Google
  Maps Platform, or Firebase". It needs a card. The listed exclusions are "Gemini API in AI
  Studio" and partner models, so Vertex Gemini appears covered. Unless you upgrade, the
  account "will be closed and all of its associated projects and resources will be stopped"
  at 90 days or US$300. Trial accounts cannot "Request a quota increase"
  (https://docs.cloud.google.com/free/docs/free-cloud-features). **[UNVERIFIED: that HK
  addresses qualify for the trial.]**
- **Budgets do not cap:** "Setting an _alerts-only_ budget _doesn't_ automatically cap Google
  Cloud … usage or spending." A Pub/Sub budget message can trigger "programmatically
  disabling Cloud Billing on a project". Reporting lags: "there is a delay between your use
  … and the usage costs reporting" (https://docs.cloud.google.com/billing/docs/how-to/budgets).
  The kill switch can fire hours late, and disabling billing stops the project's resources.
- **Quotas:** Gemini Standard PayGo uses usage tiers with "Baseline Throughput, measured in
  tokens per minute", and the tier rises with spend. That is a floor, not a ceiling you set.
  Cloud Quotas docs allow "quota decrease adjustments" in general
  (https://docs.cloud.google.com/docs/quotas/view-manage). **[UNVERIFIED: whether a
  customer-set lower quota exists for Gemini generate-content on DSQ/PayGo models. Do not
  rely on it.]**
- **API keys:** Vertex offers API keys to "an existing Google Cloud user with a billing
  account" (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys). The
  Worker then needs no service-account JWT signing. Restrict the key to the Vertex AI API.
- **Prices (Standard PayGo, per 1M tokens, from https://cloud.google.com/vertex-ai/generative-ai/pricing):**

  | Model | Input | Output |
  |---|---|---|
  | Gemini 2.5 Flash | $0.30 | $2.50 |
  | Gemini 2.5 Flash-Lite | $0.10 | $0.40 |
  | Gemini 3.5 Flash (global) | $1.50 | $9.00 |

  Re-check before setting credit prices.
- **The hard cap we build ourselves:**
  1. Prepaid credit ledger in D1. Before each call, reserve the worst case
     (`maxOutputTokens` plus input tokens, times price). Settle from `usageMetadata`. Refuse
     the call at zero balance. Spend can then never exceed money already received.
  2. A global daily ceiling in D1, for example US$5/day, that returns 503 when reached. It
     protects against ledger bugs and stolen sessions.
  3. Per-user rate limit, kept as a D1 counter.
  4. A GCP budget alert at a low figure, plus the Pub/Sub → disable-billing function (it
     runs inside Cloud Run's free tier) as the last resort.

## 5. Payments with no monthly fee

- Stripe HK: "No setup fees, monthly fees, or hidden fees". "3.4% + HK$2.35 per successful
  transaction for domestic cards". International cards add 0.5%, and currency conversion adds
  2%. Alipay and WeChat Pay cost "2.2% + HK$2.00". A dispute costs "HK$85.00"
  (https://stripe.com/en-hk/pricing).
- Top-up size matters: on a HK$50 top-up the fee is HK$4.05 (8.1%). On HK$200 it is
  HK$9.15 (4.6%). Sell packs of HK$100 or more.
- **Payment Links work from a static site.** Append `?client_reference_id=<userId>`
  (alphanumeric, `-` or `_`, "up to 200 characters"). "it's sent in the
  checkout.session.completed webhook" (https://docs.stripe.com/payment-links/url-parameters).
- Stripe says "Webhooks are required for fulfillment" and "Payment Links use Checkout"
  (https://docs.stripe.com/payments/checkout/fulfill-orders). One Worker route verifies the
  signature (HMAC-SHA256 in WebCrypto, which is cheap) and credits the ledger idempotently,
  keyed on the event id.

## 6. Monitoring

- **Sentry Developer:** "5k errors" a month, "Limited to one user", "30-day lookback". No
  commercial restriction on the pricing page (https://sentry.io/pricing/).
  **[UNVERIFIED: the full Sentry ToS]**
- **UptimeRobot Free:** "50 monitors", "5 min. monitoring interval". The ToS says
  "UptimeRobot is available for any use, including commercial and business use"
  (https://uptimerobot.com/terms/).
- **Better Stack Free:** "10 monitors", "Up to 30 seconds check frequency", 1 status page.
  It is described as "Free for personal projects", with no explicit ban on business use
  (https://betterstack.com/pricing). UptimeRobot's terms are clearer.

## 7. Three zero-fixed-cost stacks

Sizing assumptions: 1,000 accounts, 300 active, 50 docs of about 30 KB each. JSON
compresses about 5×, so a doc is about 6 KB gzipped (compress on the client, not in the
Worker). Each active teacher makes about 50 API requests a day.

### Stack A: all on Cloudflare + Vertex API key (recommended)

- **Static web:** Workers static assets or Pages. Free and unlimited.
- **API:** a single Worker handling auth-code, session, AI proxy, Stripe webhook and sync.
- **Data:** D1 holds users, sessions, ledger and sync documents.
- **Other services:** email via Resend, Stripe Payment Links, Sentry, UptimeRobot.

| Resource | Free cap | Usage at 300 active / 1,000 accounts | Breaks at | Then |
|---|---|---|---|---|
| Worker requests | 100k/day | about 15k/day | about 2,000 daily-active teachers | Workers Paid **US$5/mo** (10M req/mo) |
| Worker CPU | 10 ms/req | proxying under 2 ms **[measure]** | password hashing, server-side compression, parsing big JSON | Workers Paid (higher CPU) |
| D1 size | 500 MB/db, 5 GB/account | 1,000 × 50 × 6 KB ≈ 300 MB | about 1,500 syncing teachers per db | shard across 10 dbs, or R2 |
| D1 writes | 100k rows/day | debounced sync ≈ 10k/day | constant per-keystroke autosave sync | debounce, or Workers Paid |
| Email | 100/day, 3,000/mo | sign-in codes with 90-day sessions | a workshop signing up 150 teachers in one day | SES at $0.10/1k, or queue codes |
| Vertex | none | pay per token, pre-funded | — | covered by top-ups |

Fixed cost: **HK$0**, plus a domain (about HK$80–120/yr). Tauri: call the Worker with CORS
allowing `tauri://localhost` and `http://tauri.localhost`. Store the session token in the
existing platform layer.

### Stack B: Supabase Free + Cloudflare static

- **Auth:** Supabase Auth, with SMTP through Resend.
- **Data:** Postgres holds the ledger and sync documents.
- **AI proxy:** an Edge Function (150 s wall, 2 s CPU).
- **Web:** static site on Cloudflare.

Breaks at:
- 500 MB database, about 1,500 syncing teachers.
- 5 GB egress a month.
- The 1-week inactivity pause, which will hit in HK summer.
- 2 projects in total, so no staging.
- No backups.

Then Supabase Pro at **US$25/mo**. It is simpler to build than A (auth comes built in), but
it carries the only free-tier failure that takes the service down on its own.

### Stack C: Google-only backend + Cloudflare static

- **Auth:** Firebase Auth (Spark).
- **AI proxy:** Cloud Run in `asia-east1`, a Tier 1 region **[UNVERIFIED tiering]**. It calls
  Vertex with a service account, so there is no key to leak.
- **Data:** Firestore, 1 GiB and 20K writes/day.
- **Billing:** one billing account for Vertex and Cloud Run.

Breaks at:
- Firestore 1 GiB, about 3,000 syncing teachers.
- 20K writes/day.
- Cloud Run at about 24k 30-second calls a month.

Then usage is billed, in cents, with no step fee. Downsides: cold starts, an uncapped billed
account, container registry cents, and more moving parts. Choose it only if the owner
prefers to keep everything in Google.

## 8. Risks of depending on free tiers

- **Termination and changes:** Cloudflare may end free services "in our sole discretion"
  with "no liability" (§2.6). Every free plan here can change. Keep the design portable:
  plain SQL (D1 is SQLite), JWT sessions, and the Stripe ledger reconstructible from Stripe
  events.
- **No real backups:** D1 Time Travel lasts 7 days, and Supabase Free has no backups.
  Run a nightly `wrangler d1 export` from a GitHub Actions cron in a **private** repo,
  encrypted, because it holds teacher data.
- **Local-first protects the teachers:** documents stay local, and cloud sync is only a
  copy. A free-tier outage then costs convenience, never a worksheet. This matches the
  backward-compatibility rule in CLAUDE.md.
- **Daily caps fail loudly:** a Worker over 100k/day returns 1027 (fail closed) or bypasses.
  Fail closed on `/api/*`, and show "AI busy, try later" in the app.
- **Personal liability:** Vertex has no Google-side hard cap, so the ledger and daily ceiling
  are mandatory before launch, not polish.
- **Legal:** Stripe Checkout keeps card data off the Cloudflare property (§2.2.1(h)). Do not
  build an embedded card form on a free-plan property.
- **Vercel today:** keep Vercel only while the web build shows no purchase UI, or move it
  now. Cloudflare static hosting is the zero-cost move.

## 9. Recommendation

**Stack A.**
- Move the static web build to Cloudflare, since Vercel Hobby forbids payment UI.
- Add one Worker with D1 for accounts, sessions, a prepaid credit ledger with a global daily
  ceiling, the Stripe webhook, and later optional sync. Sync stores gzipped documents, still
  local-first.
- Sign in with an emailed 6-digit code sent via Resend Free, with 90-day sessions.
- Call Vertex Gemini with a key restricted to the Vertex API.
- Add a GCP budget alert with a Pub/Sub kill switch as the backstop.
- Use Stripe Payment Links (HK$100+ packs) with `client_reference_id`.
- Monitor with Sentry Developer and UptimeRobot Free.

Fixed cost is HK$0. The first bill that could ever appear is Workers Paid at US$5/month,
at around 2,000 daily-active teachers, which is roughly 10× the expected scale.

Before launch, measure: CPU ms per streamed proxy call (`wrangler tail`), R2 billing
behaviour if R2 is used, HK eligibility for the GCP trial, and whether Gemini PayGo allows
a customer-set quota decrease.
