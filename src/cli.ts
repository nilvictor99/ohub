import pkg from "../package.json" with { type: "json" };
import { parseArgs, type Parsed } from "./core/args.ts";
import { EXIT, OhubError } from "./core/errors.ts";
import { Output } from "./core/output.ts";
import { choose } from "./core/prompt.ts";
import { cmdList } from "./commands/list.ts";
import { cmdMcpAdd, cmdMcpList, cmdMcpRemove, cmdMcpShow, cmdMcpToggle } from "./commands/mcp.ts";
import { cmdPluginAdd, cmdPluginList, cmdPluginRemove, cmdPluginUpdate } from "./commands/plugin.ts";
import { cmdDoctor } from "./commands/doctor.ts";
import { cmdConfigInit, cmdConfigPath, cmdReload } from "./commands/service.ts";
import { runMenu } from "./ui/menu.ts";

const HELP = `ohub ${pkg.version} — OpenCode extension hub

Uso:
  ohub <grupo> <comando> [opciones]

Grupos:
  list                     Lista MCP y plugins (global + proyecto)
  mcp add <nombre> ...     Añade un servidor MCP
  mcp list                 Lista servidores MCP
  mcp show <nombre>        Muestra la configuración de un MCP
  mcp remove <nombre>      Elimina un MCP
  mcp enable <nombre>      Habilita un MCP
  mcp disable <nombre>     Deshabilita un MCP
  plugin add <spec>        Añade un plugin npm o ruta local
  plugin list              Lista plugins
  plugin remove <nombre>   Elimina un plugin
  plugin update [nombre]   Actualiza a la última versión de npm
  plugin update --all      Actualiza todos los plugins fijados
  doctor                   Diagnóstico de configuración
  reload                   Reinicia el servicio de opencode
  config path              Muestra las rutas de configuración
  config init              Crea una configuración vacía

Opciones globales:
  --scope global|project|all   Ámbito (por defecto project)
  -g, --global                 Equivale a --scope global
  --config <ruta>              Usa un archivo concreto
  --json                       Salida JSON
  -q, --quiet                  Solo datos
  -y, --yes                    No pedir confirmación
  --dry-run                    Simular sin escribir
  --menu                       Abre el menú interactivo (requiere TTY)
  -h, --help                   Ayuda
  -v, --version                Versión

Ejemplos:
  ohub mcp add context7 --url https://mcp.context7.com/mcp --scope global
  ohub mcp add everything -- npx -y @modelcontextprotocol/server-everything
  ohub mcp add github --url https://api.githubcopilot.com/mcp/ --header 'Authorization=Bearer {env:GITHUB_TOKEN}'
  ohub plugin add opencode-acme-plugin@1.2.0
  ohub plugin update --all
  ohub doctor --scope all
  ohub reload
`;

const GROUP_HELP: Record<string, string> = {
  mcp: `ohub mcp — servidores MCP

  ohub mcp list [--scope all]
  ohub mcp show <nombre>
  ohub mcp add <nombre> --url <url> [--header K=V]... [--no-oauth] [--disabled]
  ohub mcp add <nombre> [--cwd <dir>] [--env K=V]... -- <comando> [args...]
  ohub mcp enable|disable <nombre>
  ohub mcp remove <nombre> [--yes]
`,
  plugin: `ohub plugin — plugins de opencode

  ohub plugin list [--scope all]
  ohub plugin add <paquete[@version]|ruta> [--options '<json>']
  ohub plugin remove <nombre> [--yes]
  ohub plugin update <nombre>|--all [--dry-run]
`,
  config: `ohub config — configuración

  ohub config path [--scope all]
  ohub config init [--scope global|project]
`,
};

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const out = new Output({
    json: parsed.booleans.has("json"),
    quiet: parsed.booleans.has("quiet"),
  });

  if (parsed.booleans.has("version")) {
    process.stdout.write(`${pkg.version}\n`);
    return EXIT.OK;
  }
  if (parsed.booleans.has("help") || parsed.positionals[0] === "help") {
    const group = parsed.positionals[0] === "help" ? parsed.positionals[1] : parsed.positionals[0];
    process.stdout.write(`${(group && GROUP_HELP[group]) || HELP}\n`);
    return EXIT.OK;
  }
  if (parsed.positionals.length === 0) {
    if (process.stdin.isTTY && process.stdout.isTTY) return runMenu(out);
    process.stdout.write(`${HELP}\n`);
    return EXIT.OK;
  }

  return dispatch(parsed, out);
}

