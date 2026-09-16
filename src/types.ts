export type Tool = "codex" | "claude";
export interface Profile {
  id: string;
  name: string;
  tool: Tool;
  provider: string;
  baseUrl: string;
  model: string;
  auth: "bearer" | "api-key";
  revision: string;
}
export interface Draft extends Omit<Profile, "id" | "revision"> {
  id?: string;
  apiKey: string;
}
export interface Settings {
  codexDir: string;
  claudeDir: string;
}
export interface Active {
  profileId: string;
  revision: string;
  target: string;
  digest: string;
}
export interface Backup {
  id: string;
  tool: Tool;
  profileName: string;
  target: string;
  createdAt: number;
  afterDigest: string;
  beforeDigest: string;
  previousActive?: Active;
}
export interface StateView {
  store: {
    settings: Settings;
    profiles: Profile[];
    active: Partial<Record<Tool, Active>>;
    backups: Backup[];
  };
  dataDir: string;
  activeMatches: Partial<Record<Tool, boolean>>;
}
export interface Preview {
  profileRevision: string;
  target: string;
  expectedDigest: string;
  fields: string[];
  warnings: string[];
}
export interface TestResult {
  ok: boolean;
  message: string;
  elapsedMs: number;
}
