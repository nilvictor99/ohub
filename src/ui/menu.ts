import { EXIT, OhubError } from "../core/errors.ts";
import type { Output } from "../core/output.ts";
import { choose } from "../core/prompt.ts";
import { parseArgs, type Parsed } from "../core/args.ts";
import pkg from "../../package.json" with { type: "json" };

type Dispatch = (parsed: Parsed, out: Output) => Promise<number>;

const OPTIONS = [
  "Listar MCP y plugins",
  "Diagnóstico (doctor)",
  "Rutas de configuración",
  "Reiniciar servicio de opencode",
  "Ayuda",
  "Salir",
];

export async function runMenu(out: Output, dispatch: Dispatch): Promise<number> {
  process.stderr.write(`ohub ${pkg.version} — OpenCode extension hub\n\n`);
  for (;;) {
    const index = await choose("¿Qué quieres hacer?", OPTIONS).catch((error: unknown) => {
      if (error instanceof OhubError && error.code === EXIT.OK) return -1;
      throw error;
    });
    if (index === -1 || index === 5) return EXIT.OK;
    const argv =
      index === 0 ? ["list"] : index === 1 ? ["doctor"] : index === 2 ? ["config", "path"] : index === 3 ? ["reload"] : ["--help"];
    try {
      await dispatch(parseArgs(argv), out);
    } catch (error) {
      if (error instanceof OhubError) {
        if (error.code !== EXIT.OK) process.stderr.write(`error: ${error.message}\n`);
        if (error.hint) process.stderr.write(`  ${error.hint}\n`);
      } else {
        process.stderr.write(`error: ${(error as Error).message}\n`);
      }
    }
    process.stderr.write("\n");
  }
}
