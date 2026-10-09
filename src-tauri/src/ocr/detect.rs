//! Text detection postprocessing: the DB probability map → one rotated rectangle per line.
//! PaddleOCR's `DBPostProcess` (quad boxes, fast score) without OpenCV: 8-connected
//! regions stand in for `findContours`, a convex hull plus rotating calipers for
//! `minAreaRect`, and the unclip of a rectangle is exact (grow every side by `delta`).

/// A quadrilateral, clockwise from the top-left in image pixels (y down).
pub type Quad = [[f32; 2]; 4];

pub struct DetParams {
  /// Map pixels above this are text.
  pub thresh: f32,
  /// A region whose mean probability inside its box is below this is dropped.
  pub box_thresh: f32,
  /// The box grows by `area * ratio / perimeter` on every side (the DB kernel is shrunk).
  pub unclip_ratio: f32,
  pub max_candidates: usize,
  /// Shorter side (map pixels) below which a region is noise.
  pub min_size: f32,
  /// The detector sees the page with its longer side at most this.
  pub limit_side: u32,
}

/// The trial's best end-to-end settings (docs/research/2026-10-ocr-survey.md, `oar-ocr`
/// 0.10's defaults): 0 % text errors and every label found on the real scans. Full-resolution
/// detection (PaddleX's 64/min, 0.2/0.45/1.4) lost key-grid answers.
pub const DET_PARAMS: DetParams = DetParams {
  thresh: 0.3,
  box_thresh: 0.6,
  unclip_ratio: 2.0,
  max_candidates: 1000,
  min_size: 3.0,
  limit_side: 960,
};

/// Detector input size: longer side scaled down to `limit` when larger, then each side
/// rounded to a multiple of 32 (at least 32), as PaddleOCR's `DetResizeForTest`.
pub fn det_input_size(w: u32, h: u32, limit: u32) -> (u32, u32) {
  let ratio = if w.max(h) > limit { limit as f32 / w.max(h) as f32 } else { 1.0 };
  let round32 = |v: u32| ((v + 16) / 32 * 32).max(32);
  (round32((w as f32 * ratio) as u32), round32((h as f32 * ratio) as u32))
}

/// Boxes from a `w`×`h` probability map, scaled to a `dest_w`×`dest_h` image.
pub fn boxes_from_map(pred: &[f32], w: usize, h: usize, dest_w: f32, dest_h: f32, p: &DetParams) -> Vec<(Quad, f32)> {
  let sx = dest_w / w as f32;
  let sy = dest_h / h as f32;
  let mut out = Vec::new();
  for region in regions(pred, w, h, p.thresh).into_iter().take(p.max_candidates) {
    let Some(rect) = min_area_rect(&convex_hull(region)) else { continue };
    if rect.short_side() < p.min_size {
      continue;
    }
    let score = box_score(pred, w, h, &rect.corners());
    if score < p.box_thresh {
      continue;
    }
    let grown = rect.unclip(p.unclip_ratio);
    if grown.short_side() < p.min_size + 2.0 {
      continue;
    }
    let mut quad = order_quad(grown.corners());
    for pt in &mut quad {
      pt[0] = (pt[0] * sx).round().clamp(0.0, dest_w);
      pt[1] = (pt[1] * sy).round().clamp(0.0, dest_h);
    }
    out.push((quad, score));
  }
  out
}

/// The row extremes of each 8-connected region of map pixels above `thresh`, in scan order.
/// Row extremes are all a convex hull needs.
fn regions(pred: &[f32], w: usize, h: usize, thresh: f32) -> Vec<Vec<(i32, i32)>> {
  let mut seen: Vec<bool> = pred.iter().map(|&v| v <= thresh).collect();
  let mut out = Vec::new();
  let mut stack = Vec::new();
  for start in 0..w * h {
    if seen[start] {
      continue;
    }
    seen[start] = true;
    stack.push(start);
    // Per row: (min x, max x).
    let mut rows: std::collections::BTreeMap<i32, (i32, i32)> = Default::default();
    while let Some(i) = stack.pop() {
      let (x, y) = ((i % w) as i32, (i / w) as i32);
      let e = rows.entry(y).or_insert((x, x));
      e.0 = e.0.min(x);
      e.1 = e.1.max(x);
      for dy in -1..=1 {
        for dx in -1..=1 {
          let (nx, ny) = (x + dx, y + dy);
          if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
            continue;
          }
          let j = ny as usize * w + nx as usize;
          if !seen[j] {
            seen[j] = true;
            stack.push(j);
          }
        }
      }
    }
    out.push(rows.into_iter().flat_map(|(y, (a, b))| [(a, y), (b, y)]).collect());
  }
  out
}

