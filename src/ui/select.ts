import { emitKeypressEvents } from "node:readline";
import { EXIT, OhubError } from "../core/errors.ts";
import { colorEnabled } from "../core/output.ts";

export interface SelectItem {
  label: string;
  hint?: string;
  color?: string;
}

export interface SelectOptions {
  initial?: number;
  footer?: string;
}

const ESC = "\u001b[";

const PALETTE = [
  "\u001b[36m", // cyan
  "\u001b[32m", // green
  "\u001b[33m", // yellow
  "\u001b[35m", // magenta
  "\u001b[34m", // blue
  "\u001b[31m", // red
];

export async function select(
  question: string,
  options: Array<string | SelectItem>,
  config: SelectOptions = {},
): Promise<number> {
  const items: SelectItem[] = options.map((item) => (typeof item === "string" ? { label: item } : item));
  if (items.length === 0) return -1;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new OhubError(EXIT.USAGE, "El menú interactivo requiere una terminal (TTY)");
  }

  const color = colorEnabled();
  const reset = "\u001b[0m";
  const dim = "\u001b[2m";
  const bold = "\u001b[1m";
  const cyan = "\u001b[36m";
  const footer = config.footer ?? "flechas para mover, Enter para elegir, q para salir";
  let index = clamp(config.initial ?? 0, 0, items.length - 1);
  let rendered = 0;

  const width = Math.max(
    ...items.map((item) => item.label.length + (item.hint ? item.hint.length + 4 : 0)),
  );
  const lineWidth = Math.min(
    Math.max(width + 4, 24),
    Math.max(20, (process.stdout.columns ?? 80) - 2),
  );

  process.stderr.write(`${color ? `${bold}${cyan}${question}${reset}` : question}\n`);
  process.stderr.write(`${color ? `${dim}  ${footer}${reset}` : `  ${footer}`}\n`);

  const draw = () => {
    if (rendered > 0) process.stderr.write(`${ESC}${rendered}A`);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const selected = i === index;
      const hue = selected ? cyan : (item.color ?? PALETTE[i % PALETTE.length]);
      const hintText = item.hint ? `  ${item.hint}` : "";
      const visible = `${item.label}${hintText}`;
      const pad = " ".repeat(Math.max(0, lineWidth - visible.length));
      const style = selected ? `${hue}${bold}` : hue;
      const line = color
        ? `${style}${item.label}${reset}${hintText ? `${dim}${hintText}${pad}${reset}` : pad}`
        : `${visible}${pad}`;
      process.stderr.write(`${ESC}2K${line}\n`);
    }
    rendered = items.length;
  };

  process.stderr.write(`${ESC}?25l`);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  draw();

  return new Promise<number>((resolve) => {
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write(`${ESC}?25h${ESC}${rendered}A${ESC}0J`);
    };

    const finish = (value: number) => {
      cleanup();
      if (value < 0) {
        process.stderr.write(`${color ? `${dim}  cancelado${reset}` : "  cancelado"}\n`);
      } else {
        const item = items[value];
        const hint = item.hint ? `${color ? `${dim}  ${item.hint}${reset}` : `  ${item.hint}`}` : "";
        const hue = item.color ?? PALETTE[value % PALETTE.length];
        process.stderr.write(`${color ? `${bold}${hue}${item.label}${reset}` : item.label}${hint}\n`);
      }
      resolve(value);
    };

    const onKey = (_chunk: string, key: { name?: string; ctrl?: boolean }) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.stderr.write("\n");
        process.exit(EXIT.INTERRUPTED);
      }
      switch (key.name) {
        case "up":
        case "k":
          index = (index - 1 + items.length) % items.length;
          draw();
          return;
        case "down":
        case "j":
        case "tab":
          index = (index + 1) % items.length;
          draw();
          return;
        case "home":
          index = 0;
          draw();
          return;
        case "end":
          index = items.length - 1;
          draw();
          return;
        case "return":
        case "enter":
          finish(index);
          return;
        case "escape":
        case "q":
          finish(-1);
          return;
        default:
          if (/^[1-9]$/.test(key.name ?? "")) {
            const target = Number(key.name) - 1;
            if (target < items.length) {
              index = target;
              finish(index);
            }
          }
      }
    };

    process.stdin.on("keypress", onKey);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
