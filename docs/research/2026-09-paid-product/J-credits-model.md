# J. Cost-recovery AI credits for Econ Studio 經濟備課室

Research date: 2026-09-30. This builds on `C-payments.md` (processors, BR, Stripe HK) and `D-hosted-ai.md` (Vertex legality, token costs) and does not repeat them.

**Markers:**
- **[unverified]** means I could not confirm the claim on a primary source.
- **[lawyer]** / **[accountant]** mark questions that need a professional before launch.

**Goal assumed throughout:** recover AI cost plus fees, with no subscription treadmill, no school sales and near-zero fixed cost. BYOK stays free.

---

## 0. Recommendation

**Sell prepaid "AI pages" in two one-off packs, through Stripe Checkout. No subscription, no expiry, and refunds on request.**

| Pack | Price | Pages | Stripe fee (HK card) | Google cost, typical mix | Left for server + safety margin |
|---|---|---|---|---|---|
| Standard | **HK$50** | **600** | HK$4.05 (8.1%) | ≈ HK$32.40 | ≈ HK$13.55 (27%) |
| Large | **HK$150** | **1,900** | HK$7.45 (5.0%) | ≈ HK$102.60 | ≈ HK$39.95 (27%) |

**How pages are counted:**
- **1 page = about 2,500 characters of source text translated.** A two-page worksheet uses 2 pages. A full paper (about 20k characters) uses 8. Re-translating one question has a minimum charge of 0.2 page.
- **Charge only on success.** Reserve the estimated pages before the run and settle the actual count afterwards. A failed run costs nothing.

**Why these numbers:**
- **Cost per page.** D's figures give a Google cost of about HK$0.054 per page. This holds for both a typical month (US$0.42 ≈ HK$3.28 for about 62 pages) and a heavy one (US$1.76 ≈ HK$13.7 for about 254 pages). The worst case, where every run is a single-question re-translate, is about HK$0.074 per page. The HK$50 = 600 pages pack still breaks even in that case (HK$44.40 AI + HK$4.05 fee = HK$48.45).
- **What a pack buys.** A typical teacher (about 62 pages a month) gets roughly 9–10 months, about a school year, from HK$50. A heavy user gets about 2.4 months.
- **Price per worksheet.** About HK$0.17 per two-page worksheet. At that absolute size, nobody reads the price as greedy.

**Other parts of the model:**
- **Payment methods:**
  - Cards, Apple Pay and Google Pay.
  - Enable Alipay and WeChat Pay too. They cost less (2.2% + HK$2.00) and have no chargebacks.
  - Manual FPS only if teachers ask for it, and then with a HK$100 minimum (§3.5).
- **Free trial.** 20 pages once per verified email, which costs the owner about HK$1.10 per sign-up. Keep a global monthly cap on trial spend.
- **Fixed cost ≈ HK$0.** Run the proxy and ledger on free tiers (§4.4). **Watch out: Vercel Hobby forbids "any method of requesting or processing payment", so a "Buy pages" button may force Vercel Pro at US$20/month (§4.4).**
- **Paperwork:**
  - Register a sole-proprietor BR with the fee-and-levy exemption (Form 3). It costs HK$0.
  - No SVF licence is needed, because this is a single-purpose facility (§2.1).
  - Profits tax on a near-zero profit is near-zero, but it still has to be reported (§2.4).

---

## 1. Credits vs subscription vs pay-what-you-want

### 1.1 Which model fits this goal

