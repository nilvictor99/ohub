import { emitKeypressEvents } from "node:readline";
import { EXIT, OhubError } from "../core/errors.ts";
import { colorEnabled } from "../core/output.ts";

export interface SelectItem {
  label: string;
  hint?: string;
  icon?: string;
}

export interface SelectOptions {
  initial?: number;
  footer?: string;
}

const ESC = "\u001b[";

export async function select(
  question: string,
  options: Array<string | SelectItem>,
  config: SelectOptions = {},
): Promise<number> {
  const items: SelectItem[] = options.map((item) =>
    typeof item === "string" ? { label: item } : item,
  );
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
  const showIcon = process.env.OHUB_EMOJI === "1";
  let index = clamp(config.initial ?? 0, 0, items.length - 1);
  let rendered = 0;

  const reported = process.stdout.columns ?? 0;
  const columns = Math.max(20, reported > 0 ? reported : 80);
  const indent = "  ";
  const gap = 2;
  const iconWidth = Math.max(...items.map((item) => cellWidth(item.icon ?? "")));
  const iconSpace = iconWidth > 0 ? iconWidth + 1 : 0;
  const labelWidth = Math.max(...items.map((item) => cellWidth(item.label)));
  const hintStart = indent.length + iconSpace + labelWidth + gap;
  const hintBudget = Math.max(0, columns - hintStart);

  const iconCellFor = (item: SelectItem): string => {
    if (!showIcon || iconWidth === 0) return "";
    return `${padTo(item.icon ?? "", iconWidth)} `;
  };

  const row = (item: SelectItem, selected: boolean): string => {
    const iconCell = iconCellFor(item);
    const hint = item.hint ? truncate(item.hint, hintBudget) : "";
    if (!hint) {
      const label = selected && color ? `${cyan}${bold}${item.label}${reset}` : item.label;
      return `${indent}${iconCell}${label}`;
    }
    const head = `${indent}${iconCell}`;
    const label = selected && color
      ? `${cyan}${bold}${item.label}${reset}${" ".repeat(labelWidth - cellWidth(item.label))}`
      : padTo(item.label, labelWidth);
    return `${head}${label}${" ".repeat(gap)}${color ? `${dim}${hint}${reset}` : hint}`;
  };

  process.stderr.write(`${color ? `${bold}${cyan}${question}${reset}` : question}\n`);
  process.stderr.write(`${color ? `${dim}${indent}${footer}${reset}` : `${indent}${footer}`}\n`);

  const draw = () => {
    if (rendered > 0) process.stderr.write(`${ESC}${rendered}A`);
    for (let i = 0; i < items.length; i += 1) {
      process.stderr.write(`${ESC}2K${row(items[i], i === index)}\n`);
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
        const iconCell = iconCellFor(item);
        const hint = item.hint ? truncate(item.hint, hintBudget) : "";
        const label = color ? `${cyan}${bold}${item.label}${reset}` : item.label;
        const pad = hint ? " ".repeat(labelWidth - cellWidth(item.label)) + " ".repeat(gap) : "";
        const hintCell = hint ? `${color ? `${dim}${hint}${reset}` : hint}` : "";
        process.stderr.write(`${indent}${iconCell}${label}${pad}${hintCell}\n`);
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

function padTo(text: string, width: number): string {
  const missing = width - cellWidth(text);
  return missing > 0 ? `${text}${" ".repeat(missing)}` : text;
}

export function cellWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0xfe0f || code === 0x200d || code === 0x20e3) continue;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x1f000 && code <= 0x1f2ff)
  );
}

function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  if (cellWidth(text) <= max) return text;
  let out = "";
  let width = 0;
  for (const char of text) {
    const size = cellWidth(char);
    if (width + size > max - 1) break;
    out += char;
    width += size;
  }
  return `${out}…`;
}
