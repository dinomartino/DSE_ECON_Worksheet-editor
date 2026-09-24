# Try the desktop app without releasing it

Three ways to run what is on `develop` as a real Mac app. None of them touches `main`,
creates a tag, or reaches teachers. Every block below is meant to be pasted into
Terminal as-is. (Releasing for real: [`RELEASING.md`](./RELEASING.md).)

| Way | Time | Gives you |
|---|---|---|
| A. Dev window | ~1 min | The app in a window, live-reloading. Nothing to install. |
| B. Local `.dmg` | ~5–10 min | A real installer built on this Mac. |
| C. CI preview | ~15 min | Unsigned `.dmg` + Windows installer from GitHub — for another computer. |

**Before any of them**, get the latest `develop`:

```bash
cd ~/Documents/"Econ worksheet gen"
git switch develop && git pull
npm ci
```

---

## A. Dev window — fastest

```bash
npm run desktop:dev
```

A window opens with the app. Edits to the code reload it. Quit with `Ctrl+C` in
Terminal. If it says another dev server is running, stop that one first (the message
prints the command, e.g. `kill 12345`).

---

## B. Build a `.dmg` on this Mac

**1. Build it.** The `--config` part skips the update-signing files, so no private key
is needed; `CI=true` skips the Finder window-arranging step, which can hang and leave
the build failing at `bundle_dmg.sh`:

```bash
CI=true npx tauri build --bundles dmg --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

If it still fails at `bundle_dmg.sh`, a half-made image is probably mounted — eject it
(`ls /Volumes`, then `diskutil eject force "/Volumes/dmg.XXXXXX"`) and build again.

**2. Open it.** The installer window appears; drag **Econ Worksheet** into Applications:

```bash
open src-tauri/target/release/bundle/dmg/*.dmg
```

**3. Launch it:**

```bash
open -a "Econ Worksheet"
```

**Or install in one go** — quits the app, replaces it in Applications, launches it
(saved worksheets live elsewhere and are not touched):

```bash
osascript -e 'quit app "Econ Worksheet"' 2>/dev/null
M=$(hdiutil attach -nobrowse -readonly src-tauri/target/release/bundle/dmg/*.dmg | grep -o '/Volumes/.*' | tail -1)
rm -rf "/Applications/Econ Worksheet.app" && ditto "$M/Econ Worksheet.app" "/Applications/Econ Worksheet.app"
hdiutil detach "$M" && open -a "Econ Worksheet"
```

**Test the auto-update.** Build the same code labelled as an *older* version; installed,
it finds the published release, downloads it silently and shows "ready — Restart now".
No file changes — the version is set on the command line:

```bash
CI=true npx tauri build --bundles dmg --config '{"version":"0.1.9","bundle":{"createUpdaterArtifacts":false}}'
```

Afterwards you are on the *published* release, not `develop` — rebuild as above to get
back to the newest code.

Built on your own Mac, it opens without a Gatekeeper warning.

---

## C. Build on GitHub (CI preview)

Use this for another Mac or a Windows PC. Needs the GitHub CLI (`gh auth status`
should say you are logged in).

**1. Start the build from `develop`:**

```bash
gh workflow run desktop-preview.yml --ref develop
```

**2. Wait for it** (pick the run it lists, then it follows along until done):

```bash
sleep 5 && gh run watch "$(gh run list --workflow desktop-preview.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

**3. Download and open the Mac installer:**

```bash
rm -rf ~/Downloads/econ-preview
gh run download "$(gh run list --workflow desktop-preview.yml --limit 1 --json databaseId -q '.[0].databaseId')" \
  --name econ-worksheet-macos-aarch64 --dir ~/Downloads/econ-preview
open "$(find ~/Downloads/econ-preview -name '*.dmg' | head -1)"
```

The Windows installer is the `econ-worksheet-windows-x64` artifact (swap the `--name`).
Artifacts are kept for 14 days. The Mac build is Apple Silicon only.

**4. First launch on another Mac.** The preview is unsigned, so macOS blocks it once.
Either right-click the app → **Open** → **Open**, or clear the flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Econ Worksheet.app"
```

On Windows, SmartScreen warns: **More info → Run anyway**.

---

## Good to know

- **Same data as the installed app.** Every build shares one saved-worksheets folder
  (`~/Library/Application Support/hk.econworksheet.desktop/worksheets/`). Back up first
  (start screen → **Back up all…**) if the build under test changes storage.
- **It replaces the installed app.** Dragging into Applications overwrites the released
  version; to go back, download the latest release again.
- **Updates.** The build carries the version in `package.json`. "Check for updates"
  compares it with the latest *published* release, so an unreleased build of the same
  version says "Up to date" — expected.
