import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agentPluginIssues,
  type PluginFiles,
} from "./agent-plugin-conformance.js";

const PLUGIN_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

function pluginJson(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "demo", ...fields });
}

function mcpJson(
  servers: Record<string, unknown>,
  fields: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    $schema: MCP_SCHEMA,
    mcpServers: servers,
    ...fields,
  });
}

function skill(path: string, frontmatter: string): PluginFiles["skills"][0] {
  return { path, skillMd: `---\n${frontmatter}\n---\n\nBody.\n` };
}

const CONFORMING: PluginFiles = {
  pluginJson: pluginJson({ description: "A demo", version: "1.0.0" }),
  mcpJson: mcpJson({
    local: {
      type: "stdio",
      command: "./bin/server",
      args: ["--data", "${PLUGIN_DATA}/cache"],
      cwd: "${PLUGIN_ROOT}",
    },
    remote: { type: "streamable-http", url: "https://example.com/mcp" },
  }),
  skills: [skill("skills/alpha", "name: alpha\ndescription: Does alpha")],
};

function issuesFor(overrides: Partial<PluginFiles>): string[] {
  return agentPluginIssues({ ...CONFORMING, ...overrides });
}

describe("agentPluginIssues", () => {
  it("reports nothing for a conforming plugin", () => {
    assert.deepEqual(agentPluginIssues(CONFORMING), []);
  });

  it("reports nothing when mcp.json is absent", () => {
    assert.deepEqual(issuesFor({ mcpJson: undefined }), []);
  });

  it("reports nothing for a plugin with no skills", () => {
    assert.deepEqual(issuesFor({ skills: [] }), []);
  });

  describe("$schema names a known version", () => {
    it("reports a plugin.json without $schema", () => {
      const issues = issuesFor({
        pluginJson: JSON.stringify({ name: "demo" }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^plugin\.json has no "\$schema"/);
    });

    it("reports an unknown version in plugin.json", () => {
      const unknown = "https://example.com/plugin.schema.json";
      const issues = issuesFor({
        pluginJson: JSON.stringify({ $schema: unknown, name: "demo" }),
      });
      assert.deepEqual(issues, [
        `plugin.json "$schema" names an unknown Agent Plugins version: ${unknown}`,
      ]);
    });

    it("reports an mcp.json without $schema", () => {
      const issues = issuesFor({ mcpJson: JSON.stringify({ mcpServers: {} }) });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^mcp\.json has no "\$schema"/);
    });

    it("reports an unknown version in mcp.json", () => {
      const unknown = "https://example.com/mcp.schema.json";
      const issues = issuesFor({
        mcpJson: JSON.stringify({ $schema: unknown, mcpServers: {} }),
      });
      assert.deepEqual(issues, [
        `mcp.json "$schema" names an unknown Agent Plugins version: ${unknown}`,
      ]);
    });

    it("reports a plugin.json $schema that names the mcp schema", () => {
      const issues = issuesFor({
        pluginJson: JSON.stringify({ $schema: MCP_SCHEMA, name: "demo" }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /unknown Agent Plugins version/);
    });
  });

  describe("schema-valid", () => {
    it("reports a plugin.json that isn't JSON", () => {
      assert.deepEqual(issuesFor({ pluginJson: "{ nope" }), [
        "plugin.json is not valid JSON",
      ]);
    });

    it("reports an mcp.json that isn't JSON", () => {
      assert.deepEqual(issuesFor({ mcpJson: "{ nope" }), [
        "mcp.json is not valid JSON",
      ]);
    });

    it("reports each schema violation in plugin.json", () => {
      const issues = issuesFor({
        pluginJson: pluginJson({ name: "Not Valid", mcpServers: {} }),
      });
      assert.equal(issues.length, 2);
      assert.ok(issues.every((i) => i.startsWith("plugin.json ")));
      assert.ok(issues.some((i) => i.includes('"name"')));
      assert.ok(issues.some((i) => i.includes('"mcpServers"')));
    });

    it("reports a missing required name", () => {
      const issues = issuesFor({
        pluginJson: JSON.stringify({ $schema: PLUGIN_SCHEMA }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^plugin\.json .*"name"/);
    });

    it("reports a top-level schema violation in mcp.json", () => {
      const issues = issuesFor({ mcpJson: mcpJson({}, { extra: true }) });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^mcp\.json .*"extra"/);
    });

    it("reports a server that breaks its transport's schema, once", () => {
      const issues = issuesFor({
        mcpJson: mcpJson({ bad: { type: "stdio", command: "x", url: "u" } }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^mcp\.json server "bad" .*"url"/);
    });

    it("reports a server whose type the version doesn't define", () => {
      const issues = issuesFor({
        mcpJson: mcpJson({ web: { type: "http", url: "https://x.test/mcp" } }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^mcp\.json server "web" .*"http"/);
    });
  });

  describe("every MCP server declares a type", () => {
    it("reports a server without type, and nothing more about it", () => {
      const issues = issuesFor({
        mcpJson: mcpJson({ local: { command: "server" } }),
      });
      assert.deepEqual(issues, ['mcp.json server "local" declares no "type"']);
    });

    it("reports each server without type", () => {
      const issues = issuesFor({
        mcpJson: mcpJson({
          a: { command: "server" },
          b: { url: "https://example.com/mcp" },
        }),
      });
      assert.equal(issues.length, 2);
    });
  });

  describe("no MCP config clients must exclude", () => {
    const one = (server: Record<string, unknown>) =>
      issuesFor({ mcpJson: mcpJson({ s: server }) });

    it("reports an mcp.json targeting a different version than plugin.json", () => {
      // Only one version is bundled, so the other one is unknown too, which
      // is its own issue. The mismatch is reported on top of it.
      const other = "https://agent-plugins.org/schemas/9.9.9/mcp.schema.json";
      const issues = issuesFor({
        mcpJson: JSON.stringify({ $schema: other, mcpServers: {} }),
      });
      assert.equal(issues.length, 2);
      assert.ok(
        issues.some((i) => i.includes("unknown Agent Plugins version")),
      );
      assert.ok(
        issues.includes(
          "mcp.json targets Agent Plugins 9.9.9, but plugin.json targets 1.0.0",
        ),
      );
    });

    it("reports a command that is a shell command line", () => {
      const issues = one({ type: "stdio", command: "npx -y some-server" });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /^mcp\.json server "s": .*single executable/);
    });

    it("reports a command path not beginning with ./", () => {
      assert.equal(one({ type: "stdio", command: "bin/server" }).length, 1);
      assert.equal(
        one({ type: "stdio", command: "/usr/bin/server" }).length,
        1,
      );
    });

    it("accepts a bare executable name", () => {
      assert.deepEqual(one({ type: "stdio", command: "uvx" }), []);
    });

    it("reports a command that leaves the plugin root", () => {
      assert.equal(one({ type: "stdio", command: "./../outside" }).length, 1);
    });

    it("reports a cwd that leaves the plugin root or data directory", () => {
      const cwd = (value: string) =>
        one({ type: "stdio", command: "uvx", cwd: value });
      assert.equal(cwd("./../outside").length, 1);
      assert.equal(cwd("${PLUGIN_ROOT}/a/../../outside").length, 1);
      assert.equal(cwd("${PLUGIN_DATA}/../outside").length, 1);
      assert.deepEqual(cwd("./a/../b"), []);
      assert.deepEqual(cwd("${PLUGIN_DATA}"), []);
    });

    it("reports a url that isn't absolute http or https", () => {
      const url = (value: string) => one({ type: "sse", url: value });
      assert.equal(url("example.com/mcp").length, 1);
      assert.equal(url("ftp://example.com/mcp").length, 1);
    });

    it("reports a url with user information or a fragment", () => {
      const url = (value: string) =>
        one({ type: "streamable-http", url: value });
      assert.equal(url("https://user:pw@example.com/mcp").length, 1);
      assert.equal(url("https://example.com/mcp#frag").length, 1);
    });

    it("reports plain http to a non-loopback host, but not to loopback", () => {
      const url = (value: string) =>
        one({ type: "streamable-http", url: value });
      assert.equal(url("http://example.com/mcp").length, 1);
      assert.deepEqual(url("http://localhost:3000/mcp"), []);
      assert.deepEqual(url("http://127.0.0.1:3000/mcp"), []);
      assert.deepEqual(url("http://[::1]:3000/mcp"), []);
    });

    it("reports a header name that isn't an HTTP token", () => {
      const issues = one({
        type: "streamable-http",
        url: "https://example.com/mcp",
        headers: { "X Tenant": "a" },
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /valid HTTP header name/);
    });

    it("reports a header given twice under different casing", () => {
      const issues = one({
        type: "streamable-http",
        url: "https://example.com/mcp",
        headers: { "X-Tenant": "a", "x-tenant": "b" },
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /X-Tenant/i);
    });
  });

  describe("every skill's frontmatter has name and description", () => {
    it("reports a skill without a name", () => {
      assert.deepEqual(
        issuesFor({ skills: [skill("skills/beta", "description: Beta")] }),
        ['skill "skills/beta": SKILL.md frontmatter has no "name"'],
      );
    });

    it("reports a skill without a description", () => {
      assert.deepEqual(
        issuesFor({ skills: [skill("skills/beta", "name: beta")] }),
        ['skill "skills/beta": SKILL.md frontmatter has no "description"'],
      );
    });

    it("reports a skill with no frontmatter at all, once per field", () => {
      const issues = issuesFor({
        skills: [{ path: "skills/gamma", skillMd: "# Gamma\n" }],
      });
      assert.equal(issues.length, 2);
    });
  });

  it("reports every failing check at once", () => {
    const issues = agentPluginIssues({
      pluginJson: JSON.stringify({ name: "demo" }),
      mcpJson: mcpJson({ s: { command: "server" } }),
      skills: [skill("skills/beta", "name: beta")],
    });
    assert.equal(issues.length, 3);
  });
});
