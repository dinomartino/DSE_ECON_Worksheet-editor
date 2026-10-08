fn main() {
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
      ])),
  )
  .expect("failed to run tauri-build");
}
