# B. Authentication & accounts for Econ Studio (web + Tauri desktop)

Research date: 2026-09-30. Scope: login methods for HK teachers, OAuth in Tauri 2, provider
comparison, entitlement gating for an MIT app, PDPO basics. Items marked **[unverified]** were
not confirmed against a primary source.

---

## 0. Recommendation (the short version)

| Decision | Choice |
|---|---|
| Provider | **Supabase Auth** on the **Pro plan ($25/mo)**, project in **Singapore (ap-southeast-1)**. It also gives you Postgres (entitlements, quotas), Storage (cloud sync) and Edge Functions (the hosted-AI proxy that holds your Gemini key), so one vendor and one JWT cover all three paid features. |
| Login methods | **Continue with Google**, **Continue with Microsoft**, and **Email me a 6-digit code** (OTP, *not* a magic link). No passwords. No Apple, no passkeys in v1. |
| Web flow | supabase-js with `flowType: 'pkce'`, redirect to a static `/auth/callback` page that calls `exchangeCodeForSession`. Works with `output: 'export'`. |
| Desktop flow | System browser + **custom-scheme deep link** (`econstudio://auth/callback`) + PKCE, via `tauri-plugin-deep-link` + `tauri-plugin-single-instance` (feature `deep-link`). Email-code login needs no browser at all and is the fallback when deep links misbehave. |
| Token storage | Web: localStorage (supabase-js default). Desktop: a custom supabase-js `storage` adapter backed by the OS keychain (Rust `keyring` crate behind a Tauri command); store only the refresh token there; access token in memory. |
| Offline | Auth never gates local work. Documents, `.docx` export, print and BYOK AI work signed-out and offline, forever. Only server resources (hosted AI, cloud storage/sync) need a live session. Don't attempt a token refresh while offline. |
| Entitlement | **Account-based, enforced server-side** (Edge Function + RLS read a `subscriptions` row written by the payment webhook). No licence keys, no Keygen, no client-side feature gates, because the app is MIT and anyone can delete a client gate. |
| Cost | ~US$25/mo flat up to 100k MAU, plus a transactional-email provider for OTP mail (free tier likely enough at 1k MAU; a few $/mo at 10k) **[email pricing unverified]**. |

---

## 1. Login methods for HK teachers

