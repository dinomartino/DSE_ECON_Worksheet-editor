//! Text recognition: cut each line out of the page upright, batch it for the CRNN recognizer
//! (height 48, BGR, `(v/255 - 0.5) / 0.5`, zero padding on the right), and greedy-CTC-decode
//! the output with the model's alphabet.

use image::{imageops, Rgb, RgbImage};

use super::detect::Quad;

pub const REC_HEIGHT: u32 = 48;
/// The narrowest batch is 320 wide (ratio 320/48); none is wider than this.
const REC_MIN_WIDTH: u32 = 320;
const REC_MAX_WIDTH: u32 = 3200;

/// A line whose box is at least this much taller than wide is vertical (margin text).
const VERTICAL_RATIO: f32 = 1.5;

/// The line inside `quad`, rectified to an upright rectangle (PaddleOCR's
/// `get_rotate_crop_image`). Axis-aligned boxes are a plain crop; rotated ones are resampled
/// bilinearly with edge pixels repeated. None when the box has no area inside the image.
pub fn crop_line(img: &RgbImage, quad: &Quad) -> Option<RgbImage> {
  let [tl, tr, br, bl] = *quad;
  let dist = |a: [f32; 2], b: [f32; 2]| ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt();
  let cw = dist(tl, tr).max(dist(bl, br)).round() as u32;
  let ch = dist(tl, bl).max(dist(tr, br)).round() as u32;
  if cw == 0 || ch == 0 {
    return None;
  }
  let axis_aligned = tl[1] == tr[1] && bl[1] == br[1] && tl[0] == bl[0] && tr[0] == br[0];
  if axis_aligned {
    let x0 = tl[0].max(0.0) as u32;
    let y0 = tl[1].max(0.0) as u32;
    let x1 = (tr[0].min(img.width() as f32)) as u32;
    let y1 = (bl[1].min(img.height() as f32)) as u32;
    if x1 <= x0 || y1 <= y0 {
      return None;
    }
    return Some(imageops::crop_imm(img, x0, y0, x1 - x0, y1 - y0).to_image());
  }
  // dst (u, v) ↦ tl + u/cw * (tr - tl) + v/ch * (bl - tl): the box is a rectangle, so the
  // perspective transform cv2 would solve for is this affine one.
  let (ux, uy) = ((tr[0] - tl[0]) / cw as f32, (tr[1] - tl[1]) / cw as f32);
  let (vx, vy) = ((bl[0] - tl[0]) / ch as f32, (bl[1] - tl[1]) / ch as f32);
  let mut out = RgbImage::new(cw, ch);
  for v in 0..ch {
    for u in 0..cw {
      let x = tl[0] + u as f32 * ux + v as f32 * vx;
      let y = tl[1] + u as f32 * uy + v as f32 * vy;
      out.put_pixel(u, v, sample_bilinear(img, x, y));
    }
  }
  Some(out)
}

fn sample_bilinear(img: &RgbImage, x: f32, y: f32) -> Rgb<u8> {
  let (w, h) = (img.width() as i64, img.height() as i64);
  let (x0, y0) = (x.floor(), y.floor());
  let (fx, fy) = (x - x0, y - y0);
  let px = |xi: i64, yi: i64| img.get_pixel(xi.clamp(0, w - 1) as u32, yi.clamp(0, h - 1) as u32).0;
  let (xi, yi) = (x0 as i64, y0 as i64);
  let (a, b, c, d) = (px(xi, yi), px(xi + 1, yi), px(xi, yi + 1), px(xi + 1, yi + 1));
  let mut o = [0u8; 3];
  for k in 0..3 {
    let top = a[k] as f32 * (1.0 - fx) + b[k] as f32 * fx;
    let bottom = c[k] as f32 * (1.0 - fx) + d[k] as f32 * fx;
    o[k] = (top * (1.0 - fy) + bottom * fy).round().clamp(0.0, 255.0) as u8;
  }
  Rgb(o)
}

pub fn is_vertical(crop: &RgbImage) -> bool {
  crop.height() as f32 >= crop.width() as f32 * VERTICAL_RATIO
}

/// The batch tensor `[n, 3, 48, width]` and its width. Every crop keeps its aspect ratio;
/// the batch is as wide as its widest crop needs (at least 320, at most 3200).
pub fn rec_batch(crops: &[&RgbImage]) -> (Vec<f32>, usize) {
  let h = REC_HEIGHT as f32;
  let max_ratio = crops
    .iter()
    .map(|c| c.width() as f32 / c.height().max(1) as f32)
    .fold(REC_MIN_WIDTH as f32 / h, f32::max);
  let width = ((h * max_ratio) as u32).min(REC_MAX_WIDTH) as usize;
  let plane = REC_HEIGHT as usize * width;
  let mut data = vec![0.0f32; crops.len() * 3 * plane];
  for (i, crop) in crops.iter().enumerate() {
    let ratio = crop.width() as f32 / crop.height().max(1) as f32;
    let rw = ((h * ratio).ceil() as u32).clamp(1, width as u32);
    let resized = imageops::resize(*crop, rw, REC_HEIGHT, imageops::FilterType::Triangle);
    let base = i * 3 * plane;
    for (x, y, px) in resized.enumerate_pixels() {
      let at = y as usize * width + x as usize;
      // BGR channel order, as the Paddle models were trained.
      for (c, &v) in [px[2], px[1], px[0]].iter().enumerate() {
        data[base + c * plane + at] = (v as f32 / 255.0 - 0.5) / 0.5;
      }
    }
  }
  (data, width)
}

