//! The cloud drive folders on this computer, for the Storage location setup step
//! (`docs/design/library-folder.md` § 1.2): where to start the folder picker, and whether to
//! say Google Drive needs its desktop app.
//!
//! Found from paths and environment alone: no network, no process, no prompt. A provider's
//! folder is checked for existence; only Google Drive's own drive root is listed (Windows).
//! On macOS a `~/Library/CloudStorage` folder counts only while its app is installed: an
//! uninstalled client leaves its folder behind. On Windows only fixed drives are touched.

use serde::Serialize;
use std::collections::HashSet;

const PROVIDERS: [Provider; 5] = [Provider::GoogleDrive, Provider::Onedrive, Provider::Icloud, Provider::Dropbox, Provider::Box];

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
  GoogleDrive,
  Onedrive,
  Icloud,
  Dropbox,
  Box,
}

impl Provider {
  fn id(self) -> &'static str {
    match self {
      Provider::GoogleDrive => "google-drive",
      Provider::Onedrive => "onedrive",
      Provider::Icloud => "icloud",
      Provider::Dropbox => "dropbox",
      Provider::Box => "box",
    }
  }

  /// Product names stay English in both languages.
  fn name(self) -> &'static str {
    match self {
      Provider::GoogleDrive => "Google Drive",
      Provider::Onedrive => "OneDrive",
      Provider::Icloud => "iCloud Drive",
      Provider::Dropbox => "Dropbox",
      Provider::Box => "Box",
    }
  }
}

/// One folder found. `id` is what `library_choose` takes as `start`: the provider's id, then
/// `onedrive-2` and so on for a second account. Page script never hands back the path.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CloudFolder {
  pub id: String,
  pub provider: Provider,
  pub label: String,
  pub path: String,
}

/// What detection may look at, so it runs over a fake in tests.
pub trait Machine {
  fn is_dir(&self, path: &str) -> bool;
  /// The names in a folder; empty when it will not list.
  fn entries(&self, path: &str) -> Vec<String>;
  fn env(&self, key: &str) -> Option<String>;
  /// Windows: the fixed drives as (`G:`, volume label). Removable and network drives are never
  /// touched: an empty card reader or a disconnected share can stall or raise a dialog.
  fn fixed_drives(&self) -> Vec<(String, String)>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
  Mac,
  Windows,
}

struct Found {
  provider: Provider,
  /// Tells two accounts of one provider apart: "Personal", an organisation, an email.
  qualifier: Option<String>,
  path: String,
}

/// `~/Library/CloudStorage` folder prefixes and the app that must be installed for each.
const MAC_STORAGE: [(&str, Provider, &str); 4] = [
  ("GoogleDrive", Provider::GoogleDrive, "Google Drive.app"),
  ("OneDrive", Provider::Onedrive, "OneDrive.app"),
  ("Dropbox", Provider::Dropbox, "Dropbox.app"),
  ("Box", Provider::Box, "Box.app"),
];

/// `OneDrive-Personal` → (OneDrive, Some("Personal")); `Dropbox` → (Dropbox, None).
fn storage_entry(name: &str) -> Option<(Provider, &'static str, Option<String>)> {
  // Synced SharePoint libraries, not the drive itself.
  if name.starts_with("OneDrive-SharedLibraries") {
    return None;
  }
  MAC_STORAGE.iter().find_map(|&(prefix, provider, app)| {
    let rest = name.strip_prefix(prefix)?;
    if rest.is_empty() {
      return Some((provider, app, None));
    }
    let rest = rest.strip_prefix('-')?;
    Some((provider, app, (!rest.is_empty()).then(|| rest.to_string())))
  })
}

/// `None`: every provider; `Some(p)`: only `p`'s checks run.
fn wanted(want: Option<Provider>, provider: Provider) -> bool {
  want.is_none() || want == Some(provider)
}

