import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { backupDir } from "./paths.ts";

const KEEP = 20;

export async function backupFile(path: string, contents: string): Promise<string | undefined> {
  if (!contents) return undefined;
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${path.replace(/[\\/]/g, "_")}.${stamp}.bak`;
  const file = join(dir, name);
  await fs.writeFile(file, contents, { mode: 0o600 });
  await prune(dir);
  return file;
}

async function prune(dir: string): Promise<void> {
  const entries = (await fs.readdir(dir)).filter((name) => name.endsWith(".bak"));
  if (entries.length <= KEEP) return;
  entries.sort();
  for (const name of entries.slice(0, entries.length - KEEP)) {
    await fs.rm(join(dir, name), { force: true });
  }
}

export async function atomicWrite(path: string, contents: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  let mode = 0o600;
  try {
    mode = (await fs.stat(path)).mode & 0o777;
  } catch {
    // archivo nuevo
  }
  const tmp = `${path}.ohub-${process.pid}-${Date.now()}.tmp`;
  await fs.writeFile(tmp, contents, { mode });
  await fs.chmod(tmp, mode);
  await fs.rename(tmp, path);
}
