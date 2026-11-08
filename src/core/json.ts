import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { configError } from "./errors.ts";

export type ConfigObject = Record<string, unknown>;

export function parseConfig(text: string, path: string): ConfigObject {
  if (text.trim() === "") return {};
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    const first = errors[0];
    throw configError(
      `Config inválida en ${path}: ${printParseErrorCode(first.error)} en offset ${first.offset}`,
      "Corrige el archivo o restaura un backup de ohub",
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw configError(`Config inválida en ${path}: la raíz debe ser un objeto JSON`);
  }
  return value as ConfigObject;
}

export function assertShape(config: ConfigObject, path: string): void {
  const mcp = config.mcp;
  if (mcp !== undefined) {
    if (!isObject(mcp)) throw configError(`Config inválida en ${path}: "mcp" debe ser un objeto`);
    const servers = (mcp as ConfigObject).servers;
    if (servers !== undefined && !isObject(servers)) {
      throw configError(`Config inválida en ${path}: "mcp.servers" debe ser un objeto`);
    }
  }
  for (const field of ["plugins", "plugin"]) {
    const value = config[field];
    if (value !== undefined && !Array.isArray(value)) {
      throw configError(`Config inválida en ${path}: "${field}" debe ser un array`);
    }
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