fn mac(m: &impl Machine, want: Option<Provider>) -> Vec<Found> {
  let mut found = Vec::new();
  let home = m.env("HOME");
  let storage_wanted = MAC_STORAGE.iter().any(|&(_, provider, _)| wanted(want, provider));
  if let Some(home) = home.as_ref().filter(|_| storage_wanted) {
    let storage = format!("{home}/Library/CloudStorage");
    let mut names = m.entries(&storage);
    names.sort();
    for name in names {
      let Some((provider, app, qualifier)) = storage_entry(&name) else { continue };
      if !wanted(want, provider) {
        continue;
      }
      let installed = m.is_dir(&format!("/Applications/{app}")) || m.is_dir(&format!("{home}/Applications/{app}"));
      let dir = format!("{storage}/{name}");
      if !installed || !m.is_dir(&dir) {
        continue;
      }
      let my_drive = format!("{dir}/My Drive");
      let path = if provider == Provider::GoogleDrive && m.is_dir(&my_drive) { my_drive } else { dir };
      found.push(Found { provider, qualifier, path });
    }
  }
  // Drive File Stream, before Google Drive moved into CloudStorage: mounted only while running.
  let legacy = "/Volumes/GoogleDrive/My Drive";
  if wanted(want, Provider::GoogleDrive) && m.is_dir(legacy) {
    found.push(Found { provider: Provider::GoogleDrive, qualifier: None, path: legacy.into() });
  }
  if let Some(home) = home.as_ref().filter(|_| wanted(want, Provider::Icloud)) {
    let icloud = format!("{home}/Library/Mobile Documents/com~apple~CloudDocs");
    if m.is_dir(&icloud) {
      found.push(Found { provider: Provider::Icloud, qualifier: None, path: icloud });
    }
  }
  found
}

fn base_name(path: &str) -> &str {
  path.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(path)
}

/// Drive for desktop's own drive: `My Drive`, else its one visible folder (My Drive in the
/// system's language: 我的雲端硬碟…), else the root (Shared drives beside it).
fn google_drive_start(m: &impl Machine, drive: &str) -> String {
  let root = format!("{drive}\\");
  let my_drive = format!("{root}My Drive");
  if m.is_dir(&my_drive) {
    return my_drive;
  }
  let visible: Vec<String> = m
    .entries(&root)
    .into_iter()
    .filter(|n| !n.starts_with(['.', '$']) && n != "System Volume Information")
    .map(|n| format!("{root}{n}"))
    .filter(|path| m.is_dir(path))
    .collect();
  match <[String; 1]>::try_from(visible) {
    Ok([only]) => only,
    Err(_) => root,
  }
}

fn windows(m: &impl Machine, want: Option<Provider>) -> Vec<Found> {
  let mut found = Vec::new();
  let mut add = |provider, qualifier: Option<String>, path: String| {
    if wanted(want, provider) && m.is_dir(&path) {
      found.push(Found { provider, qualifier, path });
    }
  };
  // Google Drive for desktop mounts a fixed drive labelled Google Drive (G: by default; the
  // label is not translated, My Drive is). Mirroring uses a folder instead.
  if wanted(want, Provider::GoogleDrive) {
    for (drive, label) in m.fixed_drives() {
      let path = if label == "Google Drive" { google_drive_start(m, &drive) } else { format!("{drive}\\My Drive") };
      add(Provider::GoogleDrive, Some(drive), path);
    }
  }
  let profile = m.env("USERPROFILE");
  if let Some(profile) = &profile {
    add(Provider::GoogleDrive, None, format!("{profile}\\My Drive"));
    add(Provider::GoogleDrive, None, format!("{profile}\\Google Drive"));
  }
  if let Some(path) = m.env("OneDriveCommercial") {
    let qualifier = base_name(&path).strip_prefix("OneDrive - ").map(str::to_string);
    add(Provider::Onedrive, qualifier, path);
  }
  if let Some(path) = m.env("OneDriveConsumer") {
    add(Provider::Onedrive, Some("Personal".into()), path);
  }
  if let Some(path) = m.env("OneDrive") {
    add(Provider::Onedrive, None, path);
  }
  if let Some(profile) = &profile {
    add(Provider::Icloud, None, format!("{profile}\\iCloudDrive"));
    add(Provider::Dropbox, None, format!("{profile}\\Dropbox"));
    add(Provider::Box, None, format!("{profile}\\Box"));
  }
  found
}

