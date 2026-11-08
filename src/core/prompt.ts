import { createInterface } from "node:readline/promises";
import { EXIT, OhubError } from "./errors.ts";

export async function confirm(question: string, assumeYes: boolean): Promise<void> {
  if (assumeYes) return;
  if (!process.stdin.isTTY) {
    throw new OhubError(EXIT.USAGE, "Confirmación requerida", "Repite el comando con --yes");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    if (!/^(y|yes|s|si|sí)$/i.test(answer.trim())) {
      throw new OhubError(EXIT.OK, "Cancelado");
    }
  } finally {
    rl.close();
  }
}

export async function ask(question: string, options: { fallback?: string; required?: boolean } = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new OhubError(EXIT.USAGE, "Entrada interactiva no disponible");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const suffix = options.fallback ? ` [${options.fallback}]` : "";
      let answer: string;
      try {
        answer = (await rl.question(`${question}${suffix}: `)).trim();
      } catch {
        throw new OhubError(EXIT.OK, "Cancelado");
      }
      const value = answer === "" ? (options.fallback ?? "") : answer;
      if (value !== "" || options.required === false) return value;
      process.stderr.write("  Valor requerido.\n");
    }
  } finally {
    rl.close();
  }
}

export async function pause(message = "Enter para continuar"): Promise<void> {
  if (!process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    await rl.question(`${message}...`);
  } catch {
    // EOF: continuar sin bloquear
  } finally {
    rl.close();
  }
}

export async function choose(question: string, options: string[]): Promise<number> {
  if (!process.stdin.isTTY) {
    throw new OhubError(EXIT.USAGE, "Menú interactivo requiere TTY");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      let answer: string;
      try {
        answer = await rl.question(
          `${question}\n${options.map((o, i) => `  ${i + 1}) ${o}`).join("\n")}\n> `,
        );
      } catch {
        return -1;
      }
      const index = Number.parseInt(answer.trim(), 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < options.length) return index;
      process.stderr.write("  Opción inválida.\n");
    }
  } finally {
    rl.close();
  }
}
