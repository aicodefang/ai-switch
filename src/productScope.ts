/** Product scope restricts platforms, never authentication or model configuration methods. */
export const FOCUSED_PLATFORMS = ['codex', 'codex_api_service', 'claude_manager', 'zcode'] as const;
export const FOCUSED_PAGES = ['codex', 'codex-api-service', 'codex-instances', 'claude', 'claude-cli', 'zcode', '2fa', 'settings'] as const;
export const isFocusedPlatform = (id: string): boolean => (FOCUSED_PLATFORMS as readonly string[]).includes(id);
export const isFocusedPage = (page: string): boolean => (FOCUSED_PAGES as readonly string[]).includes(page);
export const UPSTREAM_REMOTE_SERVICES_ENABLED = false;
