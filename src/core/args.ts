import { usage } from "./errors.ts";

const VALUE_FLAGS = new Set([
  "url",
  "header",
  "env",
  "cwd",
  "scope",
  "config",
  "options",
  "timeout",
  "set",
]);

const SHORT: Record<string, string> = {
  y: "yes",
  h: "help",
  q: "quiet",
  j: "json",
  g: "global",
  v: "version",
};

export interface Parsed {
  positionals: string[];
  flags: Map<string, string[]>;
  booleans: Set<string>;
  passthrough: string[];
}

export function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const booleans = new Set<string>();
  const passthrough: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      passthrough.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const key = eq === -1 ? body : body.slice(0, eq);
      if (eq !== -1) {
        add(flags, key, body.slice(eq + 1));
        continue;
      }
      if (VALUE_FLAGS.has(key)) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("-")) {
          throw usage(`--${key} requiere un valor`);
        }
        add(flags, key, next);
        index += 1;
        continue;
      }
      booleans.add(key);
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      for (const char of token.slice(1)) {
        const key = SHORT[char];
        if (!key) throw usage(`Opción desconocida: -${char}`);
        booleans.add(key);
      }
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags, booleans, passthrough };
}

function add(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

export function text(parsed: Parsed, key: string): string | undefined {
  return parsed.flags.get(key)?.at(-1);
}

export function list(parsed: Parsed, key: string): string[] {
  return parsed.flags.get(key) ?? [];
}

export function has(parsed: Parsed, key: string): boolean {
  return parsed.booleans.has(key) || parsed.flags.has(key);
}
