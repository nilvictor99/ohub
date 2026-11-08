import { ask, pause } from "../core/prompt.ts";
import { confirm } from "../core/prompt.ts";
import { select } from "./select.ts";
import { EXIT, OhubError } from "../core/errors.ts";
import type { Output } from "../core/output.ts";
import type { Parsed } from "../core/args.ts";
import { cmdList } from "../commands/list.ts";
import { cmdMcpAdd, cmdMcpRemove, cmdMcpShow, cmdMcpToggle } from "../commands/mcp.ts";
import { cmdPluginAdd, cmdPluginList, cmdPluginRemove, cmdPluginUpdate } from "../commands/plugin.ts";
import { cmdDoctor } from "../commands/doctor.ts";
import { cmdConfigPath, cmdReload } from "../commands/service.ts";
import { viewsFor, targetsOf, mcpType, mcpStatus } from "../commands/shared.ts";
import { normalizePlugins } from "../core/plugins.ts";
import { ConfigEditor } from "../core/config.ts";
import { resolveTarget } from "../core/paths.ts";
import { renderBanner } from "./banner.ts";

const MAIN = [
  { label: "🖥️ Servidores MCP", hint: "añadir · activar · eliminar" },
  { label: "🔌 Plugins", hint: "añadir · actualizar · eliminar" },
  { label: "🩺 Diagnóstico", hint: "revisa config" },
  { label: "🗺️ Rutas", hint: "global · proyecto" },
  { label: "🔄 Reiniciar", hint: "aplica cambios" },
  { label: "❓ Ayuda", hint: "comandos" },
  { label: "🚪 Salir" },
];

const MCP_MENU = [
  { label: "📋 Listar", hint: "todos" },
  { label: "🌐 Remoto", hint: "por URL" },
  { label: "💻 Local", hint: "comando" },
  { label: "🔁 Alternar", hint: "activo/inactivo" },
  { label: "🔍 Detalle", hint: "ver ficha" },
  { label: "🗑️ Eliminar", hint: "pide confirmación", color: "\u001b[31m" },
  { label: "↩️ Volver" },
];

const PLUGIN_MENU = [
  { label: "📋 Listar", hint: "instalados" },
  { label: "➕ Añadir", hint: "paquete o ruta" },
  { label: "⬆️ Actualizar", hint: "elegir uno" },
  { label: "⏫ Actualizar todo", hint: "del ámbito" },
  { label: "🗑️ Eliminar", hint: "pide confirmación", color: "\u001b[31m" },
  { label: "↩️ Volver" },
];

export async function runMenu(out: Output): Promise<number> {
  process.stderr.write(`${renderBanner()}\n`);
  for (;;) {
    process.stderr.write("\n");
    const choice = await select("Menú principal", MAIN);
    try {
      switch (choice) {
        case 0:
          await mcpMenu(out);
          break;
        case 1:
          await pluginMenu(out);
          break;
        case 2:
          await cmdDoctor(from({}), out);
          await pause();
          break;
        case 3:
          await cmdConfigPath(from({}), out);
          await pause();
          break;
        case 4:
          await cmdReload(from({}), out);
          await pause();
          break;
        case 5:
          process.stderr.write(HELP_TEXT);
          await pause();
          break;
        default:
          return EXIT.OK;
      }
    } catch (error) {
      report(error);
      await pause();
    }
  }
}

async function mcpMenu(out: Output): Promise<void> {
  for (;;) {
    section(out, "MCP");
    const choice = await select("Servidores MCP", MCP_MENU);
    if (choice === 6 || choice === -1) return;
    try {
      switch (choice) {
        case 0:
          await cmdList(from({}), out);
          break;
        case 1:
          await addRemote(out);
          break;
        case 2:
          await addLocal(out);
          break;
        case 3:
          await toggleMcp(out);
          break;
        case 4:
          await showMcp(out);
          break;
        case 5:
          await removeMcp(out);
          break;
      }
    } catch (error) {
      report(error);
    }
    await pause();
  }
}

async function pluginMenu(out: Output): Promise<void> {
  for (;;) {
    section(out, "Plugins");
    const choice = await select("Plugins", PLUGIN_MENU);
    if (choice === 5 || choice === -1) return;
    try {
      switch (choice) {
        case 0:
          await cmdPluginList(from({ flags: new Map([["scope", ["all"]]]) }), out);
          break;
        case 1:
          await addPlugin(out);
          break;
        case 2:
          await updatePlugin(out, false);
          break;
        case 3:
          await updatePlugin(out, true);
          break;
        case 4:
          await removePlugin(out);
          break;
      }
    } catch (error) {
      report(error);
    }
    await pause();
  }
}

async function addRemote(out: Output): Promise<void> {
  const name = await ask("Nombre", { required: true });
  const url = await ask("URL", { required: true });
  const headers = await ask("Cabeceras K=V (opcional)", { required: false });
  const oauth = await confirm("¿Permitir OAuth?", false).then(
    () => true,
    () => false,
  );
  const scope = await askScope();
  const parsed = from({
    positionals: [name],
    flags: new Map([
      ["url", [url]],
      ["scope", [scope]],
      ...(headers ? [["header", parseList(headers)] as [string, string[]]] : []),
    ]),
    booleans: new Set(oauth ? [] : ["no-oauth"]),
  });
  await cmdMcpAdd(parsed, out);
}

