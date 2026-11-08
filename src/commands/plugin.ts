import { ConfigEditor } from "../core/config.ts";
import { conflict, notFound, usage } from "../core/errors.ts";
import { isObject } from "../core/json.ts";
import type { Parsed } from "../core/args.ts";
import { has, text } from "../core/args.ts";
import type { Output } from "../core/output.ts";
import { confirm } from "../core/prompt.ts";
import { latestVersion } from "../core/registry.ts";
import { normalizePlugins, parseSpec } from "../core/plugins.ts";
import { displayPath } from "../core/paths.ts";
import { targetOf, targetsOf, viewsFor } from "./shared.ts";

export async function cmdPluginAdd(parsed: Parsed, out: Output): Promise<number> {
  const spec = parsed.positionals[0];
  if (!spec) throw usage("Falta el plugin", "Ejemplo: ohub plugin add opencode-acme-plugin@1.2.0");
  if (/\s/.test(spec)) throw usage(`Plugin inválido: ${spec}`);

  const parsedSpec = parseSpec(spec);
  const target = targetOf(parsed);
  const existing = normalizePlugins((await ConfigEditor.open(target)).current, target.scope, target.path);
  if (existing.some((entry) => entry.name === parsedSpec.name) && !has(parsed, "force")) {
    throw conflict(
      `El plugin "${parsedSpec.name}" ya existe en ${displayPath(target.path)}`,
      "Usa --force para añadirlo igualmente o --scope global/project",
    );
  }

  const editor = await ConfigEditor.open(target);
  const field = editor.get(["plugins"]) !== undefined ? "plugins" : editor.get(["plugin"]) !== undefined ? "plugin" : "plugins";
  const options = parseOptions(text(parsed, "options"));
  const entry = options ? { package: spec, options } : spec;
  editor.append([field], entry);
  if (field === "plugin") {
    out.warn('El archivo usa el campo obsoleto "plugin"; considera migrar a "plugins"');
  }
  await editor.commit();
  out.success(`Plugin "${parsedSpec.name}" añadido en ${displayPath(target.path)}`);
  out.info("Reinicia el servicio para aplicarlo: ohub reload");
  return 0;
}

export async function cmdPluginRemove(parsed: Parsed, out: Output): Promise<number> {
  const name = parsed.positionals[0];
  if (!name) throw usage("Falta el plugin", "Ejemplo: ohub plugin remove opencode-acme-plugin");
  const target = targetOf(parsed);
  const views = normalizePlugins((await ConfigEditor.open(target)).current, target.scope, target.path);
  const view = views.find((entry) => entry.name === name || entry.spec === name);
  if (!view) throw notFound(`Plugin no encontrado: ${name}`, `Revisa: ohub plugin list --scope ${target.scope}`);
  await confirm(`Eliminar plugin "${view.name}" de ${displayPath(target.path)}?`, has(parsed, "yes"));

  const editor = await ConfigEditor.open(target);
  const entries = editor.get([view.field]);
  if (!Array.isArray(entries)) throw notFound(`Plugin no encontrado: ${name}`);
  const next = entries.filter((_, index) => index !== view.index);
  editor.set([view.field], next);
  await editor.commit();
  out.success(`Plugin "${view.name}" eliminado de ${displayPath(target.path)}`);
  return 0;
}

export async function cmdPluginUpdate(parsed: Parsed, out: Output): Promise<number> {
  const wanted = parsed.positionals;
  const targets = targetsOf(parsed);
  const all = has(parsed, "all");
  if (wanted.length === 0 && !all) {
    throw usage("Indica un plugin o usa --all", "Ejemplo: ohub plugin update --all");
  }
  const dry = has(parsed, "dry-run");
  const rows: string[][] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const editor = await ConfigEditor.open(target);
    const views = normalizePlugins(editor.current, target.scope, target.path);
    for (const view of views) {
      if (!all && !wanted.includes(view.name)) continue;
      seen.add(view.name);
      if (view.spec.startsWith(".") || view.spec.startsWith("/") || view.spec.startsWith("file:")) {
        rows.push([view.name, view.spec, "local", "omitido"]);
        continue;
      }
      if (!view.version) {
        rows.push([view.name, view.spec, "floating", "sin cambio"]);
        continue;
      }
      const latest = await latestVersion(view.name);
      if (latest.version === view.version) {
        rows.push([view.name, view.version, latest.version, "al día"]);
        continue;
      }
      if (!dry) {
        const entries = editor.get([view.field]);
        const entry = Array.isArray(entries) ? entries[view.index] : undefined;
        const nextSpec = `${view.name}@${latest.version}`;
        const next = isObject(entry) ? { ...entry, package: nextSpec } : nextSpec;
        editor.set([view.field, view.index], next);
      }
      rows.push([view.name, view.version, latest.version, dry ? "actualizar (dry-run)" : "actualizado"]);
    }
    if (!dry) await editor.commit();
  }

  for (const name of wanted) {
    if (!seen.has(name)) throw notFound(`Plugin no encontrado: ${name}`);
  }

  if (out.json) {
    out.data(rows.map(([name, from, to, status]) => ({ name, from, to, status })));
    return 0;
  }
  if (rows.length === 0) {
    out.info("Nada que actualizar.");
    return 0;
  }
  out.table(["name", "from", "to", "status"], rows);
  return 0;
}

export async function cmdPluginList(parsed: Parsed, out: Output): Promise<number> {
  const { plugins } = await viewsFor(targetsOf(parsed, true));
  if (out.json) {
    out.data(plugins.map((v) => ({ ...v })));
    return 0;
  }
  if (plugins.length === 0) {
    out.info("Sin plugins configurados.");
    return 0;
  }
  out.table(
    ["name", "version", "scope", "source"],
    plugins.map((v) => [v.name, v.version ?? "(floating)", v.scope, displayPath(v.path)]),
  );
  return 0;
}

function parseOptions(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw usage("--options debe ser JSON válido", `Recibido: ${raw}`);
  }
  if (!isObject(value)) throw usage("--options debe ser un objeto JSON");
  return value;
}
