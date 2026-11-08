import { EXIT, OhubError } from "./errors.ts";

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

const codes = {
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  magenta: "\u001b[35m",
  reset: "\u001b[0m",
} as const;

export class Output {
  readonly json: boolean;
  readonly quiet: boolean;
  private readonly color: boolean;

  constructor(options: OutputOptions = {}) {
    this.json = Boolean(options.json);
    this.quiet = Boolean(options.quiet);
    this.color = options.color ?? colorEnabled();
  }

  paint(kind: keyof typeof codes, text: string): string {
    return this.color ? `${codes[kind]}${text}${codes.reset}` : text;
  }

  data(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  line(message = ""): void {
    process.stdout.write(`${message}\n`);
  }

  info(message: string): void {
    if (this.quiet) return;
    process.stderr.write(`${message}\n`);
  }

  success(message: string): void {
    if (this.quiet) return;
    process.stderr.write(`${this.paint("green", "✓")} ${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`${this.paint("yellow", "warning:")} ${message}\n`);
  }

  table(headers: string[], rows: string[][]): void {
    if (rows.length === 0) return;
    const widths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
    );
    const line = (cells: string[]) =>
      cells
        .map((cell, index) => cell.padEnd(widths[index]))
        .join("  ")
        .trimEnd();
    process.stdout.write(`${this.paint("cyan", this.paint("bold", line(headers.map((h) => h.toUpperCase()))))}\n`);
    for (const row of rows) {
      const decorated = row.map((cell, index) => {
        const padded = cell.padEnd(widths[index]);
        const kind = this.cellKind(cell);
        if (kind) return this.paint(kind, padded);
        return index === 0 ? this.paint("bold", padded) : padded;
      });
      process.stdout.write(`${line(decorated)}\n`);
    }
  }

  private cellKind(cell: string): keyof typeof codes | undefined {
    if (/^(enabled|enabled\b)/.test(cell)) return "green";
    if (/^(disabled|disabled\b)/.test(cell)) return "red";
    if (/floating|shadowed/.test(cell)) return "dim";
    return undefined;
  }
}

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export function requireTty(flag: string): void {
  if (!process.stdin.isTTY) {
    throw new OhubError(EXIT.USAGE, "Entrada interactiva no disponible", `Usa ${flag} para continuar sin confirmación`);
  }
}
