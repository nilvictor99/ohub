import { ConfigEditor } from "../core/config.ts";
import { conflict, notFound, usage } from "../core/errors.ts";
import type { Parsed } from "../core/args.ts";
import { has, text } from "../core/args.ts";
import type { Output } from "../core/output.ts";
import { confirm } from "../core/prompt.ts";
import { looksSecret } from "../core/secrets.ts";
import type { McpConfig, McpView } from "../core/models.ts";
import { displayPath } from "../core/paths.ts";
import {
  envOf,
  findMcp,
  headersOf,
  mcpStatus,
  mcpType,
  MCP_NAME,
  requireName,
  targetOf,
  targetsOf,
  viewsFor,
} from "./shared.ts";

export async function cmdMcpAdd(parsed: Parsed, out: Output): Promise<number> {
  const name = requireName(parsed, "mcp");
  if (!MCP_NAME.test(name)) {
    throw usage(`Nombre de MCP inválido: ${name}`, "Usa letras, números, guion o guion bajo; debe empezar alfanumérico");
  }
  const url = text(parsed, "url");
  const command = parsed.passthrough;
  if (url && command.length > 0) throw usage("Usa --url o un comando, no ambos");
  if (!url && command.length === 0) {
    throw usage("Falta --url o el comando del servidor", "Local: ohub mcp add nombre -- npx -y paquete | Remoto: ohub mcp add nombre --url https://...");
  }

  const target = targetOf(parsed);
  const editor = await ConfigEditor.open(target);
  const existing = findMcp(
    await viewsFor([target]).then((views) => views.mcp),
    name,
  );
  if (existing && !has(parsed, "force")) {
    throw conflict(
      `El MCP "${name}" ya existe en ${displayPath(target.path)}`,
      "Usa --force para reemplazarlo o --scope global/project para otro ámbito",
    );
  }

  const config: McpConfig = url
    ? {
        type: "remote",
        url,
        ...(Object.keys(headersOf(parsed)).length > 0 ? { headers: headersOf(parsed) } : {}),
        ...(has(parsed, "no-oauth") ? { oauth: false as const } : {}),
        ...(has(parsed, "disabled") ? { disabled: true } : {}),
      }
    : {
        type: "local",
        command,
        ...(text(parsed, "cwd") ? { cwd: text(parsed, "cwd") } : {}),
        ...(Object.keys(envOf(parsed)).length > 0 ? { environment: envOf(parsed) } : {}),
        ...(has(parsed, "disabled") ? { disabled: true } : {}),
      };

  warnSecrets(config, name, out);
  editor.set(["mcp", "servers", name], config);
  await editor.commit();
  out.success(`MCP "${name}" ${existing ? "reemplazado" : "añadido"} en ${displayPath(target.path)}`);
  out.info("Reinicia el servicio para aplicarlo: ohub reload");
  return 0;
}

export async function cmdMcpRemove(parsed: Parsed, out: Output): Promise<number> {
  const name = requireName(parsed, "mcp");
  const target = targetOf(parsed);
  const views = (await viewsFor([target])).mcp;
  const view = findMcp(views, name);
  if (!view) throw notFound(`MCP no encontrado: ${name}`, `Revisa: ohub mcp list --scope ${target.scope}`);
  await confirm(`Eliminar MCP "${name}" de ${displayPath(target.path)}?`, has(parsed, "yes"));
  const editor = await ConfigEditor.open(target);
  editor.remove(view.location === "legacy" ? ["mcp", name] : ["mcp", "servers", name]);
  await editor.commit();
  out.success(`MCP "${name}" eliminado de ${displayPath(target.path)}`);
  return 0;
}

export async function cmdMcpToggle(
  parsed: Parsed,
  out: Output,
  disabled: boolean,
): Promise<number> {
  const name = requireName(parsed, "mcp");
  const target = targetOf(parsed);
  const view = findMcp((await viewsFor([target])).mcp, name);
  if (!view) throw notFound(`MCP no encontrado: ${name}`);
  const editor = await ConfigEditor.open(target);
  const base = view.location === "legacy" ? ["mcp", name] : ["mcp", "servers", name];
  if (disabled) editor.set([...base, "disabled"], true);
  else editor.remove([...base, "disabled"]);
  await editor.commit();
  out.success(`MCP "${name}" ${disabled ? "deshabilitado" : "habilitado"} en ${displayPath(target.path)}`);
  return 0;
}

export async function cmdMcpShow(parsed: Parsed, out: Output): Promise<number> {
  const name = requireName(parsed, "mcp");
  const views = (await viewsFor(targetsOf(parsed, true))).mcp;
  const view = findMcp(views, name);
  if (!view) throw notFound(`MCP no encontrado: ${name}`);
  if (out.json) {
    out.data({ name, scope: view.scope, location: view.location, path: view.path, config: view.config });
    return 0;
  }
  out.info(`${name} (${mcpType(view)}, ${mcpStatus(view)}, ${view.scope})`);
  out.data(view.config);
  if (view.location === "legacy") {
    out.warn("Entrada legacy fuera de mcp.servers; migra a V2 moviéndola a mcp.servers");
  }
  return 0;
}

export async function cmdMcpList(parsed: Parsed, out: Output): Promise<number> {
  const { mcp } = await viewsFor(targetsOf(parsed, true));
  if (out.json) {
    out.data(mcp.map((v: McpView) => ({ ...v })));
    return 0;
  }
  if (mcp.length === 0) {
    out.info("Sin servidores MCP configurados.");
    return 0;
  }
  out.table(
    ["name", "type", "scope", "status", "source"],
    mcp.map((v) => [v.name, mcpType(v), v.scope, mcpStatus(v), displayPath(v.path)]),
  );
  return 0;
}

function warnSecrets(config: McpConfig, name: string, out: Output): void {
  const values: string[] = [];
  if (config.type === "local" && config.environment) values.push(...Object.values(config.environment));
  if (config.type === "remote" && config.headers) values.push(...Object.values(config.headers));
  if (values.some(looksSecret)) {
    out.warn(
      `"${name}" contiene un secreto literal. Usa referencias {env:VAR} en environment/headers para no guardarlo en el archivo.`,
    );
  }
}
