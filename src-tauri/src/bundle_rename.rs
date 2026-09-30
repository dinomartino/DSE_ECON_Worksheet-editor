//! macOS: give a bundle the updater left as `Econ Worksheet.app` its current name.
//!
//! The updater unpacks into the running bundle's folder, so a Mac updated from 0.5.0 keeps
//! the old folder name (Finder, Dock and Launchpad say Econ Worksheet). On launch, before
//! any window exists, the app renames its own folder to `Econ Studio.app` and relaunches
//! from there once. Every doubt is a logged skip: startup never fails or waits on this.
//! Only the folder name changes; data, settings and the keychain are keyed by identifier.

use std::path::{Component, Path, PathBuf};

pub const OLD_BUNDLE: &str = "Econ Worksheet.app";
pub const NEW_BUNDLE: &str = "Econ Studio.app";
/// Passed to the relaunched process, which then never tries again.
pub const RELAUNCH_FLAG: &str = "--econ-studio-renamed";

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
  Rename { from: PathBuf, to: PathBuf },
  Skip(Skip),
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Skip {
  /// This process is the relaunch that followed a rename.
  Relaunched,
  /// Not running from `<name>.app/Contents/MacOS/` (e.g. `tauri dev`).
  NotInBundle,
  /// The folder is not exactly `Econ Worksheet.app` (the normal case once renamed).
  NotOldName,
  /// Gatekeeper runs a quarantined download from a read-only random path.
  Translocated,
  /// A mounted disk image or external volume.
  OnMountedVolume,
  /// A rename of this very folder was tried once; never loop, never retry a failure.
  AlreadyAttempted,
  /// `Econ Studio.app` is already beside it: the teacher has both, leave them be.
  TargetExists,
  /// Renaming would need an administrator; never prompt for one.
  ParentNotWritable,
}

impl Skip {
  /// Worth a line in the log file: the old name is involved. The rest is every launch.
  pub fn worth_recording(self) -> bool {
    !matches!(self, Skip::NotInBundle | Skip::NotOldName)
  }
}

/// The side of the decision that touches the disk, so the rules stay testable.
pub trait Probe {
  fn exists(&self, path: &Path) -> bool;
  fn writable(&self, dir: &Path) -> bool;
  /// Whether a rename of `bundle` was tried before (the marker lists each path tried).
  fn attempted(&self, bundle: &Path) -> bool;
}

/// `X.app` for an executable at `X.app/Contents/MacOS/<binary>`.
pub fn bundle_of(exe: &Path) -> Option<&Path> {
  let macos = exe.parent()?;
  let contents = macos.parent()?;
  let bundle = contents.parent()?;
  let named = |p: &Path, n: &str| p.file_name().is_some_and(|f| f == n);
  let is_app = bundle.extension().is_some_and(|e| e == "app");
  (named(macos, "MacOS") && named(contents, "Contents") && is_app).then_some(bundle)
}

/// `exe` should be canonical, so `/Volumes/Macintosh HD/…` has become `/…`.
pub fn decide(exe: &Path, relaunched: bool, probe: &dyn Probe) -> Decision {
  if relaunched {
    return Decision::Skip(Skip::Relaunched);
  }
  let Some(bundle) = bundle_of(exe) else {
    return Decision::Skip(Skip::NotInBundle);
  };
  if bundle.file_name().map_or(true, |n| n != OLD_BUNDLE) {
    return Decision::Skip(Skip::NotOldName);
  }
  if bundle.components().any(|c| c == Component::Normal("AppTranslocation".as_ref())) {
    return Decision::Skip(Skip::Translocated);
  }
  if bundle.starts_with("/Volumes") {
    return Decision::Skip(Skip::OnMountedVolume);
  }
  if probe.attempted(bundle) {
    return Decision::Skip(Skip::AlreadyAttempted);
  }
  let Some(parent) = bundle.parent() else {
    return Decision::Skip(Skip::NotInBundle);
  };
  let to = parent.join(NEW_BUNDLE);
  if probe.exists(&to) {
    return Decision::Skip(Skip::TargetExists);
  }
  // A translocated or disk-image folder is read-only too, so this also backs up the two above.
  if !probe.writable(parent) {
    return Decision::Skip(Skip::ParentNotWritable);
  }
  Decision::Rename { from: bundle.to_path_buf(), to }
}

#[cfg(target_os = "macos")]
pub use run::rename_legacy_bundle;

#[cfg(target_os = "macos")]
mod run {
  use super::*;
  use std::ffi::CString;
  use std::fs;
  use std::io::Write;
  use std::os::unix::ffi::OsStrExt;
  use std::process::Command;

  /// Frozen with `identifier` in tauri.conf.json.
  const IDENTIFIER: &str = "hk.econworksheet.desktop";
  const MARKER: &str = "bundle-rename-attempted";
  const LOG: &str = "bundle-rename.log";

  fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
  }

  /// Beside the app data (`$APPDATA`), outside `worksheets/`: one bundle path per line, so
  /// a copy tried elsewhere (a test) never stops the one in Applications.
  fn marker_path() -> Option<PathBuf> {
    Some(home()?.join("Library/Application Support").join(IDENTIFIER).join(MARKER))
  }

  /// Stderr for a terminal launch, plus `~/Library/Logs/<identifier>/bundle-rename.log`.
  fn note(line: &str) {
    eprintln!("[bundle-rename] {line}");
    let Some(dir) = home().map(|h| h.join("Library/Logs").join(IDENTIFIER)) else {
      return;
    };
    let path = dir.join(LOG);
    let _ = fs::create_dir_all(&dir);
    // Starts over past 64 KB: a teacher who cannot rename logs one line a launch.
    if fs::metadata(&path).is_ok_and(|m| m.len() > 64 * 1024) {
      let _ = fs::remove_file(&path);
    }
    let secs = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_or(0, |d| d.as_secs());
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
      let _ = writeln!(f, "{secs} {line}");
    }
  }

  struct Disk;

  impl Probe for Disk {
    fn exists(&self, path: &Path) -> bool {
      // A dangling symlink by that name still blocks the rename.
      fs::symlink_metadata(path).is_ok()
    }
    fn writable(&self, dir: &Path) -> bool {
      extern "C" {
        fn access(path: *const std::ffi::c_char, mode: std::ffi::c_int) -> std::ffi::c_int;
      }
      const W_OK: std::ffi::c_int = 2;
      let Ok(c) = CString::new(dir.as_os_str().as_bytes()) else {
        return false;
      };
      // SAFETY: a valid NUL-terminated path; access() only reads it.
      unsafe { access(c.as_ptr(), W_OK) == 0 }
    }
    fn attempted(&self, bundle: &Path) -> bool {
      // No home, no marker to keep: treat as tried rather than risk a loop.
      let Some(m) = marker_path() else { return true };
      match fs::read_to_string(m) {
        Ok(text) => text.lines().any(|l| Path::new(l) == bundle),
        Err(e) => e.kind() != std::io::ErrorKind::NotFound,
      }
    }
  }

  fn mark_attempted(bundle: &Path) -> std::io::Result<()> {
    let m = marker_path().ok_or_else(|| std::io::Error::other("no HOME"))?;
    if let Some(dir) = m.parent() {
      fs::create_dir_all(dir)?;
    }
    let mut f = fs::OpenOptions::new().create(true).append(true).open(&m)?;
    writeln!(f, "{}", bundle.display())?;
    f.sync_all()
  }

  /// Call first thing in `run()`. Returns only when this process should carry on.
  pub fn rename_legacy_bundle() {
    let relaunched = std::env::args_os().any(|a| a == RELAUNCH_FLAG);
    let exe = match std::env::current_exe() {
      Ok(p) => fs::canonicalize(&p).unwrap_or(p),
      Err(e) => return note(&format!("skip: no executable path ({e})")),
    };
    let (from, to) = match decide(&exe, relaunched, &Disk) {
      Decision::Skip(reason) => {
        if reason.worth_recording() {
          note(&format!("skip: {reason:?} ({})", exe.display()));
        }
        return;
      }
      Decision::Rename { from, to } => (from, to),
    };
    // Recorded before the rename: whatever happens next, this is the only try.
    if let Err(e) = mark_attempted(&from) {
      return note(&format!("skip: cannot record the attempt ({e})"));
    }
    if let Err(e) = fs::rename(&from, &to) {
      return note(&format!("rename failed, keeping {} ({e})", from.display()));
    }
    // `-n`: this process still runs, and without it `open` would only activate it. A launch
    // through LaunchServices also registers the new path for Finder, Spotlight and the Dock.
    let opened = Command::new("/usr/bin/open")
      .arg("-n")
      .arg(&to)
      .arg("--args")
      .arg(RELAUNCH_FLAG)
      .status();
    match opened {
      Ok(s) if s.success() => {
        note(&format!("renamed to {}, relaunched", to.display()));
        std::process::exit(0);
      }
      other => {
        // This process's paths point at the old name; put it back so it runs as before.
        let why = match other {
          Ok(s) => format!("open exited {s}"),
          Err(e) => e.to_string(),
        };
        match fs::rename(&to, &from) {
          Ok(()) => note(&format!("relaunch failed ({why}); renamed back, carrying on")),
          Err(e) => note(&format!("relaunch failed ({why}); rename back failed ({e}), carrying on")),
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::Cell;

  struct Fake {
    exists: bool,
    writable: bool,
    /// The bundle path the marker already lists.
    attempted: Option<&'static str>,
    /// Which directory `writable` was asked about.
    asked: Cell<Option<PathBuf>>,
  }

  impl Fake {
    fn ok() -> Self {
      Fake { exists: false, writable: true, attempted: None, asked: Cell::new(None) }
    }
  }

  impl Probe for Fake {
    fn exists(&self, _: &Path) -> bool {
      self.exists
    }
    fn writable(&self, dir: &Path) -> bool {
      self.asked.set(Some(dir.to_path_buf()));
      self.writable
    }
    fn attempted(&self, bundle: &Path) -> bool {
      self.attempted.is_some_and(|a| Path::new(a) == bundle)
    }
  }

  const EXE: &str = "/Applications/Econ Worksheet.app/Contents/MacOS/econ-worksheet";

  fn skip(r: Skip) -> Decision {
    Decision::Skip(r)
  }

  #[test]
  fn renames_the_old_bundle_in_applications() {
    let f = Fake::ok();
    assert_eq!(
      decide(Path::new(EXE), false, &f),
      Decision::Rename {
        from: "/Applications/Econ Worksheet.app".into(),
        to: "/Applications/Econ Studio.app".into(),
      }
    );
    assert_eq!(f.asked.take(), Some(PathBuf::from("/Applications")));
  }

  #[test]
  fn any_writable_folder_will_do() {
    let exe = Path::new("/Users/t/Applications/Econ Worksheet.app/Contents/MacOS/econ-worksheet");
    assert_eq!(
      decide(exe, false, &Fake::ok()),
      Decision::Rename {
        from: "/Users/t/Applications/Econ Worksheet.app".into(),
        to: "/Users/t/Applications/Econ Studio.app".into(),
      }
    );
  }

  #[test]
  fn the_relaunch_never_tries_again() {
    assert_eq!(decide(Path::new(EXE), true, &Fake::ok()), skip(Skip::Relaunched));
  }

  #[test]
  fn outside_a_bundle_does_nothing() {
    let dev = Path::new("/repo/src-tauri/target/debug/econ-worksheet");
    assert_eq!(decide(dev, false, &Fake::ok()), skip(Skip::NotInBundle));
    let no_app = Path::new("/Applications/Econ Worksheet/Contents/MacOS/econ-worksheet");
    assert_eq!(decide(no_app, false, &Fake::ok()), skip(Skip::NotInBundle));
    let shallow = Path::new("/Contents/MacOS/econ-worksheet");
    assert_eq!(decide(shallow, false, &Fake::ok()), skip(Skip::NotInBundle));
  }

  #[test]
  fn only_the_exact_old_name() {
    for name in ["Econ Studio.app", "Econ Worksheet 2.app", "econ worksheet.app", "Econ Worksheet copy.app"] {
      let exe = PathBuf::from("/Applications").join(name).join("Contents/MacOS/econ-worksheet");
      assert_eq!(decide(&exe, false, &Fake::ok()), skip(Skip::NotOldName), "{name}");
    }
  }

  #[test]
  fn translocated_is_left_alone() {
    let exe = Path::new(
      "/private/var/folders/ab/cd/T/AppTranslocation/0A1B-2C3D/d/Econ Worksheet.app/Contents/MacOS/econ-worksheet",
    );
    assert_eq!(decide(exe, false, &Fake::ok()), skip(Skip::Translocated));
  }

  #[test]
  fn disk_images_and_volumes_are_left_alone() {
    let exe = Path::new("/Volumes/Econ Worksheet/Econ Worksheet.app/Contents/MacOS/econ-worksheet");
    assert_eq!(decide(exe, false, &Fake::ok()), skip(Skip::OnMountedVolume));
  }

  #[test]
  fn one_attempt_per_folder() {
    let f = Fake { attempted: Some("/Applications/Econ Worksheet.app"), ..Fake::ok() };
    assert_eq!(decide(Path::new(EXE), false, &f), skip(Skip::AlreadyAttempted));
    // A copy tried somewhere else (a test) does not stop the one in Applications.
    let elsewhere = Fake { attempted: Some("/tmp/x/Econ Worksheet.app"), ..Fake::ok() };
    assert!(matches!(decide(Path::new(EXE), false, &elsewhere), Decision::Rename { .. }));
  }

  #[test]
  fn both_copies_present_is_left_alone() {
    let f = Fake { exists: true, ..Fake::ok() };
    assert_eq!(decide(Path::new(EXE), false, &f), skip(Skip::TargetExists));
  }

  #[test]
  fn never_asks_for_an_administrator() {
    let f = Fake { writable: false, ..Fake::ok() };
    assert_eq!(decide(Path::new(EXE), false, &f), skip(Skip::ParentNotWritable));
  }

  #[test]
  fn routine_skips_stay_out_of_the_log() {
    assert!(!Skip::NotInBundle.worth_recording());
    assert!(!Skip::NotOldName.worth_recording());
    assert!(Skip::ParentNotWritable.worth_recording());
    assert!(Skip::Relaunched.worth_recording());
  }
}
