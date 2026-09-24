# Release Process

本文档描述仓库当前由 `.github/workflows/release.yml` 执行的发布流程。发布行为以 workflow 和 `scripts/release/` 下的脚本为准；如果两者与本文不一致，应先修正文档或 workflow，再发版。

## 1. 发布前检查

在仓库根目录执行：

```bash
npm run release:preflight
```

当前 preflight 依次执行：

1. `node scripts/check_locales.cjs`
2. `npm run typecheck`
3. `npm run build`
4. `cargo check`（`src-tauri`）
5. `cargo test --lib`（`src-tauri`，`RUST_TEST_THREADS=1`）

排障时可以跳过单项：

```bash
node scripts/release/preflight.cjs \
  --skip-locales \
  --skip-typecheck \
  --skip-build \
  --skip-cargo \
  --skip-cargo-test
```

正式发布不应为了绕过失败而随意使用 skip 参数。

## 2. 版本与标签

`package.json.version` 是发布 workflow 读取的版本。创建发布标签前先执行：

```bash
npm run sync-version
```

然后确认版本同步后的文件与 changelog 已提交。发布标签必须严格匹配：

```text
v<package.json.version>
```

例如 `package.json.version` 为 `1.3.40` 时，标签必须是 `v1.3.40`。workflow 会在版本或标签不一致时直接失败。

## 3. GitHub Actions 发布目标

当前 release workflow 构建并上传：

- macOS Apple Silicon (`aarch64`)
- Windows x64

macOS 产物包含 `.dmg` 与 `.app.tar.gz`；Windows 产物为 NSIS `-setup.exe` 安装程序。当前 workflow 不构建 macOS Intel、Windows ARM64 或 Linux 包。

macOS 构建要求 Developer ID 证书 secrets。若配置了 Apple notarization secrets，workflow 会执行公证和 stapler 校验；若未配置完整公证 secrets，则产物为 Developer ID 签名但未公证。

Windows 安装程序当前没有 Authenticode 签名步骤；不要把它描述成已签名安装包，除非 workflow 另外明确实现了该步骤。

## 4. Release assets

Windows x64 和 macOS Apple Silicon 构建 job 会先通过 `scripts/release/stage_release_assets.cjs` 规范化允许上传的 release assets，然后上传到 Actions artifacts。发布 job 下载这些 artifacts，验证：

- `BUILD-macos-aarch64.txt` 包含当前发布 commit。
- `BUILD-windows-x64.txt` 包含当前发布 commit。

验证通过后生成 `SHA256SUMS.txt`，再发布到 GitHub Release。

## 5. SHA256SUMS

`upload-checksums` job 会重新下载该版本的 release assets，对文件逐个计算 SHA-256，并上传：

```text
SHA256SUMS.txt
```

不要依赖文档中不存在的 `npm run release:checksums` 命令。当前 checksum 的权威实现位于 release workflow 本身；`scripts/release/gen_checksums.cjs` 是可单独调用的脚本，但不是 `package.json` 中的标准 npm script。

## 6. 推荐发版顺序

1. 更新 `package.json` 版本。
2. 更新 `CHANGELOG.md` 与 `CHANGELOG.zh-CN.md`，确保存在对应版本段落。
3. 执行：

```bash
npm run sync-version
npm run release:preflight
```

4. 提交并合并发布所需改动。
5. 从期望发布的 commit 创建 `v<version>` 标签并推送标签。
6. 检查 GitHub Actions 的 release workflow 完整成功。
7. 检查 GitHub Release 的 macOS ARM64、Windows x64 产物、构建记录和 `SHA256SUMS.txt`。

仅有远端 branch 和 tag 并不代表发布已经成功。正式完成应以 release workflow 成功、预期 assets 可用以及 checksum 生成完成为准。

## 7. 当前已知的发布状态问题

当前 workflow 应在两个目标构建都完成且 checksum 生成后再发布 Release。若后续重新引入 updater manifests、Homebrew Cask 或更多平台，需要同步恢复对应的产物校验和文档。

不要通过文档把未实现的发布步骤描述成推荐设计。
