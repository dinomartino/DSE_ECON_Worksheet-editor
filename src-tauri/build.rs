use std::path::{Path, PathBuf};
use std::process::Command;

/// The OCR models (`src/ocr`), bundled as resources: PP-OCRv6 small detection and recognition,
/// the official ONNX exports on PaddlePaddle's Hugging Face pages (Apache-2.0), pinned to a
/// revision and checked by SHA-256. Too large for git, so the first build downloads them into
/// `resources/ocr/` (gitignored); `rec_dict.txt` (the recognizer's alphabet) is committed.
const OCR_MODELS: [(&str, &str, &str, u64); 2] = [
  (
    "det.onnx",
    "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/28fe5895c24fd108c19eb3e8479f4ab385fbfc62/inference.onnx",
    "d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e",
    9_880_512,
  ),
  (
    "rec.onnx",
    "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/b8f84f0b80c529de40b4fbb3544b84fa7233a513/inference.onnx",
    "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634",
    21_159_378,
  ),
];

fn sha256_hex(path: &Path) -> Option<String> {
  use sha2::{Digest, Sha256};
  let bytes = std::fs::read(path).ok()?;
  Some(Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect())
}

/// Each model is in place at its exact size (checked by SHA-256 when it was downloaded), or is
/// downloaded now (curl ships with macOS and Windows 10+) and checked.
fn ensure_ocr_models() {
  let dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("resources/ocr");
  std::fs::create_dir_all(&dir).expect("create resources/ocr");
  for (name, url, sha, size) in OCR_MODELS {
    let path = dir.join(name);
    println!("cargo:rerun-if-changed={}", path.display());
    if std::fs::metadata(&path).is_ok_and(|m| m.len() == size) {
      continue;
    }
    let part = dir.join(format!("{name}.part"));
    let status = Command::new("curl").args(["-fsSL", "--retry", "3", "-o"]).arg(&part).arg(url).status();
    let got = sha256_hex(&part);
    if !matches!(status, Ok(s) if s.success()) || got.as_deref() != Some(sha) {
      let _ = std::fs::remove_file(&part);
      panic!(
        "OCR model {name}: download failed or SHA-256 mismatch (got {got:?}).\n\
         Fetch {url} by hand, check its SHA-256 is {sha}, and save it as {}",
        path.display()
      );
    }
    std::fs::rename(&part, &path).expect("move OCR model into place");
  }
}

fn main() {
  ensure_ocr_models();

  // ONNX Runtime is linked statically (ort-sys). pyke's archives carry the CoreML provider on
  // Apple silicon and DirectML on Windows; ort-sys 2.0.0-rc.10 does not name those system
  // libraries when the archive comes from ORT_LIB_LOCATION (CI), so name them here.
  let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
  let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
  let env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
  if os == "macos" && arch == "aarch64" {
    println!("cargo:rustc-link-lib=framework=CoreML");
  }
  if os == "windows" && env == "msvc" {
    for lib in ["dxguid", "DXCORE", "DXGI", "D3D12", "DirectML", "delayimp"] {
      println!("cargo:rustc-link-lib={lib}");
    }
    // Only the DirectML provider, which OCR never uses, calls into these: load them on first
    // use, so a Windows without DirectML or DXCore (before 10 2004) still starts the app.
    for dll in ["DirectML.dll", "d3d12.dll", "dxcore.dll"] {
      println!("cargo:rustc-link-arg=/DELAYLOAD:{dll}");
    }
  }

  // App commands get `allow-*` / `deny-*` permissions generated from this list; the
  // capability grants each `allow-*`. A command missing here is denied at runtime.
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(&[
        "print_to_pdf",
        "secret_get",
        "secret_set",
        "secret_delete",
        "library_location",
        "library_choose",
        "library_cloud_folders",
        "library_found",
        "library_forget",
        "library_list",
        "library_read",
        "library_write",
        "library_remove",
        "library_watch",
        "library_unwatch",
        "ocr_status",
        "ocr_image",
      ])),
  )
  .expect("failed to run tauri-build");
}
