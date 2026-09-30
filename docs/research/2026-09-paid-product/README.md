# Paid service analysis (2026-09-30)

Accounts, hosted AI on the owner's key, cloud sync and payments, for web + desktop.
Synthesis: artifact https://claude.ai/artifact/FywY8LdptidVU4EobqsjQW. Raw agent reports here
(B auth, C payments, D hosted AI, E sync, F open-source business, G market, H backend stack).

Headlines:
- OpenAI, Anthropic and the Gemini API (AI Studio) forbid serving HK end users, even via our
  server. Legal routes: Gemini on Vertex AI (verify with one HK-billed call), Qwen HK region.
- ~1,000 DSE Economics teachers; schools pay via CITG and the HK$500k AI grant (until 2028-08-31).
- Proposed: Supabase (Singapore) + Vertex Flash-Lite + Stripe HK; app stays static; backend private.
- Sync: whole-document, server rev, conflict copies, server never migrates; desktop first
  (web localStorage ~5 MB can't hold a synced library).

## v2 (same day): the user's goal is a convenience, not a business
No school sales; fixed cost ~HK$0. Reports I (free tiers), J (credits), K (free sync).
- Sync: desktop "choose library folder" (teacher's OneDrive/Drive/iCloud/Dropbox). fileStore must
  scan instead of trusting the index, write atomically, check-before-overwrite, surface conflict copies.
- AI: prepaid "AI pages" (HK$50 = 600, no expiry, refunds) via Stripe Checkout; one Cloudflare
  Worker + D1 (free), email-code sign-in, Vertex relay, server-side ledger is the only hard cap.
- Desktop first: Vercel Hobby forbids payment on the site; moving hosts strands web localStorage.
