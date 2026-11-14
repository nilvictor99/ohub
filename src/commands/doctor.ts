import { promises as fs } from "node:fs";
import { legacyMcpEntries, pluginField } from "../core/config.ts";
import { parseConfig } from "../core/json.ts";
import { isObject } from "../core/json.ts";
import type { Parsed } from "../core/args.ts";
import type { Output } from "../core/output.ts";
import { looksSecret } from "../core/secrets.ts";
import { normalizePlugins } from "../core/plugins.ts";
import { displayPath } from "../core/paths.ts";
import type { ConfigObject } from "../core/json.ts";
import type { ConfigTarget, DoctorFinding, Scope } from "../core/models.ts";
import { mcpViews, targetsOf } from "./shared.ts";

export async function cmdDoctor(parsed: Parsed, out: Output): Promise<number> {
  const targets = targetsOf(parsed, true);
  const findings: DoctorFinding[] = [];
  const seenMcp = new Map<string, Scope>();

  for (const target of targets) {
    if (!target.exists) {
      findings.push({
        level: "info",
        code: "config.missing",
        message: `No existe configuración ${target.scope}`,
        path: target.path,
      });
      continue;
    }
    let data: ConfigObject;
    try {
      const text = await fs.readFile(target.path, "utf8");
      data = parseConfig(text, target.path);
    } catch (error) {
      findings.push({
        level: "error",
        code: "config.parse",
        message: (error as Error).message,
        path: target.path,
      });
      continue;
    }

    const mode = (await fs.stat(target.path)).mode & 0o777;
    if (mode & 0o077) {
      findings.push({
        level: "warn",
        code: "config.permissions",
        message: `Permisos ${mode.toString(8)}: otros usuarios pueden leer la config`,
        path: target.path,
        hint: `chmod 600 ${target.path}`,
      });
    }

    if (Array.isArray(data.plugin)) {
      findings.push({
        level: "warn",
        code: "field.deprecated",
        message: '"plugin" está obsoleto en V2; usa "plugins"',
        path: target.path,
        hint: "Mueve las entradas a plugins y elimina plugin",
      });
    }
    if (Array.isArray(data.plugin) && Array.isArray(data.plugins)) {
      findings.push({
        level: "error",
        code: "field.duplicate",
        message: 'Existen "plugin" y "plugins" a la vez; puede haber carga doble',
        path: target.path,
      });
    }

    for (const [name, value] of Object.entries(legacyMcpEntries(data))) {
      findings.push({
        level: "warn",
        code: "mcp.legacy",
        message: `MCP "${name}" está fuera de mcp.servers (forma V1)`,
        path: target.path,
        hint: `Mueve la entrada a mcp.servers.${name}`,
      });
      if (isObject(value)) checkMcp(name, value, target, findings);
    }

    for (const view of mcpViews(data, target.scope, target.path)) {
      if (view.location !== "servers") continue;
      checkMcp(view.name, view.config as unknown as Record<string, unknown>, target, findings);
      if (seenMcp.has(view.name)) {
        findings.push({
          level: "info",
          code: "mcp.shadow",
          message: `"${view.name}" de ${view.scope} reemplaza la definición de ${seenMcp.get(view.name)}`,
          path: target.path,
        });
      }
      seenMcp.set(view.name, view.scope);
    }

    const plugins = normalizePlugins(data, target.scope, target.path);
    const duplicates = new Map<string, number>();
    for (const plugin of plugins) {
      duplicates.set(plugin.name, (duplicates.get(plugin.name) ?? 0) + 1);
      const isPath = plugin.spec.startsWith(".") || plugin.spec.startsWith("/") || plugin.spec.startsWith("file:");
      if (isPath) {
        const path = plugin.spec.replace(/^file:\/\//, "");
        if (!(await exists(path))) {
          findings.push({
            level: "warn",
            code: "plugin.path",
            message: `Plugin local no encontrado: ${plugin.spec}`,
            path: target.path,
          });
        }
      }
    }
    for (const [name, count] of duplicates) {
      if (count > 1) {
        findings.push({
          level: "error",
          code: "plugin.duplicate",
          message: `Plugin "${name}" aparece ${count} veces`,
          path: target.path,
        });
      }
    }
    if (pluginField(data) === undefined) {
      findings.push({
        level: "info",
        code: "plugin.none",
        message: "Sin plugins configurados",
        path: target.path,
      });
    }
  }

  const binary = Bun.which("opencode");
  findings.push(
    binary
      ? { level: "info", code: "opencode.binary", message: `opencode disponible en ${binary}` }
      : { level: "warn", code: "opencode.binary", message: "opencode no está en PATH; no se podrá usar ohub reload" },
  );

  if (out.json) {
    out.data(findings);
  } else {
    for (const finding of findings) {
      const tag =
        finding.level === "error"
          ? out.paint("red", "error")
          : finding.level === "warn"
            ? out.paint("yellow", "warn ")
            : out.paint("dim", "info ");
      out.info(`${tag} ${finding.message}${finding.path ? out.paint("dim", ` (${displayPath(finding.path)})`) : ""}`);
      if (finding.hint) out.info(`      ${out.paint("dim", finding.hint)}`);
    }
    const errors = findings.filter((finding) => finding.level === "error").length;
    const warnings = findings.filter((finding) => finding.level === "warn").length;
    out.info("");
    out.info(`${errors} error(es), ${warnings} advertencia(s)`);
  }

  return findings.some((finding) => finding.level === "error") ? 1 : 0;
}

function checkMcp(
  name: string,
  value: Record<string, unknown>,
  target: ConfigTarget,
  findings: DoctorFinding[],
): void {
  if (value.type !== "local" && value.type !== "remote") {
    findings.push({
      level: "error",
      code: "mcp.type",
      message: `MCP "${name}" no tiene type local/remote`,
      path: target.path,
    });
    return;
  }
  if (value.type === "local" && !Array.isArray(value.command)) {
    findings.push({
      level: "error",
      code: "mcp.command",
      message: `MCP local "${name}" no tiene command`,
      path: target.path,
    });
  }
  if (value.type === "remote" && typeof value.url !== "string") {
    findings.push({
      level: "error",
      code: "mcp.url",
      message: `MCP remoto "${name}" no tiene url`,
      path: target.path,
    });
  }
  for (const [key, secret] of Object.entries({
    ...(isObject(value.environment) ? value.environment : {}),
    ...(isObject(value.headers) ? value.headers : {}),
  })) {
    if (typeof secret === "string" && looksSecret(secret)) {
      findings.push({
        level: "warn",
        code: "secret.literal",
        message: `MCP "${name}" guarda un secreto literal en "${key}"`,
        path: target.path,
        hint: `Usa {env:${key}} y define ${key} en el entorno`,
      });
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
