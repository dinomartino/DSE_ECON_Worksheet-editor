//! The two ONNX sessions and one page through them: detect lines on a ≤960 px copy, map the
//! boxes back to the page, cut each line out at full resolution, recognise in batches.

use std::path::Path;

use image::{imageops, RgbImage};
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;

use super::detect::{self, Quad, DET_PARAMS};
use super::recognize;

/// Crops per recognizer run, sorted by aspect ratio first so a batch pads little. Padding
/// shifts what the recognizer reads, so this stays at the trial's (`oar-ocr`'s CPU default).
const REC_BATCH: usize = 4;

pub struct Line {
  pub text: String,
  pub score: f32,
  pub quad: Quad,
  /// Reading direction in degrees clockwise from left-to-right; None when level.
  pub angle: Option<f32>,
}

pub struct Engine {
  det: Session,
  rec: Session,
  dict: String,
  chars: Option<Vec<String>>,
}

fn session(path: &Path) -> Result<Session, String> {
  let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8);
  Session::builder()
    .and_then(|b| b.with_optimization_level(GraphOptimizationLevel::Level3))
    .and_then(|b| b.with_intra_threads(threads))
    .and_then(|b| b.commit_from_file(path))
    .map_err(|e| format!("model: {}: {e}", path.file_name().unwrap_or_default().to_string_lossy()))
}

impl Engine {
  /// `dir` holds `det.onnx`, `rec.onnx` and `rec_dict.txt`.
  pub fn load(dir: &Path) -> Result<Engine, String> {
    let dict = std::fs::read_to_string(dir.join("rec_dict.txt")).map_err(|e| format!("model: rec_dict.txt: {e}"))?;
    Ok(Engine { det: session(&dir.join("det.onnx"))?, rec: session(&dir.join("rec.onnx"))?, dict, chars: None })
  }

  pub fn read_page(&mut self, page: &RgbImage) -> Result<Vec<Line>, String> {
    let boxes = self.detect(page)?;
    let mut crops: Vec<(Quad, RgbImage, bool)> = Vec::with_capacity(boxes.len());
    for (quad, _) in boxes {
      let Some(crop) = recognize::crop_line(page, &quad) else { continue };
      let vertical = recognize::is_vertical(&crop);
      crops.push((quad, crop, vertical));
    }
    // A vertical line is read both ways round: margin text runs top-to-bottom on one side of
    // a page and bottom-to-top on the other. -1: turned anticlockwise (PaddleOCR's only
    // choice; uprights top-to-bottom text); 1: turned clockwise (uprights bottom-to-top).
    let mut inputs: Vec<(usize, i8, RgbImage)> = Vec::new();
    for (i, (_, crop, vertical)) in crops.iter().enumerate() {
      if *vertical {
        inputs.push((i, -1, imageops::rotate270(crop)));
        inputs.push((i, 1, imageops::rotate90(crop)));
      } else {
        inputs.push((i, 0, crop.clone()));
      }
    }
    let ratio = |im: &RgbImage| im.width() as f32 / im.height().max(1) as f32;
    let mut order: Vec<usize> = (0..inputs.len()).collect();
    order.sort_by(|&a, &b| ratio(&inputs[a].2).total_cmp(&ratio(&inputs[b].2)));
    let mut read: Vec<Option<(String, f32, i8)>> = vec![None; crops.len()];
    for chunk in order.chunks(REC_BATCH) {
      let images: Vec<&RgbImage> = chunk.iter().map(|&k| &inputs[k].2).collect();
      for (&k, (text, score)) in chunk.iter().zip(self.recognize(&images)?) {
        let (line, turn, _) = &inputs[k];
        let best = &mut read[*line];
        // PaddleOCR's turn is the default; the other must read clearly better.
        let better = match best {
          None => true,
          Some((_, s, t)) => score > *s + if *t == -1 { 0.05 } else { -0.05 },
        };
        if better {
          *best = Some((text, score, *turn));
        }
      }
    }
    Ok(crops
      .into_iter()
      .zip(read)
      .filter_map(|((quad, _, _), r)| {
        let (text, score, turn) = r?;
        if text.trim().is_empty() {
          return None;
        }
        let angle = match turn {
          -1 => Some(90.0),
          1 => Some(-90.0),
          _ => {
            let a = (quad[1][1] - quad[0][1]).atan2(quad[1][0] - quad[0][0]).to_degrees();
            (a.abs() >= 1.0).then(|| (a * 10.0).round() / 10.0)
          }
        };
        Some(Line { text, score, quad, angle })
      })
      .collect())
  }

  fn detect(&mut self, page: &RgbImage) -> Result<Vec<(Quad, f32)>, String> {
    let (w, h) = page.dimensions();
    let (dw, dh) = detect::det_input_size(w, h, DET_PARAMS.limit_side);
    let small = imageops::resize(page, dw, dh, imageops::FilterType::Triangle);
    let plane = (dw * dh) as usize;
    let mut data = vec![0.0f32; 3 * plane];
    // BGR order with ImageNet mean/std in that same order, as PaddleOCR's DB config.
    const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
    const STD: [f32; 3] = [0.229, 0.224, 0.225];
    for (i, px) in small.pixels().enumerate() {
      for (c, &v) in [px[2], px[1], px[0]].iter().enumerate() {
        data[c * plane + i] = (v as f32 / 255.0 - MEAN[c]) / STD[c];
      }
    }
    let input = Tensor::from_array(([1usize, 3, dh as usize, dw as usize], data)).map_err(|e| format!("internal: {e}"))?;
    let outputs = self.det.run(ort::inputs![input]).map_err(|e| format!("model: detection: {e}"))?;
    let (shape, pred) = outputs[0].try_extract_tensor::<f32>().map_err(|e| format!("model: detection output: {e}"))?;
    let (mh, mw) = (shape[shape.len() - 2] as usize, shape[shape.len() - 1] as usize);
    if mh * mw > pred.len() {
      return Err(format!("model: detection output shape {shape:?}"));
    }
    Ok(detect::boxes_from_map(&pred[..mh * mw], mw, mh, w as f32, h as f32, &DET_PARAMS))
  }

  fn recognize(&mut self, crops: &[&RgbImage]) -> Result<Vec<(String, f32)>, String> {
    let (data, width) = recognize::rec_batch(crops);
    let shape = [crops.len(), 3, recognize::REC_HEIGHT as usize, width];
    let input = Tensor::from_array((shape, data)).map_err(|e| format!("internal: {e}"))?;
    let outputs = self.rec.run(ort::inputs![input]).map_err(|e| format!("model: recognition: {e}"))?;
    let (shape, probs) = outputs[0].try_extract_tensor::<f32>().map_err(|e| format!("model: recognition output: {e}"))?;
    if shape.len() != 3 || shape[0] as usize != crops.len() {
      return Err(format!("model: recognition output shape {shape:?}"));
    }
    let (steps, classes) = (shape[1] as usize, shape[2] as usize);
    if self.chars.is_none() {
      self.chars = Some(recognize::alphabet(&self.dict, classes)?);
    }
    let chars = self.chars.as_deref().unwrap_or_default();
    if chars.len() != classes {
      return Err(format!("model: recognizer has {classes} classes, expected {}", chars.len()));
    }
    Ok(probs.chunks_exact(steps * classes).map(|row| recognize::ctc_decode(row, classes, chars)).collect())
  }
}