### What teachers have
- Microsoft says all ~1,000 HK primary/secondary schools (≈50,000 teachers) can use Office 365
  Education free, and 780k+ education users had activated it by 2020
  ([Microsoft HK, 2020](https://news.microsoft.com/en-hk/2020/02/05/microsoft-empowers-hong-kong-teachers-and-students-with-real-time-interactive-remote-learning/)).
  Google Workspace for Education is also common in HK schools, but I found **no adoption
  figures** **[unverified split]**. Many teachers will also have a personal Gmail.
- So: **Microsoft + Google + an email fallback** covers essentially everyone.

### Microsoft (Entra ID school tenants): consent is the risk
- By default a user can consent to permissions that don't need admin consent; an admin can
  instead set "Do not allow user consent" (users then *always* see "Need admin approval"), or
  "Allow user consent for apps from verified publishers, for selected permissions"
  (`microsoft-user-default-low`) ([Microsoft Learn: configure user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)).
- **MC1097272 (rolled out Jul–Aug 2025)**: Microsoft-managed policy now blocks user consent for
  third-party apps accessing **files and sites**; users must request admin consent for those
  ([AppGov Score](https://www.appgovscore.com/blog/microsoft-disables-user-consent-by-default-are-you-ready-for-mc1097272),
  [office365itpros](https://office365itpros.com/2025/06/19/app-consent-policy-user-app-consent/)).
  **Sign-in-only scopes are not the target.** If you ask only for `openid profile email`
  (plus `User.Read`/`offline_access`), a default tenant still lets a teacher sign in.
- **Unverified publishers**: since Nov 2020, end users can't consent to new multi-tenant apps
  from unverified publishers **when the app asks for more than basic sign-in and profile
  read**. Basic sign-in is not affected
  ([thoughtstuff](https://blog.thoughtstuff.co.uk/2020/11/end-users-can-no-longer-grant-consent-to-unverified-multi-tenant-apps-what-this-means-for-you/),
  [publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)).
  Still, **do publisher verification** (it needs a Microsoft Cloud Partner Program ID, free).
  It removes the "unverified" label and lets tenants on the `…-default-low` policy consent.
  Whether a sole trader can easily get a CPP ID is **[unverified]**.
- **How often HK schools lock consent down: unknown [unverified].** Schools with a managed
  IT vendor often do. Plan for it. Never request Graph file/mail scopes at login. Show the
  message: "If your school account says *Need admin approval*, use **Email me a code** with
  the same school address." Supabase links identities that share a verified email, so the
  teacher lands in the same account.
- Supabase specifics: the Azure provider defaults to the `common` tenant (any Microsoft
  account). **Add the `xms_edov` optional claim**, or Entra may assert unverified email domains
  (an account-takeover vector). Client secrets expire, so put the renewal in a calendar
  ([Supabase Azure docs](https://supabase.com/docs/guides/auth/social-login/auth-azure)).

### Google (Workspace for Education)
- Admins choose one of three settings for unconfigured third-party apps: allow any (the
  **default**); allow only apps that **request basic Sign-in-with-Google info** (name, email,
  photo); or block all. Education editions can set it per age group
  ([Google Workspace admin help](https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data?hl=en)).
- Users designated **under 18** are blocked from unconfigured apps by default. Admins can let
  basic-profile-only apps through
  ([Google help 13288950](https://support.google.com/a/answer/13288950?hl=en)). Teachers are
  adults, so this normally doesn't bite, unless a school puts staff in a student OU
  **[edge case]**.
- **Takeaway**: request only `openid email profile`. Never add Drive or Classroom scopes to
  login. If Drive export is added later, request it incrementally, and expect it to need
  Google verification and admin allow-listing.
- Google blocks OAuth in embedded webviews (`disallowed_useragent`). The Tauri webview must
  never show Google's login page; always use the system browser
  ([Google blog](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)).

### Email: OTP code, not magic link
- Microsoft Defender Safe Links, Mimecast and Proofpoint **pre-click links in emails**. A
  single-use magic link gets consumed by the scanner, and the teacher sees "link expired". A
  typed 6-digit code can't be consumed that way and works across devices
  ([Bruvora](https://www.bruvora.com/blog/magic-links-vs-otp-b2b),
  [School Help Center](https://schoolhelpcenter.zendesk.com/hc/en-us/articles/4411613217939-Why-is-my-magic-login-link-already-expired)).
  HK school mail is mostly M365, so this matters.
- An OTP code is also the **ideal desktop fallback**: no deep link, no browser, no keychain
  dance at login.
- Supabase: `signInWithOtp({ email })` → `verifyOtp({ email, token, type: 'email' })`. The email
  template must include `{{ .Token }}` rather than only the link.
- **Supabase's built-in mailer only delivers to project team members, at ~2 emails/hour.**
  Production **requires custom SMTP**; the default auth-email limit with custom SMTP is 30
  new users/hour and can be adjusted
  ([Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
  [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)).
  Use Resend, Postmark or Amazon SES with SPF/DKIM on your own domain. School spam filters
  are harsh on new senders.

### Apple, passkeys, passwords
- **Apple**: skip it. App Store guideline 4.8 doesn't apply outside the store, few teachers
  use an Apple ID for work, and it needs the $99/yr developer programme plus key rotation.
- **Passkeys**: defer. In a Tauri WKWebView, WebAuthn needs the Associated Domains
  entitlement plus an https origin, and `tauri://localhost` is not one
  ([passkeys.dev macOS](https://passkeys.dev/docs/reference/macos/),
  [example PR](https://github.com/dali-lab/dali-os/pull/1805)). Passkeys would have to run in
  the system browser, and Google/Microsoft already give teachers a passkey-grade login.
- **Passwords**: no. They mean reset flows, breach liability and support load.

---

## 2. OAuth in a Tauri 2 desktop app

### Standards
- RFC 8252 (OAuth for native apps): use the **external user agent (system browser)**, the
  **authorization code flow + PKCE**, and a redirect via a private-use URI scheme *or* a
  loopback IP. Never an embedded webview, never a client secret in the binary
  ([RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)).
- With Supabase, **Supabase is the OAuth client towards Google and Microsoft**. Google and
  Microsoft redirect to `https://<ref>.supabase.co/auth/v1/callback`, and Supabase then
  redirects to your app. Google's ban on custom URI schemes for its own clients
  ([Google blog](https://developers.googleblog.com/en/improving-user-safety-in-oauth-flows-through-new-oauth-custom-uri-scheme-restrictions/),
  [native-app guide](https://developers.google.com/identity/protocols/oauth2/native-app))
  **therefore doesn't apply**. Add `econstudio://auth/callback` to Supabase's Redirect URLs
  allow-list.

### Deep link vs loopback

| | Deep link (`tauri-plugin-deep-link`) | Loopback (`tauri-plugin-oauth`) |
|---|---|---|
| How | OS routes `econstudio://…` to the app | App starts a temp `http://127.0.0.1:<port>` server |
| Starts the app if closed | Yes | No, the app must be running |
| Provider support | Fine behind a broker (Supabase, WorkOS, Auth0) | Required if you talk to Google directly |
| Pitfalls | Windows needs single-instance; macOS works only from the installed bundle | Port collisions; the browser shows a bare localhost page; fragment-based (implicit) responses not captured ([plugin README](https://github.com/fabianlars/tauri-plugin-oauth)) |
| Security | Another app could register the same scheme; PKCE covers this | Local MITM on shared loopback noted by Google; PKCE covers this |

**Pick the deep link.** Keep loopback in reserve for the case where you ever call Google
directly.

### Tauri pitfalls (checked against this repo's `src-tauri/tauri.conf.json`: NSIS `installMode: "currentUser"`, no single-instance or deep-link plugin yet, `macOS.signingIdentity: null`)
- **Windows / NSIS**: the old bug "NSIS deep link doesn't work" ([tauri#10095](https://github.com/tauri-apps/tauri/issues/10095))
  is stale. The current bundler template **writes `Software\Classes\<scheme>` under `SHCTX`**,
  which resolves to HKCU in a currentUser install, and removes it on uninstall (verified in
  [installer.nsi](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)).
  The plugin can also `register()` the scheme at runtime on Windows/Linux, which is a useful
  self-heal ([Tauri deep-linking docs](https://v2.tauri.app/plugin/deep-linking/)).
- **Windows needs `tauri-plugin-single-instance` with feature `deep-link`**, registered first.
  Otherwise clicking the callback launches a second copy of the app that holds the URL.
  There is a reported case of the URL being **delivered twice**
  ([issue](https://github.com/Carme99/PresenceJam-Desktop/issues/799)) **[third-party report]**,
  so make the code exchange idempotent (consume each `code` once).
- **macOS**: schemes can't be registered at runtime. Deep links work only for the bundled app
  **installed in /Applications**, so they can't be tested in `tauri dev`
  ([Tauri docs](https://v2.tauri.app/plugin/deep-linking/)). Handle both
  `getCurrent()` (cold start via link) and `onOpenUrl()` (already running).
- **Validate every deep link.** Anyone can launch the app with a crafted URL. Accept only
  `econstudio://auth/callback?code=…` while a login you started is pending.
- The Tauri webview origin (`tauri://localhost` / `http://tauri.localhost`) only calls
  Supabase REST/Auth over fetch, so no cookies are involved.
- Worked example: Supabase + Google + Tauri 2 deep link with
  `signInWithOAuth({ options: { redirectTo, skipBrowserRedirect: true } })`, opening the URL
  with the opener plugin, then `exchangeCodeForSession(code)`
  ([Medium, N. Covey](https://medium.com/@nathancovey/supabase-google-oauth-in-a-tauri-2-0-macos-app-with-deep-links-f8876375cb0a),
  [Supabase PKCE docs](https://supabase.com/docs/guides/auth/sessions/pkce-flow)).
- **Repo rule**: `@tauri-apps/plugin-deep-link` and the keychain commands must be loaded with
  dynamic `import()` inside `src/platform/` or `src/desktop/`, behind `isDesktop()`
  (CLAUDE.md, `tauriImports.test.ts`).

### Token storage
- Store the **refresh token only** in the OS keychain (Rust `keyring` crate: macOS Keychain /
  Windows Credential Manager) and keep the access token in memory. Plug it in through
  supabase-js's `auth.storage` option with an async adapter that invokes Tauri commands.
- **Windows Credential Manager caps a blob at 2560 bytes.** The `keyring` crate writes UTF-16,
  so the real ceiling is about 1280 characters, and whole OAuth session JSON routinely
  overflows it ([codex#10353](https://github.com/openai/codex/issues/10353),
  [jira-cli#759](https://github.com/Zious11/jira-cli/issues/759)). Store the short refresh
  token, not the session JSON, or chunk it.
- **macOS keychain ACLs follow the code signature.** An ad-hoc or unsigned app gets a new
  cdhash on every build, so after each update the keychain prompts or refuses and users are
  signed out ([example](https://github.com/TimmyAmant/marquee/pull/28),
  [Apple](https://support.apple.com/guide/keychain-access/if-a-trusted-app-asks-for-keychain-access-kyca1331/mac)).
  `signingIdentity: null` in `tauri.conf.json` suggests signing happens in CI, or not at all
  **[check the release workflow]**. If builds are not Developer-ID signed, **store the refresh
  token in a file in the app-data dir (mode 0600)** instead. The blast radius is one
  teacher's cloud quota and cloud docs, and the token is revocable server-side. Moving to the
  keychain is worth it once you sign.
- Supabase refresh tokens **never expire**, are single-use with a 10 s reuse window, and use
  rotation plus reuse detection. Pro adds time-box and inactivity timeouts
  ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)). **Don't set an
  inactivity timeout shorter than a school holiday**, e.g. 90+ days or none, or teachers
  returning after summer are logged out.

### Offline behaviour (the most important rule)
- Signed-in state is **a label on the app, never a lock on local work**. Open, edit, export,
  print and BYOK translation all work signed-out, offline and with an expired session. This
  matches the "a document must always reopen" promise in CLAUDE.md. **Signing out, or account
  deletion, never touches local documents**, and neither may change the local storage keys or
  the document schema.
- supabase-js has a history of **removing the stored session when a refresh fails offline**
  ([auth-js#141](https://github.com/supabase/auth-js/issues/141),
  [discussion #36906](https://github.com/orgs/supabase/discussions/36906), still reported in
  March 2026). A new issue (27 Sep 2026) says current versions keep the session on network/5xx
  errors but **drop it on 429/408**
  ([supabase-js#2715](https://github.com/supabase/supabase-js/issues/2715), open).
  Mitigation: `autoRefreshToken: false`; call `startAutoRefresh()` only when `navigator.onLine`
  and on the `online` event; also keep your own copy of the refresh token so a spurious
  removal can be recovered once. **Test this with Wi-Fi off before shipping [behaviour
  version-dependent]**.
- Cache `{ userId, email, plan, planExpiresAt }` locally so the UI can show "Pro" offline.
  This is display-only; the server decides.

---

## 3. Provider comparison

Prices are list prices as of Sep 2026 (official pages where fetched, otherwise third-party
roundups, marked).

| Provider | Free tier | ~1k MAU | ~10k MAU | Desktop / Tauri story | Static-export SPA | Email code / link | Lock-in | Data region |
|---|---|---|---|---|---|---|---|---|
| **Supabase Auth** | 50k MAU, but **free projects pause after 1 week idle**, so production needs Pro | **$25/mo** (Pro, 100k MAU incl., then $0.00325/MAU) | **$25/mo** | PKCE + custom-scheme redirect allow-list; community Tauri examples | Yes (supabase-js) | **OTP code + magic link** | Medium: open-source GoTrue, Postgres `auth.users` exportable, self-hostable | **Choose: Singapore / Tokyo** (no HK) |
| **Clerk** | 50k MRU (since Feb 2026) | $0 (Hobby) / $25 Pro | $0 / $25 | **Weak**: no official Tauri SDK; production sign-in issues reported ([clerk#4725](https://github.com/clerk/javascript/issues/4725)); community [tauri-plugin-clerk](https://github.com/Nipsuli/tauri-plugin-clerk) | Yes | Code + link | High (proprietary) | US **[unverified]** |
| **Firebase Auth** | 50k MAU (Spark) | $0 | $0 | JS SDK popup/redirect don't work in the webview; you'd hand-roll PKCE, then `signInWithCredential` | Yes | **Email link only**, no OTP code (bad with Safe Links) | High | Google-managed, mostly US **[unverified]** |
| **Auth0** | 25k MAU, feature-limited | $0 (free) or ~$70 on B2C Essentials | $0 free; ~$700 on Essentials **[third-party calc]** | Mature "Native app" + PKCE docs, Electron samples | Yes (auth0-spa-js) | Passwordless email code/link | High | US/EU/AU/JP tenants **[unverified list]** |
| **WorkOS AuthKit** | **1M MAU** | $0 | $0 | Public PKCE clients + loopback/deep link; [Electron example](https://github.com/workos/electron-authkit-example). authkit-js prod mode relies on a same-site cookie; use native PKCE in Tauri | Yes (authkit-js) | **Magic Auth = 6-digit code** | Medium | US **[unverified]** |
| **Kinde** | 10.5k MAU | $0 | $0 (just under), Pro $25 | Generic OIDC/PKCE | Yes | Email code | Medium-high | Region chosen at signup **[unverified]** |
| **Stytch** | 10k MAU | $0 | ~$0 at the edge, then about $0.10/MAU **[unverified]** | Generic | Yes | OTP + link | High | US |
| **Better Auth** (self-hosted; Auth.js joined it Sep 2025 and is now maintenance-only) | Free library | Infra only | Infra only | Community [better-auth-tauri](https://github.com/daveyplate/better-auth-tauri) (system browser + deep link) | **No**: needs a server runtime + DB, which the static export doesn't have; you'd add a separate API | Plugin-based OTP | **Lowest** | Wherever you host |

Sources: [Supabase pricing](https://supabase.com/pricing), [Clerk pricing](https://clerk.com/pricing),
[Clerk MRU change](https://clerk.com/articles/clerk-pricing-explained),
[Firebase pricing summary](https://blog.logto.io/firebase-authentication-pricing),
[Auth0 pricing summaries](https://idsync.com/guides/auth0-pricing),
[WorkOS pricing](https://workos.com/pricing), [WorkOS Magic Auth](https://workos.com/docs/authkit/magic-auth),
[Kinde pricing](https://www.kinde.com/pricing/), [Stytch pricing](https://stytch.com/pricing),
[Auth.js → Better Auth](https://better-auth.com/blog/authjs-joins-better-auth),
[Supabase regions](https://supabase.com/docs/guides/platform/regions).

**Why Supabase wins here.** It isn't the cheapest auth; WorkOS and Clerk are free at this
scale. It wins because you need a **database, file storage and a server function** anyway
(for entitlements, cloud sync and the AI key proxy), and Supabase is the only option where all
of these share one JWT and one row-level-security model, with no server of your own. It
supports the email **code** flow, Google, and Azure multi-tenant. It has a Singapore region
for HK latency. It is open-source and self-hostable (an exit path). $25/mo is flat far beyond
the plausible market (HK has ~50k teachers in total).

**Runner-up.** WorkOS AuthKit for auth (free, the most polished hosted login, Magic Auth
codes) plus a separate data backend. Choose it only if you'd rather not use Supabase for
data. It means two vendors and a JWT-verification bridge.

**Avoid.** Firebase (link-only email). Clerk (desktop story; free-tier 7-day fixed sessions
mean weekly re-login). Better Auth for now (it needs a server the architecture deliberately
lacks).

---

## 4. Licence and entitlement on desktop

- **Licence-key model** (Keygen from $99/mo; Lemon Squeezy, Paddle and Polar keys): the app
  holds a key or a signed offline licence file (Ed25519, with a grace period) and unlocks
  features locally ([Keygen offline](https://keygen.sh/docs/choosing-a-licensing-model/offline-licenses/),
  [Polar license keys](https://polar.sh/docs/features/benefits/license-keys)). This suits
  closed-source, pay-once desktop software.
- **For an MIT app it protects nothing.** Anyone can build without the check, so a client
  gate is only a speed bump. What actually costs you money, and so what is worth gating, is
  **server resources**:
  1. **Hosted AI**: an Edge Function holds the Gemini key. It verifies the Supabase JWT,
     reads `subscriptions` and a `usage` counter, and enforces a quota per plan, for example
     N translated words a month. Rate-limit per user and per IP. Free users keep BYOK.
  2. **Cloud storage and sync**: Storage buckets and tables behind RLS policies with a
     per-plan byte or document quota.
  3. Any other hosted service (shared template library, etc.).
- **Account-based entitlement.** The payment provider's webhook upserts
  `subscriptions(user_id, plan, status, current_period_end)`. A Supabase *custom access token
  hook* can copy `plan` into the JWT for cheap UI checks. The server re-reads the row for
  anything that costs money; tokens last an hour, so a cancelled plan stops within the hour.
- **Offline grace** is irrelevant to server features: they don't work offline anyway. Local
  features are never gated. This removes the whole "licence expired on a plane" problem class.
- **Honesty with users.** State on the pricing page that the editor is free and open source,
  and that the subscription pays for the hosted AI and cloud storage. That is also the only
  model that survives forks.
- Lemon Squeezy was bought by Stripe (2024) and in 2026 is steering users to Stripe Managed
  Payments ([LS 2026 update](https://www.lemonsqueezy.com/blog/2026-update)). Choosing the
  payment provider is out of scope here; any provider with webhooks fits this design.

---

## 5. Account deletion and PDPO

The PDPO (Cap. 486) applies to you as a **data user** in HK. There is no data-localisation
rule. The key points:

- **DPP1 (collection)**: collect only what's needed: email, display name, provider id, plan,
  usage counters. Show a **Personal Information Collection Statement** at sign-up: purposes;
  transferees (Supabase in Singapore, the email sender, the payment provider, Google for
  Gemini); whether giving the data is voluntary; access and correction rights; a contact.
- **DPP2 (accuracy and retention)**: delete account data within a stated period after
  closure. Where you use processors (Supabase, the email provider), you must use contractual
  or other means to stop over-retention (DPP2(3)); **sign Supabase's DPA**.
- **DPP3 (use)**: no new purpose without prescribed consent. Don't reuse worksheets sent
  through the AI proxy for anything else; log counts, not content.
- **DPP4 (security)**: RLS on every table, keychain or 0600 tokens, the service-role key only
  in Edge Functions, and processor security via contract (DPP4(2)).
- **DPP5 (openness)**: a public privacy policy.
- **DPP6 (access and correction)**: answer data access requests within **40 days**. A
  self-service "Download my data" button covers most of it
  ([PCPD summaries via TeamBench](https://www.teambench.ai/resources/blog/hong-kong/pdpo-privacy-documentation-review/)).
- **Cross-border**: s.33 (transfer restriction) is **not in force**. The PCPD still recommends
  its model contractual clauses for offshore processing
  ([PCPD cross-border guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/GN_crossborder_e.pdf)).
- **Direct marketing (Part 6A)**: newsletters and "what's new" marketing mail need
  **explicit, unticked opt-in consent**, separate from sign-up. Transactional OTP and billing
  mail are fine.
- **Breach notification**: still voluntary. A mandatory regime (PCPD plus individuals, within
  about 5 business days) is proposed but **not enacted as of the latest sources**
  ([HFW](https://www.hfw.com/insights/a-new-era-for-data-protection-in-hong-kong-legislative-updates-for-a-digital-age/),
  [LegCo Q, Jan 2025](https://www.info.gov.hk/gia/general/202501/22/P2025012200305.htm))
  **[verify at launch]**. Adopt the 5-day practice now.
- **Students**: teachers only. Don't let students create accounts, which avoids the under-18
  and parental-consent questions.

**Account deletion flow** (self-service, in the app):
1. Offer "Download all my cloud worksheets" first.
2. The Edge Function (service role) cancels the subscription through the payment provider's
   API, deletes Storage objects and user rows, then `auth.admin.deleteUser`.
3. The UI says plainly: **"Worksheets saved on this computer are not affected."**
4. Keep only what the law requires. Invoices are normally held by the merchant of record;
   HK business records are kept 7 years under the Inland Revenue Ordinance
   **[confirm with accountant]**.
5. Clear the local token and cached plan, and leave local documents untouched.

---

## 6. Concrete design sketch

```
Web (Vercel static)                         Desktop (Tauri)
───────────────────                         ───────────────
[Continue with Google/Microsoft]            same buttons → opener.openUrl(authUrl)
  signInWithOAuth(pkce, redirectTo=         redirectTo = econstudio://auth/callback
   https://app/auth/callback)                 ↓ system browser → Google/MS → supabase.co
  /auth/callback → exchangeCodeForSession     → econstudio://auth/callback?code=…
                                              single-instance(deep-link) → onOpenUrl
                                              → validate pending login → exchangeCodeForSession
[Email me a code] → signInWithOtp → verifyOtp (identical on both; no browser hop)

Session: supabase-js; web=localStorage; desktop=storage adapter → keychain (signed builds)
         or app-data file 0600 (unsigned); autoRefreshToken only while online
Server:  Supabase Pro, Singapore
         tables: profiles, subscriptions (webhook-written), usage, cloud_docs (RLS)
         storage: per-user bucket prefix, RLS + quota
         edge fn: ai-translate (verifies JWT, checks plan & quota, calls Gemini with owner key)
         edge fn: delete-account, export-account
Local:   unchanged. Signed-out / offline / expired = full editor + BYOK. Never gated.
```

Setup checklist:
- Supabase: Pro, Singapore region, custom SMTP with SPF/DKIM, OTP email template containing
  `{{ .Token }}`, Redirect URLs (`https://<prod>/auth/callback`, preview wildcard,
  `econstudio://auth/callback`), no short inactivity timeout, automatic identity linking by
  verified email.
- Google Cloud: a web OAuth client whose redirect is the Supabase callback; scopes `openid
  email profile`; brand verification for the consent-screen name and logo (basic scopes need
  no sensitive-scope review).
- Entra: a multi-tenant app registration (`common`), the `xms_edov` optional claim, publisher
  verification, a calendar reminder for secret expiry.
- Tauri: add `tauri-plugin-deep-link`, `tauri-plugin-single-instance` (feature `deep-link`,
  registered first), a `plugins.deep-link.desktop.schemes: ["econstudio"]` entry, and keychain
  commands; test on an installed build on both OSes.