/// Index 0 is the CTC blank; then the dictionary; then a space when the model has one more
/// class than that (PaddleOCR's `use_space_char`).
pub fn alphabet(dict: &str, classes: usize) -> Result<Vec<String>, String> {
  let mut chars: Vec<String> = std::iter::once(String::new()).chain(dict.lines().map(str::to_owned)).collect();
  if classes == chars.len() + 1 {
    chars.push(" ".into());
  }
  if classes != chars.len() {
    return Err(format!("model: recognizer has {classes} classes, dictionary {} entries", chars.len() - 1));
  }
  Ok(chars)
}

/// Greedy CTC over one `[steps, classes]` row of probabilities: best class per step, repeats
/// collapsed, blanks dropped. The score is the mean probability of the kept characters.
pub fn ctc_decode(probs: &[f32], classes: usize, chars: &[String]) -> (String, f32) {
  let mut text = String::new();
  let (mut sum, mut kept) = (0.0f32, 0usize);
  let mut prev = usize::MAX;
  for step in probs.chunks_exact(classes) {
    let (best, p) = step
      .iter()
      .enumerate()
      .fold((0usize, f32::MIN), |acc, (i, &v)| if v > acc.1 { (i, v) } else { acc });
    if best != prev && best != 0 {
      text.push_str(&chars[best]);
      sum += p;
      kept += 1;
    }
    prev = best;
  }
  let score = if kept == 0 { 0.0 } else { sum / kept as f32 };
  (text, score)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn onehot(seq: &[usize], classes: usize, p: f32) -> Vec<f32> {
    let mut out = vec![(1.0 - p) / (classes - 1) as f32; seq.len() * classes];
    for (t, &c) in seq.iter().enumerate() {
      out[t * classes + c] = p;
    }
    out
  }

  #[test]
  fn ctc_collapses_repeats_and_drops_blanks() {
    let chars = alphabet("a\nb\n供", 5).unwrap();
    assert_eq!(chars, vec!["", "a", "b", "供", " "]);
    // a a _ a b b _ _ 供 space
    let probs = onehot(&[1, 1, 0, 1, 2, 2, 0, 0, 3, 4], 5, 0.8);
    let (text, score) = ctc_decode(&probs, 5, &chars);
    assert_eq!(text, "aab供 ");
    assert!((score - 0.8).abs() < 1e-5);
  }

  #[test]
  fn ctc_of_all_blanks_is_empty_with_zero_score() {
    let chars = alphabet("a", 2).unwrap();
    assert_eq!(ctc_decode(&onehot(&[0, 0, 0], 2, 0.9), 2, &chars), (String::new(), 0.0));
  }

  #[test]
  fn alphabet_rejects_a_mismatched_model() {
    assert!(alphabet("a\nb", 9).unwrap_err().starts_with("model:"));
  }

  #[test]
  fn axis_aligned_crop_is_exact() {
    let mut img = RgbImage::new(20, 10);
    img.put_pixel(5, 3, Rgb([255, 0, 0]));
    let c = crop_line(&img, &[[5.0, 3.0], [15.0, 3.0], [15.0, 8.0], [5.0, 8.0]]).unwrap();
    assert_eq!(c.dimensions(), (10, 5));
    assert_eq!(c.get_pixel(0, 0).0, [255, 0, 0]);
  }

  #[test]
  fn rotated_crop_is_upright() {
    // A 4-px red stripe along a 45-degree line; the rectified crop has it along its middle row.
    let mut img = RgbImage::from_pixel(60, 60, Rgb([255, 255, 255]));
    for i in 10..50 {
      for d in -1..=1i32 {
        img.put_pixel(i, (i as i32 + d) as u32, Rgb([200, 0, 0]));
      }
    }
    let s = 4.0f32 / 2f32.sqrt();
    let quad = [[10.0 + s, 10.0 - s], [50.0 + s, 50.0 - s], [50.0 - s, 50.0 + s], [10.0 - s, 10.0 + s]];
    let c = crop_line(&img, &quad).unwrap();
    assert!(c.width() > c.height() * 5, "{:?}", c.dimensions());
    let mid = c.height() / 2;
    let red = (0..c.width()).filter(|&x| c.get_pixel(x, mid).0[1] < 120).count();
    assert!(red as u32 > c.width() * 8 / 10, "{red} of {}", c.width());
  }

  #[test]
  fn batch_pads_to_the_widest_crop_with_zeros() {
    let wide = RgbImage::from_pixel(480, 24, Rgb([255, 255, 255])); // ratio 20 → 960 px
    let narrow = RgbImage::from_pixel(24, 24, Rgb([0, 0, 0]));
    let (data, width) = rec_batch(&[&wide, &narrow]);
    assert_eq!(width, 960);
    let plane = 48 * width;
    assert_eq!(data.len(), 2 * 3 * plane);
    assert!((data[0] - 1.0).abs() < 1e-6); // white → 1
    let n = 3 * plane;
    assert!((data[n] + 1.0).abs() < 1e-6); // black → -1
    assert_eq!(data[n + 100], 0.0); // padding
  }
}
