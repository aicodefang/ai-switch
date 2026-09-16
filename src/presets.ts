import type { Draft, Tool } from "./types";
export interface Preset {
  id: string;
  name: string;
  mark: string;
  tools: Tool[];
  url: string;
  auth: "bearer" | "api-key";
  hint: string;
  docs: string;
}
// Presets are editable suggestions, not a claim that every model supports tool use.
// Never add API keys or referral parameters to this catalog.
export const presets: Preset[] = [
  {
    id: "openai",
    name: "OpenAI",
    mark: "O",
    tools: ["codex"],
    url: "https://api.openai.com/v1",
    auth: "bearer",
    hint: "官方 Responses API。填写你账号可用的模型 ID。",
    docs: "https://developers.openai.com/codex/config-reference/",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    mark: "A",
    tools: ["claude"],
    url: "https://api.anthropic.com",
    auth: "api-key",
    hint: "官方 Messages API，使用 Anthropic Console API Key。",
    docs: "https://code.claude.com/docs/en/settings",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    mark: "D",
    tools: ["claude"],
    url: "https://api.deepseek.com/anthropic",
    auth: "bearer",
    hint: "Anthropic 兼容入口；模型需支持 Claude Code 所需的工具调用。",
    docs: "https://api-docs.deepseek.com/guides/anthropic_api",
  },
  {
    id: "kimi",
    name: "Kimi Coding",
    mark: "K",
    tools: ["claude"],
    url: "https://api.kimi.com/coding",
    auth: "bearer",
    hint: "使用 Kimi Coding 套餐密钥，与 Moonshot 普通 API 密钥不同。",
    docs: "https://www.kimi.com/code/docs/third-party-tools/claude-code.html",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    mark: "Z",
    tools: ["claude"],
    url: "https://open.bigmodel.cn/api/anthropic",
    auth: "bearer",
    hint: "使用支持 Claude Code 的套餐与模型；不要填普通 Chat Completions 地址。",
    docs: "https://docs.bigmodel.cn/cn/coding-plan/tool/claude",
  },
  {
    id: "minimax",
    name: "MiniMax",
    mark: "M",
    tools: ["claude"],
    url: "https://api.minimax.io/anthropic",
    auth: "bearer",
    hint: "此为国际站入口；中国站账号请按官方文档调整域名。",
    docs: "https://platform.minimax.io/docs/coding-plan/claude-code",
  },
  {
    id: "qwen",
    name: "通义 Coding Plan",
    mark: "Q",
    tools: ["claude"],
    url: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    auth: "bearer",
    hint: "此为百炼 Coding Plan 入口，不能使用普通百炼 API 密钥。其他地域按套餐文档调整。",
    docs: "https://help.aliyun.com/zh/model-studio/coding-plan",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    mark: "R",
    tools: ["codex", "claude"],
    url: "",
    auth: "bearer",
    hint: "按目标工具填写 Responses 或 Anthropic Messages 入口，并确认所选模型支持工具调用。",
    docs: "https://openrouter.ai/docs",
  },
  {
    id: "custom",
    name: "自定义服务",
    mark: "+",
    tools: ["codex", "claude"],
    url: "",
    auth: "bearer",
    hint: "Codex 要求 Responses；Claude Code 要求 Anthropic Messages。仅 Chat Completions 兼容还不够。",
    docs: "",
  },
];
export const forTool = (tool: Tool) =>
  presets.filter((p) => p.tools.includes(tool));
export const presetUrl = (p: Preset, tool: Tool) =>
  p.id === "openrouter"
    ? tool === "codex"
      ? "https://openrouter.ai/api/v1"
      : "https://openrouter.ai/api"
    : p.url;
export const modelSuggestions: Record<string, string[]> = {
  deepseek: ["deepseek-v4-pro", "deepseek-flash"],
  kimi: ["kimi-for-coding"],
  glm: ["glm-5.3", "glm-5.3-flash"],
  minimax: ["MiniMax-M3"],
  qwen: ["qwen3-coder-plus", "qwen3-coder-next"],
};
export function newDraft(tool: Tool): Draft {
  const p = forTool(tool)[0];
  return {
    name: "",
    tool,
    provider: p.id,
    baseUrl: presetUrl(p, tool),
    model: "",
    auth: p.auth,
    apiKey: "",
  };
}
export function validateDraft(d: Draft): string | undefined {
  if (!d.name.trim()) return "请填写配置名称。";
  if (!d.model.trim()) return "请填写模型 ID。";
  if (!d.id && !d.apiKey.trim()) return "请填写 API Key。";
  try {
    const u = new URL(d.baseUrl);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      )
    )
      return "远程接口须使用 HTTPS，本机接口可使用 HTTP。";
    if (u.username || u.password || u.search || u.hash)
      return "API 地址不能包含账号、密码、查询参数或片段。";
    if (d.tool === "claude" && /\/v1\/messages\/?$/.test(u.pathname))
      return "请填 Base URL，不要包含 /v1/messages。";
    if (d.tool === "codex" && /\/responses\/?$/.test(u.pathname))
      return "请填 Base URL，不要包含 /responses。";
  } catch {
    return "请填写有效的 API 地址。";
  }
  return undefined;
}
