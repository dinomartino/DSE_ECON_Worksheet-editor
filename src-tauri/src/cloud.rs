//! The cloud drive folders on this computer, for the Storage location setup step
//! (`docs/design/library-folder.md` § 1.2): where to start the folder picker, and whether to
//! say Google Drive needs its desktop app.
//!
//! Found from paths and environment alone: no network, no process, no prompt. A provider's
//! folder is checked for existence, never listed. On macOS a `~/Library/CloudStorage` folder
//! counts only while its app is installed: an uninstalled client leaves its folder behind.

use serde::Serialize;
use std::collections::HashSet;

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

fn mac(m: &impl Machine) -> Vec<Found> {
  let mut found = Vec::new();
  let home = m.env("HOME");
  if let Some(home) = &home {
    let storage = format!("{home}/Library/CloudStorage");
    let mut names = m.entries(&storage);
    names.sort();
    for name in names {
      let Some((provider, app, qualifier)) = storage_entry(&name) else { continue };
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
  if m.is_dir(legacy) {
    found.push(Found { provider: Provider::GoogleDrive, qualifier: None, path: legacy.into() });
  }
  if let Some(home) = &home {
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

fn windows(m: &impl Machine) -> Vec<Found> {
  let mut found = Vec::new();
  let mut add = |provider, qualifier: Option<String>, path: String| {
    if m.is_dir(&path) {
      found.push(Found { provider, qualifier, path });
    }
  };
  // Google Drive for desktop mounts a drive (G: by default); mirroring uses a folder instead.
  for letter in 'C'..='Z' {
    add(Provider::GoogleDrive, Some(format!("{letter}:")), format!("{letter}:\\My Drive"));
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
  let found = match os {
    Os::Mac => mac(m),
    Os::Windows => windows(m),
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
}

/// This computer's cloud folders; none on a platform the app does not ship for.
pub fn this_computer() -> Vec<CloudFolder> {
  if cfg!(target_os = "macos") {
    detect(Os::Mac, &RealMachine)
  } else if cfg!(target_os = "windows") {
    detect(Os::Windows, &RealMachine)
  } else {
    Vec::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::HashMap;

  #[derive(Default)]
  struct Fake {
    dirs: HashSet<String>,
    env: HashMap<String, String>,
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
      fake
    }
  }

  impl Machine for Fake {
    fn is_dir(&self, path: &str) -> bool {
      self.dirs.contains(path)
    }

    fn entries(&self, path: &str) -> Vec<String> {
      let prefix = format!("{path}{}", self.sep);
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
    );
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
