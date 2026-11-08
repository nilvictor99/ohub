import { emitKeypressEvents } from "node:readline";
import { EXIT, OhubError } from "../core/errors.ts";
import { colorEnabled } from "../core/output.ts";

export interface SelectItem {
  label: string;
  hint?: string;
}

export interface SelectOptions {
  initial?: number;
  footer?: string;
}

const ESC = "\u001b[";

function supportsUnicode(): boolean {
  if (process.env.OHUB_ASCII) return false;
  const locale = process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? "";
  return /utf-?8/i.test(locale) || (process.platform === "linux" && !process.env.NO_UNICODE);
}

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
  const paint = (code: string, text: string) => (color ? `${code}${text}\u001b[0m` : text);
  const pointer = supportsUnicode() ? "❯" : ">";
  const footer = config.footer ?? "↑/↓ mover · Enter elegir · q salir";
  let index = clamp(config.initial ?? 0, 0, items.length - 1);
  let rendered = 0;

  const width = Math.max(
    ...items.map((item) => item.label.length + (item.hint ? item.hint.length + 3 : 0)),
  );
  const lineWidth = Math.min(
    Math.max(width + 4, 24),
    Math.max(20, (process.stdout.columns ?? 80) - 2),
  );

  process.stderr.write(`${paint("\u001b[1m", question)}\n`);
  process.stderr.write(`${paint("\u001b[2m", `  ${footer}`)}\n`);

  const draw = () => {
    if (rendered > 0) process.stderr.write(`${ESC}${rendered}A`);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const selected = i === index;
      const marker = selected ? `${pointer} ` : "  ";
      const hint = item.hint ? `  ${item.hint}` : "";
      const body = `${marker}${item.label}${hint}`.padEnd(lineWidth);
      const line = selected ? `${ESC}7m${ESC}1m${body}${ESC}0m` : body;
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
        process.stderr.write(`${paint("\u001b[2m", "  cancelado")}\n`);
      } else {
        const item = items[value];
        const hint = item.hint ? paint("\u001b[2m", `  ${item.hint}`) : "";
        process.stderr.write(`${paint("\u001b[32m", pointer)} ${paint("\u001b[1m", item.label)}${hint}\n`);
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
