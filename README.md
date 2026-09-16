# AIModel Switch

基于 [Cockpit Tools v1.3.53](https://github.com/jlcodes99/cockpit-tools/tree/c4c05a8e1ba590237340919142aad3d82e0dc52d) 的 Codex / Claude 专注版。

**精简的是平台范围，不是账号接入能力。** 0.2 恢复原版页面和控制器，替代 0.1 中功能过少的接口表单。

## 保留

- Codex：OAuth 浏览器授权、设备授权、手动回调、待授权账号；Token / JSON；API Key；文件与本地导入。
- Claude：原版账号接入、Claude Code 配置与原版管理页面。
- 账号列表、分组、备注、切换、额度查询、导入导出。
- 供应商预设、自定义供应商、已保存密钥复用、上游模型获取、模型目录与同步。
- Codex API 服务、两平台的实例管理，以及相关原版后台逻辑。
- 原版浅色/深色主题与界面结构；提高辅助文字对比度和表单字号。

其他平台不再显示在导航、平台设置或系统托盘中，它们的后台刷新、自动导入和 OAuth 监听恢复被停用。共有模块暂时保留在源码中，避免再次为了缩体积破坏依赖；这不是一个所有代码都已物理裁剪的极小版本。

## 独立性与数据

- 应用标识：`io.aicodefang.aimodel-switch`。
- 账号数据目录：`~/.aimodel_switch`，可通过 `AIMODEL_SWITCH_DATA_DIR` 覆盖。
- 不迁移或删除原 Cockpit 数据。已有账号可通过原版导出 / 新版导入迁移。
- 不加载上游广告、公告、远端平台开关或自动更新。
- 默认关闭诊断上报、插件 WebSocket 和 Codex UI 注入。
- 默认不执行针对现有 Codex 配置/历史记录的旧版一次性迁移。

0.1 的单纯 API 表单数据仍保留在当时的应用数据目录与系统凭据库中，0.2 不会自动转换或清除它们。请通过新界面重新添加需要使用的配置。

账号存储、导入导出和授权方式沿用原项目；请妥善保管令牌与备份。测试构建不会替你完成真实 OAuth 登录。Google OAuth 占位符属于已停用平台的上游残留，不影响本版 Codex / Claude 登录实现。

## 开发

需要 Node.js 22、Rust stable、Go 1.26+ 以及相应系统 Tauri 构建环境。Go 用于构建随应用一起分发的 API 服务辅助进程；使用成品应用不需要安装 Go，也不需要自己部署数据库或服务器。

```sh
npm ci
npm run tauri dev
```

```sh
npm run build
npm test
cargo check -p cockpit-tools
npm run tauri build -- --bundles app
```

macOS 如果 Command Line Tools 的 SwiftPM `PackageDescription` 接口与动态库不匹配，可以设置 `AIMODEL_DIRECT_SWIFT=1`。它直接编译同一组 Swift 原生菜单源码，不禁用菜单功能。正常工具链不需要此开关。

本分支保留上游署名与 CC BY-NC-SA 4.0 许可说明，详见 [UPSTREAM.md](UPSTREAM.md)。
