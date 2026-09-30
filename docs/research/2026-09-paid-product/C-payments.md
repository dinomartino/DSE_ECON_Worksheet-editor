# C. Payments, billing and business setup — Econ Studio 經濟備課室

Research date: 2026-09-30. Sources are linked inline. **[unverified]** marks claims taken from third-party blogs or my own inference that I could not confirm on a primary source.

---

## 0. Bottom line

- **Phase 1 (solo, <500 paying teachers, mostly HK):** open a **Stripe Hong Kong account** (register a sole proprietorship BR first, see §2), and sell through **Stripe Checkout + Stripe Billing** with the customer portal. HK has no VAT/GST, so for HK buyers a merchant of record (MoR) is pure overhead: about +3.5 points per charge. Do **not** add FPS, PayMe or Octopus for subscriptions. None of them can do recurring billing through a gateway, and Stripe HK does not offer them anyway.
- **Keep an MoR switch in reserve without changing processor.** Stripe **Managed Payments** (Stripe's own MoR, successor to Lemon Squeezy) is **GA and available to HK-based businesses**. It is a per-Checkout-Session flag on the same Stripe account, so you can turn it on later if meaningful EU/UK/SG/TW sales appear.
- **AI cost control:** use flat plans with a **monthly AI allowance plus prepaid top-up packs**, and track them in your own DB ledger. Do not bill AI in arrears at first. Stripe Meters or credit grants can come later.
- **Phase 2 (schools):** sell annual **department/school licences by quotation → invoice → bank transfer, FPS or cheque**, as a registered HK business. Price a department pack **at or under HK$5,000** so it falls in the "no competitive bidding" band of EDB aided-school procurement rules. Use Stripe Invoicing (hosted page, card payable) or a plain PDF invoice with your FPS ID and bank details. MoRs are poor at this: Stripe Managed Payments cannot issue one-off invoices, and Paddle's bank transfer accepts only EUR/GBP/USD.
- **Desktop outside app stores:** no Apple/Microsoft IAP obligation. Pay on the web, then the entitlement syncs to the account. If you later list on the Mac App Store, IAP is required (3.1.1/3.1.3(b)). The Microsoft Store allows your own payments for non-game apps.

---

## 1. Payment processors

### 1.1 Options at a glance

| Option | Model | HK seller eligible? | Individual / no company? | Headline fee | HK local methods | Notes |
|---|---|---|---|---|---|---|
| **Stripe HK (direct)** | You are merchant | Yes | Yes. "Individual" with HKID; "Sole Proprietorship" with BRN ([Stripe](https://support.stripe.com/questions/requirements-for-hong-kong-based-businesses)) | 3.4% + HK$2.35 domestic card; +0.5% intl card; +2% FX if needed ([stripe.com/en-hk/pricing](https://stripe.com/en-hk/pricing)); Billing +0.7% ([billing pricing](https://stripe.com/en-hk/billing/pricing)) | Alipay and WeChat Pay at 2.2% + HK$2.00 (mainland-oriented); **no FPS, PayMe or Octopus** ([local methods](https://stripe.com/en-hk/pricing/local-payment-methods)) | Disputes HK$85 each. Standard payouts to HK bank in HKD/USD are free. Tax Basic 0.5% if ever needed |
| **Stripe Managed Payments** | MoR (seller of record shown as **Link**) | **Yes, HK is a listed business location** ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)) | Via Stripe account; business-type eligibility review | **+3.5% on top of** standard Stripe fees ([stripe.com/en-hk/managed-payments](https://stripe.com/en-hk/managed-payments)) | Cards, Apple/Google Pay, Link; no HK wallets listed ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)) | GA since Sessions 2026 ([Stripe blog](https://stripe.com/blog/everything-we-announced-at-sessions-2026)). Checkout/Payment Links only; **no one-off invoices**; statement shows `LINK.COM* …`; Stripe may refund within 60 days |
| **Paddle** | MoR | Yes (only sanctioned countries excluded) ([Paddle](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)) | Yes, sole traders verify identity only ([Paddle](https://www.paddle.com/help/start/account-verification/what-is-identity-verification)) | 5% + US$0.50; **"contact us" for products under US$10** ([pricing](https://www.paddle.com/pricing)) | Alipay only for CN/CNY; no FPS ([Paddle Alipay](https://developer.paddle.com/concepts/payment-methods/alipay/)) | Monthly payout (wire/Payoneer, min US$100, possible US$15 SWIFT fee) ([payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid)). Invoicing supported; bank transfer EUR/GBP/USD only ([docs](https://developer.paddle.com/concepts/payment-methods/wire-transfer/)) |
| **Lemon Squeezy** | MoR | Yes | Yes | 5% + 50¢, +1.5% non-US, +0.5% subscriptions; payout 1% outside US ([fees](https://docs.lemonsqueezy.com/help/getting-started/fees)) | — | Still accepts sign-ups, but the team now builds Stripe Managed Payments and is building migration paths ([LS 2026 update](https://www.lemonsqueezy.com/blog/2026-update)). **Avoid for a new build.** |
| **Polar.sh** | MoR (payouts via Stripe Connect Express) | Yes, HK listed ([Polar](https://polar.sh/docs/merchant-of-record/supported-countries)) | Yes, where Connect Express allows individuals | Starter 5% + 50¢; Pro (US$20/mo) 3.8% + 40¢; +1.5% intl cards; US$15 per dispute; payout US$2/mo + 0.25% + 25¢ + up to 1% FX ([pricing](https://polar.sh/resources/pricing)) | — | Strong on meters and credits with a customer portal ([credits](https://polar.sh/docs/features/usage-based-billing/credits)). Open-source-friendly |
| **Creem** | MoR | Yes, HK listed ([Creem](https://docs.creem.io/merchant-of-record/supported-countries)) | Not stated | 3.9% + US$0.40 ([pricing](https://www.creem.io/pricing)); third party reports US$7 or 1% non-EU payout, US$25 chargeback **[unverified]** | — | Young company; tax coverage "50+ countries" |
| **Dodo Payments** | MoR | Yes | Reportedly **[unverified]** | 4% + 40¢ **+1.5% intl +0.5% subscription**; US$30 dispute; US$1 refund ([pricing](https://dodopayments.com/pricing)) | **FPS and Alipay HK**, but **not for subscriptions** ([docs](https://docs.dodopayments.com/features/payment-methods)) | Only MoR found offering FPS; useful for one-off credit packs |
| **FastSpring** | MoR | Yes | — | Not published; reportedly ~5.9% + $0.95, sales-led ([third party](https://dodopayments.com/blogs/fastspring-pricing-explained)) **[unverified]** | — | Too heavy for a solo developer |
| **Airwallex** | Direct gateway | Yes | Business account required **[unverified for sole props]** | Not researched in depth | **FPS**, Alipay HK, WeChat Pay HK, cards ([Airwallex FPS](https://www.airwallex.com/docs/payments/payment-methods/apac/fps)) | Worth a look only if HK wallets matter for one-off payments |

### 1.2 Merchant of record vs direct, for this product

- **The MoR's value is foreign indirect tax.** HK has no VAT/GST, so for HK customers an MoR only adds cost. The overseas triggers:
  - **EU:** VAT from the **first** B2C digital sale by a non-EU seller; register via non-Union OSS ([Stripe guide](https://stripe.com/guides/introduction-to-eu-vat-and-european-vat-oss)).
  - **UK:** likewise, no threshold for non-UK sellers **[from general knowledge; not re-verified]**.
  - **Singapore:** overseas vendor registration only if **global turnover > S$1M and B2C digital sales to SG > S$100k** ([IRAS](https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-and-digital-economy/overseas-businesses)). You will not reach this.
  - **Taiwan:** register once B2C sales to TW individuals exceed **NT$600,000/yr** (raised from NT$480k in April 2025), then charge 5% ([Fonoa](https://www.fonoa.com/resources/blog/taiwan-raises-vat-registration-threshold-foreign-e-commerce-operators)).
  - **Macau:** no VAT.
- **So for HK, Macau, SG and small TW volume, direct Stripe carries no tax-registration duty.** The only live exposure is a stray EU/UK consumer. Handle it by restricting billing countries at Checkout, or by turning on Managed Payments when you do start selling there.
- **Chargebacks and refunds.** An MoR handles disputes. Direct means you respond yourself (HK$85 per dispute on Stripe). Teacher subscriptions at HK$48 are low-fraud, so this is a minor factor.
- **School reimbursement.** With an MoR, the receipt names Link, Paddle or Polar as the seller, not you. A school finance office may query a receipt from "LINK.COM". A direct Stripe receipt carries your business name and BR number. **[inference]**

### 1.3 HK local payment methods

- **Stripe HK:** Alipay and WeChat Pay (2.2% + HK$2.00) only. No FPS, PayMe or Octopus ([Stripe local methods](https://stripe.com/en-hk/pricing/local-payment-methods); [Sleek](https://sleek.com/hk/resources/best-payment-gateways/)).
- **Where FPS is available:**
  - Dodo, one-time payments only ([docs](https://docs.dodopayments.com/features/payment-methods)).
  - Airwallex, as a gateway.
  - PayDollar/AsiaPay ([Statrys](https://statrys.com/guides/hong-kong/banking/best-payment-gateways)).
- **FPS is push-payment**, so it cannot auto-renew a subscription. It fits two cases: prepaid annual plans, credit packs, and paying school invoices. For school invoices, a plain FPS ID or QR code printed on the invoice works and costs nothing.
- **Recommendation:** cards plus Apple Pay and Google Pay on Stripe cover individual teachers. Offer FPS or bank transfer manually for annual and school purchases.

---

## 2. HK business setup

### 2.1 Business Registration (BR)

- **Who must register.** Any "trade, commerce… or other activity carried on for the purpose of gain (whether through a brick-and-mortar presence or the internet)" must register **within 1 month of commencement**. Online filing via eTAX takes about 2 working days ([IRD](https://www.ird.gov.hk/eng/tax/bre_abr.htm)). A paid subscription app is a business even as side income. The penalty for not registering is up to HK$5,000 and one year's imprisonment ([Sleek](https://sleek.com/hk/resources/br-fee/)).
- **Cost from 1 April 2026:** HK$2,350 for one year (HK$2,200 fee + HK$150 levy) or HK$6,170 for three years ([Sleek](https://sleek.com/hk/resources/br-fee/); [IRD fee table](https://www.ird.gov.hk/eng/pdf/brfee_table.pdf)).
- **Fee exemption.** Sole proprietors and partnerships can apply using **Form 3** if average monthly receipts are **≤ HK$10,000 for services** or ≤ HK$30,000 for other businesses. You **still have to register**; only the fee is waived ([IRD](https://www.ird.gov.hk/eng/tax/bre_erp.htm)). Proprietors running two or more businesses are excluded. Year 1 of a small subscription app will likely qualify, since HK$10k/month is roughly 200 monthly subscribers.
- **Stripe needs no BR** if you sign up as an "Individual" with your HKID. You still need the BR for legality, and schools expect a BR number on quotations. Register as a sole proprietor and select "Sole Proprietorship" in Stripe.

### 2.2 Profits tax basics

- **Rates for unincorporated businesses (two-tier):** 7.5% on the first HK$2M of assessable profits, 15% above that ([IRD FAQ](https://www.ird.gov.hk/eng/faq/2tr.htm); [Sleek](https://sleek.com/hk/resources/two-tiered-profits-tax-rates-regime-in-hong-kong/)).
- **Rates for a limited company:** 8.25% / 16.5%.
- **2025/26 reduction:** 100% of profits tax, capped at HK$3,000.
- **Deductible costs:** LLM API, hosting (Vercel), Apple/Microsoft signing certificates and similar are deductible expenses.
- **Filing:** the sole proprietor's profits go on the individual return (BIR60, business section). Keep books and receipts for 7 years **[general knowledge]**.

### 2.3 When to form a limited company

- **Setup and running costs:**
  - Setup: about HK$3,895 in government fees (HK$1,545 CR plus HK$2,350 BR).
  - Every year: annual return HK$105, a **mandatory audit** (small company about HK$8–15k/yr), a company secretary, and a registered address ([Sleek](https://sleek.com/hk/resources/company-registration-cost-hong-kong/)).
- **Tax gives no reason to incorporate early.** Corporate rates are higher than unincorporated rates, and the audit alone would eat Phase 1 margin.
- **Incorporate when one of these applies:**
  1. Schools or larger bodies insist on a Ltd supplier.
  2. You take on liability risk: hosted AI output, cloud storage of teacher data (PDPO), or school contracts with indemnities.
  3. You bring in a co-founder or investor.
  4. Profits are large enough that limited liability is worth about HK$15–25k/yr.
- **Moving the processor.** Stripe accounts can change legal entity. MoRs usually require re-verification. **[unverified detail]**

---

## 3. Billing model when AI costs money per use

### 3.1 Options

| Model | Pros | Cons | Fit |
|---|---|---|---|
| Flat subscription, unlimited AI | Simplest | Unbounded cost; one heavy user can wipe out the margin | No |
| **Flat subscription + monthly AI allowance (fair-use cap) + prepaid top-up packs** | Predictable for teachers; cost is capped; top-ups monetise heavy users | Needs an allowance ledger | **Yes, Phase 1** |
| Tiered plans (Free / Teacher / Pro) with different allowances | Clear upsell | More SKUs | Yes, as 2–3 tiers |
| Pure pay-per-use credits | Cost-aligned | Teachers dislike meters; weak recurring revenue | Only as the top-up |
| Metered billing in arrears (Stripe Meters) | Accurate | Bill shock; you front the LLM cost; fails for school budgets | Later, if ever |

### 3.2 Suggested shape (illustrative)

- **Free:**
  - Full offline editor and .docx export. This is the MIT core and it remains free.
  - Small AI trial allowance, e.g. 20 AI actions a month or a one-off 50.
- **Teacher (HK$48/mo or HK$480/yr, two months free):**
  - Cloud sync.
  - An AI allowance sized so the worst case costs you no more than about 25–30% of price. Example: a HK$48 plan with at most HK$12 of LLM cost.
- **Top-up packs (one-time):** e.g. HK$38 for N extra AI actions, valid 12 months. These can also be paid by FPS, since they are one-off.
- **Price allowances in "actions", not tokens.** Actions are things like "translate a paper" or "generate 10 MCQs". Internally, record token cost per action so you can adjust.

### 3.3 Implementation

- **Recommended now:** keep an app-side ledger in your own DB, with a `ai_allowance` per billing period and a `credit_balance`.
  - A Stripe webhook (`invoice.paid`, `customer.subscription.updated`) resets the allowance.
  - A `checkout.session.completed` for a top-up adds to `credit_balance`.
  - The AI proxy decrements the ledger before calling the LLM, and refuses at zero.
  - This works identically on any processor or MoR, which keeps you portable.
- **Stripe native, later:**
  - Meters are included in Billing up to 100M events/month.
  - **Billing credit grants** give prepaid or promotional credits, but they apply only to *metered* prices ([Stripe credit grants](https://docs.stripe.com/api/billing/credit-grant); [billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits)).
  - Sessions 2026 added credit-balance tracking, low-balance alerts and auto top-ups ([Stripe blog](https://stripe.com/blog/everything-we-announced-at-sessions-2026)).
- **MoR options:**
  - Polar has meters and a credits benefit, with balances visible in the hosted portal ([Polar](https://polar.sh/docs/features/usage-based-billing/credits)).
  - Paddle supports one-time charges on subscriptions and credit packs ([Paddle AI](https://developer.paddle.com/get-started/how-paddle-works/ai-companies/)).
  - Dodo includes usage metering.
  - Stripe Managed Payments supports subscriptions via Billing. Whether its meters and credit grants work is **not confirmed [unverified]**, and it does not support invoice items or off-cycle invoices.

---

## 4. School and department licences (Phase 2)

### 4.1 HK aided-school procurement

EDB handy tips on the aided-school financial limits ([EDB PDF](https://www.edb.gov.hk/attachment/en/common/handy_tips_tendering_and_purchasing_eng.pdf), 2010):

| Purchase size | Procurement rule |
|---|---|
| ≤ HK$5,000 | No competitive bidding; staff certifies the purchase is essential and the price reasonable |
| HK$5,000–30,000 | At least 2 oral quotations |
| HK$30,000–50,000 | At least 2 written quotations |
| > HK$50,000 | Tender (at least 5) |

- **These limits may be out of date.** The current *Guidelines on Procurement Procedures in Aided Schools* (EDBC 4/2013, updated 31 Oct 2025) may have revised them, and a secondary source quotes "HK$5k–50k: 2 oral quotations; HK$50k–200k: 5 written" ([EDB index](https://www.edb.gov.hk/en/sch-admin/fin-management/procurement-procedures-in-aided-schools/procurement_procedures_in_aided_schs.html)). **Confirm against the current guideline before pricing.**
- **Schools must use total contract value**, not monthly payments, and must not split purchases to dodge a threshold. A multi-year deal is judged by its full value.
- **Practical consequences:**
  - An **annual department licence ≤ HK$5,000** (e.g. 5 teachers × HK$480 = HK$2,400; 10 teachers at a small discount ≈ HK$4,300) is the path of least friction.
  - Above that, you will be one of several quotations. Write specifications generically, since schools may not stipulate a brand.
  - DSS and private schools have their own procedures.

### 4.2 How small edtech sells to HK schools [practice, partly inference]

- **Paperwork** on letterhead with BR number, in English and Chinese:
  - A **quotation** with validity date, items, seats and period.
  - Then an **invoice** (and a delivery note or licence certificate if asked).
  - Then a **receipt** once paid.
- **Payment:** cheque (payable to your registered business name), bank transfer, or FPS. Schools usually pay 30–60 days after invoice, so provision access on PO or order confirmation, not on payment.
- **Tooling:**
  - **Stripe Invoicing:** hosted invoice page plus PDF, school can pay by card; 0.4% capped at US$2 per paid invoice ([Stripe pricing](https://stripe.com/en-hk/pricing)). Mark it paid out-of-band when a cheque or FPS arrives. Invoices can carry your bank and FPS details in the memo or footer.
  - **Alternatively,** a simple invoice generator.
  - HK has no VAT, so no tax lines are needed.
- **Licence mechanics:** a school account with N seats, and an admin invites teachers by email or a school-domain allowlist. The school's licence overrides personal plans. Give each seat the same AI allowance, or pool it per school.
- **An MoR is the wrong tool for HK schools.** Stripe Managed Payments can't issue one-off invoices. Paddle invoices are payable by bank transfer only in EUR/GBP/USD. Direct Stripe, or manual invoicing by your HK business, fits.

---

## 5. Desktop apps outside the app stores

- **Distributed via GitHub Releases** (Developer ID-signed and notarised macOS, signed Windows installer):
  - **No Apple or Microsoft IAP rules apply.** The App Store Review Guidelines govern only apps distributed through the App Store.
  - The desktop app can link to the web checkout, and the entitlement syncs to the account after sign-in.
  - This is the recommended flow: the desktop app shows "Manage plan", which opens the web billing page in the browser via the opener plugin. **[inference from guideline scope]**
- **If later listed on the Mac App Store:**
  - **3.1.1:** unlocking features or subscriptions requires IAP; license keys are not allowed.
  - **3.1.3(b), multiplatform services:** content bought on your website may be accessed *provided those items are also available as IAP in the app*.
  - **3.1.3(f):** a free stand-alone companion app is exempt only if it has no purchasing and no calls to action.
  - External purchase links are allowed only on the **US storefront** (since May 2025). Other storefronts, including HK, still require IAP or a regional entitlement ([Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)).
  - Mac App Store apps must also update through the store (2.4.5(vii)), which conflicts with the Tauri updater.
  - Apple's commission would apply to IAP.
- **If later listed on the Microsoft Store** (policy 7.20, Sept 2026):
  - **10.8.1:** "Non-game products made available on PC devices may either use a secure third-party purchase API or the Microsoft Store in-product purchase API".
  - **10.8.6:** likewise allows third-party recurring billing for subscriptions.
  - Your own processing must be PCI DSS compliant (Stripe-hosted Checkout covers this), and you must declare it in Partner Center ([Microsoft Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)).
  - **Listing on the Microsoft Store is low-risk; listing on the Mac App Store is not.**

---

## 6. Refunds, dunning, portal, invoices, discounts

- **Refunds:**
  - HK has no general statutory cooling-off period for online digital subscriptions **[general knowledge]**. Publish a policy, e.g. a full refund within 14 days of the first charge and cancel-anytime thereafter with no pro-rata refund.
  - EU consumers have a 14-day withdrawal right, which an MoR handles.
  - With Managed Payments, Stripe itself may refund within 60 days, and refunds automatically if you don't answer an escalation within 48 hours ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)).
- **Failed payments and dunning:**
  - Stripe Billing 0.7% includes Smart Retries, automatic reminders, recovery automations and a hosted **customer portal** for cancelling, updating cards and downloading invoices ([Stripe Billing pricing](https://stripe.com/en-hk/billing/pricing)).
  - Paddle, Polar and Dodo include dunning. Dodo charges 5% of recovered revenue.
- **Invoices and receipts for school claims:**
  - Direct Stripe invoices and receipts show your business name, address and BR number. Add a custom field such as "School / 學校名稱" at Checkout so teachers can claim reimbursement.
  - With an MoR, the receipt comes from Link, Paddle or Polar.
- **Education discounts:**
  - The whole market is teachers, so treat the base price as the education price.
  - Use Stripe **coupons or promotion codes** for launch pricing, subject-panel referrals, and a trainee-teacher rate (e.g. 50% with a PGDE student email) **[suggestion]**.
  - Annual plan: two months free (HK$480 vs HK$576).

---

## 7. Fee math: HK$48/month and HK$480/year

- **Assumptions:**
  - HK-issued card, customer pays in HKD.
  - US$1 = HK$7.8 for fixed fees.
  - Stripe figures include Billing at 0.7%.
  - Stripe Managed Payments = standard fee + 3.5% + Billing 0.7%. Whether Billing stacks on Managed Payments is **[unverified]**.
  - For US MoRs, an HK card counts as "international" where a surcharge exists.
  - Payout fees are excluded unless noted.

| Option | HK$48/mo: fee → net (fee %) | HK$480/yr: fee → net (fee %) | Payout cost |
|---|---|---|---|
| **Stripe HK direct** (3.4% + 2.35 + 0.7%) | 4.32 → **43.68** (9.0%) | 22.03 → **457.97** (4.6%) | Free to HK bank |
| Stripe direct, intl card (+0.5%) | 4.56 → 43.44 (9.5%) | 24.43 → 455.57 (5.1%) | Free |
| **Stripe Managed Payments** (+3.5%) | 6.00 → **42.00** (12.5%) | 38.83 → **441.17** (8.1%) | Free |
| **Paddle** (5% + US$0.50) | 6.30 → **41.70** (13.1%) *(sub-US$10 price: Paddle may require custom pricing)* | 27.90 → **452.10** (5.8%) | Up to US$15 SWIFT, monthly |
| Polar Starter (5% + 50¢ + 1.5% intl) | 7.02 → 40.98 (14.6%) | 35.10 → 444.90 (7.3%) | US$2/mo + 0.25% + 25¢ + ≤1% FX |
| Polar Pro (US$20/mo; 3.8% + 40¢ + 1.5%) | 5.66 → 42.34 (11.8%) | 28.56 → 451.44 (5.9%) | Same + US$20/mo |
| Dodo (4% + 40¢ + 1.5% + 0.5% sub) | 6.00 → 42.00 (12.5%) | 31.92 → 448.08 (6.6%) | Free if > US$1k, else US$5 |
| Creem (3.9% + 40¢, headline) | 4.99 → 43.01 (10.4%) | 21.84 → 458.16 (4.5%) | Reportedly 1% or US$7 non-EU **[unverified]** |
| Lemon Squeezy (5% + 50¢ + 1.5% + 0.5%) | 7.26 → 40.74 (15.1%) | 37.50 → 442.50 (7.8%) | 1% outside US |

**Takeaways:**

- **Push the annual plan.** A fixed fee of HK$2.35–3.90 is 5–8% of a HK$48 charge, but under 1% of HK$480. Monthly plans lose 9–15% to fees; annual plans lose 4.5–8%.
- **At 500 teachers, all on annual:**
  - Revenue: HK$240,000.
  - Fees: about HK$11.0k on Stripe direct, HK$19.4k on Managed Payments, HK$14.0k on Paddle.
  - Direct Stripe saves about **HK$8.4k/yr** over Stripe's own MoR, which easily covers the BR fee.

---

## 8. Recommendation

### Phase 1: solo, fewer than 500 paying users, HK-first

1. **Register a sole proprietorship BR** (eTAX, about 2 days). If projected receipts are ≤ HK$10k/month, apply for the fee exemption on Form 3.
2. **Open a Stripe HK account** as a sole proprietorship, with a HKD payout account.
3. **Build the payment flow:**
   - Stripe **Checkout** with subscriptions (monthly and annual HKD prices).
   - The **customer portal**.
   - **Promotion codes**.
   - Webhooks into your auth backend to set entitlements.
   - Enable cards, Apple Pay and Google Pay. Alipay and WeChat Pay are optional.
4. **AI metering:** app-side allowance and credit ledger. Sell top-ups as one-time Checkout payments.
5. **Restrict or monitor non-HK sales.** Allow HK, MO, TW and SG. For EU/UK, either block them or create those Checkout Sessions with **Managed Payments on**. The flag is per session, so no migration is needed. Confirm with Stripe support that mixing per session is permitted on one account **[unverified]**.
6. **Desktop:** web checkout only, no in-app purchase. Sign in to sync the entitlement, and cache it offline with an expiry and grace period.

**Choose an MoR instead only if** you expect material EU/UK sales early, or want zero tax thinking. In that case use **Stripe Managed Payments**, since it keeps the same processor, is GA and is HK-eligible. **Paddle** is the fallback. **Polar** fits if its meters and credits portal appeal and you accept the fees.

### Phase 2: schools

1. Add a **School/Department licence** SKU:
   - Annual, seat-based.
   - A department pack priced **≤ HK$5,000** (verify against the current EDB guideline).
   - Pooled or per-seat AI allowance.
2. **Sales flow:**
   - A bilingual quotation PDF with your BR number.
   - A Stripe **Invoice**: card payable online, or marked paid on receipt of cheque, bank transfer or FPS. Net 30.
   - Provision on the purchase order.
3. **Consider incorporating a Ltd** when school contracts, data-protection liability for cloud storage, or revenue justify the HK$15–25k/yr in audit and compliance costs. Move the Stripe account's legal entity at that point.

---

## Unverified or open items

- Stripe HK international-card surcharge: the official page says +0.5%. Some calculators say +1%. The fee table uses +0.5%.
- Whether Stripe Billing's 0.7% stacks on Managed Payments subscriptions, and whether meters and credit grants work with Managed Payments.
- Whether one Stripe account can mix Managed Payments and direct sessions freely. The docs show it is a per-session flag, which implies yes.
- Current EDB aided-school thresholds (2025 guideline) vs the 2010 table.
- Paddle's actual rate for sub-US$10 prices; Creem's HK payout fee; Airwallex sole-proprietor onboarding.
- Stripe HK standard payout timing: reported as 7 business days. Stripe's page confirms payouts are free.
