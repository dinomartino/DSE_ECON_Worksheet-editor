//! Offline OCR for imports: PP-OCRv6 small (detection + recognition) on ONNX Runtime, linked
//! into the app. Two commands:
//!
//! - `ocr_status` → `{ available, engine, version }`; cheap, never loads the models.
//! - `ocr_image`, raw body = PNG or JPEG bytes, optional header `x-ocr-max-side` (default
//!   2400) → `{ width, height, lines: [{ text, score, box, angle? }], ms }`. `width`/`height`
//!   are the decoded image (EXIF orientation applied); boxes are clockwise from the top-left in
//!   that image's pixels even when the page was scaled down to read it. `angle` is the reading
//!   direction in degrees clockwise (−90: bottom-to-top margin text), only when not level.
//!
//! Errors are strings prefixed `decode:`, `model:` or `internal:`. The models load once, on the
//! first page, and pages run one at a time on the blocking pool.

mod detect;
mod engine;
mod recognize;

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use image::{imageops, DynamicImage, ImageDecoder, ImageReader, RgbImage};
use serde::Serialize;
use tauri::{ipc::InvokeBody, path::BaseDirectory, AppHandle, Manager, Runtime, State};

pub use engine::Engine;

pub const ENGINE: &str = "PP-OCRv6 small";
/// Bumped when the models, the ONNX Runtime or the pipeline settings change what comes back.
pub const VERSION: &str = "1 (onnxruntime 1.22.0)";
const DEFAULT_MAX_SIDE: u32 = 2400;
const MODEL_FILES: [&str; 3] = ["det.onnx", "rec.onnx", "rec_dict.txt"];

#[derive(Default)]
pub struct OcrState {
  engine: Arc<Mutex<Option<Engine>>>,
}

#[derive(Serialize)]
pub struct OcrStatus {
  available: bool,
  engine: &'static str,
  version: &'static str,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
  pub text: String,
  pub score: f32,
  #[serde(rename = "box")]
  pub quad: [[f32; 2]; 4],
  #[serde(skip_serializing_if = "Option::is_none")]
  pub angle: Option<f32>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
  pub width: u32,
  pub height: u32,
  pub lines: Vec<OcrLine>,
  pub ms: u64,
}

fn model_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
  let dir = app.path().resolve("ocr", BaseDirectory::Resource).ok()?;
  MODEL_FILES.iter().all(|f| dir.join(f).is_file()).then_some(dir)
}

#[tauri::command]
pub fn ocr_status<R: Runtime>(app: AppHandle<R>) -> OcrStatus {
  OcrStatus { available: model_dir(&app).is_some(), engine: ENGINE, version: VERSION }
}

#[tauri::command]
pub async fn ocr_image<R: Runtime>(
  app: AppHandle<R>,
  state: State<'_, OcrState>,
  request: tauri::ipc::Request<'_>,
) -> Result<OcrResult, String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("decode: send the image bytes as the raw request body".into());
  };
  let bytes = bytes.clone();
  let max_side = match request.headers().get("x-ocr-max-side") {
    None => DEFAULT_MAX_SIDE,
    Some(v) => v
      .to_str()
      .ok()
      .and_then(|s| s.trim().parse::<f64>().ok())
      .filter(|n| n.is_finite() && *n >= 32.0)
      .map(|n| n.min(20_000.0) as u32)
      .ok_or("decode: x-ocr-max-side must be a number of at least 32")?,
  };
  let dir = model_dir(&app).ok_or("model: the OCR models are not in this build")?;
  let engine = state.engine.clone();
  tauri::async_runtime::spawn_blocking(move || {
    let mut slot = engine.lock().unwrap_or_else(|p| p.into_inner());
    if slot.is_none() {
      *slot = Some(Engine::load(&dir)?);
    }
    run(slot.as_mut().expect("engine loaded above"), &bytes, max_side)
  })
  .await
  .map_err(|e| format!("internal: {e}"))?
}

/// Decodes PNG/JPEG bytes, upright by their EXIF orientation.
pub fn decode(bytes: &[u8]) -> Result<RgbImage, String> {
  let mut decoder = ImageReader::new(Cursor::new(bytes))
    .with_guessed_format()
    .map_err(|e| format!("decode: {e}"))?
    .into_decoder()
    .map_err(|e| format!("decode: {e}"))?;
  let orientation = decoder.orientation().ok();
  let mut img = DynamicImage::from_decoder(decoder).map_err(|e| format!("decode: {e}"))?;
  if let Some(o) = orientation {
    img.apply_orientation(o);
  }
  Ok(img.to_rgb8())
}

/// One page: decode, scale down so the longer side is at most `max_side`, read, and map the
/// boxes back to the decoded image.
pub fn run(engine: &mut Engine, bytes: &[u8], max_side: u32) -> Result<OcrResult, String> {
  let start = Instant::now();
  let img = decode(bytes)?;
  let (width, height) = img.dimensions();
  let scale = (max_side as f32 / width.max(height) as f32).min(1.0);
  let page = if scale < 1.0 {
    let w = ((width as f32 * scale).round() as u32).max(1);
    let h = ((height as f32 * scale).round() as u32).max(1);
    imageops::resize(&img, w, h, imageops::FilterType::Triangle)
  } else {
    img
  };
  let (kx, ky) = (width as f32 / page.width() as f32, height as f32 / page.height() as f32);
  let lines = engine
    .read_page(&page)?
    .into_iter()
    .map(|l| OcrLine {
      text: l.text,
      score: (l.score.clamp(0.0, 1.0) * 1e4).round() / 1e4,
      quad: l.quad.map(|[x, y]| [(x * kx * 10.0).round() / 10.0, (y * ky * 10.0).round() / 10.0]),
      angle: l.angle,
    })
    .collect();
  Ok(OcrResult { width, height, lines, ms: start.elapsed().as_millis() as u64 })
}

