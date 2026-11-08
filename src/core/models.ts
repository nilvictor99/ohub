export type Scope = "global" | "project";

export type ConfigKind = "json" | "jsonc";

export interface ConfigTarget {
  scope: Scope;
  path: string;
  kind: ConfigKind;
  exists: boolean;
}

export interface McpLocal {
  type: "local";
  command: string[];
  cwd?: string;
  environment?: Record<string, string>;
  disabled?: boolean;
  codemode?: boolean;
  timeout?: Record<string, number>;
  protocol?: string;
  pool?: boolean;
}

export interface McpRemote {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: false | Record<string, unknown>;
  disabled?: boolean;
  codemode?: boolean;
  timeout?: Record<string, number>;
  protocol?: string;
  pool?: boolean;
}

export type McpConfig = McpLocal | McpRemote;

export interface McpView {
  name: string;
  scope: Scope;
  path: string;
  location: "servers" | "legacy";
  config: McpConfig;
}

export interface PluginView {
  index: number;
  name: string;
  spec: string;
  version?: string;
  options?: Record<string, unknown>;
  scope: Scope;
  path: string;
  field: "plugins" | "plugin";
}

export interface ListResult {
  configs: Array<{ scope: Scope; path: string; exists: boolean }>;
  mcp: McpView[];
  plugins: PluginView[];
}

export interface DoctorFinding {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
  path?: string;
  hint?: string;
}