async function dispatch(parsed: Parsed, out: Output): Promise<number> {
  const [group, command, ...rest] = parsed.positionals;
  const shifted: Parsed = { ...parsed, positionals: [command, ...rest].filter((v): v is string => Boolean(v)) };

  switch (group) {
    case "list":
      return cmdList(parsed, out);
    case "doctor":
      return cmdDoctor(parsed, out);
    case "reload":
      return cmdReload(parsed, out);
    case "mcp":
      return dispatchMcp(shifted, out);
    case "plugin":
      return dispatchPlugin(shifted, out);
    case "config":
      return dispatchConfig(shifted, out);
    case "version":
      process.stdout.write(`${pkg.version}\n`);
      return EXIT.OK;
    default:
      throw new OhubError(EXIT.USAGE, `Comando desconocido: ${group}`, "Ejecuta: ohub --help");
  }
}

async function dispatchMcp(parsed: Parsed, out: Output): Promise<number> {
  const command = parsed.positionals[0];
  const args: Parsed = { ...parsed, positionals: parsed.positionals.slice(1) };
  switch (command) {
    case "add":
      return cmdMcpAdd(args, out);
    case "list":
      return cmdMcpList(args, out);
    case "show":
      return cmdMcpShow(args, out);
    case "remove":
      return cmdMcpRemove(args, out);
    case "enable":
      return cmdMcpToggle(args, out, false);
    case "disable":
      return cmdMcpToggle(args, out, true);
    case undefined:
      process.stdout.write(`${GROUP_HELP.mcp}\n`);
      return EXIT.OK;
    default:
      throw new OhubError(EXIT.USAGE, `Subcomando mcp desconocido: ${command}`, "Ejecuta: ohub mcp --help");
  }
}

async function dispatchPlugin(parsed: Parsed, out: Output): Promise<number> {
  const command = parsed.positionals[0];
  const args: Parsed = { ...parsed, positionals: parsed.positionals.slice(1) };
  switch (command) {
    case "add":
      return cmdPluginAdd(args, out);
    case "list":
      return cmdPluginList(args, out);
    case "remove":
      return cmdPluginRemove(args, out);
    case "update":
      return cmdPluginUpdate(args, out);
    case undefined:
      process.stdout.write(`${GROUP_HELP.plugin}\n`);
      return EXIT.OK;
    default:
      throw new OhubError(EXIT.USAGE, `Subcomando plugin desconocido: ${command}`, "Ejecuta: ohub plugin --help");
  }
}

async function dispatchConfig(parsed: Parsed, out: Output): Promise<number> {
  const command = parsed.positionals[0];
  const args: Parsed = { ...parsed, positionals: parsed.positionals.slice(1) };
  switch (command) {
    case "path":
      return cmdConfigPath(args, out);
    case "init":
      return cmdConfigInit(args, out);
    case undefined:
      process.stdout.write(`${GROUP_HELP.config}\n`);
      return EXIT.OK;
    default:
      throw new OhubError(EXIT.USAGE, `Subcomando config desconocido: ${command}`, "Ejecuta: ohub config --help");
  }
}

function fail(error: unknown, out: Output): number {
  if (error instanceof OhubError) {
    if (error.code !== EXIT.OK) process.stderr.write(`error: ${error.message}\n`);
    if (error.hint) process.stderr.write(`  ${error.hint}\n`);
    return error.code;
  }
  const message = (error as Error)?.message ?? String(error);
  process.stderr.write(`error: ${message}\n`);
  if (process.env.OHUB_DEBUG) process.stderr.write(`${(error as Error)?.stack}\n`);
  return EXIT.FAIL;
}

process.on("SIGINT", () => {
  process.stderr.write("\n");
  process.exit(EXIT.INTERRUPTED);
});

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    const out = new Output();
    process.exit(fail(error, out));
  });