/// Where the models are in a source checkout (`cargo test`, tools).
pub fn source_model_dir() -> &'static Path {
  Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/ocr"))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn engine() -> Engine {
    Engine::load(source_model_dir()).expect("models in resources/ocr (build.rs downloads them)")
  }

  /// The real models on a rendered page: English, Traditional Chinese, a lone label and
  /// bottom-to-top margin text. Runs both models (about a second in a debug build).
  #[test]
  fn reads_english_chinese_and_margin_text() {
    let png = include_bytes!("../../tests/fixtures/ocr-sample.png");
    let r = run(&mut engine(), png, DEFAULT_MAX_SIDE).unwrap();
    assert_eq!((r.width, r.height), (1000, 480));
    let texts: Vec<&str> = r.lines.iter().map(|l| l.text.as_str()).collect();
    let has = |want: &str| r.lines.iter().find(|l| l.text.replace(' ', "").contains(&want.replace(' ', "")));
    let line = has("Demand rises when income increases by 12.5%").unwrap_or_else(|| panic!("{texts:?}"));
    assert!(line.score > 0.9 && line.angle.is_none(), "{line:?}");
    // Clockwise from the top-left, around the text drawn at (140, 40).
    let [tl, tr, br, bl] = line.quad;
    assert!(tl[0] < 145.0 && tl[1] < 48.0 && tr[0] > 780.0 && br[1] > 65.0 && bl[0] < 145.0, "{:?}", line.quad);
    assert!(has("需求與供應決定市場價格").is_some(), "{texts:?}");
    assert!(has("(b) Explain the law of diminishing returns. (4 marks)").is_some(), "{texts:?}");
    // The detector joins a label to its line; the TS adapter splits "1. Demand…".
    assert!(line.text.starts_with("1."), "{texts:?}");
    let margin = has("寫於邊界以外的答案").unwrap_or_else(|| panic!("{texts:?}"));
    assert_eq!(margin.angle, Some(-90.0));
  }

  /// Boxes stay in the decoded image's pixels when the page is read scaled down.
  #[test]
  fn boxes_are_in_original_pixels_after_downscale() {
    let png = include_bytes!("../../tests/fixtures/ocr-sample.png");
    let mut e = engine();
    let full = run(&mut e, png, DEFAULT_MAX_SIDE).unwrap();
    let half = run(&mut e, png, 600).unwrap();
    assert_eq!((half.width, half.height), (1000, 480));
    let find = |r: &OcrResult| r.lines.iter().find(|l| l.text.contains("Demand")).map(|l| l.quad).unwrap();
    let (a, b) = (find(&full), find(&half));
    for k in 0..4 {
      assert!((a[k][0] - b[k][0]).abs() < 12.0 && (a[k][1] - b[k][1]).abs() < 12.0, "{a:?} vs {b:?}");
    }
  }

  #[test]
  fn undecodable_bytes_are_a_decode_error() {
    let err = decode(b"not an image").unwrap_err();
    assert!(err.starts_with("decode:"), "{err}");
  }

  /// Real scans, for scoring against the trial: `OCR_SCANS_IN=<dir of pngs>
  /// OCR_SCANS_OUT=<dir> cargo test --release read_scans_dir -- --ignored --nocapture` writes the trial
  /// harness's JSON (`{width,height,ms,lines:[{text,conf,box:{x,y,w,h}}]}`) per page.
  #[test]
  #[ignore]
  fn read_scans_dir() {
    let (Ok(input), Ok(out)) = (std::env::var("OCR_SCANS_IN"), std::env::var("OCR_SCANS_OUT")) else { return };
    std::fs::create_dir_all(&out).unwrap();
    let t = Instant::now();
    let mut e = engine();
    eprintln!("models loaded in {} ms", t.elapsed().as_millis());
    let mut files: Vec<_> = std::fs::read_dir(&input).unwrap().filter_map(|f| f.ok()).map(|f| f.path()).collect();
    files.sort();
    for path in files.into_iter().filter(|p| p.extension().is_some_and(|x| x == "png" || x == "jpg")) {
      let r = run(&mut e, &std::fs::read(&path).unwrap(), DEFAULT_MAX_SIDE).unwrap();
      let lines: Vec<_> = r
        .lines
        .iter()
        .map(|l| {
          let xs = l.quad.map(|p| p[0]);
          let ys = l.quad.map(|p| p[1]);
          let (x0, x1) = (xs.iter().cloned().fold(f32::MAX, f32::min), xs.iter().cloned().fold(f32::MIN, f32::max));
          let (y0, y1) = (ys.iter().cloned().fold(f32::MAX, f32::min), ys.iter().cloned().fold(f32::MIN, f32::max));
          serde_json::json!({ "text": l.text, "conf": l.score, "angle": l.angle, "box": { "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0 } })
        })
        .collect();
      let name = path.file_stem().unwrap().to_string_lossy().to_string();
      let doc = serde_json::json!({ "width": r.width, "height": r.height, "ms": r.ms, "lines": lines });
      std::fs::write(format!("{out}/{name}.json"), serde_json::to_vec(&doc).unwrap()).unwrap();
      eprintln!("{name} {} ms {} lines", r.ms, r.lines.len());
    }
  }
}
