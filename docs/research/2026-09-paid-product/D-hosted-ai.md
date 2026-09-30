# D. Hosted AI for Econ Studio: legality, cost, architecture

Researched 2026-09-30. Prices are USD per 1M tokens unless marked. **[unverified]** marks claims I could not confirm from a primary source.

## 0. Recommendation in one screen

- **Primary: Gemini on Google Cloud Vertex AI** (now branded "Gemini Enterprise Agent Platform"), billed to the developer's own Google Cloud account. Use the global endpoint, `gemini-3.5-flash-lite` by default and `gemini-3.1-flash-lite` as the cheaper fallback. This is the only way to keep Gemini that fits Google's terms for a developer and users in Hong Kong. Vertex global pricing is the same as AI Studio list pricing, so the terms-compliant route costs nothing extra.
- **Second provider: Qwen on Alibaba Cloud Model Studio, Hong Kong region.** Use it for failover and as the low-cost tier. `qwen3.5-flash` runs with "Hong Kong (China)" deployment scope, so data stays in HK.
- **Do not host with OpenAI, Anthropic, or the Gemini Developer API (AI Studio key).** Their terms bar HK end users, and OpenAI and Anthropic also bar an HK-based account holder. **DeepSeek is legal but not recommended as the default.** Its data is stored in the PRC under PRC law, and its peak-price hours overlap HK school hours.
- **Hosting:** a thin, schema-locked proxy on **Vercel Functions**, as a separate project, because the app is `output: 'export'` and cannot have API routes. Supporting services:
  - **Supabase Auth** (email OTP) for sign-in.
  - **Stripe Billing** for subscriptions.
  - **Upstash Redis** for rate limits and quotas.
  - The server owns the prompt, and the client sends only the translation payload.
- **Pricing and quota:** **HK$48/month** includes about **500k source characters** (≈100 two-page worksheets), with a hard **US$3/user/month cost ceiling** and a daily cap. Keep **BYOK free** (Raycast model: BYOK on the free tier, paid plan includes AI).
- **Unit economics:** a typical teacher costs about **US$0.42 ≈ HK$3.3/month** on Gemini 3.5 Flash-Lite (heavy use: HK$14). After Stripe fees (≈HK$4), contribution is about **HK$40 (≈85%)** per typical subscriber. Fixed costs are about HK$160–400/month (Vercel Pro is mandatory for commercial use), so break-even is about 4–8 subscribers.

---

## 1. Provider terms: can I serve HK teachers with my key?

