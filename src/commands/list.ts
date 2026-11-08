import type { Parsed } from "../core/args.ts";
import { has } from "../core/args.ts";
import { displayPath } from "../core/paths.ts";
import type { Output } from "../core/output.ts";
import { mcpStatus, mcpType, targetsOf, viewsFor } from "./shared.ts";

export async function cmdList(parsed: Parsed, out: Output): Promise<number> {
  const targets = targetsOf(parsed, true);
  const { mcp, plugins, configs } = await viewsFor(targets);
  const projectNames = new Set(mcp.filter((v) => v.scope === "project").map((v) => v.name));

  if (out.json) {
    out.data({
      configs: configs.map((c) => ({ scope: c.scope, path: c.path, exists: c.exists })),
      mcp: mcp.map((v) => ({
        name: v.name,
        type: mcpType(v),
        status: mcpStatus(v),
        scope: v.scope,
        location: v.location,
        path: v.path,
        config: v.config,
      })),
      plugins: plugins.map((v) => ({
        name: v.name,
        spec: v.spec,
        version: v.version ?? null,
        scope: v.scope,
        field: v.field,
        path: v.path,
        options: v.options ?? null,
      })),
    });
    return 0;
  }

  if (has(parsed, "quiet")) {
    for (const view of mcp) process.stdout.write(`mcp ${view.name}\n`);
    for (const view of plugins) process.stdout.write(`plugin ${view.name}\n`);
    return 0;
  }

  for (const config of configs) {
    const state = config.exists ? "" : out.paint("dim", " (no existe)");
    out.line(`${out.paint("dim", config.scope.padEnd(7))} ${displayPath(config.path)}${state}`);
  }

  out.line("");
  if (mcp.length === 0) {
    out.line("MCP: ninguno");
  } else {
    out.line("MCP");
    out.table(
      ["name", "type", "scope", "status", "source"],
      mcp.map((v) => {
        const shadowed = v.scope === "global" && projectNames.has(v.name);
        return [
          v.name,
          mcpType(v),
          v.scope,
          shadowed ? "shadowed" : mcpStatus(v),
          v.location === "legacy" ? "legacy" : displayPath(v.path),
        ];
      }),
    );
  }

  out.line("");
  if (plugins.length === 0) {
    out.line("Plugins: ninguno");
  } else {
    out.line("Plugins");
    out.table(
      ["name", "version", "scope", "source"],
      plugins.map((v) => [
        v.name,
        v.version ?? "(floating)",
        v.scope,
        displayPath(v.path),
      ]),
    );
  }
  return 0;
}
