# GitHub Releases

`Desktop release` (`.github/workflows/release.yml`) builds the supported release packages on GitHub-hosted runners. No local build is needed.

## Packages

| Platform | Architectures | Release assets |
| --- | --- | --- |
| macOS | Apple Silicon ARM64 | `.dmg`, `.app.tar.gz` |
| Windows | x64 | NSIS `-setup.exe` |

The matrix uses native runners for the published architectures. x64 means 64-bit x86; 32-bit x86/ARMv7 are not included.

Each release includes `SHA256SUMS.txt` and a `BUILD-<platform>-<arch>.txt` file for every target. The build files identify the source commit, Rust target and macOS notarization status. Windows installers are unsigned until a Windows code-signing certificate is configured.

## Trigger a release

1. Update `package.json` to an unused release version, then run `npm run sync-version` and `npm install --package-lock-only` to synchronize the manifests and lockfile. Commit the version changes.
2. Push a matching tag, for example `v0.2.2` for version `0.2.2`. The workflow must already be present in the tagged commit.
3. Open Actions -> Desktop release to follow the macOS ARM64 and Windows x64 builds. Once every build and package verification succeeds, the workflow publishes the packages to Releases.

Alternatively, after the workflow is merged into the default branch (`main`), open Actions -> Desktop release -> Run workflow and select the source branch. The tag is derived from that branch's package version and created only after all builds pass. Enable `prerelease` for a preview. Versions containing a prerelease suffix are automatically marked as prereleases.

A tag that already points at another commit is rejected. Published releases are not overwritten: use a new version. A failed upload leaves a draft release; rerunning the same commit can complete that draft. A failed platform build does not publish a partial release. Individual successful packages remain available as Actions artifacts for 14 days.

The existing Windows package workflow remains a separate main-branch smoke build; it does not publish Releases.

### Retry publishing without rebuilding

If both builds passed but publishing failed, push a `publish-<original-tag>` tag on a commit containing `.github/workflows/recover-release.yml` (for example, `publish-v0.2.2-rc.1`). This starts `Recover desktop release`, which finds the original release run, requires both build jobs and the preparation job to have succeeded, and downloads its existing Actions artifacts. It validates their source commit, regenerates checksums and publishes the original release. It does not rebuild packages, move the original tag, or overwrite a published release. The original artifacts must still be within their 14-day retention period.

## macOS signing

Configure these repository Actions Secrets:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64 of a password-protected PKCS#12 (`.p12`) containing the Developer ID Application certificate and matching private key |
| `APPLE_CERTIFICATE_PASSWORD` | Password protecting the PKCS#12 file |

Both are required for macOS builds. The workflow imports the identity into a temporary keychain, detects its Developer ID signing name, enables access for `codesign`, and deletes the keychain in an `always()` cleanup step. Certificates and private keys are never packaged as artifacts. Signing material must not be committed to Git.

For Apple notarization, add all three of:

| Secret | Purpose |
| --- | --- |
| `APPLE_ID` | Developer's Apple account email |
| `APPLE_PASSWORD` | Apple app-specific password, not the account login password |
| `APPLE_TEAM_ID` | Developer team ID (`4K29VYTAVH` for the current certificate) |

With all three present, Tauri submits the application to Apple and waits for notarization and stapling before packaging. The workflow verifies the stapled ticket and Gatekeeper acceptance before upload. With none present, it emits a warning and produces Developer ID-signed, **not notarized** packages. An incomplete set of notarization credentials fails the build instead of silently skipping notarization.

Secrets are only exposed to the signing steps in the macOS jobs. Releases run on tags or manual dispatch, not on pull requests. Only the final publishing job receives `contents: write`; build jobs have read-only repository permissions.

## References

- [GitHub-hosted runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Tauri macOS signing and notarization](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/)
