import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { colorEnabled } from "../core/output.ts";
import pkg from "../../package.json" with { type: "json" };

interface BannerConfig {
  type: "box-drawing" | "simple-lines" | "header";
  title: string;
  subtitle: string;
  version: string;
  icon: string;
  theme: string;
}

const DEFAULTS: BannerConfig = {
  type: "box-drawing",
  title: "ohub",
  subtitle: "OpenCode extension hub",
  version: pkg.version,
  icon: "◈",
  theme: "tech",
};

const THEMES: Record<string, string[]> = {
  default: ["\u001b[36m", "\u001b[36m", "\u001b[34m"],
  tech: ["\u001b[36m", "\u001b[35m", "\u001b[34m"],
  fire: ["\u001b[31m", "\u001b[33m", "\u001b[31m"],
  ocean: ["\u001b[34m", "\u001b[36m", "\u001b[34m"],
  forest: ["\u001b[32m", "\u001b[36m", "\u001b[32m"],
  neon: ["\u001b[35m", "\u001b[36m", "\u001b[35m"],
  minimal: ["", "", ""],
};

export function loadBannerConfig(): BannerConfig {
  const home = process.env.OHUB_HOME ?? process.cwd();
  const path = join(home, "banner.config.json");
  if (!existsSync(path)) return DEFAULTS;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<BannerConfig>;
    return { ...DEFAULTS, ...raw, version: pkg.version };
  } catch {
    return DEFAULTS;
  }
}

export function renderBanner(config = loadBannerConfig()): string {
  const unicode = supportsUnicode();
  const theme = THEMES[config.theme] ?? THEMES.tech;
  const colored = colorEnabled() && theme.some(Boolean);
  const [border, strong, weak] = theme;
  const reset = "\u001b[0m";
  const edge = colored ? border : "";
  const paint = (text: string, hue: string) => (colored ? `${hue}${text}${reset}` : text);
  const title = `${config.icon ? `${config.icon} ` : ""}${config.title} v${config.version}`;
  const subtitle = config.subtitle;
  const columns = Math.max(40, process.stdout.columns || 80);

  if (config.type === "header") {
    return `${paint(title, strong)} ${dim(`— ${subtitle}`)}`;
  }

  if (config.type === "simple-lines") {
    const width = Math.max(20, Math.min(columns, Math.max(title.length, subtitle.length) + 2));
    const rule = (unicode ? "─" : "-").repeat(width);
    return [paint(rule, edge), paint(title, strong), dim(subtitle), paint(rule, edge)].join("\n");
  }

  const inner = Math.max(20, Math.min(columns - 4, Math.max(title.length, subtitle.length) + 2));
  const top = unicode ? `╭${"─".repeat(inner)}╮` : `+${"-".repeat(inner)}+`;
  const bottom = unicode ? `╰${"─".repeat(inner)}╯` : `+${"-".repeat(inner)}+`;
  const bar = unicode ? "│" : "|";
  const pad = (text: string) => `${bar} ${text.padEnd(inner - 1)}${bar}`;
  return [paint(top, edge), paint(pad(title), strong), paint(pad(subtitle), weak), paint(bottom, edge)].join("\n");
}

function dim(text: string): string {
  return colorEnabled() ? `\u001b[2m${text}\u001b[0m` : text;
}

function supportsUnicode(): boolean {
  if (process.env.OHUB_ASCII) return false;
  const locale = process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? "";
  if (/utf-?8/i.test(locale)) return true;
  return process.platform === "linux" && !process.env.NO_UNICODE;
}
