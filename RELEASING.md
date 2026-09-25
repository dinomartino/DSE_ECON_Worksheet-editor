# Releasing the desktop app

Just want to try a build without releasing? See [`docs/DESKTOP-PREVIEW.md`](./docs/DESKTOP-PREVIEW.md).

The web app deploys from `main` on Vercel and needs nothing here — which is why work
happens on `develop` and reaches `main` only at release time (see CLAUDE.md). This file is about the
macOS and Windows builds, which ship from a git tag through GitHub Releases and update
themselves from the same release.

## One-time setup

### Apple signing and notarisation

macOS refuses to open an unsigned download without a right-click detour, so the release
build is signed with a **Developer ID Application** certificate and notarised by Apple.
An "Apple Development" certificate is *not* enough — it only signs for your own machines.

1. In [developer.apple.com](https://developer.apple.com/account/resources/certificates)
   → Certificates → **+** → **Developer ID Application**. Follow the CSR flow, download
   the `.cer` and double-click it into Keychain Access.
2. In Keychain Access, find the key under **My Certificates**, right-click → **Export**,
   save as `cert.p12` and set a password. That password is `APPLE_CERTIFICATE_PASSWORD`.
3. Create an app-specific password at [appleid.apple.com](https://appleid.apple.com)
   → Sign-In and Security → App-Specific Passwords. That is `APPLE_PASSWORD`.

### The updater signing key

Already generated at `~/.tauri/econ-worksheet.key` (no passphrase); its public half is in
`src-tauri/tauri.conf.json`. **Back that file up** — lose it and no installed app can ever
accept another update; every teacher would have to reinstall by hand.

### GitHub secrets

Settings → Secrets and variables → Actions → New repository secret. Exact names (seven; the eighth below is deliberately absent):

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/econ-worksheet.key` — `cat ~/.tauri/econ-worksheet.key \| pbcopy` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **do not create** — GitHub rejects empty secrets, and a missing one reads as empty, which is what an unencrypted key needs |
| `APPLE_CERTIFICATE` | base64 of the `.p12` — `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the password from the export above |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Sze Yuen HO (437KYKG9R8)` |
| `APPLE_ID` | the Apple ID email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | `437KYKG9R8` |

`GITHUB_TOKEN` is provided by Actions; do not create it.

Windows is **unsigned** for now. An OV code-signing certificate (~US$215/yr) is the later
option; Azure Trusted Signing is limited to US/CA/EU/UK, so it is not open to a Hong Kong
maintainer.

## Cutting a release

Day-to-day work lives on `develop`; `main` is what teachers get, and every push to it
deploys the web app. A release starts by bringing `develop` into `main`:

```bash
git switch main && git pull
git merge --ff-only develop          # or merge a develop → main pull request
```

Then tag on `main` as below, and afterwards `git switch develop && git merge main` so
the version bump reaches `develop`.

`package.json` is the single source of truth for the version. `npm version` runs
`scripts/sync-version.mjs`, which writes the same version into
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` and stages them, so the commit and
tag carry all three.

Before tagging, close the changelog: in `CHANGELOG.md`, rename **Unreleased** to the
version and today's date, and start a fresh empty **Unreleased** above it. Commit that
first — the tag must contain it, because the app shows this section as "What's new"
after an update, and the release body is copied from it.

```bash
npm run typecheck && npm test        # green before tagging
npm version patch                    # or: minor | major
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`: three builds (macOS arm64, macOS x64,
Windows x64) into one **draft** release. Check the assets below, then publish — that is
what ships it to installed apps:

```bash
node scripts/release-notes.mjs vX.Y.Z > /tmp/notes.md   # that version's CHANGELOG section
gh release edit vX.Y.Z --draft=false --latest --notes-file /tmp/notes.md
```

"Release" means the whole sequence including this step; a release instruction is
already the sign-off on the version.

### Beta

```bash
npm version prerelease --preid beta  # → v1.3.0-beta.1
git push --follow-tags
```

A hyphenated tag is published as a *prerelease*. The updater endpoint is
`releases/latest/download/latest.json`, and GitHub's `latest` **excludes prereleases** —
so a `-beta.N` build never reaches anyone on a stable install. Beta testers download and
install the `.dmg`/`.exe` from the prerelease page by hand. Ship it for real by cutting a
normal version afterwards.

## Checking the draft

Assets that must be there before you publish:

- `Econ Worksheet_<version>_aarch64.dmg` and `..._x64.dmg`
- `Econ Worksheet.app.tar.gz` + `.sig`, one per macOS arch
- `Econ Worksheet_<version>_x64-setup.exe` + `.sig`
- `latest.json`

No `latest.json`, or a missing `.sig`, means the signing secrets were absent — installed
apps will not update. Fix the secrets and re-run the workflow rather than publishing.

Open the `.dmg` on a Mac you have never built on: it should launch with no Gatekeeper
warning. That is the notarisation working.

## First install, for teachers

- **macOS** — open the `.dmg`, drag *Econ Worksheet* to Applications. Apple Silicon Macs
  take the `aarch64` file, Intel Macs the `x64` one.
- **Windows** — run the `-setup.exe`. It is unsigned, so SmartScreen shows "Windows
  protected your PC": click **More info** → **Run anyway**.

After that, updates arrive in the app: a bar offers the new version and installs it.

## Rollback

An installed app only ever moves *forward* — the updater will not step down a version.
So a rollback is a **new, higher version** containing the revert:

```bash
git revert <bad commit>
npm version patch && git push --follow-tags
```

Also unpublish (or delete) the bad release so `latest.json` stops pointing at it, and
delete its tag. Deleting the release alone does not un-install it from anyone's machine.

## Linking from another website

`docs/download-widget.html` is a paste-anywhere block that reads the latest release from
the GitHub API and renders one button per installer, so links never go stale. The
no-script fallback is the release page: `https://github.com/dinomartino/DSE_ECON_Worksheet-editor/releases/latest`.
