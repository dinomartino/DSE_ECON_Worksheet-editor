//! macOS: `-[WKWebView printOperationWithPrintInfo:]` run as a save job to a file URL.
//!
//! WKWebView paginates to the `NSPrintInfo` paper, not to CSS `@page size`, so the page
//! box is set here from the worksheet's setup, with zero margins: the sheets carry their
//! own margins as padding, and `@page { margin: 0 }` matches. Run modal for the window —
//! a synchronous `runOperation` gets blank pages, as WKWebView renders them
//! asynchronously — with no print or progress panel; the delegate reports completion.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::Path;
use std::sync::Mutex;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass, MainThreadMarker};
use objc2_app_kit::{
  NSPaperOrientation, NSPrintAllPages, NSPrintFirstPage, NSPrintHeaderAndFooter, NSPrintInfo,
  NSPrintJobSavingURL, NSPrintLastPage, NSPrintOperation, NSPrintSaveJob,
};
use objc2_foundation::{
  NSCopying, NSNumber, NSObject, NSObjectNSThreadPerformAdditions, NSObjectProtocol, NSSize,
  NSString, NSURL,
};
use objc2_web_kit::WKWebView;

use super::{Done, PageBox};

pub struct Ivars {
  done: Mutex<Option<Done>>,
}

define_class!(
  // SAFETY: NSObject has no subclassing requirements, and this type does not implement Drop.
  // Any thread: WKWebView lets the operation spawn its own thread, and AppKit calls
  // `didRun` from that thread.
  #[unsafe(super(NSObject))]
  #[name = "EconWorksheetPdfPrintDelegate"]
  #[ivars = Ivars]
  pub struct PdfPrintDelegate;

  impl PdfPrintDelegate {
    /// `runOperationModalForWindow:delegate:didRunSelector:contextInfo:`'s callback, on
    /// the print thread: the result goes on to the main thread.
    #[unsafe(method(printOperationDidRun:success:contextInfo:))]
    fn did_run(&self, _operation: *mut AnyObject, success: bool, _context: *mut c_void) {
      let result = NSNumber::new_bool(success);
      // SAFETY: `finish:` is defined below and takes an NSNumber.
      unsafe {
        self.performSelectorOnMainThread_withObject_waitUntilDone(
          sel!(finish:),
          Some(&result),
          false,
        )
      };
    }

    #[unsafe(method(finish:))]
    fn finish(&self, success: &NSNumber) {
      let done = self.ivars().done.lock().ok().and_then(|mut slot| slot.take());
      if let Some(done) = done {
        done(if success.as_bool() {
          Ok(())
        } else {
          Err("The print job did not complete".into())
        });
      }
    }
  }

  unsafe impl NSObjectProtocol for PdfPrintDelegate {}
);

impl PdfPrintDelegate {
  fn new(done: Done) -> Retained<Self> {
    let this = Self::alloc().set_ivars(Ivars {
      done: Mutex::new(Some(done)),
    });
    // SAFETY: NSObject's designated initialiser.
    unsafe { msg_send![super(this), init] }
  }

  fn running(&self) -> bool {
    self.ivars().done.lock().is_ok_and(|slot| slot.is_some())
  }
}

thread_local! {
  /// The delegate of the job in flight. AppKit does not retain a delegate, so it is held
  /// here (main thread) until the next job replaces it.
  static DELEGATE: RefCell<Option<Retained<PdfPrintDelegate>>> = const { RefCell::new(None) };
}

/// Print `webview` to `path`. `done` is called exactly once, on the main thread.
///
/// # Safety
/// `webview` must point to a live `WKWebView`, and this must run on the main thread.
pub unsafe fn print_to_pdf(webview: *mut c_void, path: &Path, page: PageBox, done: Done) {
  if MainThreadMarker::new().is_none() {
    return done(Err("PDF export must start on the main thread".into()));
  }
  if DELEGATE.with(|slot| slot.borrow().as_ref().is_some_and(|d| d.running())) {
    return done(Err("A PDF export is already running".into()));
  }
  let webview: &WKWebView = &*(webview as *const WKWebView);
  let Some(window) = webview.window() else {
    return done(Err("The page has no window to print from".into()));
  };
  let Some(path) = path.to_str() else {
    return done(Err("The path is not valid UTF-8".into()));
  };
  let url = NSURL::fileURLWithPath(&NSString::from_str(path));

  // A copy: the shared info is what the print sheet (`window.print`) starts from.
  let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
  let (width, height) = if page.landscape {
    (page.height_pt, page.width_pt)
  } else {
    (page.width_pt, page.height_pt)
  };
  info.setOrientation(if page.landscape {
    NSPaperOrientation::Landscape
  } else {
    NSPaperOrientation::Portrait
  });
  info.setPaperSize(NSSize::new(width, height));
  info.setTopMargin(0.0);
  info.setRightMargin(0.0);
  info.setBottomMargin(0.0);
  info.setLeftMargin(0.0);
  info.setScalingFactor(1.0);
  info.setHorizontallyCentered(false);
  info.setVerticallyCentered(false);
  info.setJobDisposition(NSPrintSaveJob);
  let dictionary = info.dictionary();
  dictionary.insert(NSPrintJobSavingURL, &url);
  dictionary.insert(NSPrintHeaderAndFooter, &NSNumber::new_bool(false));
  if page.pages > 0 {
    dictionary.insert(NSPrintAllPages, &NSNumber::new_bool(false));
    dictionary.insert(NSPrintFirstPage, &NSNumber::new_u32(1));
    dictionary.insert(NSPrintLastPage, &NSNumber::new_u32(page.pages));
  }

  let operation: Retained<NSPrintOperation> = webview.printOperationWithPrintInfo(&info);
  operation.setShowsPrintPanel(false);
  operation.setShowsProgressPanel(false);
  operation.setJobTitle(url.lastPathComponent().as_deref());

  let delegate = PdfPrintDelegate::new(done);
  DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate.clone()));
  let delegate: &AnyObject = &delegate;
  operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
    &window,
    Some(delegate),
    Some(sel!(printOperationDidRun:success:contextInfo:)),
    std::ptr::null_mut(),
  );
}