| Model | Fit for "cover cost, no treadmill, ~0 fixed cost" | Main problems |
|---|---|---|
| **Prepaid packs (credits)** | **Best.** One charge covers months of use, so the fixed HK$2.35 is spread out. Cost tracks usage. Nothing renews. Idle summer months cost the teacher nothing. | Needs a balance ledger. Needs a policy on unused balances. |
| Small subscription (e.g. HK$10/month) | Poor. The fixed fee takes 27% of a HK$10 charge (3.4% + HK$2.35 + Billing 0.7% = HK$2.76), every month. | Renewals, dunning, cancellation flow and "why was I charged in August?" disputes. This is exactly the treadmill the owner wants to avoid. Heavy users still need a cap, so a ledger is needed anyway. |
| Pay-what-you-want | Only works as a *variable-size credit pack*, where pages equal the amount paid × rate. | **Stripe HK cannot take donations at all:** "Stripe cannot support donations" in Hong Kong ([Stripe support](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations)). Stripe's "Customer chooses price" works for purchases, with a min/max, one line item and no promo codes ([Stripe docs](https://docs.stripe.com/payments/checkout/pay-what-you-want.md?payment-ui=stripe-hosted)). If PWYW is not tied to credits, the owner carries unbounded AI cost. |

**Verdict:**
- **Use fixed packs.** An optional "Customer chooses price" pack (min HK$50, pages = HK$ × 12) could be added later. It adds UI and support questions and gains little.
- **Never label anything a "donation"** on Stripe HK.

### 1.2 Who does prepaid AI credits, and what to copy

