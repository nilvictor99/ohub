import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { EXIT, OhubError } from "./errors.ts";

const STALE_MS = 30_000;
const WAIT_MS = 2_000;

export interface Lock {
  release(): Promise<void>;
}

export async function withLock<T>(target: string, run: () => Promise<T>): Promise<T> {
  const lockPath = `${target}.ohub.lock`;
  await fs.mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new OhubError(EXIT.PERMISSION, `No se pudo crear el lock ${lockPath}`);
      }
      const stale = await isStale(lockPath);
      if (stale) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > WAIT_MS) {
        throw new OhubError(
          EXIT.CONFLICT,
          `Otro proceso ohub está editando ${target}`,
          `Si estás seguro de que no hay otro proceso, borra ${lockPath}`,
        );
      }
      await sleep(100);
    }
  }
  try {
    return await run();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

async function isStale(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs > STALE_MS;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
