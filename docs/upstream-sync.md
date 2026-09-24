# 上游同步策略

当前基线：本地 cockpit-tools main，提交 `3a2fe52f`（v1.3.59 后的 main）。本次未从网络更新上游。

1. 保存当前提交为回退点，在指定开发分支复制上游完整源码。保留 Git 历史、用户数据和本机构建缓存。
2. Rust、Go 和共享前端模块成套同步；不得只复制调用方、漏掉辅助函数，也不为隐藏平台而删除底层实现。
3. 在产品层限制 Codex/Claude 入口。广告、赞助、公告与营销入口不显示，后台公告及远端配置加载关闭；保留模块本体以维护依赖完整性。
4. 恢复 ai-switch 名称、图标、应用标识、深链接和 `.aimodel_switch` 数据目录。保留现有配置格式；不用上游应用的数据目录。
5. Codex API Key 入口顺序为自定义、OpenAI Official、Azure OpenAI、tuantuianai。tuantuan 和 tuantuanai 都是同一供应商的兼容别名；地址为 https://hk1.heliumlabz.com 和 https://openai.heliumlabz.com。
6. 保留 OAuth、Token/JSON、API Key、模型、实例与本地 API 服务。恢复凭据占位符，不提交 Google OAuth 密钥或用户配置。
7. 提交前执行前端测试/构建、发布脚本测试、Go 测试和锁定依赖的 Rust 检查。macOS 通过不能代替 Windows 检查。分支 CI 使用 macOS 和 Windows runner；Windows GNU 交叉检查不能替代 Windows MSVC 安装包验证。
8. 发布仅包含 macOS ARM64 和 Windows x64。先验证指定提交，再在用户要求发布时升级全部版本文件和根 Cargo.lock、创建新 tag；不移动旧 tag。

本次交付分支为 `copy`，不自动合并 main，也不自动创建发布 tag。

## 本次验证

2026-09-24：309 项 TypeScript 测试、20 项发布脚本测试、前端构建、Go sidecar 测试全部通过。
`cargo check -p cockpit-tools --locked`（macOS ARM64，使用 AIMODEL_DIRECT_SWIFT=1）及 Windows GNU 目标的同项检查通过。
尚未执行 Windows MSVC 安装包构建、真实 OAuth 授权或应用账号切换验证。
完整导入保留了上游已有的尾随空格/文件末尾空行，根提交的 diff --check 因这些格式提示未通过；没有为修格式重写上游文件。
