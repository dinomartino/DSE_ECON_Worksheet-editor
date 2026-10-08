# Offline OCR for imports: alternatives survey (2026-10-08)

Why: teachers' papers and answer files are often scans or phone photos (Traditional Chinese +
English, MC key grids, two-column marking schemes, some handwriting). Users are desktop-only
(Tauri, macOS + Windows), so OCR is bundled and offline, and must return text **with positions**
to feed `src/import/pdfLayout.ts:layoutPdf` → the engine. Web research by an agent; speeds marked
"~" are estimates. A local trial on real scans decides (`docs/design/paste-import.md`).

## Recommendation

1. **Default, bundled:** PP-OCRv6 *small* (~26 MB, Jun 2026, Apache-2.0; one model for zh-Hant,
   zh-Hans, English; line polygons + word boxes) + PP-DocLayoutV3 (layout) + SLANet_plus (tables),
   in Rust through ONNX Runtime via `ppocr-rs` 0.7.3 or `oar-ocr` 0.10.0. No Python; builds for
   macOS arm64/x64 and Windows x64/ARM64. `medium` (~139 MB) optional.
2. **"Accurate" mode, downloaded on demand:** PaddleOCR-VL-1.6 (0.9B, Apache-2.0, OmniDocBench 1.6
   96.3, best published TC edit distance) as GGUF (~1.2 GB) via llama.cpp, or Candle through
   `oar-ocr`. Layout first in Rust, then each region to the VLM. Metal: seconds per page; CPU-only
   laptop: 30–60 s per page. Runner-up GLM-OCR (0.9B, MIT).
3. **OS-native fast path / fallback:** macOS Vision `VNRecognizeTextRequest` (`objc2-vision`);
   macOS 26 `RecognizeDocumentsRequest` adds tables but is Swift-only (needs a shim). Windows
   `Windows.Media.Ocr`, with a check for the zh-Hant OCR language pack.

## Comparison (abridged)

| Engine | Licence | Size | Runtime | TC | Tables/layout | Positions | Ship in Tauri |
|---|---|---|---|---|---|---|---|
| PP-OCRv6 tiny/small/medium | Apache-2.0 | 6/26/139 MB | ONNX | yes | with layout models | lines + words | easy |
| PP-DocLayoutV3, SLANet_plus | Apache-2.0 | ~10–120 MB | ONNX | n/a | layout, table cells | boxes | easy |
| `ppocr-rs` / `oar-ocr` (Rust) | Apache-2.0 (oar-ocr: confirm) | crates | ort (+Candle) | v6 | yes | yes | easy |
| RapidOCR 3.9 | Apache-2.0 | ~29 MB | ONNX, Python-first | v6 | separate libs | lines | medium |
| Tesseract 5.5 | Apache-2.0 | 10–60 MB | C++ | weak on photos | weak | words | medium |
| PaddleOCR-VL-1.6 | Apache-2.0 | 0.9B (GGUF 1.2 GB) | llama.cpp / MLX | best measured | tables, charts | blocks; spotting polygons | medium |
| GLM-OCR | MIT | 0.9B | GGUF | likely good | tables | blocks | medium |
| DeepSeek-OCR 2, dots.ocr 1.5, Qwen3-VL small | Apache/MIT | 0.9–4B | GGUF / Python | good | prompted | loose | medium–hard |
| Surya 2, Chandra 2 | weights RAIL-M, revenue caps US$5M / US$2M | 0.65–4B | Python | good | strong | yes | hard; licence risk |
| MonkeyOCR | non-commercial weights | — | Python | — | — | — | no |
| HunyuanOCR | territory-restricted | 1B | GGUF | — | — | — | no |
| macOS Vision (+ macOS 26 documents) | system | 0 | native | good | tables on 26 | lines/words | easy (Swift shim for 26) |
| Windows.Media.Ocr | system | 0 | WinRT | needs language pack | no | lines/words | easy |
| Windows AI TextRecognizer | system | 0 | WinAppSDK | ? | no | words | no: Copilot+ NPU + package identity |
| OneOCR (Snipping Tool dll) | proprietary | 95 MB | — | good | no | yes | no: no redistribution |
| Cloud (Azure, Google, Mistral OCR 3, Textract, Gemini) | paid | — | HTTPS | excellent | excellent | yes | opt-in BYOK only |

## Pitfalls

- Licences: avoid RAIL-M revenue caps (Surya, Chandra), non-commercial (MonkeyOCR), territory
  limits (Hunyuan), MinerU's custom terms, GPL/AGPL PyMuPDF in Python pipelines, OneOCR.
- Python/PyTorch sidecars are 1–3 GB and fragile to sign; stay on ONNX + GGUF.
- VLMs can "fix" numbers (84-89 → 84.89) and lose positions: keep PP-OCR boxes as ground truth.
- Model downloads: GitHub Releases or Hugging Face, verified by SHA-256, kept out of the installer.
- No public HK-specific benchmark: our own scan corpus decides; score handwriting separately.

Sources: [PP-OCRv6](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html),
[paper](https://arxiv.org/abs/2606.13108), [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6),
[ppocr-rs](https://docs.rs/crate/ppocr-rs/latest), [oar-ocr](https://docs.rs/crate/oar-ocr),
[RapidOCR](https://github.com/RapidAI/RapidOCR/releases), [OmniDocBench](https://github.com/opendatalab/OmniDocBench),
[GLM-OCR](https://huggingface.co/zai-org/GLM-OCR), [Surya](https://github.com/datalab-to/surya),
[RecognizeDocumentsRequest](https://developer.apple.com/documentation/vision/recognizedocumentsrequest),
[Windows AI text recognition](https://learn.microsoft.com/en-us/windows/ai/apis/text-recognition),
[Windows.Media.Ocr](https://learn.microsoft.com/uwp/api/windows.media.ocr), [Mistral OCR 3](https://mistral.ai/fr/news/mistral-ocr-3/).