### 1.1 OpenAI (direct API): **No**
- The OpenAI Services Agreement (online v.010126, PDF) says: **§16.12 "Geographical Limitations on Use. Customer and End Users may not access or offer access to the Services outside of the Supported Countries and Territories. A violation of this Section … may result in Services suspension under Section 8."** The definition reads: "'Supported Countries and Territories' means the countries and territories for which OpenAI supports access to API Services and our ChatGPT services." ([PDF](https://cdn.openai.com/osa/openai-services-agreement.pdf))
- The supported-countries page says: "Accessing or offering access to our services outside of the countries and territories listed below may result in your account being suspended." Hong Kong is not listed. ([OpenAI](https://developers.openai.com/api/docs/supported-countries))
- **The clause covers End Users explicitly.** A US or Singapore proxy serving HK teachers therefore breaches it, and so does an HK developer holding the account. OpenAI has enforced this at the network level since 9 July 2024. Vercel told customers that `hkg1` functions would be blocked ([Vercel changelog](https://vercel.com/changelog/openai-will-not-support-the-hong-kong-region-hkg1-for-functions)).

### 1.2 Anthropic (direct API): **No**
- The Commercial Terms (effective 17 June 2025) say: **D.2 "Customer and its Users may only use the Services in compliance with these Terms, including (a) the Usage Policy, (b) our policy on the countries and regions Anthropic currently supports ('Supported Regions Policy') …"** They also say you may not "resell the Services except as expressly approved by Anthropic". Powering your own product for Users is allowed. ([Anthropic commercial terms](https://www.anthropic.com/legal/commercial-terms))
- The Supported Regions page does not list Hong Kong. It also says: "Anthropic reserves the right to not provide its products or services to entities whose majority direct or indirect ownership is attributable to nations other than those listed." ([Anthropic](https://www.anthropic.com/supported-countries))
- **Bedrock is not a way around this.** Claude on Bedrock requires the AWS account's billing address to be in a supported country, and an HK billing address gets "Access to Anthropic models is not allowed from unsupported countries, regions, or territories". Other Bedrock providers work with HK billing ([AWS Builder article, Aug 2026](https://builder.aws.com/content/3IKafAdgh3M4UNo5CS2xXWGPuOz/i-tested-bedrock-from-hong-kong-across-4-regions-description), secondary). Microsoft Foundry also sells Claude only to supported-country billing accounts (secondary: [eimoon summary](https://blog.eimoon.com/p/anthropic-supported-countries-regions-2026-04/)) **[unverified primary]**.

### 1.3 Google Gemini Developer API (AI Studio keys, including paid tier): **No**
The Gemini API Additional Terms were last updated 2026-04-28 ([terms](https://ai.google.dev/gemini-api/terms)):
- **"You may only access the Services (or make API Clients available to users) within an available region."** Hong Kong is not on the available-regions list; I checked the raw page, where Japan, Singapore and Taiwan appear and Hong Kong does not ([regions](https://ai.google.dev/gemini-api/docs/available-regions)). The page tells anyone outside those regions to "try the Gemini API in Gemini Enterprise Agent Platform" (Vertex).
- "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom." This does not apply to Econ Studio.
- **"You must be 18 years of age or older to use the APIs. You also will not use the … API Clients … directed towards or likely to be accessed by individuals under the age of 18."** The product is for teachers, not students. Say so in its own terms.
- Unpaid tier: "Google uses the content you submit … to provide, improve, and develop Google products." Paid tier: "Google doesn't use your prompts or responses to improve our products."
- The consumer Gemini app opened in HK on 16 March 2026 ([HKFP](https://hongkongfp.com/2026/03/16/googles-gemini-ai-chatbot-finally-rolling-out-to-all-hongkongers/)), but the **API still returns "User location is not supported for the API use"** from HK ([10beasts](https://10beasts.net/gemini-hong-kong-api-blocked-vpn/), secondary).
- **Side note on today's BYOK advice.** Telling HK teachers to "turn on a VPN" for an AI Studio key means they are using the key outside an available region, which the terms forbid. The risk falls on the teacher's Google account, not on the app, but a hosted Vertex option removes the need for that advice.

### 1.4 Google Cloud Vertex AI (Gemini Enterprise Agent Platform): **Yes, the legal Gemini path**
- Vertex AI runs under the Google Cloud terms, not the Gemini API terms. The Vertex locations page lists **Hong Kong (asia-east2)** as a region, and the global endpoint is available ([locations](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)). Several HK sources confirm that Vertex serves Gemini to HK accounts without a VPN ([HK AI Podcast](https://hongkongaipodcast.com/blog/gemini-hong-kong), [doodhk](https://doodhk.com/blog/ai-model-access-in-hong-kong/)).
- The Google Cloud Service Specific Terms have **no Hong Kong or country restriction** for generative AI beyond US-embargoed countries. The only under-18 clause I found concerns Custom Voice/Avatar. §18 says: **"Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction."** ([service terms](https://cloud.google.com/terms/service-terms))
- **[unverified]** I found no Google primary document that says in so many words "HK billing accounts may use Gemini on Vertex". It rests on the absent restriction and on reports of it working. **Before building: create the billing account with the HK address and make one call to `gemini-3.5-flash-lite` on the global endpoint.**
- **Pricing matches AI Studio.** Gemini 3.5 Flash-Lite is $0.30 in / $2.50 out on the global endpoint and $0.33 / $2.75 on regional endpoints (+10%) ([Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)). The podcast's claim that Vertex costs 20–40% more is out of date.
- ZDR: Vertex caches inputs for up to 24 h by default, and abuse-monitoring prompt logging applies to non-invoiced accounts. Full ZDR means turning caching off (which also loses the implicit-cache discount) and filing an exception form ([data governance](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance)).

### 1.5 Azure OpenAI / Microsoft Foundry: **Yes, a legal route to GPT models**
- Microsoft (2024, still its position): "no change to Azure OpenAI service offerings in Hong Kong… continue to provide access to eligible customers in Hong Kong via models deployed in regions outside Hong Kong" ([SCMP](https://www.scmp.com/tech/big-tech/article/3268233/microsoft-maintains-ai-services-hong-kong-openai-curbs-api-access-china)). On Microsoft Q&A, Microsoft says HK is not a deployment region but HK organisations can deploy in East Asia or Southeast Asia and serve HK ([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/5813396/providing-solution-in-hong-kong-using-openai-found)).
- It is a viable second source if GPT quality is ever needed. It carries more setup: an Azure subscription, deployments, and quota requests. **[unverified]** whether the newest GPT-6 "Luna"-class small model is on Azure in Southeast Asia or East Asia.

### 1.6 Alibaba Cloud Model Studio (Qwen): **Yes**
- Model Studio has a **Hong Kong region**. Qwen3.5-Flash and qwen-plus offer a "Hong Kong (China)" deployment scope. Newer models (qwen3.8-flash, qwen3.7-plus) use a "Global" scope, where "model inference compute resources are dynamically scheduled worldwide, while static data is stored in your selected region". The Singapore "International" scope excludes mainland China ([regions](https://www.alibabacloud.com/help/en/model-studio/regions), [pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)).
- No end-user geography restriction applies to HK. The contracting entity for international accounts is Alibaba Cloud's international arm **[unverified: exact entity]**.

### 1.7 DeepSeek: **Legal, but weak on privacy**
- DeepSeek has no HK geo-restriction. It is operated by Hangzhou DeepSeek AI Co.; its terms are governed by PRC mainland law, and its privacy policy says it "collects, processes and stores personal data in People's Republic of China". Developers must give end users their own privacy notice ([Open Platform ToS](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html), [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)).
- Pricing gotcha: peak hours are 01:00–04:00 and 06:00–10:00 UTC on weekdays, which is **09:00–12:00 and 14:00–18:00 HKT**, when teachers work. Prices double in those hours ([DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)).

### 1.8 Gateways do not change any of this
OpenRouter forwards the upstream provider's 403 to users in HK ([hermes-agent issue](https://github.com/NousResearch/hermes-agent/issues/23501)). Vercel AI Gateway says your use of each provider "is subject to their terms". Routing OpenAI or Claude through a gateway does not make HK end users compliant.

### 1.9 PDPO
- Worksheets are mostly exam text with no personal data. Personal data enters only if a teacher types student names. PDPO s33 (cross-border transfer) **is still not in force**. The PCPD's cross-border and AI guidance (the 2024 Model Framework and the 2025 checklist for employee use of GenAI) is non-binding best practice ([Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/10/ai-governance-practical-guidance-from-hong-kong-privacy-commissioner-for-personal-data), [Baker McKenzie](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/hong-kong/topics/international-data-transfer)).
- Practical steps:
  - Publish a short privacy notice naming the processor (Google Cloud, with Alibaba Cloud HK as fallback).
  - Say that content is not used for training and is not stored by Econ Studio.
  - Tell teachers not to include student personal data.
  - DeepSeek (PRC storage) is the provider a school IT head is most likely to question.

---

## 2. Unit economics

### 2.1 Tokens per action (from the repo)
- `src/translate/promptText.ts` and `prompt.ts` hold a **static system prompt plus few-shot**. The rendered prompt is ≈5.7k chars (≈1.85k tokens) for EN→中 and ≈3.3k chars (≈1.0k tokens) for 中→EN. The few-shot adds ≈620 (toZh) or ≈330 (toEn) tokens. I measured the rendered strings with a temporary test and a mixed CJK/Latin estimate, so treat these as ±20%.
- `plan.ts` has `CHUNK_CHARS = 4000`, `CHUNK_JOBS = 60` and `CONTEXT_CHARS = 1200`. Each chunk is one request containing the prefix, the JSON payload, glossary pins and context. `run.ts` adds at most one repair pass per chunk.
- **Check terms is keyless.** `termCheck.ts` runs against the local glossary, so it costs $0 and needs no proxy.

| Action | Input tokens | Output tokens | Notes |
|---|---|---|---|
| Chunk (4k EN chars → 中) | ≈4.5k | ≈2.2k | 2.5k prefix + ≈1.4k payload + pins/context |
| **2-page worksheet** (~5k chars, 2 chunks + repair) | **≈12k** | **≈4k** | |
| Full paper (~20k chars, 5–6 chunks + repair) | ≈30k | ≈12k | |
| Re-translate one question | ≈3k | ≈0.4k | prefix dominates |

Implicit prompt caching on the Gemini 2.5+ models could cut about 40% of input cost on repeated prefixes, at 90% off cached tokens. The table ignores it because the discount disappears if you turn caching off for ZDR.

Usage tiers per teacher per month:
- **Light:** 5 worksheets, ≈60k in / 20k out.
- **Typical:** 20 worksheets, 2 full papers and 30 single-question re-translates, ≈400k in / 120k out.
- **Heavy:** 80 worksheets, 8 papers and 150 re-translates, ≈1.7M in / 0.5M out (≈710k source chars).

### 2.2 Prices (Sept 2026, primary sources)
- **Gemini** ([AI Studio pricing](https://ai.google.dev/gemini-api/docs/pricing); same on Vertex global):
  - 3.5 Flash-Lite: $0.30 / $2.50.
  - 3.1 Flash-Lite: $0.25 / $1.50.
  - 3.8 Flash: $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50.
  - 2.5 Flash-Lite ($0.10 / $0.40) **retires 16 Oct 2026**, so it is excluded ([CloudZero](https://www.cloudzero.com/blog/gemini-pricing/)).
- **Qwen, HK region:**
  - qwen3.8-flash: $0.113 / $0.382 (Global scope).
  - qwen3.5-flash: $0.10 / $0.40 (HK scope).
  - qwen3.7-plus: $0.276 / $1.101 list, with time-limited discounts.
  - Singapore Intl: qwen3.8-flash $0.15 / $0.47.
- **DeepSeek:**
  - V4.1 Flash: $0.15 / $0.60 off-peak, $0.30 / $1.20 peak.
  - V4 Pro: $0.66 / $1.98 off-peak, $1.32 / $3.96 peak.
- **For reference only (not allowed for HK):** OpenAI gpt-6-luna $0.10 / $0.50 ([OpenAI pricing](https://developers.openai.com/api/docs/pricing)); Claude Haiku 4.5 $1 / $5 ([Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)).

### 2.3 Cost per action and per teacher per month (USD; last column HKD at 7.8)

| Model | In / Out | 2-page ws | Full paper | Light | Typical | Heavy | Heavy HK$ |
|---|---|---|---|---|---|---|---|
| **Gemini 3.5 Flash-Lite (Vertex)** | 0.30 / 2.50 | $0.0136 | $0.039 | $0.07 | **$0.42** | $1.76 | 13.7 |
| Gemini 3.1 Flash-Lite (Vertex) | 0.25 / 1.50 | $0.0090 | $0.025 | $0.04 | $0.28 | $1.18 | 9.2 |
| Gemini 3.8 Flash (promo → 2026) | 0.75 / 3.75 | $0.024 | $0.068 | $0.12 | $0.75 | $3.15 | 24.6 |
| Gemini 3.8 Flash (2027 list) | 1.50 / 7.50 | $0.048 | $0.135 | $0.24 | $1.50 | $6.30 | 49.1 |
| **Qwen3.8-Flash (HK)** | 0.113 / 0.382 | $0.0029 | $0.008 | $0.01 | $0.09 | $0.38 | 3.0 |
| Qwen3.5-Flash (HK scope) | 0.10 / 0.40 | $0.0028 | $0.008 | $0.01 | $0.09 | $0.37 | 2.9 |
| Qwen3.7-Plus (HK list) | 0.276 / 1.101 | $0.0077 | $0.021 | $0.04 | $0.24 | $1.02 | 8.0 |
| DeepSeek V4.1 Flash (peak) | 0.30 / 1.20 | $0.0084 | $0.023 | $0.04 | $0.26 | $1.11 | 8.7 |
| DeepSeek V4 Pro (peak) | 1.32 / 3.96 | $0.032 | $0.087 | $0.16 | $1.00 | $4.22 | 32.9 |
| *ref: GPT-6 Luna (not allowed)* | 0.10 / 0.50 | $0.0032 | $0.009 | $0.02 | $0.10 | $0.42 | 3.3 |
| *ref: Claude Haiku 4.5 (not allowed)* | 1.00 / 5.00 | $0.032 | $0.090 | $0.16 | $1.00 | $4.20 | 32.8 |

### 2.4 Margin under HK$40–60/month
- Stripe HK charges 3.4% + HK$2.35 on domestic cards (3.9% on international) ([Stripe HK](https://stripe.com/en-hk/pricing)). On HK$48 that is ≈HK$4.0.
- **HK$48 plan on Gemini 3.5 Flash-Lite:**
  - Typical user: 48 − 4.0 − 3.3 = **HK$40.7 contribution (85%)**.
  - Heavy user: 48 − 4.0 − 13.7 = HK$30.3 (63%).
  - A user who hits the US$3 cap: 48 − 4 − 23.4 = HK$20.6.
- **Fixed costs:**
  - **Vercel Pro $20/month is required.** The Hobby plan is "non-commercial, personal use only", and that includes the static site once you charge ([Vercel Hobby](https://vercel.com/docs/plans/hobby)).
  - Supabase Auth free tier; Upstash free (500k commands/month, then $0.20 per 100k) ([Upstash](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)).
  - Google Cloud has no fixed fee.
  - Total ≈HK$160–400/month, so **break-even is about 4–8 subscribers**.
- The one real cost risk: if the paused features (question generation) ship, they are output-heavy and belong on Flash-class models. Meter them against the same cost ceiling.

---

## 3. Architecture

### 3.1 Shape
```
Web (static, Vercel) / Tauri ──HTTPS + Supabase JWT──▶ Proxy (Vercel Function, Node, sin1 or hkg1)
                                                        ├─ verify JWT → user id, plan (Supabase)
                                                        ├─ Upstash: rate limit + monthly chars + monthly $ ceiling
                                                        ├─ validate payload (zod) → build prompt SERVER-SIDE
                                                        ├─ Vertex Gemini (global) ──fail──▶ Vertex 3.1 Flash-Lite ──fail──▶ Qwen HK
                                                        └─ log metadata only; decrement quota by actual tokens
Stripe Billing ──webhook──▶ Supabase (plan, period)
```
- **Separate Vercel project.** `next.config.ts` is `output: 'export'`, which cannot host route handlers, and the same `out/` feeds Tauri. Keep the proxy in `/api` of a second project, or a small `services/ai-proxy`.
- **Region.** Vertex and Alibaba HK both serve HK legitimately, so `hkg1` is legal and fastest. Choose `sin1` if you want to keep the option of adding other providers later.
- **Cloudflare Workers gotcha.** Workers run at the colo nearest the user (HKG), so a Worker calling a geo-fenced API fails. You would need `placement.region` hints, and even then Cloudflare gives "no 100% guarantee" ([CF placement](https://developers.cloudflare.com/workers/configuration/placement/), [Zenn](https://zenn.dev/retore/articles/a04046c8829d8f?locale=en)). This matters less with Vertex, but Vercel's fixed region is simpler.
- **Supabase Edge Functions** also work: Deno, a Singapore project, and a longer wall-clock limit on paid plans. They mean one vendor fewer, but you lose the Vercel AI SDK conveniences.

### 3.2 Anti-abuse: the server owns the prompt
- Add a `hosted` provider preset whose adapter posts **`{direction, payload}`** instead of `{system, turns}`. The payload uses the existing `PromptPayload` shape from `src/translate/types.ts`.
- The function **imports the same `promptText.ts`, `prompt.ts` and `ITEMS_SCHEMA`** (a shared package) and renders the system prompt and few-shot itself.
- The client can never send a system prompt, arbitrary turns, `model`, `max_tokens` or temperature.
- Validate with zod:
  - `task ∈ {translate, repair}` and `direction ∈ {toZh, toEn}`.
  - `kind` from the `SlotKind` enum.
  - Total source ≤ 4 000 chars (the `CHUNK_CHARS` mirror); ≤ 60 items; each `text` ≤ 2 000 chars.
  - Context ≤ 1 200 chars.
  - Glossary lines must be members of the bundled EDB glossary, or recompute pins server-side with `glossary.pin()`.
- Compute `maxOutputTokens` server-side with `maxOutputTokens()` and force structured output with `ITEMS_SCHEMA`. The worst an abuser can do is get translations, and those are metered.
- Rate limits (@upstash/ratelimit sliding window):
  - 3 concurrent requests and 30 requests per minute per user.
  - Daily cap of 100k chars (stops account sharing).
  - Monthly quota of 500k source chars.
  - Hard **$ ceiling** computed from actual `usage` tokens × price.
  - Return a 429 or 402 with teacher-readable copy.
- **Streaming is not needed.** The pipeline is chunked JSON with per-chunk progress. A 4k-char chunk takes tens of seconds, well within Fluid Compute's default 300 s limit. Streaming would complicate schema validation and repair.

### 3.3 Logging without content
- Log only: user id, request id, direction, source chars, model, input/output/cached tokens, latency, status, error kind, cost.
- Never log request or response bodies. Scrub the payload from thrown errors (the app already logs only `{kind, status}` client-side, in `src/ai/client.ts`). Turn off Vercel log drains for bodies.
- Vertex paid use means no training (§18). For stricter handling, disable Vertex caching and request the abuse-monitoring exception. That costs the implicit-cache discount, so skip it at launch and state the policy plainly instead.

### 3.4 Gateways compared

| | Fit here | Cost | Notes |
|---|---|---|---|
| **Direct SDK calls + own fallback** | **Best** | $0 | The repo already has Gemini and OpenAI-compatible adapters. Two providers do not need a gateway. |
| Vercel AI Gateway | Good (optional) | 0% token markup incl. BYOK; team-wide ZDR $0.10/1k req | Does not retain prompts; per-key budgets; model fallbacks; provider allowlists ([FAQ](https://vercel.com/docs/ai-gateway/faq)). Use **BYOK with your own Vertex credentials**. With Vercel's pooled credentials you would not control which Google product serves the call. **[unverified]** whether it routes to Alibaba's HK region. |
| OpenRouter | Poor for hosted | 5.5% on credit purchases; BYOK 5% after a free allowance | Forwards provider geo-403s; one more processor for privacy. Provisioning keys per user exist but add little here. Fine to keep for BYOK. |
| Cloudflare AI Gateway | OK | Free core | Caching, rate limiting, logs (can be turned off). Beware the Worker placement gotcha. |
| LiteLLM | Overkill | Self-host | Needs a server. |
| Portkey / Helicone | Observability only | Free tiers | Helicone logs bodies by default, which is wrong for this privacy promise. |

**Fallback order:**
1. Vertex `gemini-3.5-flash-lite` (global).
2. Vertex `gemini-3.1-flash-lite`, the same processor, and cheaper.
3. Alibaba HK `qwen3.8-flash` or `qwen3.5-flash`.

Every fallback model must pass the repo's eval gate (`evals/`, `PROMPT_VERSION e2.2`) before it is enabled.

---

## 4. Keep BYOK alongside hosted?
**Yes.** Recommended tiers:
- **Free:** everything that works without a key (editing, export, Check terms) plus **BYOK AI**, with all current presets.
- **Econ Studio AI (HK$48/month or HK$480/year):** no key and no VPN, with a quota.

Precedents:
- **Raycast:** BYOK for OpenAI, Anthropic and Google works on the free tier; Pro includes AI with monthly credits ([Raycast](https://www.raycast.com/pricing), [BYOK announcement](https://x.com/raycast/status/1932792469063901607)).
- **TypingMind:** one-time licence plus BYOK only, with no built-in credits ([TypingMind](https://www.typingmind.com/buy)).
- **Cursor:** subscription includes model usage, and BYOK is also available **[unverified current details]**.
- **Obsidian AI plugins:** almost all are BYOK.

Costs and benefits of keeping BYOK:
- The code already exists, so it is cheap to keep.
- It serves teachers who have school-provided keys or Azure credentials.
- It gives schools with data policies an exit.
- The main cost is support. Present hosted as the default and BYOK as "Advanced".

## 5. Open items to verify before building
1. Create a Google Cloud billing account with the HK address and call Vertex `gemini-3.5-flash-lite` on the global endpoint. Also confirm that model's availability in asia-east2.
2. Check the Alibaba Cloud international account KYC requirements for an HK sole proprietor, and whether HK-scope models pass the translation eval.
3. Stripe HK: recurring payments with FPS, Alipay HK or WeChat Pay HK. Many teachers may prefer these to cards. **[not researched]**
4. Write your own terms: users must be 18+ (teachers), no student personal data, name Google Cloud (and Alibaba Cloud as fallback) as processors.
