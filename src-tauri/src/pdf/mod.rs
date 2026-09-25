//! Export → PDF on desktop: the webview's own print of the page, written straight to a
//! file, with no print sheet (§ PDF is a print of the sheets, chosen in Export).
//!
//! The page is prepared by the JS side exactly as for the print sheet (mode, `@page`
//! vars, settled sheets); this only swaps the destination. Print media CSS applies on
//! both engines, so `data-print-hide` and the `#print-root` rules hold.

use std::path::PathBuf;
use std::time::Duration;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// The page box in points, portrait width × height; `landscape` turns it. `pages` is the
/// sheet count (0 = all): the last sheet can overrun the engine's page by a fraction of a
/// pixel, which WebKit prints as a blank trailing page.
#[derive(Clone, Copy, Debug)]
pub struct PageBox {
  pub width_pt: f64,
  pub height_pt: f64,
  pub landscape: bool,
  pub pages: u32,
}

/// Called once, on the main thread, when the file is written (or the print failed).
pub type Done = Box<dyn FnOnce(Result<(), String>) + Send + 'static>;

/// Longer than any worksheet takes; past it the call fails and JS falls back to the sheet.
const TIMEOUT: Duration = Duration::from_secs(120);

/// Largest page side accepted, in points (A0 is 3370).
const MAX_SIDE_PT: f64 = 5000.0;

/// Print the calling window's page to `path` as a PDF. Resolves once the file is on
/// disk; an `Err` means nothing usable was written and the caller may fall back.
#[tauri::command]
pub async fn print_to_pdf(
  window: tauri::WebviewWindow,
  path: String,
  width_pt: f64,
  height_pt: f64,
  landscape: bool,
  pages: u32,
) -> Result<(), String> {
  let target = PathBuf::from(&path);
  let is_pdf = target
    .extension()
    .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
  if !target.is_absolute() || !is_pdf {
    return Err(format!("Not an absolute .pdf path: {path}"));
  }
  // The engines report a missing folder only as a failed job.
  if !target.parent().is_some_and(|dir| dir.is_dir()) {
    return Err(format!("The folder for {path} does not exist"));
  }
  let valid = |side: f64| side.is_finite() && side > 0.0 && side <= MAX_SIDE_PT;
  if !valid(width_pt) || !valid(height_pt) {
    return Err(format!("Invalid page size: {width_pt} × {height_pt} pt"));
  }
  let page = PageBox {
    width_pt,
    height_pt,
    landscape,
    pages,
  };

  let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
  let done: Done = Box::new(move |result| {
    let _ = tx.send(result);
  });
  let job_target = target.clone();
  window
    .with_webview(move |webview| run(webview, job_target, page, done))
    .map_err(|err| err.to_string())?;

  match tokio::time::timeout(TIMEOUT, rx).await {
    Ok(Ok(result)) => result?,
    Ok(Err(_)) => return Err("The print job ended without a result".into()),
    Err(_) => return Err("Timed out writing the PDF".into()),
  }
  match std::fs::metadata(&target) {
    Ok(meta) if meta.len() > 0 => Ok(()),
    _ => Err("The print job finished but wrote no PDF".into()),
  }
}

/// On the main thread, inside `with_webview`.
#[allow(unused_variables)]
fn run(webview: tauri::webview::PlatformWebview, target: PathBuf, page: PageBox, done: Done) {
  #[cfg(target_os = "macos")]
  // SAFETY: `inner()` is the live WKWebView, and `with_webview` runs this on the main thread.
  unsafe {
    macos::print_to_pdf(webview.inner(), &target, page, done)
  };
  #[cfg(target_os = "windows")]
  windows::print_to_pdf(
    &webview.controller(),
    &webview.environment(),
    &target,
    page,
    done,
  );
  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  done(Err("Saving a PDF directly is not supported on this platform".into()));
}
