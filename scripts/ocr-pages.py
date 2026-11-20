"""Headless OCR of scanned PDFs / PNGs: a Python port of the desktop app's OCR engine.

Mirrors src-tauri/src/ocr (detect.rs, recognize.rs, engine.rs, mod.rs) -- PP-OCRv6 small
detection + recognition on ONNX Runtime -- so the TypeScript import pipeline can be tested
on this Linux server (k-0480). Only numpy, PIL and onnxruntime; no OpenCV/shapely.

    python3 -I scripts/ocr-pages.py <file.pdf | page.png> <outdir>

A PDF is rendered with `pdftoppm -r 200 -png` (scanImport.ts's SCAN_DPI) into a temp dir
outside the repo; each page is written to <outdir>/p01.json, p02.json ... as an OcrResult
({width, height, lines: [{text, score, box, angle?}], ms}, plus "dpi": 200 for a PDF).

Models: src-tauri/resources/ocr/{det.onnx,rec.onnx,rec_dict.txt} (build.rs downloads them).
Outputs of real papers never go into the repo: point <outdir> outside it (e.g. /tmp).
"""
import json
import math
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "..", "src-tauri", "resources", "ocr")
DPI = 200
DEFAULT_MAX_SIDE = 2400
REC_BATCH = 4
REC_HEIGHT = 48
REC_MIN_WIDTH = 320
REC_MAX_WIDTH = 3200
VERTICAL_RATIO = 1.5
# DET_PARAMS (detect.rs)
THRESH, BOX_THRESH, UNCLIP_RATIO, MAX_CANDIDATES, MIN_SIZE, LIMIT_SIDE = 0.3, 0.6, 2.0, 1000, 3.0, 960
TRIANGLE = Image.BILINEAR  # PIL's antialiased triangle filter == image-rs FilterType::Triangle


def rnd(x):
    """Rust f32::round: half away from zero."""
    return math.copysign(math.floor(abs(x) + 0.5), x)


# ---------------------------------------------------------------- detect.rs

