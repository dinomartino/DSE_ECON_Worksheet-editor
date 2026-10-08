//! The library folder: a cloud-synced folder the sync engine mirrors the local library to
//! (`docs/design/sync-engine.md`; commands per `docs/design/library-folder.md` § 4).
//!
//! - Page script never names an absolute path. The root comes from a native folder picker run
//!   here and is kept in `$APPDATA/library-location.json`, which only this module writes (the
//!   capability denies that file to plugin-fs). Every other path is relative to the root, and
//!   must stay inside it after symlinks are resolved.
//! - A root that is missing, not a folder, without the marker, or with a newer marker is
//!   `unavailable`: never an empty listing, which would read as "the cloud copy was emptied".
//! - Writes and removes are compare-and-swap on the SHA-256 of the file's bytes. A write is a
//!   temp file beside the target, fsync, rename; identical bytes are not written at all.
//! - A file that will not read (a cloud placeholder, no permission) is listed, never dropped.
//! - The watcher only says *when* to look; the listing is the truth.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const LOCATION_FILE: &str = "library-location.json";
pub const MARKER: &str = "econ-studio-library.json";
pub const LIBRARY_DIR: &str = "Econ Studio";
/// The marker's `format` this build reads and writes. A higher one is a newer build's library.
pub const LIBRARY_FORMAT: u64 = 1;
pub const CHANGED_EVENT: &str = "library-changed";

/// This app's temp files: `.<name>.econ-<hex>.tmp`.
const TEMP_TAG: &str = ".econ-";
const STALE_TEMP: Duration = Duration::from_secs(24 * 60 * 60);
/// A file modified this recently may change again within the same mtime tick: never cached.
const RACY: Duration = Duration::from_secs(2);
const MAX_DEPTH: usize = 8;
/// About one second in all, for a file a cloud client or antivirus holds open (Windows).
const RETRY_MS: [u64; 5] = [50, 100, 200, 300, 350];

