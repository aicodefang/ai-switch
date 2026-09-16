use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use toml_edit::{value, DocumentMut, Item, Table};

pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    Codex,
    Claude,
}
impl Tool {
    pub fn key(&self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub tool: Tool,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub auth: String,
    pub revision: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub codex_dir: String,
    pub claude_dir: String,
}
impl Default for Settings {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            codex_dir: std::env::var("CODEX_HOME")
                .unwrap_or_else(|_| home.join(".codex").to_string_lossy().into()),
            claude_dir: std::env::var("CLAUDE_CONFIG_DIR")
                .unwrap_or_else(|_| home.join(".claude").to_string_lossy().into()),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Active {
    pub profile_id: String,
    pub revision: String,
    pub target: String,
    pub digest: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: String,
    pub tool: Tool,
    pub profile_name: String,
    pub target: String,
    pub created_at: u64,
    pub after_digest: String,
    pub before_digest: String,
    pub previous_active: Option<Active>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub settings: Settings,
    pub profiles: Vec<Profile>,
    pub active: BTreeMap<String, Active>,
    pub backups: Vec<Backup>,
}
#[derive(Serialize, Deserialize)]
pub struct Snapshot {
    pub original: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub target: String,
    pub expected_digest: String,
    pub profile_revision: String,
    pub fields: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn digest(text: &Option<String>) -> String {
    // Missing and existing-but-empty files are distinct restore states.
    let mut hash = Sha256::new();
    hash.update(if text.is_some() {
        b"present"
    } else {
        b"missing"
    });
    if let Some(s) = text {
        hash.update(s.as_bytes());
    }
    format!("{:x}", hash.finalize())
}

pub fn checked_path(path: &Path) -> Result<()> {
    if !path.is_absolute() || path.parent().is_none() {
        return Err("请选择绝对目录路径。".into());
    }
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("路径不能包含 ..。".into());
    }
    for part in path.ancestors() {
        match fs::symlink_metadata(part) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err("为防止误写，暂不支持符号链接路径，请填写实际目录。".into())
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("无法读取目录权限。".into()),
        }
    }
    Ok(())
}

pub fn read_optional(path: &Path) -> Result<Option<String>> {
    checked_path(path)?;
    match fs::metadata(path) {
        Ok(m) if !m.is_file() || m.len() > 4 * 1024 * 1024 => {
            return Err("配置文件不是普通文件或超过 4 MB，已停止操作。".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法访问配置文件。".into()),
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|_| "无法读取 UTF-8 配置文件。".into())
}

pub fn private_dir(path: &Path) -> Result<()> {
    checked_path(path)?;
    let existed = path.exists();
    fs::create_dir_all(path).map_err(|_| "无法创建配置目录。")?;
    #[cfg(unix)]
    if !existed {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法设置目录权限。")?;
    }
    let _ = existed;
    Ok(())
}
pub fn atomic_write(path: &Path, text: &str) -> Result<()> {
    checked_path(path)?;
    let parent = path.parent().ok_or("无效路径。")?;
    private_dir(parent)?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建临时文件。")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tmp.as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| "无法保护配置文件权限。")?;
    }
    tmp.write_all(text.as_bytes())
        .map_err(|_| "配置写入失败。")?;
    tmp.as_file().sync_all().map_err(|_| "配置同步失败。")?;
    tmp.persist(path)
        .map_err(|_| "无法原子替换配置文件；原文件未被主动删除。")?;
    Ok(())
}

pub fn validate_profile(p: &Profile) -> Result<()> {
    if p.name.trim().is_empty()
        || p.name.len() > 120
        || p.model.trim().is_empty()
        || p.model.len() > 200
    {
        return Err("请填写配置名称与模型 ID（长度不能超过限制）。".into());
    }
    if p.model.chars().any(char::is_control) {
        return Err("模型 ID 不能含控制字符。".into());
    }
    if p.auth != "bearer" && p.auth != "api-key" {
        return Err("不支持的认证方式。".into());
    }
    if p.tool == Tool::Codex && p.auth != "bearer" {
        return Err("Codex Responses 接口需要 Bearer 认证。".into());
    }
    validate_url(&p.base_url)?;
    Ok(())
}
pub fn validate_url(s: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(s).map_err(|_| "API 地址格式无效。")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || url.scheme() == "http" && local) || url.host_str().is_none() {
        return Err("请使用 HTTPS；仅本机地址允许 HTTP。".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("API 地址不能包含账号、密码、查询参数或片段。".into());
    }
    Ok(url)
}
pub fn target(settings: &Settings, tool: &Tool) -> Result<PathBuf> {
    let (dir, file) = match tool {
        Tool::Codex => (&settings.codex_dir, "config.toml"),
        Tool::Claude => (&settings.claude_dir, "settings.json"),
    };
    let path = PathBuf::from(dir).join(file);
    checked_path(&path)?;
    if Path::new(dir).parent().is_none() {
        return Err("不能将系统根目录设为配置目录。".into());
    }
    Ok(path)
}

pub fn transform(profile: &Profile, original: &Option<String>, secret: &str) -> Result<String> {
    validate_profile(profile)?;
    if secret.trim().is_empty() || secret.chars().any(char::is_control) {
        return Err("API Key 为空或含控制字符。".into());
    }
    match profile.tool {
        Tool::Codex => {
            // toml_edit preserves comments and all unrelated user settings.
            let mut doc = original
                .as_deref()
                .unwrap_or("")
                .parse::<DocumentMut>()
                .map_err(|_| "Codex TOML 格式无效，请先修复原文件。")?;
            if doc.get("model_providers").is_some_and(|x| !x.is_table()) {
                return Err("model_providers 不是标准 TOML 表，无法安全合并。".into());
            }
            if doc.get("model_providers").is_none() {
                doc["model_providers"] = Item::Table(Table::new());
            }
            let mut provider = Table::new();
            provider["name"] = value(&profile.name);
            provider["base_url"] = value(profile.base_url.trim_end_matches('/'));
            provider["wire_api"] = value("responses");
            provider["requires_openai_auth"] = value(false);
            // Explicit bearer credentials let Codex run after this app exits, without changing auth.json.
            provider["experimental_bearer_token"] = value(secret);
            doc["model_providers"]["aimodel_switch"] = Item::Table(provider);
            doc["model_provider"] = value("aimodel_switch");
            doc["model"] = value(&profile.model);
            doc.remove("profile"); // A selected named profile would override top-level model/provider.
            Ok(doc.to_string())
        }
        Tool::Claude => {
            let mut doc: Value = match original {
                Some(s) => {
                    serde_json::from_str(s).map_err(|_| "Claude settings.json 不是有效 JSON。")?
                }
                None => json!({}),
            };
            let obj = doc.as_object_mut().ok_or("Claude 设置必须是 JSON 对象。")?;
            let env = obj
                .entry("env")
                .or_insert(json!({}))
                .as_object_mut()
                .ok_or("Claude env 必须是对象。")?;
            for key in [
                "ANTHROPIC_API_KEY",
                "ANTHROPIC_AUTH_TOKEN",
                "ANTHROPIC_DEFAULT_MODEL",
                "CLAUDE_CODE_USE_BEDROCK",
                "CLAUDE_CODE_USE_VERTEX",
                "CLAUDE_CODE_USE_FOUNDRY",
            ] {
                env.remove(key);
            }
            env.insert(
                "ANTHROPIC_BASE_URL".into(),
                json!(profile.base_url.trim_end_matches('/')),
            );
            env.insert(
                if profile.auth == "api-key" {
                    "ANTHROPIC_API_KEY"
                } else {
                    "ANTHROPIC_AUTH_TOKEN"
                }
                .into(),
                json!(secret),
            );
            env.insert(
                if profile.auth == "api-key" {
                    "ANTHROPIC_AUTH_TOKEN"
                } else {
                    "ANTHROPIC_API_KEY"
                }
                .into(),
                json!(""),
            );
            for key in [
                "ANTHROPIC_MODEL",
                "ANTHROPIC_DEFAULT_OPUS_MODEL",
                "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                "CLAUDE_CODE_SUBAGENT_MODEL",
            ] {
                env.insert(key.into(), json!(profile.model));
            }
            obj.remove("apiKeyHelper");
            obj.insert("model".into(), json!(profile.model));
            serde_json::to_string_pretty(&doc)
                .map(|s| s + "\n")
                .map_err(|_| "配置序列化失败。".into())
        }
    }
}

pub fn preview(profile: &Profile, settings: &Settings) -> Result<Preview> {
    let path = target(settings, &profile.tool)?;
    let original = read_optional(&path)?;
    transform(profile, &original, "preview-only")?;
    let fields = match profile.tool {
        Tool::Codex => vec![
            "model",
            "model_provider",
            "model_providers.aimodel_switch",
            "profile（取消默认命名配置）",
        ],
        Tool::Claude => vec![
            "model",
            "env.ANTHROPIC_*（地址、认证、模型别名）",
            "env.CLAUDE_CODE_SUBAGENT_MODEL",
            "apiKeyHelper / 其他云平台开关（移除冲突项）",
        ],
    };
    Ok(Preview {
        target: path.to_string_lossy().into(), expected_digest: digest(&original), profile_revision: profile.revision.clone(),
        fields: fields.into_iter().map(String::from).collect(),
        warnings: vec!["启用后密钥会写入目标工具的本地配置文件；备份也可能包含原有密钥。请勿分享这些文件。".into(), "重新启动工具或开启新会话后使用。命令行参数、项目设置或终端环境变量可能覆盖这里的配置。".into()],
    })
}

pub fn apply(
    root: &Path,
    store: &mut Store,
    profile: &Profile,
    secret: &str,
    expected: &str,
) -> Result<()> {
    let path = target(&store.settings, &profile.tool)?;
    let original = read_optional(&path)?;
    if digest(&original) != expected {
        return Err("配置在预览后已被其他程序修改，请重新预览。".into());
    }
    let output = transform(profile, &original, secret)?;
    let backup = Backup {
        id: uuid::Uuid::new_v4().to_string(),
        tool: profile.tool.clone(),
        profile_name: profile.name.clone(),
        target: path.to_string_lossy().into(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        after_digest: digest(&Some(output.clone())),
        before_digest: digest(&original),
        previous_active: store.active.get(profile.tool.key()).cloned(),
    };
    let snapshot = serde_json::to_string(&Snapshot { original }).map_err(|_| "备份编码失败。")?;
    atomic_write(
        &root.join("backups").join(format!("{}.json", backup.id)),
        &snapshot,
    )?;
    store.active.insert(
        profile.tool.key().into(),
        Active {
            profile_id: profile.id.clone(),
            revision: profile.revision.clone(),
            target: backup.target.clone(),
            digest: backup.after_digest.clone(),
        },
    );
    store.backups.push(backup);
    // Persist the recovery journal BEFORE modifying the tool. On interruption the UI exposes recovery.
    persist(root, store)?;
    if let Err(e) = atomic_write(&path, &output) {
        return Err(format!("{e} 备份已保存，可在备份页恢复或再次启用。"));
    }
    Ok(())
}
pub fn restore(root: &Path, store: &mut Store, id: &str) -> Result<()> {
    let backup = store
        .backups
        .iter()
        .find(|b| b.id == id)
        .cloned()
        .ok_or("备份不存在。")?;
    if store
        .backups
        .iter()
        .rev()
        .find(|b| b.target == backup.target)
        .map(|b| &b.id)
        != Some(&backup.id)
    {
        return Err("请先恢复此文件最新的一次备份，再逐次回退。".into());
    }
    let path = Path::new(&backup.target);
    let current = read_optional(path)?;
    let actual = digest(&current);
    if actual != backup.after_digest && actual != backup.before_digest {
        return Err(
            "文件在启用后已被外部修改，恢复已停止，避免覆盖你的新设置。原备份仍保留。".into(),
        );
    }
    let raw = read_optional(&root.join("backups").join(format!("{}.json", backup.id)))?
        .ok_or("备份文件缺失。")?;
    let snapshot: Snapshot = serde_json::from_str(&raw).map_err(|_| "备份损坏。")?;
    if digest(&snapshot.original) != backup.before_digest {
        return Err("备份内容校验失败，停止恢复。".into());
    }
    match snapshot.original {
        Some(text) => atomic_write(path, &text)?,
        None if current.is_some() => {
            fs::remove_file(path).map_err(|_| "无法移除本应用创建的配置文件。")?
        }
        None => (),
    }
    store.backups.retain(|b| b.id != id);
    if let Some(previous) = backup.previous_active {
        store.active.insert(backup.tool.key().into(), previous);
    } else {
        store.active.remove(backup.tool.key());
    }
    persist(root, store)?;
    // File intentionally retained as recovery history, private permissions, never returned over IPC.
    Ok(())
}
pub fn persist(root: &Path, store: &Store) -> Result<()> {
    atomic_write(
        &root.join("profiles.json"),
        &serde_json::to_string_pretty(store).map_err(|_| "配置保存失败。")?,
    )
}
pub fn load(root: &Path) -> Result<Store> {
    match read_optional(&root.join("profiles.json"))? {
        Some(s) => serde_json::from_str(&s)
            .map_err(|_| "配置库损坏；请保留文件并从备份恢复，不会重置现有数据。".into()),
        None => Ok(Store::default()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile(tool: Tool) -> Profile {
        Profile {
            id: "test".into(),
            name: "Test".into(),
            tool,
            provider: "custom".into(),
            base_url: "https://example.com/v1".into(),
            model: "test-model".into(),
            auth: "bearer".into(),
            revision: "1".into(),
        }
    }
    #[test]
    fn codex_preserves_comments_and_other_providers() {
        let original = Some("# user comment\nmodel = 'old'\nprofile = 'work'\n[model_providers.other]\nname='Other'\n[mcp_servers.local]\ncommand='test'\n".into());
        let output = transform(&profile(Tool::Codex), &original, "test-key").unwrap();
        assert!(output.contains("# user comment"));
        let doc = output.parse::<DocumentMut>().unwrap();
        assert_eq!(
            doc["mcp_servers"]["local"]["command"].as_str(),
            Some("test")
        );
        assert_eq!(
            doc["model_providers"]["other"]["name"].as_str(),
            Some("Other")
        );
        assert!(doc.get("profile").is_none());
        assert_eq!(
            doc["model_providers"]["aimodel_switch"]["wire_api"].as_str(),
            Some("responses")
        );
    }
    #[test]
    fn claude_preserves_permissions_and_clears_conflicts() {
        let original = Some(r#"{"permissions":{"deny":["Bash(rm *)"]},"env":{"KEEP":"yes","ANTHROPIC_API_KEY":"old","CLAUDE_CODE_USE_BEDROCK":"1"},"apiKeyHelper":"old"}"#.into());
        let output: Value = serde_json::from_str(
            &transform(&profile(Tool::Claude), &original, "test-key").unwrap(),
        )
        .unwrap();
        assert_eq!(output["env"]["KEEP"], "yes");
        assert_eq!(output["permissions"]["deny"][0], "Bash(rm *)");
        assert_eq!(output["env"]["ANTHROPIC_API_KEY"], "");
        assert!(output.get("apiKeyHelper").is_none());
    }
    #[test]
    fn rejects_malformed_inputs_and_insecure_hosts() {
        assert!(validate_url("http://example.com").is_err());
        assert!(validate_url("https://user:pass@example.com").is_err());
        assert!(validate_url("https://example.com/?key=secret").is_err());
        assert!(validate_url("http://127.0.0.1:8000/v1").is_ok());
        assert!(transform(&profile(Tool::Codex), &Some("invalid = [".into()), "key").is_err());
        assert!(transform(&profile(Tool::Claude), &Some("[]".into()), "key").is_err());
    }
    #[test]
    fn apply_restore_preserves_bytes_and_checks_races() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let mut store = Store {
            settings: Settings {
                codex_dir: root.join("codex").to_string_lossy().into(),
                claude_dir: root.join("claude").to_string_lossy().into(),
            },
            ..Store::default()
        };
        let p = profile(Tool::Codex);
        let path = target(&store.settings, &p.tool).unwrap();
        let original = "# original\nmodel = 'old'\n";
        atomic_write(&path, original).unwrap();
        let initial = preview(&p, &store.settings).unwrap();
        atomic_write(&path, "# externally changed").unwrap();
        assert!(apply(&root, &mut store, &p, "test-key", &initial.expected_digest).is_err());
        atomic_write(&path, original).unwrap();
        apply(&root, &mut store, &p, "test-key", &initial.expected_digest).unwrap();
        let id = store.backups.last().unwrap().id.clone();
        let applied = read_optional(&path).unwrap().unwrap();
        atomic_write(&path, "# user edited").unwrap();
        assert!(restore(&root, &mut store, &id).is_err());
        atomic_write(&path, &applied).unwrap();
        restore(&root, &mut store, &id).unwrap();
        assert_eq!(read_optional(&path).unwrap().unwrap(), original);
        assert!(store.active.is_empty());
    }
    #[test]
    fn missing_file_restores_to_missing_and_backups_are_ordered() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let mut store = Store {
            settings: Settings {
                codex_dir: root.join("codex").to_string_lossy().into(),
                claude_dir: root.join("claude").to_string_lossy().into(),
            },
            ..Store::default()
        };
        let p = profile(Tool::Claude);
        let path = target(&store.settings, &p.tool).unwrap();
        let expected = preview(&p, &store.settings).unwrap().expected_digest;
        apply(&root, &mut store, &p, "key", &expected).unwrap();
        let first = store.backups[0].id.clone();
        let expected = preview(&p, &store.settings).unwrap().expected_digest;
        apply(&root, &mut store, &p, "key2", &expected).unwrap();
        let second = store.backups[1].id.clone();
        assert!(restore(&root, &mut store, &first).is_err());
        restore(&root, &mut store, &second).unwrap();
        restore(&root, &mut store, &first).unwrap();
        assert!(!path.exists());
        assert_ne!(digest(&None), digest(&Some("".into())));
    }
    #[cfg(unix)]
    #[test]
    fn symlink_target_is_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let actual = root.join("actual");
        fs::write(&actual, "preserve").unwrap();
        let link = root.join("config.toml");
        std::os::unix::fs::symlink(&actual, &link).unwrap();
        assert!(atomic_write(&link, "overwrite").is_err());
        assert_eq!(fs::read_to_string(actual).unwrap(), "preserve");
    }
}
