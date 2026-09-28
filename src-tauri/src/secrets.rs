//! The AI provider key in the OS keychain (macOS Keychain, Windows Credential Manager).
//!
//! Three commands, one item per account `ai:<provider>` under the app's identifier.
//! Keychain calls can block on a user prompt, so each runs on the blocking pool. Error
//! strings come from the platform and never contain the secret.

const SERVICE: &str = "hk.econworksheet.desktop";

/// `ai:` plus 2–16 lowercase ASCII letters; anything else never reaches the keychain.
fn valid_account(account: &str) -> bool {
  account.len() <= 19
    && account
      .strip_prefix("ai:")
      .is_some_and(|p| (2..=16).contains(&p.len()) && p.bytes().all(|b| b.is_ascii_lowercase()))
}

fn entry(account: &str) -> Result<keyring::Entry, String> {
  if !valid_account(account) {
    return Err("bad account".into());
  }
  keyring::Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_get(account: String) -> Result<Option<String>, String> {
  tauri::async_runtime::spawn_blocking(move || match entry(&account)?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_set(account: String, secret: String) -> Result<(), String> {
  if secret.is_empty() || secret.len() > 512 {
    return Err("bad secret".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    entry(&account)?.set_password(&secret).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_delete(account: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || match entry(&account)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::valid_account;

  #[test]
  fn account_validation() {
    for ok in ["ai:gemini", "ai:deepseek", "ai:qwen", "ai:openrouter", "ai:ollama", "ai:ab", "ai:abcdefghijklmnop"] {
      assert!(valid_account(ok), "{ok} should be accepted");
    }
    for bad in [
      "", "ai:", "ai:a", "ai:abcdefghijklmnopq", "ai:Gemini", "ai:gem-ini", "ai:gem1ni", "gemini",
      "AI:gemini", "ai:gemini ", " ai:gemini", "ai:../x", "ai:gëmini", "xx:gemini",
    ] {
      assert!(!valid_account(bad), "{bad:?} should be refused");
    }
  }
}