def det_input_size(w, h, limit):
    ratio = limit / max(w, h) if max(w, h) > limit else 1.0
    r32 = lambda v: max((v + 16) // 32 * 32, 32)
    return r32(int(w * ratio)), r32(int(h * ratio))


def regions(pred, thresh):
    """Row extremes of each 8-connected region above thresh, in scan order of first pixel.

    Run-based union-find instead of a pixel flood fill; same regions, same order."""
    h, w = pred.shape
    mask = pred > thresh
    runs = []  # (y, x0, x1)
    first_of_row = [0] * (h + 1)
    padded = np.zeros((h, w + 2), dtype=np.int8)
    padded[:, 1:-1] = mask
    d = np.diff(padded, axis=1)
    for y in range(h):
        first_of_row[y] = len(runs)
        starts = np.flatnonzero(d[y] == 1)
        ends = np.flatnonzero(d[y] == -1) - 1
        for a, b in zip(starts.tolist(), ends.tolist()):
            runs.append((y, a, b))
    first_of_row[h] = len(runs)
    parent = list(range(len(runs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for y in range(h - 1):
        i, j_lo, j_hi = first_of_row[y], first_of_row[y + 1], first_of_row[y + 2]
        j = j_lo
        for i in range(first_of_row[y], first_of_row[y + 1]):
            _, a, b = runs[i]
            while j < j_hi and runs[j][2] < a - 1:
                j += 1
            k = j
            while k < j_hi and runs[k][1] <= b + 1:
                ri, rk = find(i), find(k)
                if ri != rk:
                    parent[max(ri, rk)] = min(ri, rk)
                k += 1
    groups = {}
    for i in range(len(runs)):
        groups.setdefault(find(i), []).append(i)
    out = []
    for root in sorted(groups):  # root = lowest run index = first pixel in scan order
        rows = {}
        for i in groups[root]:
            y, a, b = runs[i]
            e = rows.get(y)
            rows[y] = (a, b) if e is None else (min(e[0], a), max(e[1], b))
        out.append([(x, y) for y, (a, b) in sorted(rows.items()) for x in (a, b)])
    return out


def convex_hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return [(float(x), float(y)) for x, y in pts]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    hull = []
    for seq in (pts, pts[::-1]):
        start = len(hull)
        for p in seq:
            while len(hull) >= start + 2 and cross(hull[-2], hull[-1], p) <= 0:
                hull.pop()
            hull.append(p)
        hull.pop()
    return [(float(x), float(y)) for x, y in hull]


def min_area_rect(hull):
    """-> (origin, u, n, len_u, len_n) or None."""
    if len(hull) < 3:
        return None
    best = None
    n_pts = len(hull)
    arr = np.array(hull, dtype=np.float64)
    for i in range(n_pts):
        a, b = hull[i], hull[(i + 1) % n_pts]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy)
        if ln == 0:
            continue
        u = (dx / ln, dy / ln)
        n = (-u[1], u[0])
        s = arr[:, 0] * u[0] + arr[:, 1] * u[1]
        t = arr[:, 0] * n[0] + arr[:, 1] * n[1]
        s0, s1, t0, t1 = s.min(), s.max(), t.min(), t.max()
        area = (s1 - s0) * (t1 - t0)
        if best is None or area < best[0]:
            origin = (s0 * u[0] + t0 * n[0], s0 * u[1] + t0 * n[1])
            best = (area, (origin, u, n, s1 - s0, t1 - t0))
    return best[1] if best else None


def rect_corners(r):
    (ox, oy), u, n, lu, ln = r
    at = lambda s, t: [ox + s * u[0] + t * n[0], oy + s * u[1] + t * n[1]]
    return [at(0, 0), at(lu, 0), at(lu, ln), at(0, ln)]


def rect_unclip(r, ratio):
    (ox, oy), u, n, lu, ln = r
    delta = lu * ln * ratio / (2.0 * (lu + ln))
    return ((ox - delta * (u[0] + n[0]), oy - delta * (u[1] + n[1])), u, n, lu + 2 * delta, ln + 2 * delta)


def order_quad(pts):
    pts = sorted(pts, key=lambda p: p[0])  # stable, like Rust's sort_by
    tl, bl = (pts[0], pts[1]) if pts[1][1] > pts[0][1] else (pts[1], pts[0])
    tr, br = (pts[2], pts[3]) if pts[3][1] > pts[2][1] else (pts[3], pts[2])
    return [tl, tr, br, bl]


def box_score(pred, quad):
    h, w = pred.shape
    clampf = lambda x, hi: max(0.0, min(x, hi - 1.0))
    ys = [p[1] for p in quad]
    xs = [p[0] for p in quad]
    y0 = int(clampf(math.floor(min(ys)), h))
    y1 = int(clampf(math.ceil(max(ys)), h)) + 1
    x0 = int(clampf(math.floor(min(xs)), w))
    x1 = int(clampf(math.ceil(max(xs)), w)) + 1
    total, count = 0.0, 0
    for y in range(y0, min(y1, h)):
        yf = y + 0.5
        cross = []
        for i in range(4):
            a, b = quad[i], quad[(i + 1) % 4]
            if ((a[1] <= yf < b[1]) or (b[1] <= yf < a[1])) and abs(b[1] - a[1]) > 1.1920929e-07:
                cross.append(a[0] + (yf - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
        cross.sort()
        for k in range(0, len(cross) - 1, 2):
            a = int(max(cross[k], x0))
            b = int(min(cross[k + 1], x1))
            b = min(b, w)
            if b > a:
                total += float(pred[y, a:b].sum(dtype=np.float64))
                count += b - a
    return 0.0 if count == 0 else total / count


def boxes_from_map(pred, dest_w, dest_h):
    h, w = pred.shape
    sx, sy = dest_w / w, dest_h / h
    out = []
    for region in regions(pred, THRESH)[:MAX_CANDIDATES]:
        rect = min_area_rect(convex_hull(region))
        if rect is None or min(rect[3], rect[4]) < MIN_SIZE:
            continue
        score = box_score(pred, rect_corners(rect))
        if score < BOX_THRESH:
            continue
        grown = rect_unclip(rect, UNCLIP_RATIO)
        if min(grown[3], grown[4]) < MIN_SIZE + 2.0:
            continue
        quad = order_quad(rect_corners(grown))
        quad = [[min(max(rnd(p[0] * sx), 0.0), dest_w), min(max(rnd(p[1] * sy), 0.0), dest_h)] for p in quad]
        out.append((quad, score))
    return out


# ---------------------------------------------------------------- recognize.rs

def crop_line(img, quad):
    """img: PIL RGB. Returns uint8 array (h, w, 3) or None."""
    tl, tr, br, bl = quad
    dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
    cw = int(rnd(max(dist(tl, tr), dist(bl, br))))
    ch = int(rnd(max(dist(tl, bl), dist(tr, br))))
    if cw <= 0 or ch <= 0:
        return None
    arr = np.asarray(img)
    H, W = arr.shape[:2]
    if tl[1] == tr[1] and bl[1] == br[1] and tl[0] == bl[0] and tr[0] == br[0]:
        x0, y0 = int(max(tl[0], 0.0)), int(max(tl[1], 0.0))
        x1, y1 = int(min(tr[0], W)), int(min(bl[1], H))
        if x1 <= x0 or y1 <= y0:
            return None
        return arr[y0:y1, x0:x1]
    ux, uy = (tr[0] - tl[0]) / cw, (tr[1] - tl[1]) / cw
    vx, vy = (bl[0] - tl[0]) / ch, (bl[1] - tl[1]) / ch
    uu = np.arange(cw, dtype=np.float32)[None, :]
    vv = np.arange(ch, dtype=np.float32)[:, None]
    x = np.float32(tl[0]) + uu * np.float32(ux) + vv * np.float32(vx)
    y = np.float32(tl[1]) + uu * np.float32(uy) + vv * np.float32(vy)
    x0f, y0f = np.floor(x), np.floor(y)
    fx, fy = (x - x0f)[..., None], (y - y0f)[..., None]
    xi, yi = x0f.astype(np.int64), y0f.astype(np.int64)
    px = lambda a, b: arr[np.clip(b, 0, H - 1), np.clip(a, 0, W - 1)].astype(np.float32)
    top = px(xi, yi) * (1 - fx) + px(xi + 1, yi) * fx
    bottom = px(xi, yi + 1) * (1 - fx) + px(xi + 1, yi + 1) * fx
    return np.clip(np.floor(top * (1 - fy) + bottom * fy + 0.5), 0, 255).astype(np.uint8)


def is_vertical(crop):
    return crop.shape[0] >= crop.shape[1] * VERTICAL_RATIO


def rec_batch(crops):
    f32 = np.float32
    h = f32(REC_HEIGHT)
    ratios = [f32(c.shape[1]) / f32(max(c.shape[0], 1)) for c in crops]
    max_ratio = max([f32(REC_MIN_WIDTH) / h] + ratios)
    width = min(int(h * max_ratio), REC_MAX_WIDTH)
    data = np.zeros((len(crops), 3, REC_HEIGHT, width), dtype=np.float32)
    for i, (crop, ratio) in enumerate(zip(crops, ratios)):
        rw = min(max(int(math.ceil(h * ratio)), 1), width)
        res = np.asarray(Image.fromarray(crop).resize((rw, REC_HEIGHT), TRIANGLE)).astype(np.float32)
        bgr = res[:, :, ::-1]
        data[i, :, :, :rw] = ((bgr / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)
    return data, width


def alphabet(dict_text, classes):
    lines = dict_text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    lines = [l[:-1] if l.endswith("\r") else l for l in lines]
    chars = [""] + lines
    if classes == len(chars) + 1:
        chars.append(" ")
    if classes != len(chars):
        raise RuntimeError(f"model: recognizer has {classes} classes, dictionary {len(chars) - 1} entries")
    return chars


def ctc_decode(probs, chars):
    best = probs.argmax(axis=1)
    p = probs[np.arange(len(best)), best]
    text, total, kept, prev = [], 0.0, 0, -1
    for b, pv in zip(best.tolist(), p.tolist()):
        if b != prev and b != 0:
            text.append(chars[b])
            total += pv
            kept += 1
        prev = b
    return "".join(text), (0.0 if kept == 0 else total / kept)


# ---------------------------------------------------------------- engine.rs

class Engine:
    def __init__(self, d=MODEL_DIR):
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = min(os.cpu_count() or 4, 8)
        mk = lambda n: ort.InferenceSession(os.path.join(d, n), opts, providers=["CPUExecutionProvider"])
        self.det, self.rec = mk("det.onnx"), mk("rec.onnx")
        with open(os.path.join(d, "rec_dict.txt"), encoding="utf-8", newline="") as f:
            self.dict = f.read()
        self.chars = None

    def detect(self, page):
        w, h = page.size
        dw, dh = det_input_size(w, h, LIMIT_SIDE)
        small = np.asarray(page.resize((dw, dh), TRIANGLE)).astype(np.float32)
        bgr = small[:, :, ::-1]
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        data = ((bgr / 255.0 - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
        out = self.det.run(None, {self.det.get_inputs()[0].name: np.ascontiguousarray(data)})[0]
        pred = np.ascontiguousarray(out.reshape(out.shape[-2], out.shape[-1]))
        return boxes_from_map(pred, float(w), float(h))

    def recognize(self, crops):
        data, _ = rec_batch(crops)
        probs = self.rec.run(None, {self.rec.get_inputs()[0].name: data})[0]
        if self.chars is None:
            self.chars = alphabet(self.dict, probs.shape[2])
        return [ctc_decode(row, self.chars) for row in probs]

    def read_page(self, page):
        crops = []
        for quad, _ in self.detect(page):
            crop = crop_line(page, quad)
            if crop is None:
                continue
            crops.append((quad, crop, is_vertical(crop)))
        inputs = []  # (line, turn, array)
        for i, (_, crop, vertical) in enumerate(crops):
            if vertical:
                inputs.append((i, -1, np.ascontiguousarray(np.rot90(crop, 1))))   # rotate270: anticlockwise
                inputs.append((i, 1, np.ascontiguousarray(np.rot90(crop, -1))))   # rotate90: clockwise
            else:
                inputs.append((i, 0, crop))
        ratio = lambda a: np.float32(a.shape[1]) / np.float32(max(a.shape[0], 1))
        order = sorted(range(len(inputs)), key=lambda k: ratio(inputs[k][2]))
        read = [None] * len(crops)
        for s in range(0, len(order), REC_BATCH):
            chunk = order[s:s + REC_BATCH]
            results = self.recognize([inputs[k][2] for k in chunk])
            for k, (text, score) in zip(chunk, results):
                line, turn, _ = inputs[k]
                best = read[line]
                if best is None:
                    better = True
                else:
                    better = score > best[1] + (0.05 if best[2] == -1 else -0.05)
                if better:
                    read[line] = (text, score, turn)
        lines = []
        for (quad, _, _), r in zip(crops, read):
            if r is None:
                continue
            text, score, turn = r
            if not text.strip():
                continue
            if turn == -1:
                angle = 90.0
            elif turn == 1:
                angle = -90.0
            else:
                a = math.degrees(math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]))
                angle = rnd(a * 10.0) / 10.0 if abs(a) >= 1.0 else None
            lines.append((text, score, quad, angle))
        return lines


# ---------------------------------------------------------------- mod.rs

def run(engine, path, max_side=DEFAULT_MAX_SIDE):
    start = time.time()
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    width, height = img.size
    scale = min(max_side / max(width, height), 1.0)
    page = img
    if scale < 1.0:
        page = img.resize((max(int(rnd(width * scale)), 1), max(int(rnd(height * scale)), 1)), TRIANGLE)
    kx, ky = width / page.size[0], height / page.size[1]
    lines = []
    for text, score, quad, angle in engine.read_page(page):
        line = {
            "text": text,
            "score": rnd(min(max(score, 0.0), 1.0) * 1e4) / 1e4,
            "box": [[rnd(x * kx * 10.0) / 10.0, rnd(y * ky * 10.0) / 10.0] for x, y in quad],
        }
        if angle is not None:
            line["angle"] = angle
        lines.append(line)
    return {"width": width, "height": height, "lines": lines, "ms": int((time.time() - start) * 1000)}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    tmp = None
    if src.lower().endswith(".pdf"):
        tmp = tempfile.mkdtemp(prefix="ocr-pages-")
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", src, os.path.join(tmp, "pg")], check=True)
        pages = sorted(os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith(".png"))
    else:
        pages = [src]
    engine = Engine()
    for i, png in enumerate(pages, 1):
        t = time.time()
        try:
            result = run(engine, png)
        except Exception as e:  # keep going on a bad page
            print(f"p{i:02d} ERROR {e}", file=sys.stderr, flush=True)
            continue
        if tmp:
            result["dpi"] = DPI
        with open(os.path.join(outdir, f"p{i:02d}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        print(f"p{i:02d}/{len(pages)} {len(result['lines'])} lines {time.time() - t:.1f}s", flush=True)
    if tmp:
        for f in os.listdir(tmp):
            os.remove(os.path.join(tmp, f))
        os.rmdir(tmp)


if __name__ == "__main__":
    main()