async function addLocal(out: Output): Promise<void> {
  const name = await ask("Nombre", { required: true });
  const command = await ask("Comando", { required: true });
  const env = await ask("Variables K=V (opcional)", { required: false });
  const scope = await askScope();
  const parsed = from({
    positionals: [name],
    flags: new Map([
      ["scope", [scope]],
      ...(env ? [["env", parseList(env)] as [string, string[]]] : []),
    ]),
    passthrough: splitCommand(command),
  });
  await cmdMcpAdd(parsed, out);
}

async function toggleMcp(out: Output): Promise<void> {
  const views = (await viewsFor(targetsOf(from({}), true))).mcp;
  if (views.length === 0) {
    out.info("No hay servidores MCP configurados.");
    return;
  }
  const index = await select(
    "Servidor",
    [...views.map((v) => `${v.name}  ·  ${mcpStatus(v)}  ·  ${v.scope}`), "Cancelar"],
  );
  if (index === -1 || index === views.length) return;
  const view = views[index];
  await cmdMcpToggle(
    from({ positionals: [view.name], flags: new Map([["scope", [view.scope]]]) }),
    out,
    !view.config.disabled,
  );
}

async function showMcp(out: Output): Promise<void> {
  const views = (await viewsFor(targetsOf(from({}), true))).mcp;
  if (views.length === 0) {
    out.info("No hay servidores MCP configurados.");
    return;
  }
  const index = await select("Servidor", [...views.map((v) => `${v.name}  ·  ${v.scope}`), "Cancelar"]);
  if (index === -1 || index === views.length) return;
  await cmdMcpShow(from({ positionals: [views[index].name], flags: new Map([["scope", [views[index].scope]]]) }), out);
}

async function removeMcp(out: Output): Promise<void> {
  const views = (await viewsFor(targetsOf(from({}), true))).mcp;
  if (views.length === 0) {
    out.info("No hay servidores MCP configurados.");
    return;
  }
  const index = await select("Eliminar", [...views.map((v) => `${v.name}  ·  ${v.scope}`), "Cancelar"]);
  if (index === -1 || index === views.length) return;
  const view = views[index];
  await cmdMcpRemove(from({ positionals: [view.name], flags: new Map([["scope", [view.scope]]]) }), out);
}

async function addPlugin(out: Output): Promise<void> {
  const spec = await ask("Paquete o ruta", { required: true });
  const scope = await askScope();
  await cmdPluginAdd(from({ positionals: [spec], flags: new Map([["scope", [scope]]]) }), out);
}

async function updatePlugin(out: Output, all: boolean): Promise<void> {
  const scope = await askScope();
  const parsed = from({ positionals: [], flags: new Map([["scope", [scope]]]), booleans: new Set(all ? ["all"] : []) });
  if (!all) {
    const target = resolveTarget(scope);
    const views = normalizePlugins((await ConfigEditor.open(target)).current, scope, target.path);
    const names = [...new Set(views.map((v) => v.name))];
    if (names.length === 0) {
      out.info("No hay plugins en ese ámbito.");
      return;
    }
    const index = await select("Actualizar", [...names, "Cancelar"]);
    if (index === -1 || index === names.length) return;
    parsed.positionals = [names[index]];
  } else {
    const ok = await confirm("Actualizar todos los plugins fijados de ese ámbito?", false).then(
      () => true,
      () => false,
    );
    if (!ok) return;
  }
  await cmdPluginUpdate(parsed, out);
}

async function removePlugin(out: Output): Promise<void> {
  const views = (await viewsFor(targetsOf(from({}), true))).plugins;
  if (views.length === 0) {
    out.info("No hay plugins configurados.");
    return;
  }
  const index = await select(
    "Eliminar",
    [...views.map((v) => `${v.name}  ·  ${v.scope}`), "Cancelar"],
  );
  if (index === -1 || index === views.length) return;
  const view = views[index];
  await cmdPluginRemove(
    from({ positionals: [view.name], flags: new Map([["scope", [view.scope]]]) }),
    out,
  );
}

async function askScope(): Promise<"project" | "global"> {
  const index = await select("Ámbito", ["Proyecto actual", "Global (usuario)"]);
  return index === 1 ? "global" : "project";
}

function from(init: {
  positionals?: string[];
  flags?: Map<string, string[]>;
  booleans?: Set<string>;
  passthrough?: string[];
}): Parsed {
  return {
    positionals: init.positionals ?? [],
    flags: init.flags ?? new Map(),
    booleans: init.booleans ?? new Set(),
    passthrough: init.passthrough ?? [],
  };
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function section(out: Output, title: string): void {
  process.stderr.write(`\n${out.paint("bold", title)}\n`);
}

function report(error: unknown): void {
  if (error instanceof OhubError) {
    if (error.code !== EXIT.OK) process.stderr.write(`error: ${error.message}\n`);
    if (error.hint) process.stderr.write(`  ${error.hint}\n`);
  } else {
    process.stderr.write(`error: ${(error as Error).message}\n`);
  }
}

const HELP_TEXT = `
Directo (sin menú):
  list  mcp add|list|show|remove  plugin add|list|remove|update
  doctor  reload  config path
  ./start.sh --help  → ayuda completa
`;