/// Andrew's monotone chain; counter-clockwise in a y-up frame, no collinear points.
fn convex_hull(mut pts: Vec<(i32, i32)>) -> Vec<[f32; 2]> {
  pts.sort_unstable();
  pts.dedup();
  if pts.len() < 3 {
    return pts.into_iter().map(|(x, y)| [x as f32, y as f32]).collect();
  }
  let cross = |o: (i32, i32), a: (i32, i32), b: (i32, i32)| {
    (a.0 - o.0) as i64 * (b.1 - o.1) as i64 - (a.1 - o.1) as i64 * (b.0 - o.0) as i64
  };
  let mut hull: Vec<(i32, i32)> = Vec::with_capacity(pts.len() * 2);
  for pass in 0..2 {
    let start = hull.len();
    let iter: Box<dyn Iterator<Item = &(i32, i32)>> = if pass == 0 { Box::new(pts.iter()) } else { Box::new(pts.iter().rev()) };
    for &p in iter {
      while hull.len() >= start + 2 && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0 {
        hull.pop();
      }
      hull.push(p);
    }
    hull.pop();
  }
  hull.into_iter().map(|(x, y)| [x as f32, y as f32]).collect()
}

/// A rotated rectangle: `origin + s*u + t*n` for s in 0..len_u, t in 0..len_n.
#[derive(Clone, Copy, Debug)]
pub struct Rect {
  origin: [f32; 2],
  u: [f32; 2],
  n: [f32; 2],
  len_u: f32,
  len_n: f32,
}

impl Rect {
  pub fn short_side(&self) -> f32 {
    self.len_u.min(self.len_n)
  }

  pub fn corners(&self) -> [[f32; 2]; 4] {
    let at = |s: f32, t: f32| [self.origin[0] + s * self.u[0] + t * self.n[0], self.origin[1] + s * self.u[1] + t * self.n[1]];
    [at(0.0, 0.0), at(self.len_u, 0.0), at(self.len_u, self.len_n), at(0.0, self.len_n)]
  }

  /// PaddleOCR offsets the polygon by `area * ratio / perimeter` with round joins and takes
  /// the min-area rectangle of the result; for a rectangle that is every side out by `delta`.
  pub fn unclip(&self, ratio: f32) -> Rect {
    let delta = self.len_u * self.len_n * ratio / (2.0 * (self.len_u + self.len_n));
    Rect {
      origin: [self.origin[0] - delta * (self.u[0] + self.n[0]), self.origin[1] - delta * (self.u[1] + self.n[1])],
      len_u: self.len_u + 2.0 * delta,
      len_n: self.len_n + 2.0 * delta,
      ..*self
    }
  }
}

/// Minimum-area enclosing rectangle of a convex hull (rotating calipers over hull edges).
/// None for fewer than 3 points: a line or a dot has no area, like OpenCV's zero-size box.
fn min_area_rect(hull: &[[f32; 2]]) -> Option<Rect> {
  if hull.len() < 3 {
    return None;
  }
  let mut best: Option<(f32, Rect)> = None;
  for i in 0..hull.len() {
    let (a, b) = (hull[i], hull[(i + 1) % hull.len()]);
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len = (dx * dx + dy * dy).sqrt();
    if len == 0.0 {
      continue;
    }
    let u = [dx / len, dy / len];
    let n = [-u[1], u[0]];
    let (mut s0, mut s1, mut t0, mut t1) = (f32::MAX, f32::MIN, f32::MAX, f32::MIN);
    for p in hull {
      let s = p[0] * u[0] + p[1] * u[1];
      let t = p[0] * n[0] + p[1] * n[1];
      s0 = s0.min(s);
      s1 = s1.max(s);
      t0 = t0.min(t);
      t1 = t1.max(t);
    }
    let area = (s1 - s0) * (t1 - t0);
    if best.as_ref().map_or(true, |(a, _)| area < *a) {
      let origin = [s0 * u[0] + t0 * n[0], s0 * u[1] + t0 * n[1]];
      best = Some((area, Rect { origin, u, n, len_u: s1 - s0, len_n: t1 - t0 }));
    }
  }
  best.map(|(_, r)| r)
}

