import { configError, usage } from "../core/errors.ts";
import { isObject } from "../core/json.ts";
import type { ConfigObject } from "../core/json.ts";
import { mcpServers } from "../core/config.ts";
import { normalizePlugins } from "../core/plugins.ts";
import { has, list as listFlag, text, type Parsed } from "../core/args.ts";
import { resolveTarget, explicitTarget } from "../core/paths.ts";
import { loadConfig } from "../core/config.ts";
import type { ConfigTarget, McpView, PluginView, Scope } from "../core/models.ts";

export function scopeOf(parsed: Parsed): Scope {
  if (has(parsed, "global")) return "global";
  const value = text(parsed, "scope");
  if (value === undefined) return "project";
  if (value === "global" || value === "project") return value;
  throw usage(`Scope inválido: ${value}`, "Usa --scope global o --scope project");
}

export function targetsOf(parsed: Parsed, defaultAll = false): ConfigTarget[] {
  const explicit = text(parsed, "config");
  if (explicit) return [explicitTarget(explicit)];
  const value = text(parsed, "scope");
  if (value === "all" || (value === undefined && defaultAll && !has(parsed, "global"))) {
    return [resolveTarget("global"), resolveTarget("project")];
  }
  if (value !== undefined && value !== "global" && value !== "project") {
    throw usage(`Scope inválido: ${value}`, "Usa --scope global, project o all");
  }
  return [resolveTarget(scopeOf(parsed))];
}

export function targetOf(parsed: Parsed): ConfigTarget {
  const explicit = text(parsed, "config");
  if (explicit) return explicitTarget(explicit);
  return resolveTarget(scopeOf(parsed));
}

export const MCP_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function requireName(parsed: Parsed, kind: string): string {
  const name = parsed.positionals[0];
  if (!name) throw usage(`Falta el nombre del ${kind}`, `Ejemplo: ohub ${kind} add <nombre>`);
  return name;
}

export function parsePairs(values: string[], flag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values) {
    const index = value.indexOf("=");
    if (index <= 0) throw usage(`${flag} espera CLAVE=VALOR`, `Recibido: ${value}`);
    out[value.slice(0, index)] = value.slice(index + 1);
  }
  return out;
}

export function headersOf(parsed: Parsed): Record<string, string> {
  return parsePairs(listFlag(parsed, "header"), "--header");
}

export function envOf(parsed: Parsed): Record<string, string> {
  return parsePairs(listFlag(parsed, "env"), "--env");
}

export function mcpViews(config: ConfigObject, scope: Scope, path: string): McpView[] {
  const out: McpView[] = [];
  for (const [name, value] of Object.entries(mcpServers(config))) {
    if (!isObject(value)) continue;
    out.push({
      name,
      scope,
      path,
      location: "servers",
      config: value as unknown as McpView["config"],
    });
  }
  const mcp = config.mcp;
  if (isObject(mcp)) {
    for (const [name, value] of Object.entries(mcp)) {
      if (name === "servers" || name === "timeout") continue;
      if (!isObject(value)) continue;
      out.push({
        name,
        scope,
        path,
        location: "legacy",
        config: value as unknown as McpView["config"],
      });
    }
  }
  return out;
}

export async function viewsFor(targets: ConfigTarget[]): Promise<{
  mcp: McpView[];
  plugins: PluginView[];
  configs: ConfigTarget[];
}> {
  const mcp: McpView[] = [];
  const plugins: PluginView[] = [];
  for (const target of targets) {
    const loaded = await loadConfig(target);
    mcp.push(...mcpViews(loaded.data, target.scope, target.path));
    plugins.push(...normalizePlugins(loaded.data, target.scope, target.path));
  }
  return { mcp, plugins, configs: targets };
}

export function mcpType(view: McpView): string {
  return view.config.type === "local" ? "local" : "remote";
}

export function mcpStatus(view: McpView): string {
  return view.config.disabled ? "disabled" : "enabled";
}

export function findMcp(views: McpView[], name: string): McpView | undefined {
  return views.find((view) => view.name === name);
}

export function assertMcpShape(value: unknown, name: string): void {
  if (!isObject(value)) throw configError(`MCP inválido: ${name}`);
  if (value.type === "local" && !Array.isArray(value.command)) {
    throw configError(`MCP local inválido: ${name}`, "Falta command");
  }
  if (value.type === "remote" && typeof value.url !== "string") {
    throw configError(`MCP remoto inválido: ${name}`, "Falta url");
  }
}
