import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { cleanup, globalConfig, projectConfig, run, sandbox } from "./helpers.ts";

describe("ohub cli", () => {
  test("list en vacío no falla", async () => {
    const box = sandbox();
    const result = await run(box, ["list", "--scope", "all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ninguno");
    cleanup(box);
  });

  test("config init crea schema", async () => {
    const box = sandbox();
    expect((await run(box, ["config", "init"])).code).toBe(0);
    const data = JSON.parse(readFileSync(projectConfig(box), "utf8"));
    expect(data.$schema).toBe("https://opencode.ai/config.json");
    cleanup(box);
  });

  test("mcp add remoto escribe servidores y evita duplicados", async () => {
    const box = sandbox();
    const first = await run(box, ["mcp", "add", "context7", "--url", "https://mcp.context7.com/mcp"]);
    expect(first.code).toBe(0);
    const data = JSON.parse(readFileSync(projectConfig(box), "utf8"));
    expect(data.mcp.servers.context7.type).toBe("remote");

    const duplicate = await run(box, ["mcp", "add", "context7", "--url", "https://other.example/mcp"]);
    expect(duplicate.code).toBe(5);

    const forced = await run(box, [
      "mcp",
      "add",
      "context7",
      "--url",
      "https://other.example/mcp",
      "--force",
    ]);
    expect(forced.code).toBe(0);
    expect(JSON.parse(readFileSync(projectConfig(box), "utf8")).mcp.servers.context7.url).toBe(
      "https://other.example/mcp",
    );
    cleanup(box);
  });

  test("mcp local guarda comando y entorno", async () => {
    const box = sandbox();
    const result = await run(box, [
      "mcp",
      "add",
      "everything",
      "--env",
      "LOG_LEVEL=info",
      "--",
      "npx",
      "-y",
      "@modelcontextprotocol/server-everything",
    ]);
    expect(result.code).toBe(0);
    const server = JSON.parse(readFileSync(projectConfig(box), "utf8")).mcp.servers.everything;
    expect(server.type).toBe("local");
    expect(server.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-everything"]);
    expect(server.environment).toEqual({ LOG_LEVEL: "info" });
    cleanup(box);
  });

  test("disable y enable cambian el campo disabled", async () => {
    const box = sandbox();
    await run(box, ["mcp", "add", "srv", "--url", "https://example.com/mcp"]);
    expect((await run(box, ["mcp", "disable", "srv"])).code).toBe(0);
    expect(JSON.parse(readFileSync(projectConfig(box), "utf8")).mcp.servers.srv.disabled).toBe(true);
    expect((await run(box, ["mcp", "enable", "srv"])).code).toBe(0);
    expect(
      JSON.parse(readFileSync(projectConfig(box), "utf8")).mcp.servers.srv.disabled,
    ).toBeUndefined();
    cleanup(box);
  });

  test("remove exige confirmación en modo no interactivo", async () => {
    const box = sandbox();
    await run(box, ["mcp", "add", "srv", "--url", "https://example.com/mcp"]);
    const refused = await run(box, ["mcp", "remove", "srv"]);
    expect(refused.code).toBe(2);
    expect((await run(box, ["mcp", "remove", "srv", "--yes"])).code).toBe(0);
    expect(JSON.parse(readFileSync(projectConfig(box), "utf8")).mcp.servers).toEqual({});
    cleanup(box);
  });

  test("plugin add, list y remove", async () => {
    const box = sandbox();
    expect((await run(box, ["plugin", "add", "opencode-acme-plugin@1.2.0"])).code).toBe(0);
    expect((await run(box, ["plugin", "add", "opencode-acme-plugin@1.2.0"])).code).toBe(5);
    const listed = await run(box, ["plugin", "list", "--json"]);
    expect(listed.code).toBe(0);
    const entries = JSON.parse(listed.stdout);
    expect(entries[0].name).toBe("opencode-acme-plugin");
    expect(entries[0].version).toBe("1.2.0");

    expect((await run(box, ["plugin", "remove", "opencode-acme-plugin", "--yes"])).code).toBe(0);
    expect(JSON.parse(readFileSync(projectConfig(box), "utf8")).plugins).toEqual([]);
    cleanup(box);
  });

  test("plugin update usa el registry configurado", async () => {
    const box = sandbox();
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.endsWith("/latest")) return Response.json({ version: "2.0.0" });
        return new Response("not found", { status: 404 });
      },
    });
    try {
      await run(box, ["plugin", "add", "opencode-acme-plugin@1.0.0"]);
      const result = await run(box, ["plugin", "update", "opencode-acme-plugin"], {
        OHUB_REGISTRY: `http://127.0.0.1:${server.port}`,
      });
      expect(result.code).toBe(0);
      expect(JSON.parse(readFileSync(projectConfig(box), "utf8")).plugins).toEqual([
        "opencode-acme-plugin@2.0.0",
      ]);
    } finally {
      server.stop(true);
      cleanup(box);
    }
  });

  test("conserva comentarios al editar", async () => {
    const box = sandbox();
    writeFileSync(
      projectConfig(box),
      '{\n  // keep me\n  "$schema": "https://opencode.ai/config.json"\n}\n',
    );
    await run(box, ["mcp", "add", "srv", "--url", "https://example.com/mcp"]);
    expect(readFileSync(projectConfig(box), "utf8")).toContain("// keep me");
    cleanup(box);
  });

  test("doctor detecta json inválido y secretos", async () => {
    const box = sandbox();
    writeFileSync(projectConfig(box), "{ roto");
    const broken = await run(box, ["doctor"]);
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain("Config inválida");

    writeFileSync(
      projectConfig(box),
      JSON.stringify(
        {
          plugin: ["legacy-plugin"],
          mcp: {
            servers: {
              bad: {
                type: "remote",
                url: "https://x.test",
                headers: { Authorization: "Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
              },
            },
          },
        },
        null,
        2,
      ),
    );
    const warn = await run(box, ["doctor"]);
    expect(warn.code).toBe(0);
    expect(warn.stderr).toContain("secreto literal");
    expect(warn.stderr).toContain("obsoleto");
    cleanup(box);
  });

  test("scope global escribe en XDG_CONFIG_HOME", async () => {
    const box = sandbox();
    expect(
      (await run(box, ["mcp", "add", "srv", "--url", "https://example.com/mcp", "-g"])).code,
    ).toBe(0);
    const data = JSON.parse(readFileSync(globalConfig(box), "utf8"));
    expect(data.mcp.servers.srv).toBeDefined();
    cleanup(box);
  });

  test("json output es parseable y estable", async () => {
    const box = sandbox();
    await run(box, ["mcp", "add", "srv", "--url", "https://example.com/mcp"]);
    const result = await run(box, ["list", "--json"]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.mcp[0].name).toBe("srv");
    expect(parsed.configs.map((c: { scope: string }) => c.scope)).toEqual(["global", "project"]);
    cleanup(box);
  });

  test("comando desconocido devuelve 2", async () => {
    const box = sandbox();
    expect((await run(box, ["nope"])).code).toBe(2);
    cleanup(box);
  });
});
