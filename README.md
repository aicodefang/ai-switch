# AIModel Switch

A local desktop configuration manager for **Codex** and **Claude Code**.

保存多组供应商、接口地址、密钥和模型配置，预览后启用，随时恢复。
不需要数据库服务器、Docker 或常驻 API 代理。

## 功能

- Codex Responses 与 Claude Code Anthropic Messages 配置适配。
- OpenAI、Anthropic、DeepSeek、Kimi、智谱、MiniMax、通义、OpenRouter 与自定义供应商入口。
- 保存、编辑、复制和删除配置；保存不等于启用。
- API Key 保存在系统凭据库，前端不会读取已保存的密钥。
- 连接测试发送最小模型请求；拒绝跨域重定向，不回显供应商响应中的敏感内容。
- 启用前预览目标路径和改动字段；自动备份原始文件，检测外部修改，按时间顺序回退。
- 独立应用标识与数据目录，无上游更新服务、远程广告或公告。

## 开发与构建

需要 Node.js 22.12+、npm、Rust stable 和 Tauri 2 对应平台工具链。
macOS 需要 Xcode Command Line Tools；Windows 需要 MSVC Build Tools 和 WebView2；Linux 需要 WebKitGTK 4.1 等 Tauri 构建依赖，以及已解锁的 Secret Service（例如 GNOME Keyring）。不需要 Go。

```sh
npm ci
npm run tauri dev
```

仅预览界面：`npm run dev`。浏览器模式明确禁用保存、测试与启用，绝不在 localStorage 模拟存储 API Key。

```sh
npm run build
npm test
cargo test --workspace
npm run tauri build
```

测试仅使用临时目录与本机模拟 HTTP 接口，不读取或修改真实工具账号。
系统凭据库集成测试单独执行：`cargo test vault_roundtrip -- --ignored`，只创建并删除随机测试凭据，不访问其他应用密钥。

## 使用

1. 选择 Codex 或 Claude Code，新增供应商配置。
2. 确认所购套餐、区域、Base URL 和认证方式；模型 ID 必须在该账号下可用。
3. 保存配置；可选择连接测试（会产生少量 API 用量）。
4. 点击启用，检查路径与修改范围后确认。
5. 重启编程工具或新建会话。需要撤销时前往“备份与恢复”。

**不同协议不能混用。** 普通 OpenAI Chat Completions 兼容不能自动视为 Responses 或 Anthropic Messages 兼容；本应用不做协议转换，也不保证所有模型具备完整的工具调用能力。
预设是可编辑建议，不是账号权限承诺。Kimi 和通义预设针对 Coding Plan；其他套餐或地域需要按官方文档调整地址。部分供应商提供模型建议，也可手动填写其他 ID。

## 文件与密钥

- 应用数据：操作系统应用数据目录下 `io.aicodefang.aimodel-switch`。
- 配置库：`profiles.json`，仅含名称、地址、模型和凭据引用，不含 API Key。
- API Key：系统凭据库服务名 `io.aicodefang.aimodel-switch.api-keys`。
- Codex 默认目标：`$CODEX_HOME/config.toml`，未设置变量则为 `~/.codex/config.toml`。
- Claude Code 默认目标：`$CLAUDE_CONFIG_DIR/settings.json`，未设置则为 `~/.claude/settings.json`。
- 设置页可指定其他实际绝对目录，暂不支持符号链接。

**启用后目标工具配置中含明文密钥。** 这是为了让独立启动的客户端在本应用退出后继续使用接口；它不意味着客户端配置也在钥匙串里。Codex 使用官方 schema 的 `experimental_bearer_token`，不修改 `auth.json`；Claude 根据认证方式写入 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`。

原始文件备份可能含原有凭据。Unix 备份/配置文件权限为 `0600`、新建目录为 `0700`；Windows 继承目标个人目录的 ACL。不要将目标配置或数据目录上传公开仓库。

启用仅替换相关配置项：Codex 取消顶层默认 `profile` 以避免其覆盖模型；Claude 清除冲突的认证 helper / 云服务开关并统一主模型、子代理模型与别名。MCP、Hooks、权限等无关配置保持原值。原文件格式错误时拒绝写入。

命令行参数、项目配置、组织托管策略和 shell 环境变量仍可能覆盖用户配置。UI 的“已启用”表示目标文件匹配，不等同于对实际运行客户端做了探测。

恢复只允许最新的同文件备份，文件外部变动会阻止恢复；已恢复的备份原文件留在数据目录供人工找回。请自行按需清理旧备份。

## 结构

```text
src/                   React 界面、类型与供应商预设
src-tauri/src/engine.rs 配置转换、原子写入、备份与恢复
src-tauri/src/lib.rs    Tauri 命令、系统凭据库、连接测试
```

## 官方配置依据

- [Codex configuration](https://developers.openai.com/codex/config-reference/)，并核对 [OpenAI 官方 config schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)。
- [Claude Code settings](https://code.claude.com/docs/en/settings)。
- [DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api)。
- [智谱 Claude Code](https://docs.bigmodel.cn/cn/coding-plan/tool/claude)。
- [MiniMax Claude Code](https://platform.minimax.io/docs/coding-plan/claude-code)。
- [Kimi Coding](https://www.kimi.com/code/docs/third-party-tools/claude-code.html)。
- [百炼 Coding Plan](https://help.aliyun.com/zh/model-studio/coding-plan)。
- [OpenRouter Claude Code](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration) 与 [Responses](https://openrouter.ai/docs/api_reference/responses/basic-usage)。

## 上游与许可

本项目来自 [jlcodes99/cockpit-tools](https://github.com/jlcodes99/cockpit-tools) `c4c05a8e1ba590237340919142aad3d82e0dc52d`（v1.3.53）。保留上游说明于 [UPSTREAM.md](UPSTREAM.md)。本分支将产品聚焦于两款工具的 API 配置，替换了界面和配置后端，移除 OAuth、多实例、额度调度及 Go sidecar。

沿用上游声明的 **CC BY-NC-SA 4.0**；仓库公开不改变其许可。第三方依赖仍遵循各自许可。
