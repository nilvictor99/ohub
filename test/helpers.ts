import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../src/cli.ts", import.meta.url).pathname;

export interface Sandbox {
  root: string;
  work: string;
  home: string;
  configHome: string;
  stateHome: string;
}

export function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "ohub-test-"));
  const box = {
    root,
    work: join(root, "work"),
    home: join(root, "home"),
    configHome: join(root, "home", ".config"),
    stateHome: join(root, "home", ".local", "state"),
  };
  for (const dir of [box.work, box.home, box.configHome, box.stateHome]) {
    mkdirSync(dir, { recursive: true });
  }
  return box;
}

export function cleanup(box: Sandbox): void {
  rmSync(box.root, { recursive: true, force: true });
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function run(
  box: Sandbox,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd: box.work,
    env: {
      ...process.env,
      HOME: box.home,
      XDG_CONFIG_HOME: box.configHome,
      XDG_STATE_HOME: box.stateHome,
      NO_COLOR: "1",
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

export function projectConfig(box: Sandbox): string {
  return join(box.work, "opencode.jsonc");
}

export function globalConfig(box: Sandbox): string {
  return join(box.configHome, "opencode", "opencode.jsonc");
}