// ---------------------------------------------------------------------------------------
// Results, as page script sees them (`src/platform/library.ts`).

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
  /// No folder chosen on this computer.
  NoLocation,
  RootMissing,
  NotAFolder,
  /// No `econ-studio-library.json`, or one that will not parse.
  NoMarker,
  /// The marker's format is above this build's: a newer build's library, never written here.
  NewerFormat,
  Io,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FileState {
  Ok,
  /// Content not on this computer yet (evicted to the cloud): not hashed, so as not to force a
  /// download per listing. Reading it downloads it.
  Placeholder,
  /// Could not be read (permission, a provider error). Retried every listing.
  Unreadable,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
  /// Relative to the root, `/`-separated.
  pub path: String,
  pub size: u64,
  pub mtime_ms: u64,
  /// SHA-256 of the bytes, lowercase hex; `None` unless `state` is `ok`.
  pub hash: Option<String>,
  pub state: FileState,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum ListResult {
  Ok { files: Vec<FileEntry> },
  Unavailable { reason: Reason },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum ReadResult {
  Ok { text: String, hash: String },
  Missing,
  /// Present but will not read, or not UTF-8: held by the engine, never read as deleted.
  Unreadable,
  Unavailable { reason: Reason },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum WriteResult {
  Ok { hash: String },
  /// The file is not what `expect` said; nothing was written.
  Conflict,
  Unavailable { reason: Reason },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum RemoveResult {
  Ok,
  Missing,
  Conflict,
  Unavailable { reason: Reason },
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LocationStatus {
  None,
  Ok,
  Unavailable,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Location {
  /// Random, made once per computer.
  pub device_id: String,
  pub root: Option<String>,
  pub status: LocationStatus,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<Reason>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum ChooseResult {
  Chosen { root: String },
  Cancelled,
  /// Nothing was created or saved.
  Refused { reason: Refusal },
}

/// Why a picked folder is not used (`docs/design/library-folder.md` § 1.2).
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Refusal {
  /// This app's own data folder, or one inside it.
  AppData,
  /// The home folder itself.
  Home,
  /// A drive or volume root.
  DriveRoot,
  /// Inside another library, which would list this one's marker as a document.
  InsideLibrary,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum WatchResult {
  Ok { session: u64 },
  Unavailable { reason: Reason },
}

/// The `library-changed` payload. `rescan`: events may have been lost; list everything.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Changed {
  pub session: u64,
  pub paths: Vec<String>,
  pub rescan: bool,
}

// ---------------------------------------------------------------------------------------
// The root and paths.

pub fn hash_bytes(bytes: &[u8]) -> String {
  Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// The canonical root, if it is a library this build may use.
pub fn open_root(root: &Path) -> Result<PathBuf, Reason> {
  let meta = match fs::metadata(root) {
    Ok(meta) => meta,
    Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(Reason::RootMissing),
    Err(_) => return Err(Reason::Io),
  };
  if !meta.is_dir() {
    return Err(Reason::NotAFolder);
  }
  let root = fs::canonicalize(root).map_err(|_| Reason::Io)?;
  let text = match fs::read_to_string(root.join(MARKER)) {
    Ok(text) => text,
    Err(e) if e.kind() == io::ErrorKind::NotFound => return Err(Reason::NoMarker),
    Err(_) => return Err(Reason::Io),
  };
  let format = serde_json::from_str::<serde_json::Value>(&text)
    .ok()
    .and_then(|v| v.get("format").and_then(serde_json::Value::as_u64))
    .ok_or(Reason::NoMarker)?;
  if format > LIBRARY_FORMAT {
    return Err(Reason::NewerFormat);
  }
  Ok(root)
}

/// A name a key may hold: no dot-names, separators, drive or stream colons, or names Windows
/// would silently change (a trailing dot or space).
fn valid_component(name: &str) -> bool {
  !name.is_empty()
    && !name.starts_with('.')
    && !name.ends_with('.')
    && !name.ends_with(' ')
    && !name.chars().any(|c| c == '\\' || c == ':' || c.is_control())
}

/// `rel` split into names, or `None` when it is not a path page script may use.
fn relative_parts(rel: &str) -> Option<Vec<&str>> {
  if rel.is_empty() || rel.len() > 1024 || rel.starts_with('/') {
    return None;
  }
  let parts: Vec<&str> = rel.split('/').collect();
  if parts.len() > MAX_DEPTH || !parts.iter().all(|p| valid_component(p)) {
    return None;
  }
  let last = parts.last()?;
  if last.ends_with(".tmp") || (parts.len() == 1 && *last == MARKER) {
    return None;
  }
  Some(parts)
}

/// `root/rel`, refused unless relative and, after symlinks, inside the (canonical) root.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
  let parts = relative_parts(rel).ok_or_else(|| format!("not a library path: {rel:?}"))?;
  let mut path = root.to_path_buf();
  path.extend(&parts);
  // The nearest part that exists decides: everything below it is created by us, as folders.
  let mut probe = path.as_path();
  loop {
    if fs::symlink_metadata(probe).is_ok() {
      let real = fs::canonicalize(probe).map_err(|_| format!("outside the library: {rel:?}"))?;
      if !real.starts_with(root) {
        return Err(format!("outside the library: {rel:?}"));
      }
      return Ok(path);
    }
    probe = probe.parent().filter(|p| p.starts_with(root)).ok_or_else(|| format!("outside the library: {rel:?}"))?;
  }
}

/// `.<name>.icloud` (an evicted iCloud file on older macOS) stands for `<name>`.
fn icloud_stub_target(name: &str) -> Option<&str> {
  name.strip_prefix('.')?.strip_suffix(".icloud").filter(|n| !n.is_empty())
}

fn icloud_stub_exists(path: &Path) -> bool {
  let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else {
    return false;
  };
  dir.join(format!(".{name}.icloud")).is_file()
}

fn is_own_temp(name: &str) -> bool {
  name.starts_with('.') && name.ends_with(".tmp") && name.contains(TEMP_TAG)
}

fn mtime(meta: &fs::Metadata) -> SystemTime {
  meta.modified().unwrap_or(UNIX_EPOCH)
}

fn millis(time: SystemTime) -> u64 {
  time.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Content not on this computer: reading it would download it.
#[cfg(target_os = "macos")]
fn is_dataless(meta: &fs::Metadata) -> bool {
  use std::os::macos::fs::MetadataExt;
  const SF_DATALESS: u32 = 0x4000_0000;
  meta.st_flags() & SF_DATALESS != 0
}

#[cfg(windows)]
fn is_dataless(meta: &fs::Metadata) -> bool {
  use std::os::windows::fs::MetadataExt;
  const OFFLINE: u32 = 0x0000_1000;
  const RECALL_ON_OPEN: u32 = 0x0004_0000;
  const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
  meta.file_attributes() & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0
}

#[cfg(not(any(target_os = "macos", windows)))]
fn is_dataless(_meta: &fs::Metadata) -> bool {
  false
}

// ---------------------------------------------------------------------------------------
// The hash cache: an unchanged folder is listed without reading a file.

#[derive(Default)]
pub struct HashCache {
  map: Mutex<HashMap<PathBuf, (u64, SystemTime, String)>>,
}

impl HashCache {
  fn get(&self, path: &Path, meta: &fs::Metadata) -> Option<String> {
    let map = self.map.lock().ok()?;
    let (size, time, hash) = map.get(path)?;
    (*size == meta.len() && *time == mtime(meta)).then(|| hash.clone())
  }

  /// Remembers `hash` for bytes read after `before` was taken, keyed on `before`: only if the
  /// file still has its size and mtime (a cloud client may replace it mid-read, with the other
  /// computer's older mtime), and not if it changed too recently to trust.
  fn put(&self, path: &Path, before: &fs::Metadata, hash: &str) {
    let held = fs::metadata(path).is_ok_and(|after| after.len() == before.len() && mtime(&after) == mtime(before));
    let time = mtime(before);
    let settled = SystemTime::now().duration_since(time).map(|age| age >= RACY).unwrap_or(false);
    if let Ok(mut map) = self.map.lock() {
      if held && settled {
        map.insert(path.to_path_buf(), (before.len(), time, hash.to_string()));
      } else {
        map.remove(path);
      }
    }
  }

  fn forget(&self, path: &Path) {
    if let Ok(mut map) = self.map.lock() {
      map.remove(path);
    }
  }
}

// ---------------------------------------------------------------------------------------
// The operations, on a canonical root (from `open_root`).

/// Every `*.json` under the root except the marker, sorted. `clean_temps`: also remove this
/// app's temp files older than a day (done once per root per launch).
pub fn list(root: &Path, cache: &HashCache, clean_temps: bool) -> Result<Vec<FileEntry>, Reason> {
  let mut found = BTreeMap::new();
  walk(root, "", 0, cache, clean_temps, &mut found)?;
  Ok(found.into_values().collect())
}

fn walk(
  dir: &Path,
  prefix: &str,
  depth: usize,
  cache: &HashCache,
  clean_temps: bool,
  found: &mut BTreeMap<String, FileEntry>,
) -> Result<(), Reason> {
  // A folder that will not list fails the whole listing: its files must not read as deleted.
  // One removed since its parent was listed is gone with its files: skipped.
  let entries = match fs::read_dir(dir) {
    Ok(entries) => entries,
    Err(e) if depth > 0 && e.kind() == io::ErrorKind::NotFound => return Ok(()),
    Err(_) => return Err(Reason::Io),
  };
  for entry in entries {
    let entry = entry.map_err(|_| Reason::Io)?;
    let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
    let path = entry.path();
    let meta = match fs::symlink_metadata(&path) {
      Ok(meta) => meta,
      Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
      Err(_) => return Err(Reason::Io),
    };
    let join = |name: &str| if prefix.is_empty() { name.to_string() } else { format!("{prefix}/{name}") };
    if meta.file_type().is_symlink() {
      continue;
    }
    if meta.is_dir() {
      if valid_component(&name) && depth + 1 < MAX_DEPTH {
        walk(&path, &join(&name), depth + 1, cache, clean_temps, found)?;
      }
      continue;
    }
    if !meta.is_file() {
      continue;
    }
    if let Some(real) = icloud_stub_target(&name) {
      let rel = join(real);
      if real.ends_with(".json") && relative_parts(&rel).is_some() && !found.contains_key(&rel) {
        let entry = FileEntry { path: rel.clone(), size: 0, mtime_ms: millis(mtime(&meta)), hash: None, state: FileState::Placeholder };
        found.insert(rel, entry);
      }
      continue;
    }
    if name.starts_with('.') {
      let stale = SystemTime::now().duration_since(mtime(&meta)).map(|age| age > STALE_TEMP).unwrap_or(false);
      if clean_temps && is_own_temp(&name) && stale {
        let _ = fs::remove_file(&path);
      }
      continue;
    }
    let rel = join(&name);
    if !name.ends_with(".json") || relative_parts(&rel).is_none() {
      continue;
    }
    let (hash, state) = match cache.get(&path, &meta) {
      Some(hash) => (Some(hash), FileState::Ok),
      None if is_dataless(&meta) => (None, FileState::Placeholder),
      None => match fs::read(&path) {
        Ok(bytes) => {
          let hash = hash_bytes(&bytes);
          cache.put(&path, &meta, &hash);
          (Some(hash), FileState::Ok)
        }
        Err(_) => (None, FileState::Unreadable),
      },
    };
    // A real file wins over its own iCloud stub.
    found.insert(rel.clone(), FileEntry { path: rel, size: meta.len(), mtime_ms: millis(mtime(&meta)), hash, state });
  }
  Ok(())
}

pub fn read(root: &Path, rel: &str, cache: &HashCache) -> Result<ReadResult, String> {
  let path = resolve(root, rel)?;
  let before = fs::metadata(&path);
  Ok(match fs::read(&path) {
    Ok(bytes) => {
      let hash = hash_bytes(&bytes);
      if let Ok(before) = &before {
        cache.put(&path, before, &hash);
      }
      match String::from_utf8(bytes) {
        Ok(text) => ReadResult::Ok { text, hash },
        Err(_) => ReadResult::Unreadable,
      }
    }
    Err(e) if e.kind() == io::ErrorKind::NotFound && !icloud_stub_exists(&path) => ReadResult::Missing,
    Err(_) => ReadResult::Unreadable,
  })
}

enum Current {
  Absent,
  Present(String),
  /// Never matches an expectation: nothing is written over what could not be read.
  Unreadable,
}

fn current(path: &Path) -> Current {
  match fs::read(path) {
    Ok(bytes) => Current::Present(hash_bytes(&bytes)),
    Err(e) if e.kind() == io::ErrorKind::NotFound && !icloud_stub_exists(path) => Current::Absent,
    Err(_) => Current::Unreadable,
  }
}

fn expected(current: &Current, expect: &str) -> bool {
  match current {
    Current::Absent => expect == "absent",
    Current::Present(hash) => hash == expect,
    Current::Unreadable => false,
  }
}

/// Compare-and-swap write. `expect`: the current bytes' hash, or `"absent"`.
pub fn write(root: &Path, rel: &str, text: &str, expect: &str, cache: &HashCache) -> Result<WriteResult, String> {
  let path = resolve(root, rel)?;
  let now = current(&path);
  if !expected(&now, expect) {
    return Ok(WriteResult::Conflict);
  }
  let hash = hash_bytes(text.as_bytes());
  if matches!(&now, Current::Present(h) if *h == hash) {
    return Ok(WriteResult::Ok { hash });
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let done = replace(&path, text.as_bytes(), &mut |from, to| fs::rename(from, to), is_sharing_violation, &pause, &|| {
    still(&path, expect)
  })
  .map_err(|e| e.to_string())?;
  // Just written, so too fresh to cache anyway.
  cache.forget(&path);
  Ok(match done {
    Done::Ok => WriteResult::Ok { hash },
    Done::Changed => WriteResult::Conflict,
  })
}

/// Compare-and-swap delete. A plain delete: the provider's own recycle bin is the backstop.
pub fn remove(root: &Path, rel: &str, expect: &str, cache: &HashCache) -> Result<RemoveResult, String> {
  let path = resolve(root, rel)?;
  let now = current(&path);
  if matches!(now, Current::Absent) {
    return Ok(RemoveResult::Missing);
  }
  if !expected(&now, expect) {
    return Ok(RemoveResult::Conflict);
  }
  let done = with_retry(|| fs::remove_file(&path), is_sharing_violation, &pause, &|| still(&path, expect)).map_err(|e| e.to_string())?;
  cache.forget(&path);
  Ok(match done {
    Done::Ok => RemoveResult::Ok,
    Done::Changed => RemoveResult::Conflict,
  })
}

/// Before a retry: the file is still what `expect` says. One held so it will not read is an
/// error, not a guess: the engine tries again next run, and the local copy stays the truth.
fn still(path: &Path, expect: &str) -> io::Result<bool> {
  match current(path) {
    Current::Unreadable => Err(io::Error::other("the file is held open")),
    now => Ok(expected(&now, expect)),
  }
}

fn random_hex(bytes: usize) -> String {
  let mut buf = vec![0u8; bytes];
  if getrandom::fill(&mut buf).is_err() {
    // No OS randomness: a temp name only needs to be unlikely to collide.
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    return format!("{nanos:x}");
  }
  buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Temp file beside the target, fsync, rename over it. For files only this app writes.
pub fn write_atomic(target: &Path, bytes: &[u8]) -> io::Result<()> {
  replace(target, bytes, &mut |from, to| fs::rename(from, to), is_sharing_violation, &pause, &|| Ok(true)).map(|_| ())
}

/// How a retried rename or delete ended.
#[derive(Debug, PartialEq)]
enum Done {
  Ok,
  /// The target changed while it was held open: nothing was done.
  Changed,
}

/// Temp beside `target`, fsync, rename over it; the temp is gone on every path. A rename
/// refused while the file is held open is retried for about a second, each retry only while
/// `unchanged` holds; still held, it is an error. Never written in place: truncate-then-write
/// can tear the file, or overwrite what a cloud client is downloading.
fn replace(
  target: &Path,
  bytes: &[u8],
  rename: &mut dyn FnMut(&Path, &Path) -> io::Result<()>,
  retryable: fn(&io::Error) -> bool,
  wait: &dyn Fn(Duration),
  unchanged: &dyn Fn() -> io::Result<bool>,
) -> io::Result<Done> {
  let dir = target.parent().ok_or_else(|| io::Error::other("no parent folder"))?;
  let name = target.file_name().and_then(|n| n.to_str()).ok_or_else(|| io::Error::other("bad file name"))?;
  let temp = dir.join(format!(".{name}{TEMP_TAG}{}.tmp", random_hex(6)));
  let written = (|| {
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()
  })();
  let result = written.and_then(|()| with_retry(|| rename(&temp, target), retryable, wait, unchanged));
  if matches!(result, Ok(Done::Ok)) {
    sync_dir(dir);
  }
  let _ = fs::remove_file(&temp);
  result
}

/// `op`, retried on `retryable` errors for about a second; before each retry `unchanged` must
/// still hold (whoever held the file may have replaced it).
fn with_retry(
  mut op: impl FnMut() -> io::Result<()>,
  retryable: fn(&io::Error) -> bool,
  wait: &dyn Fn(Duration),
  unchanged: &dyn Fn() -> io::Result<bool>,
) -> io::Result<Done> {
  let mut attempt = 0;
  loop {
    match op() {
      Ok(()) => return Ok(Done::Ok),
      Err(e) if retryable(&e) && attempt < RETRY_MS.len() => {
        wait(Duration::from_millis(RETRY_MS[attempt]));
        attempt += 1;
        if !unchanged()? {
          return Ok(Done::Changed);
        }
      }
      Err(e) => return Err(e),
    }
  }
}

fn pause(duration: Duration) {
  std::thread::sleep(duration);
}

/// Windows: another process (a cloud client, antivirus) has the file open.
#[cfg(windows)]
fn is_sharing_violation(error: &io::Error) -> bool {
  // ERROR_ACCESS_DENIED, ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
  matches!(error.raw_os_error(), Some(5 | 32 | 33))
}

#[cfg(not(windows))]
fn is_sharing_violation(_error: &io::Error) -> bool {
  false
}

/// Makes the rename itself durable. Best effort; Windows has no directory fsync.
fn sync_dir(dir: &Path) {
  #[cfg(unix)]
  if let Ok(dir) = fs::File::open(dir) {
    let _ = dir.sync_all();
  }
  #[cfg(not(unix))]
  let _ = dir;
}

// ---------------------------------------------------------------------------------------
// Choosing a folder, and this computer's own state.

/// The picked folder's library: the folder itself when it is one, else `<picked>/Econ Studio`,
/// created with its marker. An existing marker, or its undownloaded iCloud stub, is never
/// written. `app_data` and `home` are this computer's, for the refusals (`refusal`).
pub fn adopt_folder(picked: &Path, app_data: &Path, home: Option<&Path>) -> io::Result<Result<PathBuf, Refusal>> {
  let picked = fs::canonicalize(picked)?;
  let real = |path: &Path| fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
  if let Some(reason) = refusal(&picked, &real(app_data), home.map(real).as_deref()) {
    return Ok(Err(reason));
  }
  if has_marker(&picked) {
    return Ok(Ok(picked));
  }
  let root = picked.join(LIBRARY_DIR);
  fs::create_dir_all(&root)?;
  let marker = root.join(MARKER);
  if !marker.exists() && !has_marker(&root) {
    write_atomic(&marker, format!("{{ \"format\": {LIBRARY_FORMAT} }}\n").as_bytes())?;
  }
  fs::canonicalize(root).map(Ok)
}

/// The marker, or its legacy iCloud stub (not downloaded yet, but there).
fn has_marker(dir: &Path) -> bool {
  dir.join(MARKER).is_file() || dir.join(format!(".{MARKER}.icloud")).is_file()
}

/// Why `picked` (canonical, as are the others) cannot hold a library, if it cannot.
pub fn refusal(picked: &Path, app_data: &Path, home: Option<&Path>) -> Option<Refusal> {
  if picked.starts_with(app_data) {
    Some(Refusal::AppData)
  } else if home == Some(picked) {
    Some(Refusal::Home)
  } else if is_drive_root(picked) {
    Some(Refusal::DriveRoot)
  } else if picked.ancestors().skip(1).any(has_marker) {
    Some(Refusal::InsideLibrary)
  } else {
    None
  }
}

/// `C:\`, a share's root, `/`, or a mounted volume (`/Volumes/USB`).
fn is_drive_root(path: &Path) -> bool {
  match path.parent() {
    None => true,
    Some(parent) => parent == Path::new("/Volumes"),
  }
}

#[derive(Serialize, Deserialize, Default, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocationFile {
  #[serde(default)]
  pub device_id: String,
  #[serde(default)]
  pub root: Option<PathBuf>,
}

/// `library-location.json`; missing or unreadable reads as nothing chosen.
pub fn load_location(app_dir: &Path) -> LocationFile {
  fs::read_to_string(app_dir.join(LOCATION_FILE))
    .ok()
    .and_then(|text| serde_json::from_str(&text).ok())
    .unwrap_or_default()
}

pub fn save_location(app_dir: &Path, location: &LocationFile) -> io::Result<()> {
  fs::create_dir_all(app_dir)?;
  let text = serde_json::to_string_pretty(location).map_err(io::Error::other)?;
  write_atomic(&app_dir.join(LOCATION_FILE), text.as_bytes())
}

/// The location, with a device id made (and saved) the first time.
pub fn location_with_device(app_dir: &Path) -> io::Result<LocationFile> {
  let mut location = load_location(app_dir);
  let valid = location.device_id.len() == 32 && location.device_id.bytes().all(|b| b.is_ascii_hexdigit());
  if !valid {
    location.device_id = random_hex(16);
    save_location(app_dir, &location)?;
  }
  Ok(location)
}

/// What changed, relative to the root. `true`: something cannot be named (the root itself,
/// a path outside it), so everything must be listed again.
pub fn changed_paths<'a>(root: &Path, paths: impl IntoIterator<Item = &'a Path>) -> (Vec<String>, bool) {
  let mut found = BTreeSet::new();
  let mut rescan = false;
  for path in paths {
    let Ok(rel) = path.strip_prefix(root) else {
      rescan = true;
      continue;
    };
    let names: Option<Vec<&str>> = rel
      .components()
      .map(|c| match c {
        Component::Normal(name) => name.to_str(),
        _ => None,
      })
      .collect();
    let Some(mut names) = names.filter(|n| !n.is_empty()) else {
      rescan = true;
      continue;
    };
    if let Some(real) = names.last().and_then(|n| icloud_stub_target(n)) {
      *names.last_mut().unwrap() = real;
    }
    let rel = names.join("/");
    if relative_parts(&rel).is_some() {
      found.insert(rel);
    }
  }
  (found.into_iter().collect(), rescan)
}

// ---------------------------------------------------------------------------------------
// Tauri commands. Each runs on the blocking pool: a cloud folder can stall any call.

use notify_debouncer_full::notify::{Config, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

type Watcher = Debouncer<RecommendedWatcher, NoCache>;

struct Watch {
  session: u64,
  _debouncer: Watcher,
}

/// Watches `root` recursively: `on_change(paths, rescan)` once per ~1 s burst. Stops on drop.
pub fn watch_root(root: &Path, on_change: impl Fn(Vec<String>, bool) + Send + 'static) -> Result<Watcher, String> {
  let watched = root.to_path_buf();
  let handler = move |result: DebounceEventResult| {
    let (paths, rescan) = match result {
      Ok(events) => {
        let flagged = events.iter().any(|event| event.need_rescan());
        let (paths, rescan) = changed_paths(&watched, events.iter().flat_map(|event| event.paths.iter().map(PathBuf::as_path)));
        (paths, rescan || flagged)
      }
      Err(_) => (Vec::new(), true),
    };
    if !paths.is_empty() || rescan {
      on_change(paths, rescan);
    }
  };
  // No file-id cache: it walks the tree on start following links, so a link to `/` or home
  // would walk everything (and raise macOS privacy prompts). Links are not followed either.
  let config = Config::default().with_follow_symlinks(false);
  let mut debouncer = new_debouncer_opt(Duration::from_secs(1), None, handler, NoCache, config).map_err(|e| e.to_string())?;
  debouncer.watch(root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
  Ok(debouncer)
}

#[derive(Default)]
pub struct LibraryState {
  cache: HashCache,
  /// This process's writes and removes, one at a time.
  io: Mutex<()>,
  /// `library-location.json` changes, one at a time.
  location: Mutex<()>,
  cleaned: Mutex<HashSet<PathBuf>>,
  watch: Mutex<Option<Watch>>,
  sessions: AtomicU64,
}

impl LibraryState {
  fn stop_watching(&self) {
    if let Ok(mut watch) = self.watch.lock() {
      *watch = None;
    }
  }
}

fn app_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  app.path().app_data_dir().map_err(|e| e.to_string())
}

fn root_of<R: Runtime>(app: &AppHandle<R>) -> Result<Result<PathBuf, Reason>, String> {
  Ok(match load_location(&app_dir(app)?).root {
    None => Err(Reason::NoLocation),
    Some(root) => open_root(&root),
  })
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// An I/O error mid-operation is the root going away more often than not: say so.
fn failed<R: Runtime>(app: &AppHandle<R>, error: String) -> Result<Reason, String> {
  match root_of(app)? {
    Err(reason) => Ok(reason),
    Ok(_) => Err(error),
  }
}

#[tauri::command]
pub async fn library_location<R: Runtime>(app: AppHandle<R>) -> Result<Location, String> {
  blocking(move || {
    let state = app.state::<LibraryState>();
    let _guard = state.location.lock().map_err(|e| e.to_string())?;
    let location = location_with_device(&app_dir(&app)?).map_err(|e| e.to_string())?;
    let (status, reason) = match &location.root {
      None => (LocationStatus::None, None),
      Some(root) => match open_root(root) {
        Ok(_) => (LocationStatus::Ok, None),
        Err(reason) => (LocationStatus::Unavailable, Some(reason)),
      },
    };
    let root = location.root.map(|r| r.to_string_lossy().into_owned());
    Ok(Location { device_id: location.device_id, root, status, reason })
  })
  .await
}

/// The native folder picker, run here: page script never supplies the root. `start`: a
/// `library_cloud_folders` id to open the picker at, found again here, never a path.
#[tauri::command]
pub async fn library_choose<R: Runtime>(app: AppHandle<R>, title: Option<String>, start: Option<String>) -> Result<ChooseResult, String> {
  blocking(move || {
    let mut dialog = app.dialog().file().set_can_create_directories(true);
    if let Some(title) = title.filter(|t| !t.is_empty() && t.len() <= 200) {
      dialog = dialog.set_title(title);
    }
    if let Some(folder) = start.and_then(|id| crate::cloud::this_computers(&id)) {
      dialog = dialog.set_directory(folder.path);
    }
    let Some(picked) = dialog.blocking_pick_folder() else { return Ok(ChooseResult::Cancelled) };
    let picked = picked.into_path().map_err(|e| e.to_string())?;
    let dir = app_dir(&app)?;
    let home = app.path().home_dir().ok();
    let root = match adopt_folder(&picked, &dir, home.as_deref()).map_err(|e| e.to_string())? {
      Ok(root) => root,
      Err(reason) => return Ok(ChooseResult::Refused { reason }),
    };
    let state = app.state::<LibraryState>();
    let _guard = state.location.lock().map_err(|e| e.to_string())?;
    let mut location = location_with_device(&dir).map_err(|e| e.to_string())?;
    location.root = Some(root.clone());
    save_location(&dir, &location).map_err(|e| e.to_string())?;
    state.stop_watching();
    Ok(ChooseResult::Chosen { root: root.to_string_lossy().into_owned() })
  })
  .await
}

/// The cloud drive folders on this computer (`cloud.rs`), for the setup step. Paths only.
#[tauri::command]
pub async fn library_cloud_folders() -> Result<Vec<crate::cloud::CloudFolder>, String> {
  blocking(|| Ok(crate::cloud::this_computer())).await
}

/// Detach: this computer stops using the folder. Nothing in the folder is touched.
#[tauri::command]
pub async fn library_forget<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  blocking(move || {
    let state = app.state::<LibraryState>();
    let _guard = state.location.lock().map_err(|e| e.to_string())?;
    let dir = app_dir(&app)?;
    let mut location = location_with_device(&dir).map_err(|e| e.to_string())?;
    location.root = None;
    save_location(&dir, &location).map_err(|e| e.to_string())?;
    state.stop_watching();
    Ok(())
  })
  .await
}

#[tauri::command]
pub async fn library_list<R: Runtime>(app: AppHandle<R>) -> Result<ListResult, String> {
  blocking(move || {
    let root = match root_of(&app)? {
      Ok(root) => root,
      Err(reason) => return Ok(ListResult::Unavailable { reason }),
    };
    let state = app.state::<LibraryState>();
    let clean = state.cleaned.lock().map(|mut done| done.insert(root.clone())).unwrap_or(false);
    Ok(match list(&root, &state.cache, clean) {
      Ok(files) => ListResult::Ok { files },
      // The root may have gone mid-listing; either way, unavailable.
      Err(reason) => ListResult::Unavailable { reason: root_of(&app)?.err().unwrap_or(reason) },
    })
  })
  .await
}

#[tauri::command]
pub async fn library_read<R: Runtime>(app: AppHandle<R>, path: String) -> Result<ReadResult, String> {
  blocking(move || {
    let root = match root_of(&app)? {
      Ok(root) => root,
      Err(reason) => return Ok(ReadResult::Unavailable { reason }),
    };
    let result = read(&root, &path, &app.state::<LibraryState>().cache)?;
    if result == ReadResult::Unreadable {
      if let Err(reason) = root_of(&app)? {
        return Ok(ReadResult::Unavailable { reason });
      }
    }
    Ok(result)
  })
  .await
}

#[tauri::command]
pub async fn library_write<R: Runtime>(app: AppHandle<R>, path: String, text: String, expect: String) -> Result<WriteResult, String> {
  blocking(move || {
    let root = match root_of(&app)? {
      Ok(root) => root,
      Err(reason) => return Ok(WriteResult::Unavailable { reason }),
    };
    let state = app.state::<LibraryState>();
    let _guard = state.io.lock().map_err(|e| e.to_string())?;
    match write(&root, &path, &text, &expect, &state.cache) {
      Ok(result) => Ok(result),
      Err(error) => failed(&app, error).map(|reason| WriteResult::Unavailable { reason }),
    }
  })
  .await
}

#[tauri::command]
pub async fn library_remove<R: Runtime>(app: AppHandle<R>, path: String, expect: String) -> Result<RemoveResult, String> {
  blocking(move || {
    let root = match root_of(&app)? {
      Ok(root) => root,
      Err(reason) => return Ok(RemoveResult::Unavailable { reason }),
    };
    let state = app.state::<LibraryState>();
    let _guard = state.io.lock().map_err(|e| e.to_string())?;
    match remove(&root, &path, &expect, &state.cache) {
      Ok(result) => Ok(result),
      Err(error) => failed(&app, error).map(|reason| RemoveResult::Unavailable { reason }),
    }
  })
  .await
}

/// (Re)starts the watcher on the current root: one `library-changed` per ~1 s burst. Each
/// start is a new session; events carry it, so page script can tell a restart happened.
#[tauri::command]
pub async fn library_watch<R: Runtime>(app: AppHandle<R>) -> Result<WatchResult, String> {
  blocking(move || {
    let root = match root_of(&app)? {
      Ok(root) => root,
      Err(reason) => return Ok(WatchResult::Unavailable { reason }),
    };
    let state = app.state::<LibraryState>();
    let session = state.sessions.fetch_add(1, Ordering::SeqCst) + 1;
    let emitter = app.clone();
    let debouncer = watch_root(&root, move |paths, rescan| {
      let _ = emitter.emit(CHANGED_EVENT, Changed { session, paths, rescan });
    })?;
    let mut watch = state.watch.lock().map_err(|e| e.to_string())?;
    *watch = Some(Watch { session, _debouncer: debouncer });
    Ok(WatchResult::Ok { session })
  })
  .await
}

/// Stops the watcher if `session` is still the current one.
#[tauri::command]
pub async fn library_unwatch<R: Runtime>(app: AppHandle<R>, session: u64) -> Result<(), String> {
  blocking(move || {
    let state = app.state::<LibraryState>();
    let mut watch = state.watch.lock().map_err(|e| e.to_string())?;
    if watch.as_ref().is_some_and(|w| w.session == session) {
      *watch = None;
    }
    Ok(())
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::Cell;

  /// `adopt_folder` on a computer whose app data and home are elsewhere.
  fn adopt(picked: &Path) -> Result<PathBuf, Refusal> {
    adopt_folder(picked, Path::new("/nowhere/app-data"), None).unwrap()
  }

  fn library() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = adopt(dir.path()).unwrap();
    (dir, root)
  }

  fn age(path: &Path, seconds: u64) {
    let file = OpenOptions::new().write(true).open(path).unwrap();
    file.set_modified(SystemTime::now() - Duration::from_secs(seconds)).unwrap();
  }

  fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    names
  }

  #[test]
  fn choosing_a_folder_makes_a_library_inside_it_once() {
    let dir = tempfile::tempdir().unwrap();
    let root = adopt(dir.path()).unwrap();
    assert!(root.ends_with(LIBRARY_DIR));
    assert_eq!(fs::read_to_string(root.join(MARKER)).unwrap(), "{ \"format\": 1 }\n");
    // Picking the library itself, or its parent again, finds the same one.
    assert_eq!(adopt(&root), Ok(root.clone()));
    assert_eq!(adopt(dir.path()), Ok(root.clone()));
    assert_eq!(names(&root), vec![MARKER.to_string()]);
  }

  #[test]
  fn app_data_home_drive_roots_and_folders_inside_a_library_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let base = fs::canonicalize(dir.path()).unwrap();
    let (app, home) = (base.join("app"), base.join("home"));
    for path in [app.join("sub"), home.join("Documents"), base.join("lib"), base.join("stub/inner")] {
      fs::create_dir_all(path).unwrap();
    }
    let pick = |path: &Path| adopt_folder(path, &app, Some(&home)).unwrap();
    assert_eq!(pick(&app), Err(Refusal::AppData));
    assert_eq!(pick(&app.join("sub")), Err(Refusal::AppData));
    assert_eq!(pick(&home), Err(Refusal::Home));
    assert_eq!(pick(Path::new("/")), Err(Refusal::DriveRoot));
    assert!(is_drive_root(Path::new("/Volumes/USB")) && !is_drive_root(Path::new("/Volumes/USB/Econ")));
    // Inside a library, even below a folder of it, or below a marker iCloud has not downloaded.
    let lib = pick(&base.join("lib")).unwrap();
    fs::create_dir(lib.join("trash")).unwrap();
    assert_eq!(pick(&lib.join("trash")), Err(Refusal::InsideLibrary));
    fs::write(base.join("stub").join(format!(".{MARKER}.icloud")), "").unwrap();
    assert_eq!(pick(&base.join("stub/inner")), Err(Refusal::InsideLibrary));
    // Nothing was made by a refusal.
    assert_eq!(names(&app), vec!["sub"]);
    assert_eq!(names(&home), vec!["Documents"]);
    assert_eq!(pick(&home.join("Documents")), Ok(home.join("Documents").join(LIBRARY_DIR)));
  }

  #[test]
  fn a_library_whose_marker_is_not_downloaded_is_adopted_without_a_second_marker() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join(LIBRARY_DIR);
    fs::create_dir(&root).unwrap();
    let stub = format!(".{MARKER}.icloud");
    fs::write(root.join(&stub), "").unwrap();
    assert_eq!(adopt(dir.path()), Ok(fs::canonicalize(&root).unwrap()));
    assert_eq!(names(&root), vec![stub.clone()]);
    // Picked directly, too.
    assert_eq!(adopt(&root), Ok(fs::canonicalize(&root).unwrap()));
    assert_eq!(names(&root), vec![stub]);
  }

  #[test]
  fn a_root_without_its_marker_or_from_a_newer_build_is_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(open_root(&dir.path().join("gone")), Err(Reason::RootMissing));
    fs::write(dir.path().join("file"), "x").unwrap();
    assert_eq!(open_root(&dir.path().join("file")), Err(Reason::NotAFolder));
    assert_eq!(open_root(dir.path()), Err(Reason::NoMarker));
    fs::write(dir.path().join(MARKER), "{ torn").unwrap();
    assert_eq!(open_root(dir.path()), Err(Reason::NoMarker));
    fs::write(dir.path().join(MARKER), "{ \"format\": 2 }").unwrap();
    assert_eq!(open_root(dir.path()), Err(Reason::NewerFormat));
    fs::write(dir.path().join(MARKER), "{ \"format\": 1, \"later\": true }").unwrap();
    assert_eq!(open_root(dir.path()), Ok(fs::canonicalize(dir.path()).unwrap()));
  }

  #[test]
  fn paths_must_be_relative_and_stay_inside() {
    let (_dir, root) = library();
    for bad in [
      "", "/etc/passwd", "..", "../x.json", "a/../../x.json", "./x.json", "trash/", "trash//x.json", ".hidden.json",
      "a\\..\\x.json", "C:x.json", "x.json.", "x.json ", MARKER, "x.json.tmp", "a/b/c/d/e/f/g/h/i.json",
    ] {
      assert!(resolve(&root, bad).is_err(), "accepted {bad:?}");
    }
    assert_eq!(resolve(&root, "abc.worksheet.json").unwrap(), root.join("abc.worksheet.json"));
    assert_eq!(resolve(&root, "trash/abc.worksheet.json").unwrap(), root.join("trash").join("abc.worksheet.json"));
    // The marker's name is fine below the root.
    assert!(resolve(&root, &format!("trash/{MARKER}")).is_ok());
  }

  #[cfg(unix)]
  #[test]
  fn symlinks_out_of_the_root_are_refused() {
    let (dir, root) = library();
    let outside = dir.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("secret.json"), "{}").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("trash")).unwrap();
    std::os::unix::fs::symlink(outside.join("secret.json"), root.join("link.json")).unwrap();
    std::os::unix::fs::symlink(dir.path().join("nowhere"), root.join("dangling.json")).unwrap();
    assert!(resolve(&root, "trash/x.worksheet.json").is_err());
    assert!(resolve(&root, "trash/new/x.worksheet.json").is_err());
    assert!(resolve(&root, "link.json").is_err());
    assert!(resolve(&root, "dangling.json").is_err());
    let cache = HashCache::default();
    assert!(write(&root, "trash/x.worksheet.json", "{}", "absent", &cache).is_err());
    assert_eq!(names(&outside), vec!["secret.json"]);
    // Links are not listed either.
    assert_eq!(list(&root, &cache, false).unwrap(), vec![]);
  }

  #[test]
  fn lists_json_under_the_root_with_hashes_and_skips_the_rest() {
    let (_dir, root) = library();
    fs::create_dir_all(root.join("trash")).unwrap();
    fs::create_dir_all(root.join(".hidden")).unwrap();
    fs::write(root.join("a.worksheet.json"), "A").unwrap();
    fs::write(root.join("a.worksheet (1).json"), "A1").unwrap();
    fs::write(root.join("trash/b.worksheet.json"), "B").unwrap();
    fs::write(root.join(".a.worksheet.json.econ-0a0b.tmp"), "partial").unwrap();
    fs::write(root.join(".DS_Store"), "x").unwrap();
    fs::write(root.join(".hidden/c.json"), "C").unwrap();
    fs::write(root.join("notes.txt"), "x").unwrap();
    let files = list(&root, &HashCache::default(), false).unwrap();
    let got: Vec<(&str, Option<&str>, FileState)> = files.iter().map(|f| (f.path.as_str(), f.hash.as_deref(), f.state)).collect();
    let a = hash_bytes(b"A");
    let a1 = hash_bytes(b"A1");
    let b = hash_bytes(b"B");
    assert_eq!(
      got,
      vec![
        ("a.worksheet (1).json", Some(a1.as_str()), FileState::Ok),
        ("a.worksheet.json", Some(a.as_str()), FileState::Ok),
        ("trash/b.worksheet.json", Some(b.as_str()), FileState::Ok),
      ]
    );
    assert_eq!(files[1].size, 1);
  }

  #[test]
  fn an_evicted_icloud_file_is_listed_as_a_placeholder_and_never_written_over() {
    let (_dir, root) = library();
    fs::write(root.join(".x.worksheet.json.icloud"), "stub").unwrap();
    let cache = HashCache::default();
    let files = list(&root, &cache, false).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!((files[0].path.as_str(), files[0].hash.as_ref(), files[0].state), ("x.worksheet.json", None, FileState::Placeholder));
    assert_eq!(read(&root, "x.worksheet.json", &cache).unwrap(), ReadResult::Unreadable);
    assert_eq!(write(&root, "x.worksheet.json", "new", "absent", &cache).unwrap(), WriteResult::Conflict);
    assert_eq!(remove(&root, "x.worksheet.json", "absent", &cache).unwrap(), RemoveResult::Conflict);
    // Once downloaded, the real file wins over its stub.
    fs::write(root.join("x.worksheet.json"), "X").unwrap();
    let files = list(&root, &cache, false).unwrap();
    assert_eq!((files.len(), files[0].state), (1, FileState::Ok));
  }

  #[cfg(unix)]
  #[test]
  fn an_unreadable_file_is_listed_not_dropped() {
    use std::os::unix::fs::PermissionsExt;
    let (_dir, root) = library();
    let path = root.join("locked.worksheet.json");
    fs::write(&path, "L").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(&path).is_ok() {
      return; // Running as root: permissions do not bite.
    }
    let cache = HashCache::default();
    let files = list(&root, &cache, false).unwrap();
    assert_eq!((files[0].path.as_str(), files[0].state, files[0].hash.as_ref()), ("locked.worksheet.json", FileState::Unreadable, None));
    assert_eq!(read(&root, "locked.worksheet.json", &cache).unwrap(), ReadResult::Unreadable);
    assert_eq!(write(&root, "locked.worksheet.json", "new", &hash_bytes(b"L"), &cache).unwrap(), WriteResult::Conflict);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
  }

  #[cfg(unix)]
  #[test]
  fn an_unchanged_file_is_not_read_again() {
    use std::os::unix::fs::PermissionsExt;
    let (_dir, root) = library();
    let path = root.join("a.worksheet.json");
    fs::write(&path, "A").unwrap();
    age(&path, 60);
    let cache = HashCache::default();
    list(&root, &cache, false).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(&path).is_ok() {
      return;
    }
    // Unreadable now, yet listed with its hash: the cache answered.
    assert_eq!(list(&root, &cache, false).unwrap()[0].hash, Some(hash_bytes(b"A")));
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    fs::write(&path, "B").unwrap();
    assert_eq!(list(&root, &cache, false).unwrap()[0].hash, Some(hash_bytes(b"B")));
  }

  #[test]
  fn a_fresh_file_is_not_cached() {
    let (_dir, root) = library();
    let path = root.join("a.worksheet.json");
    fs::write(&path, "A").unwrap();
    let cache = HashCache::default();
    list(&root, &cache, false).unwrap();
    assert!(cache.map.lock().unwrap().is_empty());
  }

  #[test]
  fn a_file_replaced_mid_read_is_not_cached_with_the_old_hash() {
    let (_dir, root) = library();
    let path = root.join("a.worksheet.json");
    fs::write(&path, "A").unwrap();
    age(&path, 60);
    let before = fs::metadata(&path).unwrap();
    // Replaced while "A" was being read, with the other computer's older edit time.
    fs::write(&path, "B").unwrap();
    age(&path, 120);
    let cache = HashCache::default();
    cache.put(&path, &before, &hash_bytes(b"A"));
    assert!(cache.map.lock().unwrap().is_empty());
    assert_eq!(list(&root, &cache, false).unwrap()[0].hash, Some(hash_bytes(b"B")));
    // Held still: cached, keyed on the stat taken before the read.
    assert_eq!(cache.get(&path, &fs::metadata(&path).unwrap()), Some(hash_bytes(b"B")));
  }

  #[test]
  fn a_subfolder_removed_mid_listing_is_skipped_the_root_is_not() {
    let (_dir, root) = library();
    let cache = HashCache::default();
    let mut found = BTreeMap::new();
    assert_eq!(walk(&root.join("trash"), "trash", 1, &cache, false, &mut found), Ok(()));
    assert!(found.is_empty());
    assert_eq!(walk(&root.join("gone"), "", 0, &cache, false, &mut found), Err(Reason::Io));
  }

  #[test]
  fn the_first_listing_removes_this_apps_stale_temp_files_only() {
    let (_dir, root) = library();
    for name in [".old.json.econ-aa.tmp", ".new.json.econ-bb.tmp", ".other.tmp"] {
      fs::write(root.join(name), "x").unwrap();
    }
    age(&root.join(".old.json.econ-aa.tmp"), 2 * 24 * 3600);
    age(&root.join(".other.tmp"), 2 * 24 * 3600);
    list(&root, &HashCache::default(), false).unwrap();
    assert_eq!(names(&root).len(), 4);
    list(&root, &HashCache::default(), true).unwrap();
    assert_eq!(names(&root), vec![".new.json.econ-bb.tmp", ".other.tmp", MARKER]);
  }

  #[test]
  fn write_is_compare_and_swap_by_content_hash() {
    let (_dir, root) = library();
    let cache = HashCache::default();
    let key = "trash/a.worksheet.json";
    let one = match write(&root, key, "one", "absent", &cache).unwrap() {
      WriteResult::Ok { hash } => hash,
      other => panic!("{other:?}"),
    };
    assert_eq!(one, hash_bytes(b"one"));
    assert_eq!(fs::read_to_string(root.join(key)).unwrap(), "one");
    assert_eq!(write(&root, key, "two", "absent", &cache).unwrap(), WriteResult::Conflict);
    assert_eq!(write(&root, key, "two", &hash_bytes(b"other"), &cache).unwrap(), WriteResult::Conflict);
    assert_eq!(fs::read_to_string(root.join(key)).unwrap(), "one");
    assert_eq!(write(&root, key, "two", &one, &cache).unwrap(), WriteResult::Ok { hash: hash_bytes(b"two") });
    assert_eq!(fs::read_to_string(root.join(key)).unwrap(), "two");
    assert_eq!(names(&root.join("trash")), vec!["a.worksheet.json"]);
  }

  #[test]
  fn identical_bytes_are_not_written() {
    let (_dir, root) = library();
    let cache = HashCache::default();
    let path = root.join("a.worksheet.json");
    fs::write(&path, "same").unwrap();
    age(&path, 3600);
    let before = fs::metadata(&path).unwrap().modified().unwrap();
    let hash = hash_bytes(b"same");
    assert_eq!(write(&root, "a.worksheet.json", "same", &hash, &cache).unwrap(), WriteResult::Ok { hash: hash.clone() });
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
  }

  #[test]
  fn read_reports_missing_and_text_that_is_not_utf8() {
    let (_dir, root) = library();
    let cache = HashCache::default();
    assert_eq!(read(&root, "none.worksheet.json", &cache).unwrap(), ReadResult::Missing);
    fs::write(root.join("bin.json"), [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(read(&root, "bin.json", &cache).unwrap(), ReadResult::Unreadable);
    fs::write(root.join("a.worksheet.json"), "A").unwrap();
    assert_eq!(read(&root, "a.worksheet.json", &cache).unwrap(), ReadResult::Ok { text: "A".into(), hash: hash_bytes(b"A") });
  }

  #[test]
  fn remove_is_compare_and_swap() {
    let (_dir, root) = library();
    let cache = HashCache::default();
    fs::write(root.join("a.worksheet.json"), "A").unwrap();
    assert_eq!(remove(&root, "a.worksheet.json", &hash_bytes(b"B"), &cache).unwrap(), RemoveResult::Conflict);
    assert!(root.join("a.worksheet.json").exists());
    assert_eq!(remove(&root, "a.worksheet.json", &hash_bytes(b"A"), &cache).unwrap(), RemoveResult::Ok);
    assert!(!root.join("a.worksheet.json").exists());
    assert_eq!(remove(&root, "a.worksheet.json", &hash_bytes(b"A"), &cache).unwrap(), RemoveResult::Missing);
  }

  const HELD: fn(&io::Error) -> bool = |e| e.kind() == io::ErrorKind::PermissionDenied;

  #[test]
  fn a_file_held_open_is_retried_then_left_alone() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("a.json");
    fs::write(&target, "old").unwrap();
    let attempts = Cell::new(0);
    let waited = Cell::new(Duration::ZERO);
    let mut rename = |_: &Path, _: &Path| {
      attempts.set(attempts.get() + 1);
      Err(io::Error::from(io::ErrorKind::PermissionDenied))
    };
    let result = replace(&target, b"new", &mut rename, HELD, &|d| waited.set(waited.get() + d), &|| Ok(true));
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    assert_eq!(attempts.get(), RETRY_MS.len() + 1);
    assert_eq!(waited.get(), Duration::from_millis(1000));
    assert_eq!(fs::read_to_string(&target).unwrap(), "old");
    assert_eq!(names(dir.path()), vec!["a.json"]);
  }

  #[test]
  fn a_file_replaced_while_held_open_is_a_conflict_and_kept() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("a.json");
    fs::write(&target, "old").unwrap();
    let old = hash_bytes(b"old");
    // The cloud client holding it finishes downloading the other computer's version.
    let mut rename = |_: &Path, to: &Path| {
      fs::write(to, "theirs").unwrap();
      Err(io::Error::from(io::ErrorKind::PermissionDenied))
    };
    let result = replace(&target, b"mine", &mut rename, HELD, &|_| (), &|| still(&target, &old));
    assert_eq!(result.unwrap(), Done::Changed);
    assert_eq!(fs::read_to_string(&target).unwrap(), "theirs");
    assert_eq!(names(dir.path()), vec!["a.json"]);
    // Held so it will not even read: an error, not a guess.
    let mut rename = |_: &Path, _: &Path| Err(io::Error::from(io::ErrorKind::PermissionDenied));
    assert!(replace(&target, b"mine", &mut rename, HELD, &|_| (), &|| Err(io::Error::other("held"))).is_err());
    assert_eq!(names(dir.path()), vec!["a.json"]);
  }

  #[test]
  fn a_failed_rename_leaves_the_target_and_no_temp() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("a.json");
    fs::write(&target, "old").unwrap();
    let mut rename = |_: &Path, _: &Path| Err(io::Error::other("disk gone"));
    assert!(replace(&target, b"new", &mut rename, |_| false, &|_| (), &|| Ok(true)).is_err());
    assert_eq!(fs::read_to_string(&target).unwrap(), "old");
    assert_eq!(names(dir.path()), vec!["a.json"]);
  }

  #[test]
  fn the_device_id_is_made_once_and_the_root_kept() {
    let dir = tempfile::tempdir().unwrap();
    let first = location_with_device(dir.path()).unwrap();
    assert_eq!(first.device_id.len(), 32);
    assert_eq!(first.root, None);
    let mut chosen = first.clone();
    chosen.root = Some(PathBuf::from("/somewhere/Econ Studio"));
    save_location(dir.path(), &chosen).unwrap();
    assert_eq!(location_with_device(dir.path()).unwrap(), chosen);
    // A torn file reads as nothing chosen, and gets a fresh id.
    fs::write(dir.path().join(LOCATION_FILE), "{ torn").unwrap();
    let fresh = location_with_device(dir.path()).unwrap();
    assert_eq!(fresh.root, None);
    assert_ne!(fresh.device_id, first.device_id);
    assert_eq!(names(dir.path()), vec![LOCATION_FILE]);
  }

  #[test]
  fn watcher_paths_are_named_relative_to_the_root() {
    let root = Path::new("/lib/Econ Studio");
    let paths = [
      root.join("a.worksheet.json"),
      root.join("trash/b.worksheet.json"),
      root.join("trash/.c.worksheet.json.icloud"),
      root.join(".a.worksheet.json.econ-ff.tmp"),
      root.join("a.worksheet.json"),
    ];
    let (names, rescan) = changed_paths(root, paths.iter().map(PathBuf::as_path));
    assert_eq!(names, vec!["a.worksheet.json", "trash/b.worksheet.json", "trash/c.worksheet.json"]);
    assert!(!rescan);
    assert!(changed_paths(root, [root]).1);
    assert!(changed_paths(root, [Path::new("/elsewhere/x.json")]).1);
  }

  #[test]
  #[ignore = "real filesystem events, timing-dependent: cargo test -- --ignored"]
  fn the_watcher_reports_writes_by_relative_path() {
    let (_dir, root) = library();
    let (send, receive) = std::sync::mpsc::channel();
    let _watcher = watch_root(&root, move |paths, rescan| send.send((paths, rescan)).unwrap()).unwrap();
    std::thread::sleep(Duration::from_millis(300));
    let cache = HashCache::default();
    write(&root, "trash/a.worksheet.json", "A", "absent", &cache).unwrap();
    write(&root, "b.worksheet.json", "B", "absent", &cache).unwrap();
    let mut seen = BTreeSet::new();
    while let Ok((paths, _)) = receive.recv_timeout(Duration::from_secs(10)) {
      seen.extend(paths);
      if seen.contains("b.worksheet.json") && seen.contains("trash/a.worksheet.json") {
        break;
      }
    }
    assert!(seen.contains("b.worksheet.json") && seen.contains("trash/a.worksheet.json"), "{seen:?}");
    assert!(seen.iter().all(|p| !p.ends_with(".tmp")), "{seen:?}");
  }

  #[test]
  fn results_serialise_as_the_bridge_expects() {
    let json = |v: serde_json::Result<String>| v.unwrap();
    assert_eq!(json(serde_json::to_string(&ReadResult::Missing)), r#"{"status":"missing"}"#);
    assert_eq!(
      json(serde_json::to_string(&WriteResult::Unavailable { reason: Reason::NewerFormat })),
      r#"{"status":"unavailable","reason":"newer-format"}"#
    );
    let entry = FileEntry { path: "a.json".into(), size: 1, mtime_ms: 2, hash: None, state: FileState::Placeholder };
    assert_eq!(
      json(serde_json::to_string(&ListResult::Ok { files: vec![entry] })),
      r#"{"status":"ok","files":[{"path":"a.json","size":1,"mtimeMs":2,"hash":null,"state":"placeholder"}]}"#
    );
    assert_eq!(json(serde_json::to_string(&RemoveResult::Ok)), r#"{"status":"ok"}"#);
  }
}
