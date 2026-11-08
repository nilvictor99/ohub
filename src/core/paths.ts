import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { ConfigKind, ConfigTarget, Scope } from "./models.ts";

export function home(): string {
  return process.env.HOME || homedir();
}

export function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "opencode") : join(home(), ".config", "opencode");
}

export function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  return xdg ? join(xdg, "ohub") : join(home(), ".local", "state", "ohub");
}

export function backupDir(): string {
  return join(stateDir(), "backups");
}

export function kindOf(path: string): ConfigKind {
  return path.endsWith(".json") ? "json" : "jsonc";
}

export function toTarget(scope: Scope, path: string): ConfigTarget {
  const abs = resolve(path);
  return { scope, path: abs, kind: kindOf(abs), exists: existsSync(abs) };
}

function firstExisting(dir: string, names: string[]): string | undefined {
  for (const name of names) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function findProjectConfig(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const direct = firstExisting(dir, ["opencode.jsonc", "opencode.json"]);
    if (direct) return direct;
    const nested = firstExisting(dir, [
      join(".opencode", "opencode.jsonc"),
      join(".opencode", "opencode.json"),
    ]);
    if (nested) return nested;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function globalTarget(): ConfigTarget {
  const dir = globalConfigDir();
  const existing = firstExisting(dir, ["opencode.jsonc", "opencode.json"]);
  return toTarget("global", existing ?? join(dir, "opencode.jsonc"));
}

export function projectTarget(start = process.cwd()): ConfigTarget {
  const existing = findProjectConfig(start);
  return toTarget("project", existing ?? join(resolve(start), "opencode.jsonc"));
}

export function resolveTarget(scope: Scope, start = process.cwd()): ConfigTarget {
  return scope === "global" ? globalTarget() : projectTarget(start);
}

export function explicitTarget(path: string): ConfigTarget {
  const abs = resolve(path);
  const global = resolve(globalConfigDir());
  const scope: Scope = abs === global || abs.startsWith(`${global}/`) ? "global" : "project";
  return toTarget(scope, abs);
}

export function relativeToHome(path: string): string {
  const h = home();
  return path === h ? "~" : path.startsWith(`${h}/`) ? `~/${path.slice(h.length + 1)}` : path;
}

export function displayPath(path: string): string {
  const cwd = process.cwd();
  if (path === cwd) return ".";
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
  return relativeToHome(path);
}

export function isJsonc(path: string): boolean {
  return basename(path).endsWith(".jsonc");
}