/// Top-left, top-right, bottom-right, bottom-left (PaddleX's `get_mini_boxes` order).
pub fn order_quad(mut pts: [[f32; 2]; 4]) -> Quad {
  pts.sort_by(|a, b| a[0].total_cmp(&b[0]));
  let (tl, bl) = if pts[1][1] > pts[0][1] { (pts[0], pts[1]) } else { (pts[1], pts[0]) };
  let (tr, br) = if pts[3][1] > pts[2][1] { (pts[2], pts[3]) } else { (pts[3], pts[2]) };
  [tl, tr, br, bl]
}

/// Mean map value inside the quad, sampled at pixel centres: row `y` counts where `y + 0.5`
/// crosses the quad, from `x1` up to but not including `x2` (`oar-ocr`'s `box_score_fast`;
/// counting the boundary pixels, as OpenCV's `fillPoly` does, drops small labels like "1.").
fn box_score(pred: &[f32], w: usize, h: usize, quad: &[[f32; 2]; 4]) -> f32 {
  let clampf = |x: f32, hi: usize| x.max(0.0).min(hi as f32 - 1.0);
  let y0 = clampf(quad.iter().map(|p| p[1]).fold(f32::MAX, f32::min).floor(), h) as usize;
  let y1 = clampf(quad.iter().map(|p| p[1]).fold(f32::MIN, f32::max).ceil(), h) as usize + 1;
  let x0 = clampf(quad.iter().map(|p| p[0]).fold(f32::MAX, f32::min).floor(), w) as usize;
  let x1 = clampf(quad.iter().map(|p| p[0]).fold(f32::MIN, f32::max).ceil(), w) as usize + 1;
  let (mut sum, mut count) = (0.0f32, 0usize);
  let mut cross: Vec<f32> = Vec::with_capacity(4);
  for y in y0..y1.min(h) {
    let yf = y as f32 + 0.5;
    cross.clear();
    for i in 0..4 {
      let (a, b) = (quad[i], quad[(i + 1) % 4]);
      if ((a[1] <= yf && yf < b[1]) || (b[1] <= yf && yf < a[1])) && (b[1] - a[1]).abs() > f32::EPSILON {
        cross.push(a[0] + (yf - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    cross.sort_by(f32::total_cmp);
    for pair in cross.chunks_exact(2) {
      let (a, b) = (pair[0].max(x0 as f32) as usize, pair[1].min(x1 as f32) as usize);
      for x in a..b.min(w) {
        sum += pred[y * w + x];
        count += 1;
      }
    }
  }
  if count == 0 { 0.0 } else { sum / count as f32 }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn map_with(w: usize, h: usize, rects: &[(usize, usize, usize, usize)]) -> Vec<f32> {
    let mut m = vec![0.0; w * h];
    for &(x0, y0, x1, y1) in rects {
      for y in y0..=y1 {
        for x in x0..=x1 {
          m[y * w + x] = 0.9;
        }
      }
    }
    m
  }

  #[test]
  fn input_size_rounds_to_32_and_limits_the_long_side() {
    assert_eq!(det_input_size(1654, 2339, 960), (672, 960));
    assert_eq!(det_input_size(500, 300, 960), (512, 288));
    assert_eq!(det_input_size(10, 10, 960), (32, 32));
  }

  #[test]
  fn hull_and_rect_of_an_axis_aligned_block() {
    let hull = convex_hull(vec![(2, 3), (11, 3), (2, 7), (11, 7), (5, 5)]);
    assert_eq!(hull.len(), 4);
    let r = min_area_rect(&hull).unwrap();
    let (a, b) = (r.len_u.max(r.len_n), r.short_side());
    assert!((a - 9.0).abs() < 1e-4 && (b - 4.0).abs() < 1e-4, "{a} x {b}");
  }

  #[test]
  fn rect_of_a_rotated_block_follows_its_slope() {
    // A 40 x 6 bar rotated by 30 degrees.
    let (c, s) = (30f32.to_radians().cos(), 30f32.to_radians().sin());
    let mut pts = vec![];
    for i in 0..=400 {
      for j in 0..=60 {
        let (u, v) = (i as f32 / 10.0, j as f32 / 10.0);
        pts.push(((50.0 + u * c - v * s).round() as i32, (50.0 + u * s + v * c).round() as i32));
      }
    }
    let r = min_area_rect(&convex_hull(pts)).unwrap();
    let angle = r.u[1].atan2(r.u[0]).to_degrees().rem_euclid(180.0);
    let long_angle = if r.len_u >= r.len_n { angle } else { (angle + 90.0).rem_euclid(180.0) };
    assert!((long_angle - 30.0).abs() < 2.0, "angle {long_angle}");
    assert!((r.len_u.max(r.len_n) - 40.0).abs() < 1.5);
  }

  #[test]
  fn unclip_grows_every_side_by_area_ratio_over_perimeter() {
    let r = min_area_rect(&convex_hull(vec![(0, 0), (20, 0), (20, 10), (0, 10)])).unwrap();
    let g = r.unclip(2.0);
    // delta = 20 * 10 * 2 / 60 = 6.667
    let d = 200.0 * 2.0 / 60.0;
    assert!((g.len_u.max(g.len_n) - (20.0 + 2.0 * d)).abs() < 1e-3);
    assert!((g.short_side() - (10.0 + 2.0 * d)).abs() < 1e-3);
    let q = order_quad(g.corners());
    assert!((q[0][0] + d).abs() < 1e-3 && (q[0][1] + d).abs() < 1e-3, "{q:?}");
    assert!((q[2][0] - 20.0 - d).abs() < 1e-3 && (q[2][1] - 10.0 - d).abs() < 1e-3);
  }

  #[test]
  fn order_is_clockwise_from_top_left() {
    let q = order_quad([[10.0, 5.0], [0.0, 5.0], [10.0, 0.0], [0.0, 0.0]]);
    assert_eq!(q, [[0.0, 0.0], [10.0, 0.0], [10.0, 5.0], [0.0, 5.0]]);
  }

  #[test]
  fn two_lines_give_two_scaled_boxes_and_specks_are_dropped() {
    let (w, h) = (64, 32);
    let pred = map_with(w, h, &[(4, 4, 40, 9), (4, 18, 50, 24), (60, 30, 61, 31)]);
    let boxes = boxes_from_map(&pred, w, h, 128.0, 64.0, &DET_PARAMS);
    assert_eq!(boxes.len(), 2, "{boxes:?}");
    let (q, score) = &boxes[0];
    assert!(*score > 0.85);
    // Region 4..40 x 4..9 (36 x 5), delta = 36*5*2/82 = 4.39, then x2 to the dest size.
    assert!((q[0][0] - ((4.0 - 4.39f32) * 2.0).round().max(0.0)).abs() <= 1.0, "{q:?}");
    assert!((q[2][1] - ((9.0 + 4.39f32) * 2.0).round()).abs() <= 1.0, "{q:?}");
  }

  #[test]
  fn box_score_samples_pixel_centres_half_open() {
    // Rows 2..=3 strong, row 4 weak: the box spans y 2..4, and row 4's centre (4.5) is outside.
    let (w, h) = (12, 8);
    let mut pred = map_with(w, h, &[(2, 2, 7, 3)]);
    for x in 2..=7 {
      pred[4 * w + x] = 0.31;
    }
    let quad = [[2.0, 2.0], [7.0, 2.0], [7.0, 4.0], [2.0, 4.0]];
    assert!((box_score(&pred, w, h, &quad) - 0.9).abs() < 1e-6);
  }

  #[test]
  fn faint_regions_fail_the_box_threshold() {
    let (w, h) = (40, 20);
    let mut pred = vec![0.0; w * h];
    for y in 5..12 {
      for x in 5..30 {
        pred[y * w + x] = 0.35; // above thresh, below box_thresh
      }
    }
    assert!(boxes_from_map(&pred, w, h, 40.0, 20.0, &DET_PARAMS).is_empty());
  }
}
