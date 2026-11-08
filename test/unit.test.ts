import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/core/args.ts";
import { parseSpec } from "../src/core/plugins.ts";
import { parseConfig } from "../src/core/json.ts";

describe("parseArgs", () => {
  test("separa flags, valores y passthrough", () => {
    const parsed = parseArgs(["mcp", "add", "x", "--url", "https://a", "--yes", "--", "npx", "-y", "pkg"]);
    expect(parsed.positionals).toEqual(["mcp", "add", "x"]);
    expect(parsed.flags.get("url")).toEqual(["https://a"]);
    expect(parsed.booleans.has("yes")).toBe(true);
    expect(parsed.passthrough).toEqual(["npx", "-y", "pkg"]);
  });

  test("acepta --clave=valor y cortos combinados", () => {
    const parsed = parseArgs(["--scope=global", "-yq"]);
    expect(parsed.flags.get("scope")).toEqual(["global"]);
    expect(parsed.booleans.has("yes")).toBe(true);
    expect(parsed.booleans.has("quiet")).toBe(true);
  });

  test("falla si un flag con valor no lo tiene", () => {
    expect(() => parseArgs(["--url"])).toThrow();
  });
});

describe("parseSpec", () => {
  test("paquete simple con versión", () => {
    expect(parseSpec("pkg@1.2.3")).toEqual({ name: "pkg", version: "1.2.3" });
    expect(parseSpec("pkg")).toEqual({ name: "pkg", version: undefined });
  });

  test("paquete con scope", () => {
    expect(parseSpec("@scope/pkg@2.0.0")).toEqual({ name: "@scope/pkg", version: "2.0.0" });
    expect(parseSpec("@scope/pkg")).toEqual({ name: "@scope/pkg", version: undefined });
  });

  test("rutas locales", () => {
    expect(parseSpec("./plugins/local")).toEqual({ name: "local" });
    expect(parseSpec("/abs/plugin")).toEqual({ name: "plugin" });
    expect(parseSpec("file:///abs/plugin")).toEqual({ name: "plugin" });
  });
});

describe("parseConfig", () => {
  test("acepta jsonc con comentarios y coma final", () => {
    const data = parseConfig('{\n // x\n "a": 1,\n}', "test.jsonc");
    expect(data.a).toBe(1);
  });

  test("rechaza raíz no objeto", () => {
    expect(() => parseConfig("[]", "test.json")).toThrow();
  });
});
