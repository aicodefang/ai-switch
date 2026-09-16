mod engine;
use engine::*;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs::OpenOptions, path::PathBuf, sync::Mutex, time::Duration};
use tauri::Manager;

struct AppState {
    root: PathBuf,
    gate: Mutex<()>,
}
const VAULT_SERVICE: &str = "io.aicodefang.aimodel-switch.api-keys";
fn vault(id: &str) -> Result<keyring::Entry> {
    uuid::Uuid::parse_str(id).map_err(|_| "无效配置 ID。")?;
    keyring::Entry::new(VAULT_SERVICE, id)
        .map_err(|_| "系统凭据库不可用。Linux 需要已解锁的 Secret Service。".into())
}
fn secret(id: &str) -> Result<String> {
    vault(id)?
        .get_password()
        .map_err(|_| "无法读取 API Key，请检查系统凭据库权限或重新保存密钥。".into())
}
fn locked<T>(state: &AppState, action: impl FnOnce(&mut Store) -> Result<T>) -> Result<T> {
    let _guard = state.gate.lock().map_err(|_| "应用状态繁忙，请重启。")?;
    private_dir(&state.root)?;
    let lock_path = state.root.join("write.lock");
    checked_path(&lock_path)?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|_| "无法锁定配置库。")?;
    file.try_lock_exclusive()
        .map_err(|_| "另一个 AIModel Switch 窗口正在操作，请稍后重试。")?;
    let mut store = load(&state.root)?;
    action(&mut store)
}
fn find(store: &Store, id: &str) -> Result<Profile> {
    store
        .profiles
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or("配置不存在。".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StateView {
    store: Store,
    data_dir: String,
    active_matches: std::collections::BTreeMap<String, bool>,
}
#[tauri::command]
fn get_state(state: tauri::State<AppState>) -> Result<StateView> {
    locked(&state, |store| {
        let active_matches = store
            .active
            .iter()
            .map(|(tool, a)| {
                let current = read_optional(std::path::Path::new(&a.target)).ok();
                let profile_same = store
                    .profiles
                    .iter()
                    .any(|p| p.id == a.profile_id && p.revision == a.revision);
                let path_same = store
                    .profiles
                    .iter()
                    .find(|p| p.id == a.profile_id)
                    .and_then(|p| target(&store.settings, &p.tool).ok())
                    .is_some_and(|p| p.to_string_lossy() == a.target);
                (
                    tool.clone(),
                    profile_same && path_same && current.is_some_and(|c| digest(&c) == a.digest),
                )
            })
            .collect();
        Ok(StateView {
            store: store.clone(),
            data_dir: state.root.to_string_lossy().into(),
            active_matches,
        })
    })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveInput {
    id: Option<String>,
    name: String,
    tool: Tool,
    provider: String,
    base_url: String,
    model: String,
    auth: String,
    api_key: String,
}
#[tauri::command]
fn save_profile(state: tauri::State<AppState>, input: SaveInput) -> Result<String> {
    locked(&state, |store| {
        let existing = match &input.id {
            Some(id) => Some(find(store, id)?),
            None => None,
        };
        let id = existing
            .as_ref()
            .map(|p| p.id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let p = Profile {
            id: id.clone(),
            name: input.name.trim().into(),
            tool: input.tool,
            provider: input.provider,
            base_url: input.base_url.trim().trim_end_matches('/').into(),
            model: input.model.trim().into(),
            auth: input.auth,
            revision: uuid::Uuid::new_v4().to_string(),
        };
        validate_profile(&p)?;
        if p.provider.len() > 100 {
            return Err("供应商标识过长。".into());
        }
        if store.profiles.len() >= 200 && existing.is_none() {
            return Err("最多保存 200 组配置。".into());
        }
        let key = input.api_key.trim();
        if key.len() > 8192 || key.chars().any(char::is_control) {
            return Err("密钥格式无效。".into());
        }
        if key.is_empty() && existing.is_none() {
            return Err("新配置需要填写 API Key。".into());
        }
        let entry = vault(&id)?;
        let old = if existing.is_some() {
            Some(secret(&id)?)
        } else {
            None
        };
        if !key.is_empty() {
            entry
                .set_password(key)
                .map_err(|_| "无法保存到系统凭据库。不会回退到明文配置库。")?;
        }
        store.profiles.retain(|x| x.id != id);
        store.profiles.push(p);
        if let Err(e) = persist(&state.root, store) {
            if !key.is_empty() {
                if let Some(s) = old {
                    let _ = entry.set_password(&s);
                } else {
                    let _ = entry.delete_credential();
                }
            }
            return Err(e);
        }
        Ok(id)
    })
}
#[tauri::command]
fn delete_profile(state: tauri::State<AppState>, id: String) -> Result<()> {
    locked(&state, |store| {
        find(store, &id)?;
        if store.active.values().any(|a| a.profile_id == id) {
            return Err("请先恢复该工具的配置，或启用另一组配置，再删除。".into());
        }
        let key = secret(&id)?;
        let entry = vault(&id)?;
        entry
            .delete_credential()
            .map_err(|_| "系统凭据删除失败，配置已保留。")?;
        store.profiles.retain(|p| p.id != id);
        if let Err(e) = persist(&state.root, store) {
            let _ = entry.set_password(&key);
            return Err(e);
        }
        Ok(())
    })
}
#[tauri::command]
fn preview_profile(state: tauri::State<AppState>, id: String, revision: String) -> Result<Preview> {
    locked(&state, |store| {
        let p = find(store, &id)?;
        if p.revision != revision {
            return Err("配置已在另一个窗口编辑，请刷新后重试。".into());
        }
        preview(&p, &store.settings)
    })
}
#[tauri::command]
fn apply_profile(
    state: tauri::State<AppState>,
    id: String,
    expected_digest: String,
    expected_target: String,
    expected_revision: String,
) -> Result<()> {
    locked(&state, |store| {
        let p = find(store, &id)?;
        if p.revision != expected_revision
            || target(&store.settings, &p.tool)?.to_string_lossy() != expected_target
        {
            return Err("配置或目录在预览后发生变化，请重新预览。".into());
        }
        apply(&state.root, store, &p, &secret(&id)?, &expected_digest)
    })
}
#[tauri::command]
fn restore_backup(state: tauri::State<AppState>, id: String) -> Result<()> {
    locked(&state, |store| restore(&state.root, store, &id))
}
#[tauri::command]
fn save_settings(state: tauri::State<AppState>, settings: Settings) -> Result<()> {
    target(&settings, &Tool::Codex)?;
    target(&settings, &Tool::Claude)?;
    locked(&state, |store| {
        store.settings = settings;
        persist(&state.root, store)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TestResult {
    ok: bool,
    message: String,
    elapsed_ms: u128,
}
#[tauri::command]
async fn test_profile(state: tauri::State<'_, AppState>, id: String) -> Result<TestResult> {
    let (profile, key) = locked(&state, |store| Ok((find(store, &id)?, secret(&id)?)))?;
    test_connection(profile, key).await
}
async fn test_connection(profile: Profile, key: String) -> Result<TestResult> {
    validate_profile(&profile)?;
    let (endpoint, body) = match profile.tool {
        Tool::Codex => (
            format!("{}/responses", profile.base_url.trim_end_matches('/')),
            json!({"model":profile.model,"input":"Reply OK.","max_output_tokens":16,"store":false}),
        ),
        Tool::Claude => (
            format!("{}/v1/messages", profile.base_url.trim_end_matches('/')),
            json!({"model":profile.model,"messages":[{"role":"user","content":"Reply OK."}],"max_tokens":16}),
        ),
    };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "无法创建网络客户端。")?;
    let mut request = client.post(&endpoint).json(&body);
    if profile.auth == "api-key" {
        request = request.header("x-api-key", &key);
    } else {
        request = request.bearer_auth(&key);
    }
    if profile.tool == Tool::Claude {
        request = request.header("anthropic-version", "2023-06-01");
    }
    let start = std::time::Instant::now();
    let response = match request.send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(TestResult {
                ok: false,
                message: if e.is_timeout() {
                    "请求超时，请检查网络或供应商状态。"
                } else {
                    "网络连接失败，请检查地址、证书与代理。"
                }
                .into(),
                elapsed_ms: start.elapsed().as_millis(),
            })
        }
    };
    let status = response.status();
    if !status.is_success() {
        let message = match status.as_u16() {
            401 | 403 => "认证失败或无权限，请检查密钥、套餐及认证方式。",
            404 => "接口或模型不存在，请检查 Base URL、协议与模型 ID。",
            429 => "触发限流或额度不足。",
            300..=399 => "接口返回重定向，已停止以防密钥发送到其他地址。",
            _ => "供应商返回错误，请核对协议和参数，或稍后重试。",
        };
        return Ok(TestResult {
            ok: false,
            message: format!("HTTP {} · {message}", status.as_u16()),
            elapsed_ms: start.elapsed().as_millis(),
        });
    }
    // Read only a small response and never send provider response bodies (which can echo secrets) to the UI.
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取响应失败或超时。")? {
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err("响应过大，已停止测试。".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let parsed: Value =
        serde_json::from_slice(&bytes).map_err(|_| "接口没有返回 JSON，请检查协议与地址。")?;
    let compatible = match profile.tool {
        Tool::Codex => {
            parsed.get("object").and_then(Value::as_str) == Some("response")
                && parsed.get("error").is_none_or(Value::is_null)
        }
        Tool::Claude => {
            parsed.get("type").and_then(Value::as_str) == Some("message")
                && parsed.get("content").is_some_and(Value::is_array)
        }
    };
    Ok(TestResult {
        ok: compatible,
        message: if compatible {
            "接口、认证与基础模型请求测试通过；不代表工具调用等全部能力兼容。"
        } else {
            "HTTP 成功，但响应格式与所选工具协议不匹配。"
        }
        .into(),
        elapsed_ms: start.elapsed().as_millis(),
    })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(AppState {
                root,
                gate: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            save_profile,
            delete_profile,
            preview_profile,
            apply_profile,
            restore_backup,
            save_settings,
            test_profile
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start AIModel Switch");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    fn serve(status: &str, body: &str, header: &str) -> (String, std::thread::JoinHandle<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let response=format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{header}\r\n{body}",body.len());
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let count = socket.read(&mut buf).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buf[..count]);
                if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|v| v.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            socket.write_all(response.as_bytes()).unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, handle)
    }
    fn p(tool: Tool, base_url: String, auth: &str) -> Profile {
        Profile {
            id: "test".into(),
            name: "test".into(),
            tool,
            provider: "custom".into(),
            base_url,
            model: "test-model".into(),
            auth: auth.into(),
            revision: "1".into(),
        }
    }
    #[test]
    fn connection_uses_correct_paths_and_auth() {
        let (url, server) = serve("200 OK", r#"{"object":"response","output":[]}"#, "");
        let result = tauri::async_runtime::block_on(test_connection(
            p(Tool::Codex, format!("{url}/v1"), "bearer"),
            "dummy-test-key".into(),
        ))
        .unwrap();
        assert!(result.ok);
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /v1/responses"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer dummy-test-key"));
        assert!(request.contains("test-model"));
        let (url, server) = serve("200 OK", r#"{"type":"message","content":[]}"#, "");
        let result = tauri::async_runtime::block_on(test_connection(
            p(Tool::Claude, format!("{url}/anthropic"), "api-key"),
            "dummy-test-key".into(),
        ))
        .unwrap();
        assert!(result.ok);
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /anthropic/v1/messages"));
        assert!(request.to_lowercase().contains("x-api-key: dummy-test-key"));
        assert!(request.contains("anthropic-version"));
    }
    #[test]
    fn errors_and_redirects_do_not_leak_keys_or_claim_success() {
        for (status, body, header) in [
            ("401 Unauthorized", r#"{"error":"dummy-test-key"}"#, ""),
            ("302 Found", "{}", "Location: https://example.com/steal\r\n"),
            ("200 OK", r#"{"choices":[]}"#, ""),
        ] {
            let (url, server) = serve(status, body, header);
            let result = tauri::async_runtime::block_on(test_connection(
                p(Tool::Codex, url, "bearer"),
                "dummy-test-key".into(),
            ))
            .unwrap();
            assert!(!result.ok);
            assert!(!result.message.contains("dummy-test-key"));
            server.join().unwrap();
        }
    }
    #[test]
    #[ignore = "Requires an unlocked OS credential store; creates only a random dummy test entry"]
    fn vault_roundtrip() {
        let id = uuid::Uuid::new_v4().to_string();
        let entry = vault(&id).unwrap();
        entry
            .set_password("aimodel-switch-dummy-test-only")
            .unwrap();
        let read = secret(&id);
        let removed = entry.delete_credential();
        assert_eq!(read.unwrap(), "aimodel-switch-dummy-test-only");
        assert!(removed.is_ok());
        assert!(secret(&id).is_err());
    }
}
