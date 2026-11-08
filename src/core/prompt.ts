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

export async function choose(question: string, options: string[]): Promise<number> {
  if (!process.stdin.isTTY) {
    throw new OhubError(EXIT.USAGE, "Menú interactivo requiere TTY");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question}\n${options.map((o, i) => `  ${i + 1}) ${o}`).join("\n")}\n> `);
    const index = Number.parseInt(answer.trim(), 10) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      throw new OhubError(EXIT.USAGE, "Opción inválida");
    }
    return index;
  } finally {
    rl.close();
  }
}
