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

**2. Open it.** The installer window appears; drag **Econ Studio** into Applications.
If *Econ Worksheet* (0.5.0 or earlier) is there too, move it to the Bin: same app, same
saved worksheets.

```bash
open src-tauri/target/release/bundle/dmg/*.dmg
```

**3. Launch it:**

```bash
open -a "Econ Studio"
```

**Or install in one go** — quits the app, replaces it in Applications (removing an old
*Econ Worksheet* copy too), launches it (saved worksheets live elsewhere and are not touched):

```bash
osascript -e 'tell application id "hk.econworksheet.desktop" to quit' 2>/dev/null
M=$(hdiutil attach -nobrowse -readonly src-tauri/target/release/bundle/dmg/*.dmg | grep -o '/Volumes/.*' | tail -1)
rm -rf "/Applications/Econ Studio.app" "/Applications/Econ Worksheet.app" && ditto "$M/Econ Studio.app" "/Applications/Econ Studio.app"
hdiutil detach "$M" && open -a "Econ Studio"
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
  --name econ-studio-macos-aarch64 --dir ~/Downloads/econ-preview
open "$(find ~/Downloads/econ-preview -name '*.dmg' | head -1)"
```

The Windows installer is the `econ-studio-windows-x64` artifact (swap the `--name`).
Artifacts are kept for 14 days. The Mac build is Apple Silicon only.

**4. First launch on another Mac.** The preview is unsigned, so macOS blocks it once.
Either right-click the app → **Open** → **Open**, or clear the flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Econ Studio.app"
```

On Windows, SmartScreen warns: **More info → Run anyway**.

---

## Good to know

- **Same data as the installed app.** Every build shares one saved-worksheets folder
  (`~/Library/Application Support/hk.econworksheet.desktop/worksheets/`). Back up first
  (start screen → **Back up all…**) if the build under test changes storage.
- **It replaces the installed app.** Dragging into Applications overwrites the released
  version; to go back, download the latest release again.
- **Keychain prompt.** Unsigned and dev builds ask "Econ Studio wants to use… your
  keychain" when an AI key is saved or read (the Keychain ties access to the code
  signature, which changes every build). Expected; signed releases don't ask.
- **An `Econ Worksheet.app` renames itself.** Any build opened from a folder named
  `Econ Worksheet.app` renames it `Econ Studio.app` and reopens (how a Mac updated from
  0.5.0 gets the new name; `SYSTEM_ARCHITECTURE.md` § Desktop shell). It leaves it alone
  when `Econ Studio.app` is already beside it, and tries each folder only once
  (`~/Library/Application Support/hk.econworksheet.desktop/bundle-rename-attempted` lists
  the folders tried; the reason for a skip is in
  `~/Library/Logs/hk.econworksheet.desktop/bundle-rename.log`).
- **Updates.** The build carries the version in `package.json`. "Check for updates"
  compares it with the latest *published* release, so an unreleased build of the same
  version says "Up to date" — expected.
