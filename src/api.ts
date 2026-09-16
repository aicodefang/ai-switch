import { invoke, isTauri } from "@tauri-apps/api/core";
import type { StateView } from "./types";
export const desktop = isTauri();
export const demo: StateView = {
  store: {
    settings: { codexDir: "~/.codex", claudeDir: "~/.claude" },
    profiles: [],
    active: {},
    backups: [],
  },
  dataDir: "桌面版启动后显示",
  activeMatches: {},
};
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!desktop)
    throw new Error(
      "浏览器为界面预览。请运行桌面版以安全存储密钥、测试或启用配置。",
    );
  return invoke<T>(command, args);
}
