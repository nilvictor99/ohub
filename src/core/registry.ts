import { EXIT, OhubError } from "./errors.ts";

export interface LatestVersion {
  name: string;
  version: string;
}

const TIMEOUT_MS = 8_000;

export async function latestVersion(name: string): Promise<LatestVersion> {
  const base = process.env.OHUB_REGISTRY ?? "https://registry.npmjs.org";
  const url = `${base.replace(/\/$/, "")}/${encodeURIComponent(name).replace(/^%40/, "@")}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      throw new OhubError(EXIT.NOT_FOUND, `Paquete no publicado en npm: ${name}`);
    }
    if (!response.ok) {
      throw new OhubError(EXIT.NETWORK, `npm respondió ${response.status} para ${name}`);
    }
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== "string") {
      throw new OhubError(EXIT.NETWORK, `Respuesta inesperada de npm para ${name}`);
    }
    return { name, version: body.version };
  } catch (error) {
    if (error instanceof OhubError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new OhubError(EXIT.NETWORK, `Timeout consultando npm para ${name}`, "Revisa tu conexión y reintenta");
    }
    throw new OhubError(EXIT.NETWORK, `No se pudo consultar npm para ${name}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
