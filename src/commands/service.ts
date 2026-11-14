import { notFound } from "../core/errors.ts";
import type { Parsed } from "../core/args.ts";
import type { Output } from "../core/output.ts";
import { resolveTarget } from "../core/paths.ts";
import { displayPath } from "../core/paths.ts";
import { targetsOf } from "./shared.ts";

export async function cmdReload(_parsed: Parsed, out: Output): Promise<number> {
  const binary = Bun.which("opencode");
  if (!binary) throw notFound("opencode no está en PATH", "Instala opencode o añade su binario al PATH");
  out.info("Reiniciando servicio de opencode...");
  const process_ = Bun.spawn([binary, "service", "restart"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const code = await process_.exited;
  if (code !== 0) return code;
  out.success("Servicio reiniciado. Los cambios ya están activos.");
  return 0;
}

export async function cmdConfigPath(parsed: Parsed, out: Output): Promise<number> {
  const targets = targetsOf(parsed, true);
  if (out.json) {
    out.data(targets.map((target) => ({ scope: target.scope, path: target.path, exists: target.exists })));
    return 0;
  }
  for (const target of targets) {
    process.stdout.write(`${target.path}\n`);
  }
  return 0;
}

export async function cmdConfigInit(parsed: Parsed, out: Output): Promise<number> {
  const scope = parsed.flags.get("scope")?.at(-1) === "global" || parsed.booleans.has("global") ? "global" : "project";
  const target = resolveTarget(scope);
  if (target.exists) {
    out.info(`Ya existe: ${displayPath(target.path)}`);
    return 0;
  }
  const { ConfigEditor } = await import("../core/config.ts");
  const editor = await ConfigEditor.open(target);
  editor.set(["$schema"], "https://opencode.ai/config.json");
  await editor.commit();
  out.success(`Config creada en ${displayPath(target.path)}`);
  return 0;
}