/// The folders `m` holds, in a fixed provider order, one entry per folder.
pub fn detect(os: Os, m: &impl Machine) -> Vec<CloudFolder> {
  detect_some(os, m, None)
}

/// The folder `id` names (`onedrive-2`…), found again running only its provider's checks.
pub fn find(os: Os, m: &impl Machine, id: &str) -> Option<CloudFolder> {
  let provider = PROVIDERS.into_iter().find(|p| {
    id == p.id() || id.strip_prefix(p.id()).and_then(|n| n.strip_prefix('-')).is_some_and(|n| n.parse::<u8>().is_ok())
  })?;
  detect_some(os, m, Some(provider)).into_iter().find(|f| f.id == id)
}

fn detect_some(os: Os, m: &impl Machine, want: Option<Provider>) -> Vec<CloudFolder> {
  let found = match os {
    Os::Mac => mac(m, want),
    Os::Windows => windows(m, want),
  };
  // Windows paths compare without case; `%OneDrive%` repeats one of the other two.
  let key = |path: &str| {
    let path = path.trim_end_matches(['\\', '/']);
    if os == Os::Windows { path.to_lowercase() } else { path.to_string() }
  };
  let mut seen = HashSet::new();
  let mut found: Vec<Found> = found.into_iter().filter(|f| seen.insert(key(&f.path))).collect();
  found.sort_by_key(|f| f.provider);

  let mut folders = Vec::with_capacity(found.len());
  for (index, f) in found.iter().enumerate() {
    let same = found.iter().filter(|g| g.provider == f.provider).count();
    let nth = found[..index].iter().filter(|g| g.provider == f.provider).count() + 1;
    let id = if nth == 1 { f.provider.id().to_string() } else { format!("{}-{nth}", f.provider.id()) };
    let label = match (&f.qualifier, same > 1) {
      (Some(q), true) => format!("{} ({q})", f.provider.name()),
      _ => f.provider.name().to_string(),
    };
    folders.push(CloudFolder { id, provider: f.provider, label, path: f.path.clone() });
  }
  folders
}

struct RealMachine;

impl Machine for RealMachine {
  fn is_dir(&self, path: &str) -> bool {
    std::fs::metadata(path).is_ok_and(|meta| meta.is_dir())
  }

  fn entries(&self, path: &str) -> Vec<String> {
    std::fs::read_dir(path)
      .map(|dir| dir.flatten().filter_map(|e| e.file_name().into_string().ok()).collect())
      .unwrap_or_default()
  }

  fn env(&self, key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
  }

  fn fixed_drives(&self) -> Vec<(String, String)> {
    #[cfg(windows)]
    return win::fixed_drives();
    #[cfg(not(windows))]
    Vec::new()
  }
}

/// `f` on this computer; `None` on a platform the app does not ship for.
fn on_this_computer<T>(f: impl FnOnce(Os, &RealMachine) -> T) -> Option<T> {
  let os = if cfg!(target_os = "macos") {
    Os::Mac
  } else if cfg!(windows) {
    Os::Windows
  } else {
    return None;
  };
  #[cfg(windows)]
  let _quiet = win::QuietErrors::new();
  Some(f(os, &RealMachine))
}

/// This computer's cloud folders.
pub fn this_computer() -> Vec<CloudFolder> {
  on_this_computer(detect).unwrap_or_default()
}

/// The one folder a `CloudFolder.id` names on this computer.
pub fn this_computers(id: &str) -> Option<CloudFolder> {
  on_this_computer(|os, m| find(os, m, id)).flatten()
}

