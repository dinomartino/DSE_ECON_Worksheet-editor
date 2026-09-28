fn main() {
  // App commands get `allow-*` / `deny-*` permissions generated from this list; the
  // capability grants each `allow-*`. A command missing here is denied at runtime.
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(&["print_to_pdf", "secret_get", "secret_set", "secret_delete"])),
  )
  .expect("failed to run tauri-build");
}