| Product | Model | Expiry and refunds | Lesson |
|---|---|---|---|
| **OpenRouter** | Pass-through model prices, plus a **5.5% fee (US$0.80 minimum)** on card credit purchases | "We reserve the right to expire unused credits after one year of purchase." Refunds only "within twenty-four (24) hours"; platform fees non-refundable ([FAQ](https://openrouter.ai/docs/faq)) | The model for "prices at cost, we charge the fee openly" |
| **Raycast** (changed 10 Sep 2026) | Plans include monthly credits, plus top-ups. "The cost of supporting these workflows has increased, while our subscription prices haven't." ([blog](https://www.raycast.com/blog/changing-how-raycast-ai-is-priced)) | "Top-up credits expire 12 months after purchase." Soonest-expiring credits are spent first. **Using credits requires an active paid subscription** ([manual](https://manual.raycast.com/billing)) | Show usage in the app. Top-up plus subscription is the treadmill to avoid. |
| **Anthropic API** | Prepaid usage credits | Credits "expire one calendar year" after issue and are non-refundable ([credit terms](https://www.anthropic.com/legal/credit-terms)). Drew public backlash ([HN](https://news.ycombinator.com/item?id=44793446)) | Expiring paid credits reads as taking money. Avoid it for a goodwill project. |
| **Zed** (open source editor) | Hosted AI at "API list price +10%", US$5 included on Pro. BYOK is free on the free plan ([pricing](https://zed.dev/pricing)) | — | The closest open-source precedent for stating the markup openly |
| **Cursor** | Plans include usage, then "on-demand usage… billed in arrears" ([pricing](https://cursor.com/pricing)) | — | Billing in arrears means the owner fronts the cost. Not for us. |
| **TypingMind** | BYOK only, with a one-time licence. No hosted credits ([buy](https://www.typingmind.com/buy)) | — | Shows a one-time purchase, no subscription, works as a brand |

### 1.3 Expiry and refunds for Econ Studio

- **No expiry.** State that "pages do not expire while Econ Studio's AI service runs".
  - The liability is tiny: a HK$50 balance on which Google has not yet been paid.
  - An expiry clause earns HN-style resentment for a few dollars.
  - Add a dormancy clause: after 3 years with no sign-in and two emails, the balance may be closed and refunded on request.
- **Refunds.** Full refund of a pack within 14 days if unused. After that, refund of unused pages on request, pro rata, **minus the card fee Stripe keeps**.
  - Stripe says refunds carry "no fees… original processing fees not returned" ([pricing](https://stripe.com/en-hk/pricing)).
  - A self-serve "refund my balance" button is the cheapest defence against chargebacks (§5).
- **Refund windows.** Alipay refunds work for up to 90 days ([docs](https://docs.stripe.com/payments/alipay)) and WeChat Pay for up to 180 days ([docs](https://docs.stripe.com/payments/wechat-pay)). After that, refund by FPS by hand.
- **If the service shuts down,** promise a pro-rata refund of unused balances. This also answers the Trade Descriptions Ordinance's "wrongly accepting payment" concern (§2.2).

---

## 2. Hong Kong law

### 2.1 Stored Value Facility licence (Cap. 584): not required, as a single-purpose SVF

**The HKMA *Explanatory Note on Licensing for Stored Value Facilities*** (Jan 2019), Chapter 2 ([PDF](https://www.hkma.gov.hk/media/eng/doc/key-functions/financial-infrastructure/infrastructure/retail-payment-initiatives/Explanatory_note_on_licensing_for_SVF.pdf)), says:

> "3. Unless an SVF is a single-purpose SVF or is exempt from the provisions of the Ordinance, an SVF is subject to the licensing requirement. Under section 8B of the Ordinance, it is an offence to issue an SVF without an SVF licence."
>
> **"Licence is not required for issuing single-purpose SVF (SPSVF)**
> 4. For the purposes of the Ordinance, an SPSVF is not an SVF.
> 5. Section 2A(5) defines an SPSVF as a facility that may be used for the purpose mentioned in section 2A(1)(a); and in respect of which the issuer gives an undertaking that, if the facility is used as a means of making payments for goods or services (not being money or money's worth) provided by the issuer, the issuer will provide the goods or services under the rules of the facility and does not give any other undertaking that falls within the description of section 2A(2) or 2A(3)."

**Schedule 8 is a second, independent exemption for multi-purpose SVFs** (s8ZZZB). It includes "(b) SVF used for purchasing certain digital products", meaning goods or services "delivered to, and are to be used through, a … digital or information technology device", where the operator "does not act only as an intermediary".

**How Econ Studio fits:**
- Pages can be spent only on Econ Studio's own AI translation. That makes the facility a single-purpose SVF, so it is *not an SVF*, and no licence or HKMA filing is needed.

**Conditions that keep it that way (design rules):**
1. **Pages buy only Econ Studio's own service.**
   - Never let pages pay other people. For example, if a future worksheet marketplace let teachers sell to each other, paying for it with pages would make this a multi-purpose SVF.
   - Describe the product as "Econ Studio AI translation" and not "Gemini credits", so the service is plainly the issuer's. Google is a subcontractor. **[lawyer]** Confirm that reselling a third party's model inside your own service still counts as "provided by the issuer". I believe it does, because you set the prompt, the output and the price.
2. **No transfers between users.** A page-gifting feature is a "payment to another person" under s2A(1)(b)(ii).
3. **No cash-out** except refunds of unused prepayment to the payer. **[lawyer]** The note does not address refunds of an SPSVF balance. Ordinary consumer refunds should not turn the facility into a payment undertaking, but confirm.
4. **The HKMA can look behind labels** (s8ZZZC for Schedule 8 exemptions). Keep the scheme plainly a prepaid service.

### 2.2 Consumer protection: Trade Descriptions Ordinance (Cap. 362)

- **What the TDO prohibits.** It prohibits "false trade descriptions, misleading omissions, aggressive commercial practices, bait advertising, bait-and-switch and wrongly accepting payment" for goods *and services* ([CEDB LegCo reply, 2024](https://www.cedb.gov.hk/en/legco-business/questions/2024/pr06112024b.html)).
  - The maximum penalty is 5 years and HK$500,000 ([LCQ15, 2023](https://www.info.gov.hk/gia/general/202311/08/P2023110800290.htm)).
- **Two duties are relevant:**
  - **Misleading omission.** State material terms (expiry, refund rules, what a "page" is) clearly before payment. Burying an expiry would be the risk. Having no expiry avoids it.
  - **Wrongly accepting payment**, meaning accepting prepayment with no intention or reasonable grounds to supply ([Tanner De Witt](https://www.tannerdewitt.com/the-hong-kong-market-entry-playbook-consumer-protection/)).
    - Do not sell packs while the Vertex path is broken or if you plan to wind down. Stop sales first, then refund.
    - The section number is **[unverified]**. I read it as s13I; a 2026 consultation summary cites "13L".
- **No HK statute bans expiry on prepaid digital credit.** The government said in 2024 that it had "no plan to change the relevant practices" on prepayment generally ([CEDB](https://www.cedb.gov.hk/en/legco-business/questions/2024/pr06112024b.html)).
  - The June 2026 consultation (a 7-day cooling-off period, a 14-day refund window and a 2-year cap on contract length) covers **only beauty and fitness** contracts of HK$3,000, HK$8,000 or HK$15,000 and above, depending on the option chosen ([news.gov.hk](https://www.news.gov.hk/eng/2026/06/20260629/20260629_151648_848.html)).
  - It does not reach a HK$50 software top-up, but it shows which way policy is heading. The recommended refund terms already exceed it.
- **Contract terms.** Keep them short and fair. The Control of Exemption Clauses and Unconscionable Contracts Ordinances apply to consumer terms generally.

### 2.3 Business registration

- **Who must register.** The IRD defines a business as "any form of trade, commerce, craftsmanship, profession, calling or other activity carried on for the purpose of gain (whether through a brick-and-mortar presence or the internet)". Sole proprietors must register "within one month from commencing business". The penalty is up to HK$5,000 and one year, plus back fees ([IRD](https://www.ird.gov.hk/eng/tax/bre_abr.htm)).
- **Is cost recovery "for the purpose of gain"?** Arguably not, if it is truly at cost. But the packs are priced with a margin, and this is a regular public sale. **Do not rely on the argument. Register.** **[lawyer/accountant]** If the owner wants to test it.
- **The fee exemption makes registration free.** Form 3 waives both the fee and the levy if average monthly receipts are "$10,000" or less for a service business. Registration itself is still mandatory ([IRD](https://www.ird.gov.hk/eng/tax/bre_erp.htm)).
  - This business will be far below HK$10k a month: that would be 200 packs a month.
  - **Exclusion:** proprietors running two or more businesses at once cannot use the exemption.
- **Employer approval (not researched).** If the owner is a school employee, their school's rules on outside work may require approval. **[check]**

### 2.4 Profits tax on a near-zero profit

- **Rates.** Unincorporated businesses pay 7.5% on the first HK$2M of assessable profit ([IRD](https://www.ird.gov.hk/eng/tax/bus_pft.htm)). C reports a 2025/26 reduction of 100% capped at HK$3,000 **[not re-verified]**.
- **What to expect.** At dozens of packs a year, assessable profit after Vertex, Stripe, hosting and domain costs will be around zero, or a loss that can be carried forward.
- **It still has to be reported:**
  - BR holders report business profit on their return. I believe this goes in the business section of the individual return (BIR60) **[unverified]**.
  - Keep records for 7 years **[general knowledge, unverified]**.
- **Timing of prepaid income.** Is a pack taxed when it is sold or when the pages are used? The sums are trivial, but **[accountant]** should confirm.

---

## 3. Payments and fee math

### 3.1 Stripe HK fees (verified 2026-09-30, [stripe.com/en-hk/pricing](https://stripe.com/en-hk/pricing))

- **Cards:**
  - Domestic cards **3.4% + HK$2.35**.
  - International cards +0.5%.
  - FX +2% if conversion is needed.
- **Wallets** ([local methods](https://stripe.com/en-hk/pricing/local-payment-methods)):
  - Apple Pay and Google Pay: same as cards.
  - **Alipay and WeChat Pay: 2.2% + HK$2.00.**
  - FPS, PayMe and Octopus are **not** offered.
- **Disputes:** **HK$85 per dispute received**, never refunded. Another HK$85 to counter, which is refunded if you win.
- **Refunds:** no fee, but the original fee is not returned.
- **Payment Links and Checkout:** no extra charge. A custom domain costs US$10/month (skip it).
- **Minimum charge:** HK$4.00 ([currencies](https://docs.stripe.com/currencies)).

### 3.2 Fee per pack size

| Pack | HK card fee | % | Net | Intl card % | Alipay/WeChat fee | % |
|---|---|---|---|---|---|---|
| HK$20 | 3.03 | 15.2% | 16.97 | 15.7% | 2.44 | 12.2% |
| HK$30 | 3.37 | 11.2% | 26.63 | 11.7% | 2.66 | 8.9% |
| HK$40 | 3.71 | 9.3% | 36.29 | 9.8% | 2.88 | 7.2% |
| **HK$50** | **4.05** | **8.1%** | **45.95** | 8.6% | 3.10 | 6.2% |
| HK$100 | 5.75 | 5.8% | 94.25 | 6.2% | 4.20 | 4.2% |
| **HK$150** | **7.45** | **5.0%** | **142.55** | 5.5% | 5.30 | 3.5% |
| HK$200 | 9.15 | 4.6% | 190.85 | 5.1% | 6.40 | 3.2% |

**Minimum sensible pack.** The fee share falls below 10% at **HK$36**, below 8% at **HK$51** and below 5% at **HK$147**. So:
- **HK$50 is the smallest sensible pack.**
- **HK$150 is where the fee stops mattering.**
- A HK$20 pack loses 15% to fees, and a single HK$85 dispute wipes out 28 such packs' worth of fee headroom. Do not offer one. Use the free trial pages instead.

### 3.3 Payment Links vs Checkout

- **Payment Links:** no code. You can pass `?client_reference_id=<userId>&prefilled_email=…`, and it arrives in the `checkout.session.completed` webhook (alphanumeric, dash and underscore, up to 200 characters) ([docs](https://docs.stripe.com/payment-links/url-parameters)).
  - That is enough for an MVP.
  - The drawback: the URL is public and reusable, so card testers can hit it without signing in.
- **Checkout Sessions created server-side, for signed-in users only.** Recommended, since you need the webhook endpoint anyway.
  - Stripe: "limit access to your payment form… requiring login or session validation before they can make a payment" reduces card testing.
  - Checkout gets Stripe's built-in "rate limiters, AI models, CAPTCHA triggers" ([card testing](https://docs.stripe.com/disputes/prevention/card-testing)).
  - Rate-limit session creation to, say, 3 per account per day.
- Neither needs Stripe Billing. Both are `mode=payment`, so the 0.7% Billing fee does not apply.

### 3.4 Alipay and WeChat Pay on Stripe HK

- **Support:**
  - Both work in Checkout and Payment Links in payment mode, presented in HKD.
  - **Neither has a dispute process**: "no dispute process exists that could create chargebacks". This is a real advantage against the HK$85 fee.
  - Refunds work for up to 90 days on Alipay and 180 days on WeChat Pay ([Alipay](https://docs.stripe.com/payments/alipay), [WeChat Pay](https://docs.stripe.com/payments/wechat-pay)).
- **Catch:**
  - Stripe targets "Chinese consumers, overseas Chinese, and Chinese travelers", and the default display currency is CNY.
  - Third parties say Stripe supports the mainland wallets, **not AlipayHK or WeChat Pay HK**, which most HK teachers use ([Sleek](https://sleek.com/hk/resources/best-payment-gateways/)). **[unverified]** Test with an AlipayHK phone.
- **Recommendation:** enable both anyway (no cost), but do not count on them for HK teachers.

### 3.5 Alternatives, and manual FPS

- **Airwallex:** 3.30% + HK$2.35 on domestic cards, and "HK$2.00 plus payment method fees" for FPS, AlipayHK and WeChat Pay HK. No monthly fee on the free Explore plan ([pricing](https://www.airwallex.com/hk/pricing)).
  - It adds genuine HK wallets and FPS.
  - The fixed fee is about the same, so it does not solve the small-amount problem.
  - Sole-proprietor onboarding is **[unverified]**.
- **PayDollar/AsiaPay** supports AlipayHK and WeChat Pay HK natively (per Sleek). Setup fees and minimums **[unverified]**.
- **PayMe for Business:** fees could not be retrieved **[unverified]**.
- **Manual FPS.** It has zero fees and no chargebacks, because FPS is an irrevocable push payment. How it would work:
  1. In the app, "Pay by FPS" shows the owner's FPS ID or QR code, the exact amount, and a reference code such as `ES-7K2Q`.
  2. The teacher pays and types the reference into their bank app's remark field.
  3. The owner checks the bank app, matches the reference, and clicks "credit" in a small admin page.
- **Effort and risks of manual FPS:**
  - About 1–2 minutes per payment, so about 40 minutes a month at 20 payments.
  - The teacher waits hours for credit.
  - Mismatched remarks happen.
  - Refunds are manual.
  - The bank shows payer names, which is personal data the owner now holds (PDPO).
  - Receiving business income into a *personal* account may breach its terms **[unverified]**.
- **Verdict on FPS:** offer it only if card-less teachers ask. Set a HK$100 minimum so the manual effort per dollar stays bounded. Batch-credit once a day.

---

## 4. Pricing presentation

### 4.1 Units

- **Sell "pages", not tokens and not HK$ balances.**
  - A HK$ balance looks like a wallet, invites "cash it out" requests and confuses the SVF story.
  - Tokens mean nothing to teachers.
  - Pages track characters, and characters track cost. D's per-page cost is about HK$0.054 across light, typical and heavy mixes.
- **Before each run,** show the estimate: "About 4 pages. Balance: 486 pages."
- **After each run,** show the actual count and keep a history list.
- **When prices change,** existing balances keep their pages. Adjust pages-per-pack only for new sales.

### 4.2 "At cost" framing

- **Precedents:**
  - Zed states "API list price +10%".
  - OpenRouter passes through model prices and names its 5.5% purchase fee.
- **Suggested copy.** It has no em dashes, per the UI-copy rule. The figures are those for the HK$50 pack.
  - **EN:** "AI pages are sold at cost. Of each HK$50, about HK$32 pays Google for the AI and HK$4 goes to the card company. The rest keeps the server running and covers price changes and failed runs. We publish the numbers every term; if there is a surplus, packs get bigger. Using your own API key stays free."
  - **中文:** 「AI 頁數按成本收費。每 HK$50 之中，約 HK$32 付給 Google、HK$4 為信用卡手續費，餘額用於伺服器及應付價格變動與失敗重試。每學期公開帳目；如有盈餘，套票頁數會增加。自備 API 金鑰永久免費。」
- **Publish a small ledger each term:** packs sold, Google bill, Stripe fees, hosting and the surplus. This is what makes "at cost" believable. It is also the pressure valve: give surplus back as more pages per pack.

### 4.3 Break-even sanity check

- **Surplus per HK$50 pack** on a typical mix is about HK$13.55.
- **What it has to cover:**
  - **Fixed costs.** HK$0 on free tiers. Workers Paid would be US$5 ≈ HK$39/month, which takes about 3 packs a month.
  - **One lost dispute:** HK$50 + HK$85 = HK$135, about 10 packs' surplus.
  - **A Google price rise.** Gemini 3.8 Flash doubles on 1 Jan 2027 (from D), a reminder that list prices move.
- **At very low volume** (say 30 packs a year), the owner may be a few hundred HK$ a year out of pocket if any fixed-cost service is paid. The buffer is sized for that, not for profit.

### 4.4 Keeping fixed cost near zero

- **Vercel Hobby rules this out:**
  - It is "non-commercial personal use only".
  - Commercial use includes "**Any method of requesting or processing payment from visitors of the site**". Donations are exempt, but Stripe HK cannot take donations.
  - Source: [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines).
  - If the web app is on Hobby today, a "Buy pages" button probably makes it commercial, which means Vercel Pro at US$20 ≈ HK$156/month. That would be the largest cost line. **Decide this before building.**
  - The options:
    1. Accept Pro.
    2. Move static hosting to a host whose free tier allows commercial use.
    3. Keep checkout entirely off the Vercel site. That is a grey area. **[check with Vercel]**
- **Proxy and ledger options:**
  - **Cloudflare Workers Free:** 100k requests a day, D1 with 5M row reads and 100k row writes a day. The docs state no commercial-use restriction ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)). The paid plan is US$5/month.
  - **Google Cloud Run**, in the same project as Vertex, authenticates to Vertex with a service account and holds no key. Free-tier figures **[unverified]**: the page did not load.
- **Stripe** has no monthly fee. Vertex is pay-per-use. Set a daily global spend cap in the proxy, because Google budget alerts do not hard-stop spending.

---

## 5. Abuse: chargebacks, card testing, Radar

- **Dispute economics.** A dispute costs HK$85, which is more than the pack price.
  - Stripe's own guidance: "the optimal point for issuing a refund on early fraud warnings is on charges that are roughly less than or equal to your dispute fee" ([disputes](https://docs.stripe.com/disputes/how-disputes-work)).
  - Every pack here qualifies. **So automatically refund any early fraud warning, zero that account's pages and block it.**
  - Unrefunded EFWs become fraud disputes about 40% of the time.
- **Card-network monitoring bites small merchants hard.** Visa VAMP puts an account on "non-compliant" watch at a **count of 5 and a ratio of 0.5%** of disputes plus TC40 fraud reports in a month. EFWs count even when refunded ([monitoring programs](https://docs.stripe.com/disputes/monitoring-programs)). One card-testing burst could put a 20-sale-a-month merchant there.
- **Card testing.** Testers favour small payments that cardholders miss. Defences, in order:
  1. Stripe-hosted Checkout, with its built-in CAPTCHA and card-testing controls.
  2. Purchase only for signed-in users with a verified email.
  3. Rate limits on session creation.
  4. Refund suspicious low-value payments.
  - Source: [Stripe card testing](https://docs.stripe.com/disputes/prevention/card-testing).
- **Radar:**
  - Radar Lite ("AI-based fraud prevention for card payments and card testing, plus fraud alerts") is **included at no charge** on standard pricing.
  - Paid Radar starts at **HK$80/month** ([Radar pricing](https://stripe.com/en-hk/radar/pricing)), which is not worth it at this scale.
  - Custom velocity rules need a Radar plan that supports them.
- **Friendly fraud** ("I don't recognise this charge"):
  - Use a clear statement descriptor (`ECON STUDIO`) and an emailed receipt.
  - Put the self-serve refund button in the app.
  - Show a one-line "no subscription, no auto-renew" note at checkout. Stripe lists clear terms and flexible refunds as the main prevention.
- **Credit abuse:**
  - One free trial per verified email, with a global monthly cap on trial spend.
  - Server-side per-account daily page cap, e.g. 300 pages a day.
  - Payloads are schema-locked (from D), so the proxy cannot be used as a general Gemini relay.

---

## 6. What needs a professional

| Question | Who |
|---|---|
| Does a prepaid page balance for AI translation, fulfilled via Google Vertex, sit inside the s2A(5) single-purpose definition? Is a refund of unused balance compatible with it? | Lawyer (financial regulation). A one-hour opinion; or email HKMA's SVF team for comfort. |
| Is a deliberately at-cost scheme "for the purpose of gain" (BR)? When is prepaid pack income taxable? What records does a sole proprietor keep? | Accountant |
| Do the consumer terms (no expiry, refund minus card fee, shutdown refund) satisfy the TDO and the Unconscionable Contracts Ordinance? | Lawyer (a quick review of a one-page terms document) |
| If the owner is a school employee: is outside work approval required? | The owner's school or HR |

## 7. Open or unverified items

- Whether Stripe HK's Alipay and WeChat Pay accept AlipayHK and WeChat Pay HK wallets. Test with a real phone.
- Cloud Run free-tier numbers. Cloudflare's free-plan commercial use is implied by the docs but not explicitly stated.
- Section numbers in TDO Part IIB (13E misleading omission; 13I vs 13L wrongly accepting payment).
- PayMe for Business and PayDollar fees. Airwallex sole-proprietor onboarding.
- Whether Payment Links get exactly the same CAPTCHA protections as API-created Checkout Sessions. They are both hosted Checkout, so probably yes.
- The page-cost figures inherit D's ±20% token estimates. Measure real per-page cost for the first month and retune pages per pack.
