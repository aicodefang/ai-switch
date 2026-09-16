import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FolderClock,
  KeyRound,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { call, demo, desktop } from "./api";
import {
  forTool,
  newDraft,
  presets,
  presetUrl,
  modelSuggestions,
  validateDraft,
} from "./presets";
import type {
  Backup,
  Draft,
  Preview,
  Profile,
  Settings,
  StateView,
  TestResult,
  Tool,
} from "./types";

type Dialog =
  | { kind: "apply"; p: Profile; preview: Preview }
  | { kind: "delete"; p: Profile }
  | { kind: "restore"; b: Backup }
  | { kind: "test"; p: Profile };
const labels = { codex: "Codex", claude: "Claude Code" };
export default function App() {
  const [view, setView] = useState<Tool | "settings" | "backups">("codex");
  const [state, setState] = useState<StateView>(demo);
  const [loading, setLoading] = useState(desktop);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [paths, setPaths] = useState<Settings>(demo.store.settings);
  const formRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tool: Tool = view === "claude" ? "claude" : "codex";
  const profiles = state.store.profiles.filter(
    (p) =>
      p.tool === tool &&
      `${p.name} ${p.model} ${p.provider}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const active = state.store.active[tool];
  const enabled = state.activeMatches[tool];
  async function refresh() {
    const next = await call<StateView>("get_state");
    setState(next);
    setPaths(next.store.settings);
  }
  useEffect(() => {
    if (desktop)
      refresh()
        .catch((e) => setNotice({ text: String(e), error: true }))
        .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const element = dialog ? dialogRef.current : draft ? formRef.current : null;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,a[href],[tabindex="0"]',
        ),
      );
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        dialog ? setDialog(null) : setDraft(null);
      }
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [!!draft, !!dialog, busy]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setNotice({ text: String(e).replace(/^Error: /, ""), error: true });
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: typeof view) {
    setView(next);
    setQuery("");
    setNotice(null);
  }
  async function save() {
    if (!draft) return;
    const error = validateDraft(draft);
    if (error) {
      setNotice({ text: error, error: true });
      return;
    }
    await perform(async () => {
      await call("save_profile", { input: draft });
      setDraft(null);
      await refresh();
      setNotice({
        text: "配置已保存，尚未写入工具。点击「启用」查看变更。",
        error: false,
      });
    });
  }
  async function confirm() {
    if (!dialog) return;
    const d = dialog;
    await perform(async () => {
      if (d.kind === "apply") {
        await call("apply_profile", {
          id: d.p.id,
          expectedDigest: d.preview.expectedDigest,
          expectedTarget: d.preview.target,
          expectedRevision: d.preview.profileRevision,
        });
        setNotice({
          text: "已启用并自动备份。请重新启动工具或新建会话。",
          error: false,
        });
      }
      if (d.kind === "delete") {
        await call("delete_profile", { id: d.p.id });
        setNotice({
          text: "配置与系统凭据已删除。已有备份仍保留。",
          error: false,
        });
      }
      if (d.kind === "restore") {
        await call("restore_backup", { id: d.b.id });
        setNotice({ text: "已恢复到此次启用前的配置。", error: false });
      }
      if (d.kind === "test") {
        const result = await call<TestResult>("test_profile", { id: d.p.id });
        setTests((s) => ({ ...s, [d.p.id]: result }));
        setNotice({ text: result.message, error: !result.ok });
      }
      setDialog(null);
      await refresh();
    });
  }
  const edit = (p: Profile) => setDraft({ ...p, apiKey: "" });
  const copy = (p: Profile) =>
    setDraft({
      name: `${p.name} 副本`,
      tool: p.tool,
      provider: p.provider,
      baseUrl: p.baseUrl,
      model: p.model,
      auth: p.auth,
      apiKey: "",
    });
  const isTool = view === "codex" || view === "claude";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ArrowLeftRight size={21} />
          </div>
          <div>
            <strong>AIModel Switch</strong>
            <small>你的编程接口工作台</small>
          </div>
        </div>
        <div className="nav-label">工作空间</div>
        <nav aria-label="主导航">
          <button
            className={view === "codex" ? "nav active" : "nav"}
            onClick={() => navigate("codex")}
          >
            <Terminal size={19} />
            Codex
            <span>
              {state.store.profiles.filter((p) => p.tool === "codex").length}
            </span>
          </button>
          <button
            className={view === "claude" ? "nav active" : "nav"}
            onClick={() => navigate("claude")}
          >
            <Sparkles size={19} />
            Claude Code
            <span>
              {state.store.profiles.filter((p) => p.tool === "claude").length}
            </span>
          </button>
          <div className="nav-separator" />
          <button
            className={view === "backups" ? "nav active" : "nav"}
            onClick={() => navigate("backups")}
          >
            <FolderClock size={19} />
            备份与恢复
          </button>
          <button
            className={view === "settings" ? "nav active" : "nav"}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            设置
          </button>
        </nav>
        <div className="local-note">
          <ShieldCheck size={22} />
          <strong>留在你的设备上</strong>
          <p>配置本地保存，密钥使用系统凭据库。不需要部署服务器。</p>
          <span className="local-pill">
            <i />
            本地优先 · v0.1.0
          </span>
        </div>
        <div className="sidebar-footer">
          为专注编程而精简 <ArrowUpIcon />
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            工作空间 <ChevronRight size={14} />{" "}
            {isTool
              ? labels[tool]
              : view === "settings"
                ? "设置"
                : "备份与恢复"}
          </span>
          <span className="subtle">
            <span
              className={desktop ? "status-dot" : "status-dot preview-dot"}
            />
            {desktop ? "桌面应用" : "浏览器预览"}
          </span>
        </header>
        <div className="content">
          {!desktop && (
            <div className="preview-banner">
              <Code2 size={17} />
              <span>
                界面预览模式 · 可以浏览表单；保存、测试和启用需要桌面版。
              </span>
            </div>
          )}
          {notice && (
            <div
              role={notice.error ? "alert" : "status"}
              className={`notice ${notice.error ? "error" : "success"}`}
            >
              <span>{notice.text}</span>
              <button aria-label="关闭提示" onClick={() => setNotice(null)}>
                <X size={16} />
              </button>
            </div>
          )}
          {isTool && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">CONFIGURE. SWITCH. BUILD.</div>
                  <h1>{labels[tool]} 配置</h1>
                  <p>选好接口，切换模型。把注意力留给代码。</p>
                </div>
                <button
                  className="primary"
                  onClick={() => setDraft(newDraft(tool))}
                  disabled={busy || loading}
                >
                  <Plus size={17} />
                  添加配置
                </button>
              </section>
              <section className="overview">
                <div className="overview-icon">
                  {tool === "codex" ? (
                    <Terminal size={27} />
                  ) : (
                    <Sparkles size={27} />
                  )}
                </div>
                <div className="overview-main">
                  <div className="eyebrow">当前配置</div>
                  <h2>
                    {enabled
                      ? state.store.profiles.find(
                          (p) => p.id === active?.profileId,
                        )?.name
                      : active
                        ? "配置已变化"
                        : "尚未通过本应用启用"}
                  </h2>
                  <p>
                    {enabled
                      ? "已写入工具，关闭本应用后仍然生效。"
                      : active
                        ? "保存的配置或目标文件已变化，请重新预览后启用。"
                        : "现有工具配置保持原样，添加并启用一组配置即可开始。"}
                  </p>
                </div>
                <span className={`badge ${enabled ? "green" : ""}`}>
                  {enabled ? (
                    <Check size={13} />
                  ) : (
                    <SlidersHorizontal size={13} />
                  )}{" "}
                  {enabled ? "已启用" : "待配置"}
                </span>
              </section>
              <div className="section-heading">
                <h2>
                  我的配置 <span>{profiles.length}</span>
                </h2>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="搜索配置"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索名称、供应商或模型"
                  />
                </label>
              </div>
              {loading ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  正在读取本地配置…
                </div>
              ) : profiles.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <ArrowLeftRight size={28} />
                  </div>
                  <h3>
                    {query
                      ? "没有找到匹配的配置"
                      : "你的下一次切换，从这里开始"}
                  </h3>
                  <p>
                    {query
                      ? "换个关键词试试。"
                      : "保存常用供应商与模型，一次配置，随时切换。"}
                  </p>
                  {!query && (
                    <button
                      className="secondary"
                      onClick={() => setDraft(newDraft(tool))}
                    >
                      <Plus size={16} />
                      创建第一组配置
                    </button>
                  )}
                </div>
              ) : (
                <div className="profile-grid">
                  {profiles.map((p) => {
                    const preset = presets.find((x) => x.id === p.provider),
                      current = active?.profileId === p.id && enabled;
                    return (
                      <article
                        className={`profile-card ${current ? "selected" : ""}`}
                        key={p.id}
                      >
                        <div className="card-top">
                          <span className="provider-mark">
                            {preset?.mark || "+"}
                          </span>
                          <div>
                            <h3>{p.name}</h3>
                            <small>{preset?.name || p.provider}</small>
                          </div>
                          {current && (
                            <span className="badge green">
                              <Check size={12} />
                              已启用
                            </span>
                          )}
                        </div>
                        <div className="model-name" title={p.model}>
                          {p.model}
                        </div>
                        <p className="endpoint" title={p.baseUrl}>
                          {p.baseUrl}
                        </p>
                        <div className="protocol">
                          <span>
                            {tool === "codex"
                              ? "Responses"
                              : "Anthropic Messages"}
                          </span>
                          <KeyRound size={12} />
                          系统凭据库
                        </div>
                        {tests[p.id] && (
                          <div
                            className={`test-inline ${tests[p.id].ok ? "ok" : "bad"}`}
                            role="status"
                          >
                            {tests[p.id].ok ? "基础请求通过" : "测试未通过"} ·{" "}
                            {tests[p.id].elapsedMs} ms
                          </div>
                        )}
                        <div className="card-actions">
                          <button onClick={() => edit(p)} disabled={busy}>
                            编辑
                          </button>
                          <button
                            title="复制配置（需重新填写密钥）"
                            aria-label={`复制 ${p.name}`}
                            onClick={() => copy(p)}
                            disabled={busy}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            title="删除配置"
                            aria-label={`删除 ${p.name}`}
                            onClick={() => setDialog({ kind: "delete", p })}
                            disabled={busy || active?.profileId === p.id}
                          >
                            <Trash2 size={14} />
                          </button>
                          <div className="spacer" />
                          <button
                            onClick={() => setDialog({ kind: "test", p })}
                            disabled={busy}
                          >
                            <Zap size={14} />
                            测试
                          </button>
                          <button
                            className="mini-primary"
                            disabled={busy}
                            onClick={() =>
                              perform(async () => {
                                const preview = await call<Preview>(
                                  "preview_profile",
                                  { id: p.id, revision: p.revision },
                                );
                                setDialog({ kind: "apply", p, preview });
                              })
                            }
                          >
                            启用
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <section className="providers-section">
                <div className="section-heading">
                  <h2>从供应商开始</h2>
                  <span className="subtle">
                    {tool === "codex"
                      ? "Responses 协议"
                      : "Anthropic Messages 协议"}
                  </span>
                </div>
                <div className="provider-grid">
                  {forTool(tool).map((p) => (
                    <button
                      key={p.id}
                      className="provider-tile"
                      onClick={() =>
                        setDraft({
                          ...newDraft(tool),
                          provider: p.id,
                          baseUrl: presetUrl(p, tool),
                          auth: p.auth,
                        })
                      }
                    >
                      <span className="provider-mark small">{p.mark}</span>
                      <span>{p.name}</span>
                      <Plus size={14} />
                    </button>
                  ))}
                </div>
                <p className="footnote">
                  预设可编辑。不同套餐与地域可能使用不同地址，是否可用以供应商权限与实际测试为准。
                </p>
              </section>
            </>
          )}
          {view === "settings" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">LOCAL BY DESIGN</div>
                  <h1>设置</h1>
                  <p>明确写到哪里，始终掌握自己的配置。</p>
                </div>
              </section>
              <section className="panel">
                <h2>
                  <SlidersHorizontal size={19} />
                  工具配置目录
                </h2>
                <p>
                  默认读取 CODEX_HOME /
                  CLAUDE_CONFIG_DIR，未设置时使用用户目录。请填写实际绝对路径，不支持符号链接。
                </p>
                <label>
                  Codex 目录
                  <input
                    value={paths.codexDir}
                    onChange={(e) =>
                      setPaths({ ...paths, codexDir: e.target.value })
                    }
                  />
                  <small>写入 config.toml，不修改 auth.json。</small>
                </label>
                <label>
                  Claude Code 目录
                  <input
                    value={paths.claudeDir}
                    onChange={(e) =>
                      setPaths({ ...paths, claudeDir: e.target.value })
                    }
                  />
                  <small>
                    写入 settings.json，保留权限、Hooks 等其他设置。
                  </small>
                </label>
                <button
                  className="primary"
                  disabled={busy || !desktop}
                  onClick={() =>
                    perform(async () => {
                      await call("save_settings", { settings: paths });
                      await refresh();
                      setNotice({
                        text: "目录设置已保存，未改动工具配置。",
                        error: false,
                      });
                    })
                  }
                >
                  保存目录
                </button>
              </section>
              <section className="panel">
                <h2>
                  <Database size={19} />
                  数据与安全
                </h2>
                <p className="path">{state.dataDir}</p>
                <ul>
                  <li>配置列表不保存 API Key；密钥进入操作系统凭据库。</li>
                  <li>
                    启用时目标工具需要读取密钥，因此其配置文件会包含明文密钥。
                  </li>
                  <li>
                    恢复备份可能含原有凭据；Unix 文件权限为 0600，Windows
                    请使用受保护的个人目录。
                  </li>
                  <li>
                    无后台网关、远程公告和自动更新。连接测试才会发送最小模型请求。
                  </li>
                </ul>
              </section>
            </>
          )}
          {view === "backups" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">A WAY BACK, ALWAYS</div>
                  <h1>备份与恢复</h1>
                  <p>每次启用前自动备份。按文件从最近一次开始回退。</p>
                </div>
                <button
                  className="secondary"
                  disabled={!desktop || busy}
                  onClick={() => perform(refresh)}
                >
                  刷新
                </button>
              </section>
              {state.store.backups.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <FolderClock size={28} />
                  </div>
                  <h3>还没有需要恢复的配置</h3>
                  <p>启用配置后，备份会自动出现在这里。</p>
                </div>
              ) : (
                <div className="backup-list">
                  {[...state.store.backups].reverse().map((b, i, all) => (
                    <article className="backup-row" key={b.id}>
                      <div className="backup-icon">
                        <FolderClock size={21} />
                      </div>
                      <div>
                        <h3>
                          {labels[b.tool]} · {b.profileName}
                        </h3>
                        <p>{new Date(b.createdAt * 1000).toLocaleString()}</p>
                        <small className="path">{b.target}</small>
                      </div>
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          all.slice(0, i).some((x) => x.target === b.target)
                        }
                        onClick={() => setDialog({ kind: "restore", b })}
                      >
                        恢复此前配置
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <p className="footnote">
                如果文件已被其他程序修改，恢复会停止。恢复完成的备份原文件仍保存在本机数据目录，便于手动找回。
              </p>
            </>
          )}
          <footer>
            <ShieldCheck size={14} />
            本地配置 · 显式启用 · 随时恢复<span>AIModel Switch</span>
          </footer>
        </div>
      </main>
      {draft && (
        <div className="overlay">
          <div
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            ref={formRef}
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow">{labels[draft.tool]}</div>
                <h2 id="form-title">{draft.id ? "编辑配置" : "添加配置"}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭配置表单"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="form-body">
                <label>
                  供应商
                  <select
                    value={draft.provider}
                    onChange={(e) => {
                      const p = presets.find((p) => p.id === e.target.value)!;
                      setDraft({
                        ...draft,
                        provider: p.id,
                        baseUrl: presetUrl(p, draft.tool),
                        auth: p.auth,
                      });
                    }}
                  >
                    {forTool(draft.tool).map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="provider-help">
                  {presets.find((p) => p.id === draft.provider)?.hint}
                  {presets.find((p) => p.id === draft.provider)?.docs && (
                    <a
                      href={presets.find((p) => p.id === draft.provider)?.docs}
                      target="_blank"
                      rel="noreferrer"
                    >
                      官方文档
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <label>
                  配置名称
                  <input
                    autoComplete="off"
                    maxLength={120}
                    required
                    placeholder="例如：日常开发 / 备用接口"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Base URL
                  <input
                    type="url"
                    required
                    placeholder={
                      draft.tool === "codex"
                        ? "https://api.example.com/v1"
                        : "https://api.example.com/anthropic"
                    }
                    value={draft.baseUrl}
                    onChange={(e) =>
                      setDraft({ ...draft, baseUrl: e.target.value })
                    }
                  />
                  <small>
                    {draft.tool === "codex"
                      ? "填写 Responses 基础地址，不含 /responses。"
                      : "填写 Anthropic 基础地址，不含 /v1/messages。"}
                  </small>
                </label>
                <label>
                  模型 ID
                  <input
                    required
                    maxLength={200}
                    autoComplete="off"
                    placeholder="填写供应商实际支持的模型 ID"
                    list="model-suggestions"
                    value={draft.model}
                    onChange={(e) =>
                      setDraft({ ...draft, model: e.target.value })
                    }
                  />
                  <datalist id="model-suggestions">
                    {(modelSuggestions[draft.provider] || []).map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  <small>
                    可选文档中的模型示例，也可手填；可用性以账号权限与测试为准。
                  </small>
                </label>
                <label>
                  API Key{" "}
                  <span className="optional">
                    {draft.id ? "留空保留原密钥" : "仅存入系统凭据库"}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    required={!draft.id}
                    maxLength={8192}
                    placeholder={draft.id ? "已保存 · 不回显" : "输入 API Key"}
                    value={draft.apiKey}
                    onChange={(e) =>
                      setDraft({ ...draft, apiKey: e.target.value })
                    }
                  />
                </label>
                {draft.tool === "claude" && (
                  <label>
                    认证方式
                    <select
                      value={draft.auth}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          auth: e.target.value as Draft["auth"],
                        })
                      }
                    >
                      <option value="bearer">
                        Bearer / ANTHROPIC_AUTH_TOKEN
                      </option>
                      <option value="api-key">
                        x-api-key / ANTHROPIC_API_KEY
                      </option>
                    </select>
                  </label>
                )}
                <div className="form-note">
                  <ShieldCheck size={16} />
                  保存只建立配置。点击启用并确认后，才修改工具文件。
                </div>
                {notice?.error && (
                  <div className="notice error" role="alert">
                    {notice.text}
                  </div>
                )}
              </div>
              <div className="drawer-footer">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !desktop}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  保存配置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {dialog && (
        <div className="overlay modal-overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            ref={dialogRef}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭确认窗口"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              <X size={20} />
            </button>
            <div className="empty-icon">
              {dialog.kind === "test" ? (
                <Zap />
              ) : dialog.kind === "restore" ? (
                <FolderClock />
              ) : dialog.kind === "delete" ? (
                <Trash2 />
              ) : (
                <ArrowLeftRight />
              )}
            </div>
            <h2 id="dialog-title">
              {dialog.kind === "apply"
                ? "确认启用配置"
                : dialog.kind === "test"
                  ? "发送一次连接测试"
                  : dialog.kind === "restore"
                    ? "恢复到启用前"
                    : "删除这组配置"}
            </h2>
            {dialog.kind === "apply" ? (
              <>
                <p>将启用「{dialog.p.name}」，写入前自动保存原文件。</p>
                <div className="path callout">{dialog.preview.target}</div>
                <ul>
                  {dialog.preview.fields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {dialog.preview.warnings.map((w) => (
                  <p className="footnote" key={w}>
                    {w}
                  </p>
                ))}
              </>
            ) : dialog.kind === "test" ? (
              <>
                <p>
                  使用「{dialog.p.name}
                  」的密钥，向以下地址发送一句简短测试消息，可能产生少量费用。
                </p>
                <div className="path callout">{dialog.p.baseUrl}</div>
                <p className="footnote">
                  只验证基础请求，不会读取你的项目或聊天记录。
                </p>
              </>
            ) : dialog.kind === "restore" ? (
              <>
                <p>
                  恢复「{dialog.b.profileName}
                  」启用前的文件内容。如果原文件不存在，将移除本应用创建的文件。
                </p>
                <div className="path callout">{dialog.b.target}</div>
                <p className="footnote">
                  检测到外部修改时会停止，不会强行覆盖。
                </p>
              </>
            ) : (
              <p>
                删除「{dialog.p.name}」及其系统凭据。该操作不会删除历史备份。
              </p>
            )}
            {notice?.error && (
              <div className="notice error" role="alert">
                {notice.text}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : null}
                {dialog.kind === "apply"
                  ? "备份并启用"
                  : dialog.kind === "test"
                    ? "开始测试"
                    : dialog.kind === "restore"
                      ? "确认恢复"
                      : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function ArrowUpIcon() {
  return <span aria-hidden="true">↗</span>;
}
