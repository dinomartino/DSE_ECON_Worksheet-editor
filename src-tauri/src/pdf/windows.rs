//! Windows: WebView2's `ICoreWebView2_7::PrintToPdf`, Chromium's print-to-PDF.
//!
//! Chromium takes the paper from the settings rather than CSS `@page size`, so the page
//! box is set here, with zero margins (the sheets carry their own) and no browser
//! header/footer. Needs a WebView2 runtime with `ICoreWebView2_7` (2021+); an older one
//! reports an error and the JS side falls back to the print sheet.

use std::path::Path;
use std::sync::{Arc, Mutex};

use webview2_com::Microsoft::Web::WebView2::Win32::{
  ICoreWebView2Controller, ICoreWebView2Environment, ICoreWebView2Environment6,
  ICoreWebView2PrintSettings2, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
  COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

use super::{Done, PageBox};

const POINTS_PER_INCH: f64 = 72.0;

/// Start the print; `done` is called exactly once (from WebView2's completion, on the UI
/// thread, or here if the job could not start).
pub fn print_to_pdf(
  controller: &ICoreWebView2Controller,
  environment: &ICoreWebView2Environment,
  path: &Path,
  page: PageBox,
  done: Done,
) {
  let done = Arc::new(Mutex::new(Some(done)));
  let finish = {
    let done = Arc::clone(&done);
    move |result: Result<(), String>| {
      if let Some(done) = done.lock().ok().and_then(|mut slot| slot.take()) {
        done(result);
      }
    }
  };
  let on_complete = finish.clone();
  let handler = PrintToPdfCompletedHandler::create(Box::new(move |status, success| {
    on_complete(match status {
      Err(err) => Err(format!("WebView2 could not write the PDF: {err}")),
      Ok(()) if !success => Err("WebView2 could not write the PDF".into()),
      Ok(()) => Ok(()),
    });
    Ok(())
  }));
  // SAFETY: WebView2 COM calls, made on the UI thread `with_webview` runs us on.
  let started = unsafe {
    (|| -> windows::core::Result<()> {
      let webview = controller.CoreWebView2()?.cast::<ICoreWebView2_7>()?;
      let settings = environment
        .cast::<ICoreWebView2Environment6>()?
        .CreatePrintSettings()?;
      settings.SetOrientation(if page.landscape {
        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
      } else {
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
      })?;
      // Portrait dimensions: the orientation turns them.
      settings.SetPageWidth(page.width_pt / POINTS_PER_INCH)?;
      settings.SetPageHeight(page.height_pt / POINTS_PER_INCH)?;
      settings.SetMarginTop(0.0)?;
      settings.SetMarginRight(0.0)?;
      settings.SetMarginBottom(0.0)?;
      settings.SetMarginLeft(0.0)?;
      settings.SetScaleFactor(1.0)?;
      settings.SetShouldPrintBackgrounds(true)?;
      settings.SetShouldPrintHeaderAndFooter(false)?;
      // Page ranges need a newer runtime; without them every page prints.
      if page.pages > 0 {
        if let Ok(ranged) = settings.cast::<ICoreWebView2PrintSettings2>() {
          ranged.SetPageRanges(&HSTRING::from(format!("1-{}", page.pages)))?;
        }
      }
      let target = HSTRING::from(path.as_os_str());
      webview.PrintToPdf(&target, &settings, &handler)
    })()
  };
  if let Err(err) = started {
    finish(Err(format!("WebView2 cannot print to PDF here: {err}")));
  }
}
