import { describe, expect, test } from "bun:test";
import { renderBanner } from "../src/ui/banner.ts";
import { splitCommand } from "../src/ui/menu.ts";
import { stateDir } from "../src/core/paths.ts";

const BASE = {
  type: "box-drawing" as const,
  title: "ohub",
  subtitle: "OpenCode extension hub",
  version: "1.0.0",
  icon: "◈",
  theme: "tech" as const,
};

describe("banner", () => {
  test("box-drawing incluye título y subtítulo", () => {
    const text = renderBanner(BASE);
    expect(text).toContain("ohub v1.0.0");
    expect(text).toContain("OpenCode extension hub");
    expect(text.split("\n").length).toBe(4);
  });

  test("header es una línea", () => {
    const text = renderBanner({ ...BASE, type: "header" });
    expect(text.split("\n").length).toBe(1);
    expect(text).toContain("ohub v1.0.0");
  });

  test("simple-lines no desborda con terminal estrecha", () => {
    const text = renderBanner({ ...BASE, type: "simple-lines" });
    const lines = text.split("\n");
    expect(lines.length).toBe(4);
    for (const line of lines) expect(line.length).toBeLessThan(120);
  });

  test("modo ascii evita unicode", () => {
    process.env.OHUB_ASCII = "1";
    const text = renderBanner(BASE);
    expect(text).toContain("+");
    expect(text).not.toContain("╭");
    delete process.env.OHUB_ASCII;
  });
});

describe("splitCommand", () => {
  test("separa argumentos simples", () => {
    expect(splitCommand("npx -y pkg")).toEqual(["npx", "-y", "pkg"]);
  });

  test("respeta comillas", () => {
    expect(splitCommand(`npx "paquete con espacio" --flag 'a b'`)).toEqual([
      "npx",
      "paquete con espacio",
      "--flag",
      "a b",
    ]);
  });
});

describe("estado portable", () => {
  test("OHUB_STATE_HOME aísla el estado", () => {
    const previous = process.env.OHUB_STATE_HOME;
    process.env.OHUB_STATE_HOME = "/tmp/opencode/ohub-state-test";
    expect(stateDir()).toBe("/tmp/opencode/ohub-state-test");
    if (previous === undefined) delete process.env.OHUB_STATE_HOME;
    else process.env.OHUB_STATE_HOME = previous;
  });
});

describe("select", () => {
  test("exige TTY cuando no hay terminal", async () => {
    const { select } = await import("../src/ui/select.ts");
    await expect(select("¿?", ["a", "b"])).rejects.toThrow();
  });

  test("acepta icono por opción", async () => {
    const { select } = await import("../src/ui/select.ts");
    await expect(select("¿?", [{ label: "x", icon: "×" }])).rejects.toThrow();
  });
});
