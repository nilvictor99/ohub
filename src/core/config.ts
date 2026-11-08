import { promises as fs } from "node:fs";
import { applyEdits, modify } from "jsonc-parser";
import type { ConfigObject } from "./json.ts";
import { assertShape, isObject, parseConfig } from "./json.ts";
import { atomicWrite, backupFile } from "./files.ts";
import { withLock } from "./lock.ts";
import type { ConfigTarget } from "./models.ts";

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } } as const;

export interface LoadedConfig extends ConfigTarget {
  text: string;
  data: ConfigObject;
}

export async function loadConfig(target: ConfigTarget): Promise<LoadedConfig> {
  if (!target.exists) return { ...target, text: "", data: {} };
  const text = await fs.readFile(target.path, "utf8");
  const data = parseConfig(text, target.path);
  assertShape(data, target.path);
  return { ...target, text, data };
}

export class ConfigEditor {
  readonly target: ConfigTarget;
  private text: string;
  private data: ConfigObject;
  private dirty = false;

  private constructor(target: ConfigTarget, text: string, data: ConfigObject) {
    this.target = target;
    this.text = text;
    this.data = data;
  }

  static async open(target: ConfigTarget): Promise<ConfigEditor> {
    const loaded = await loadConfig(target);
    const text =
      loaded.text === ""
        ? `{\n  "$schema": "https://opencode.ai/config.json"\n}\n`
        : loaded.text;
    return new ConfigEditor(target, text, parseConfig(text, target.path));
  }

  get current(): ConfigObject {
    return this.data;
  }

  get changed(): boolean {
    return this.dirty;
  }

  get(path: Array<string | number>): unknown {
    let cursor: unknown = this.data;
    for (const key of path) {
      if (Array.isArray(cursor)) {
        if (typeof key !== "number") return undefined;
        cursor = cursor[key];
      } else if (isObject(cursor)) {
        cursor = cursor[String(key)];
      } else {
        return undefined;
      }
    }
    return cursor;
  }

  set(path: Array<string | number>, value: unknown): void {
    this.text = applyEdits(this.text, modify(this.text, path, value, FORMAT));
    this.data = parseConfig(this.text, this.target.path);
    this.dirty = true;
  }

  remove(path: Array<string | number>): void {
    this.set(path, undefined);
  }

  append(path: Array<string | number>, value: unknown): void {
    const current = this.get(path);
    const list = Array.isArray(current) ? current : [];
    this.set(path, [...list, value]);
  }

  async commit(): Promise<{ backup?: string }> {
    if (!this.dirty) return {};
    if (!this.target.exists && !("$schema" in this.data)) {
      this.set(["$schema"], "https://opencode.ai/config.json");
    }
    assertShape(this.data, this.target.path);
    parseConfig(this.text, this.target.path);
    return withLock(this.target.path, async () => {
      const previous = this.target.exists ? await fs.readFile(this.target.path, "utf8") : "";
      const backup = previous ? await backupFile(this.target.path, previous) : undefined;
      await atomicWrite(this.target.path, this.text);
      return { backup };
    });
  }
}

export function mcpServers(config: ConfigObject): Record<string, unknown> {
  const mcp = config.mcp;
  if (!isObject(mcp)) return {};
  const servers = mcp.servers;
  return isObject(servers) ? servers : {};
}

export function legacyMcpEntries(config: ConfigObject): Record<string, unknown> {
  const mcp = config.mcp;
  if (!isObject(mcp)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mcp)) {
    if (key === "servers" || key === "timeout") continue;
    if (isObject(value)) out[key] = value;
  }
  return out;
}

export function pluginField(config: ConfigObject): "plugins" | "plugin" | undefined {
  if (Array.isArray(config.plugins)) return "plugins";
  if (Array.isArray(config.plugin)) return "plugin";
  return undefined;
}
