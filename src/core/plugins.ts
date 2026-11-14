import { basename } from "node:path";
import type { ConfigObject } from "./json.ts";
import { isObject } from "./json.ts";
import { pluginField } from "./config.ts";
import type { PluginView, Scope } from "./models.ts";

export interface ParsedSpec {
  name: string;
  version?: string;
}

export function parseSpec(spec: string): ParsedSpec {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("file:")) {
    const clean = spec.replace(/^file:\/\//, "");
    return { name: basename(clean) };
  }
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    const version = spec.slice(at + 1);
    return { name: spec.slice(0, at), version: version || undefined };
  }
  return { name: spec };
}

export function formatSpec(name: string, version?: string): string {
  return version ? `${name}@${version}` : name;
}

export function normalizePlugins(
  config: ConfigObject,
  scope: Scope,
  path: string,
): PluginView[] {
  const field = pluginField(config);
  if (!field) return [];
  const entries = config[field];
  if (!Array.isArray(entries)) return [];
  const out: PluginView[] = [];
  entries.forEach((entry, index) => {
    if (typeof entry === "string") {
      const parsed = parseSpec(entry);
      out.push({ index, name: parsed.name, spec: entry, version: parsed.version, scope, path, field });
      return;
    }
    if (isObject(entry) && typeof entry.package === "string") {
      const parsed = parseSpec(entry.package);
      const options = isObject(entry.options) ? entry.options : undefined;
      out.push({
        index,
        name: parsed.name,
        spec: entry.package,
        version: parsed.version,
        options,
        scope,
        path,
        field,
      });
    }
  });
  return out;
}