/// The only Windows calls here, kept small: what they return is decided on above, under test.
#[cfg(windows)]
mod win {
  use windows::core::PCWSTR;
  use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW};
  use windows::Win32::System::Diagnostics::Debug::{SetThreadErrorMode, SEM_FAILCRITICALERRORS, THREAD_ERROR_MODE};

  /// `DRIVE_FIXED` (in WindowsProgramming, a feature not otherwise needed).
  const DRIVE_FIXED: u32 = 3;

  /// While alive, a drive with no media fails at once on this thread instead of asking.
  pub struct QuietErrors(THREAD_ERROR_MODE);

  impl QuietErrors {
    pub fn new() -> Self {
      let mut old = THREAD_ERROR_MODE(0);
      // SAFETY: plain values; `old` outlives the call.
      let _ = unsafe { SetThreadErrorMode(SEM_FAILCRITICALERRORS, Some(&mut old as *mut _)) };
      QuietErrors(old)
    }
  }

  impl Drop for QuietErrors {
    fn drop(&mut self) {
      // SAFETY: restores the mode saved above.
      let _ = unsafe { SetThreadErrorMode(self.0, None) };
    }
  }

  pub fn fixed_drives() -> Vec<(String, String)> {
    // SAFETY: no arguments.
    let mask = unsafe { GetLogicalDrives() };
    let mut drives = Vec::new();
    for (bit, letter) in ('A'..='Z').enumerate() {
      if mask & (1 << bit) == 0 {
        continue;
      }
      let root: Vec<u16> = format!("{letter}:\\").encode_utf16().chain([0]).collect();
      // SAFETY: `root` is NUL-terminated and outlives the call.
      if unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) } != DRIVE_FIXED {
        continue;
      }
      let mut label = [0u16; 261];
      // SAFETY: as above; the label buffer's length is passed with it.
      let read = unsafe { GetVolumeInformationW(PCWSTR(root.as_ptr()), Some(&mut label), None, None, None, None) };
      let len = label.iter().position(|&c| c == 0).unwrap_or(label.len());
      let label = if read.is_ok() { String::from_utf16_lossy(&label[..len]) } else { String::new() };
      drives.push((format!("{letter}:"), label));
    }
    drives
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::Cell;
  use std::collections::HashMap;

  #[derive(Default)]
  struct Fake {
    dirs: HashSet<String>,
    env: HashMap<String, String>,
    drives: Vec<(String, String)>,
    drives_asked: Cell<bool>,
    sep: char,
  }

  impl Fake {
    fn mac(dirs: &[&str]) -> Self {
      let mut fake = Fake { sep: '/', ..Default::default() };
      fake.env.insert("HOME".into(), "/Users/t".into());
      fake.dirs.extend(dirs.iter().map(|d| d.to_string()));
      fake
    }

    fn windows(dirs: &[&str], env: &[(&str, &str)]) -> Self {
      let mut fake = Fake { sep: '\\', ..Default::default() };
      fake.env.insert("USERPROFILE".into(), r"C:\Users\t".into());
      fake.env.extend(env.iter().map(|(k, v)| (k.to_string(), v.to_string())));
      fake.dirs.extend(dirs.iter().map(|d| d.to_string()));
      fake.drives.push(("C:".into(), "Windows".into()));
      fake
    }

    fn drive(mut self, letter: &str, label: &str) -> Self {
      self.drives.push((letter.into(), label.into()));
      self
    }
  }

  impl Machine for Fake {
    fn is_dir(&self, path: &str) -> bool {
      self.dirs.contains(path)
    }

    fn entries(&self, path: &str) -> Vec<String> {
      let prefix = format!("{}{}", path.trim_end_matches(self.sep), self.sep);
      let names: HashSet<String> = self
        .dirs
        .iter()
        .filter_map(|d| d.strip_prefix(&prefix))
        .map(|rest| rest.split(self.sep).next().unwrap_or(rest).to_string())
        .collect();
      names.into_iter().collect()
    }

    fn env(&self, key: &str) -> Option<String> {
      self.env.get(key).cloned()
    }

    fn fixed_drives(&self) -> Vec<(String, String)> {
      self.drives_asked.set(true);
      self.drives.clone()
    }
  }

  fn summary(folders: &[CloudFolder]) -> Vec<(String, String, String)> {
    folders.iter().map(|f| (f.id.clone(), f.label.clone(), f.path.clone())).collect()
  }

  fn row(id: &str, label: &str, path: &str) -> (String, String, String) {
    (id.into(), label.into(), path.into())
  }

  #[test]
  fn mac_onedrive_and_icloud_found_a_leftover_dropbox_folder_is_not() {
    let fake = Fake::mac(&[
      "/Users/t/Library/CloudStorage/OneDrive-TheChineseUniversityofHongKong",
      "/Users/t/Library/CloudStorage/Dropbox",
      "/Users/t/Library/Mobile Documents/com~apple~CloudDocs",
      "/Applications/OneDrive.app",
    ]);
    assert_eq!(
      summary(&detect(Os::Mac, &fake)),
      vec![
        row("onedrive", "OneDrive", "/Users/t/Library/CloudStorage/OneDrive-TheChineseUniversityofHongKong"),
        row("icloud", "iCloud Drive", "/Users/t/Library/Mobile Documents/com~apple~CloudDocs"),
      ]
    );
  }

  #[test]
  fn mac_google_drive_opens_at_my_drive_and_two_accounts_are_told_apart() {
    let fake = Fake::mac(&[
      "/Users/t/Library/CloudStorage/GoogleDrive-a@school.edu.hk",
      "/Users/t/Library/CloudStorage/GoogleDrive-a@school.edu.hk/My Drive",
      "/Users/t/Library/CloudStorage/OneDrive-Personal",
      "/Users/t/Library/CloudStorage/OneDrive-School",
      "/Users/t/Library/CloudStorage/OneDrive-SharedLibraries-School",
      "/Users/t/Library/CloudStorage/Box-Box",
      "/Users/t/Applications/Google Drive.app",
      "/Applications/OneDrive.app",
    ]);
    assert_eq!(
      summary(&detect(Os::Mac, &fake)),
      vec![
        row("google-drive", "Google Drive", "/Users/t/Library/CloudStorage/GoogleDrive-a@school.edu.hk/My Drive"),
        row("onedrive", "OneDrive (Personal)", "/Users/t/Library/CloudStorage/OneDrive-Personal"),
        row("onedrive-2", "OneDrive (School)", "/Users/t/Library/CloudStorage/OneDrive-School"),
      ]
    );
  }

  #[test]
  fn mac_the_old_google_drive_volume_and_nothing_at_all() {
    let fake = Fake::mac(&["/Volumes/GoogleDrive/My Drive"]);
    assert_eq!(summary(&detect(Os::Mac, &fake)), vec![row("google-drive", "Google Drive", "/Volumes/GoogleDrive/My Drive")]);
    assert!(detect(Os::Mac, &Fake::mac(&[])).is_empty());
    // No HOME: only what needs none.
    let mut bare = Fake::mac(&["/Users/t/Library/Mobile Documents/com~apple~CloudDocs"]);
    bare.env.clear();
    assert!(detect(Os::Mac, &bare).is_empty());
  }

  #[test]
  fn windows_a_drive_letter_onedrive_twice_named_once_and_the_profile_folders() {
    let fake = Fake::windows(
      &[
        r"G:\My Drive",
        r"C:\Users\t\OneDrive",
        r"C:\Users\t\OneDrive - The Chinese University of Hong Kong",
        r"C:\Users\t\iCloudDrive",
        r"C:\Users\t\Dropbox",
      ],
      &[
        ("OneDrive", r"C:\Users\t\onedrive\"),
        ("OneDriveConsumer", r"C:\Users\t\OneDrive"),
        ("OneDriveCommercial", r"C:\Users\t\OneDrive - The Chinese University of Hong Kong"),
      ],
    )
    .drive("G:", "Google Drive");
    let mut fake = fake;
    // `%OneDrive%` as Windows may spell it: other case, a trailing separator.
    fake.dirs.insert(r"C:\Users\t\onedrive\".into());
    assert_eq!(
      summary(&detect(Os::Windows, &fake)),
      vec![
        row("google-drive", "Google Drive", r"G:\My Drive"),
        row(
          "onedrive",
          "OneDrive (The Chinese University of Hong Kong)",
          r"C:\Users\t\OneDrive - The Chinese University of Hong Kong"
        ),
        row("onedrive-2", "OneDrive (Personal)", r"C:\Users\t\OneDrive"),
        row("icloud", "iCloud Drive", r"C:\Users\t\iCloudDrive"),
        row("dropbox", "Dropbox", r"C:\Users\t\Dropbox"),
      ]
    );
  }

  #[test]
  fn windows_mirrored_google_drive_and_a_onedrive_variable_with_no_folder() {
    let fake = Fake::windows(&[r"C:\Users\t\My Drive"], &[("OneDrive", r"C:\Users\t\OneDrive")]);
    assert_eq!(summary(&detect(Os::Windows, &fake)), vec![row("google-drive", "Google Drive", r"C:\Users\t\My Drive")]);
    assert!(detect(Os::Windows, &Fake::windows(&[], &[])).is_empty());
  }

  #[test]
  fn windows_google_drive_is_found_by_its_label_in_any_language() {
    // 繁體中文 Windows: My Drive is 我的雲端硬碟, hidden folders beside it.
    let zh = Fake::windows(&[r"H:\我的雲端硬碟", r"H:\.shortcut-targets-by-id", r"H:\$RECYCLE.BIN"], &[]).drive("H:", "Google Drive");
    assert_eq!(summary(&detect(Os::Windows, &zh)), vec![row("google-drive", "Google Drive", r"H:\我的雲端硬碟")]);
    // Shared drives beside it: open at the drive itself.
    let shared = Fake::windows(&[r"G:\", r"G:\我的雲端硬碟", r"G:\共用雲端硬碟"], &[]).drive("G:", "Google Drive");
    assert_eq!(summary(&detect(Os::Windows, &shared)), vec![row("google-drive", "Google Drive", r"G:\")]);
    // Another label still counts with a My Drive folder; a drive that is not fixed is never probed.
    let other = Fake::windows(&[r"D:\My Drive", r"E:\My Drive"], &[]).drive("D:", "Data");
    assert_eq!(summary(&detect(Os::Windows, &other)), vec![row("google-drive", "Google Drive", r"D:\My Drive")]);
  }

  #[test]
  fn find_runs_only_the_named_providers_checks() {
    let fake = Fake::windows(&[r"G:\My Drive", r"C:\Users\t\OneDrive", r"C:\Users\t\OneDrive - School"], &[
      ("OneDriveConsumer", r"C:\Users\t\OneDrive"),
      ("OneDriveCommercial", r"C:\Users\t\OneDrive - School"),
    ])
    .drive("G:", "Google Drive");
    let second = find(Os::Windows, &fake, "onedrive-2").unwrap();
    assert_eq!((second.label.as_str(), second.path.as_str()), ("OneDrive (Personal)", r"C:\Users\t\OneDrive"));
    assert!(!fake.drives_asked.get(), "a OneDrive id must not touch the drives");
    assert_eq!(find(Os::Windows, &fake, "google-drive").unwrap().path, r"G:\My Drive");
    assert!(fake.drives_asked.get());
    for unknown in ["onedrive-3", "dropbox", "", "onedrive-x", "C:\\Users"] {
      assert_eq!(find(Os::Windows, &fake, unknown), None, "{unknown:?}");
    }
    let mac = Fake::mac(&["/Users/t/Library/Mobile Documents/com~apple~CloudDocs"]);
    assert_eq!(find(Os::Mac, &mac, "icloud").unwrap().path, "/Users/t/Library/Mobile Documents/com~apple~CloudDocs");
  }

  #[test]
  fn serialises_as_the_bridge_expects() {
    let folder = CloudFolder { id: "google-drive".into(), provider: Provider::GoogleDrive, label: "Google Drive".into(), path: "/p".into() };
    assert_eq!(
      serde_json::to_string(&folder).unwrap(),
      r#"{"id":"google-drive","provider":"google-drive","label":"Google Drive","path":"/p"}"#
    );
    assert_eq!(serde_json::to_string(&Provider::Onedrive).unwrap(), r#""onedrive""#);
    assert_eq!(serde_json::to_string(&Provider::Icloud).unwrap(), r#""icloud""#);
  }

  /// `cargo test this_computer -- --ignored --nocapture`: what this machine holds.
  #[test]
  #[ignore]
  fn this_computer_prints_what_it_finds() {
    println!("{:#?}", this_computer());
  }
}
