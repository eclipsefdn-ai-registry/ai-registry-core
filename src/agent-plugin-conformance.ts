import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { readFileSync, readdirSync } from "node:fs";
import { posix } from "node:path";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillFrontmatter } from "./skill-source.js";

// Decides whether a Plugin is an Agent Plugin: whether it conforms to the
// Agent Plugins specification (agent-plugins.org). Pure over the Plugin's file
// contents, so consolidation and vendor validation, which both reach it
// through fetchPluginManifest, report the same messages.
//
// The known specification versions are the schema directories bundled under
// schemas/agent-plugins/. A `$schema` URL is never fetched: a version that
// isn't bundled is unknown, and an unknown version is not an Agent Plugin.

export interface PluginFiles {
  // plugin.json at the plugin root, as text.
  pluginJson: string;
  // mcp.json at the plugin root, as text, or undefined when there is none.
  mcpJson: string | undefined;
  // Each discovered skill: its directory relative to the plugin root (e.g.
  // "skills/alpha") and the text of its SKILL.md.
  skills: { path: string; skillMd: string }[];
}

// --- Bundled schemas ---

interface SpecVersion {
  version: string;
  validatePlugin: ValidateFunction;
  validateMcp: ValidateFunction;
  // Validators for each MCP server variant, keyed by the `type` const that
  // selects it, read from the schema's $defs/server oneOf.
  validateServer: Map<string, ValidateFunction>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "../schemas/agent-plugins");

const ajv = new Ajv2020.default({ allErrors: true });

interface JsonSchema {
  $id: string;
  $defs?: Record<string, JsonSchema>;
  oneOf?: { $ref: string }[];
  properties?: Record<string, { const?: unknown }>;
}

function loadJson(path: string): JsonSchema {
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function loadSpecVersions(): {
  byPluginId: Map<string, SpecVersion>;
  byMcpId: Map<string, SpecVersion>;
} {
  const byPluginId = new Map<string, SpecVersion>();
  const byMcpId = new Map<string, SpecVersion>();
  for (const dirent of readdirSync(SCHEMAS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dir = join(SCHEMAS_DIR, dirent.name);
    const pluginSchema = loadJson(join(dir, "plugin.schema.json"));
    const mcpSchema = loadJson(join(dir, "mcp.schema.json"));
    const validateServer = new Map<string, ValidateFunction>();
    const spec: SpecVersion = {
      version: dirent.name,
      validatePlugin: ajv.compile(pluginSchema),
      validateMcp: ajv.compile(mcpSchema),
      validateServer,
    };
    for (const { $ref } of mcpSchema.$defs?.server?.oneOf ?? []) {
      const defName = $ref.replace("#/$defs/", "");
      const type = mcpSchema.$defs?.[defName]?.properties?.type?.const;
      const validate = ajv.getSchema(`${mcpSchema.$id}${$ref}`);
      if (typeof type === "string" && validate) {
        validateServer.set(type, validate);
      }
    }
    byPluginId.set(pluginSchema.$id, spec);
    byMcpId.set(mcpSchema.$id, spec);
  }
  return { byPluginId, byMcpId };
}

const SPEC_VERSIONS = loadSpecVersions();

// The version a canonical schema identifier names, known or not, so a
// mismatch between plugin.json and mcp.json can be told apart from two
// unknown versions.
function versionInSchemaUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  return /^https:\/\/agent-plugins\.org\/schemas\/([^/]+)\//.exec(url)?.[1];
}

// --- Messages ---

function describeError(error: ErrorObject): string {
  const field = error.instancePath.split("/").filter(Boolean).join(".");
  const where = field ? `field "${field}" ` : "";
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "additionalProperties") {
    return `${where}has unknown field "${String(params.additionalProperty)}"`;
  }
  if (error.keyword === "required") {
    return `${where}is missing required field "${String(params.missingProperty)}"`;
  }
  return `${where}${error.message ?? "is invalid"}`;
}

function schemaIssues(
  file: string,
  spec: SpecVersion,
  errors: ErrorObject[] | null | undefined,
): string[] {
  return (errors ?? []).map(
    (e) =>
      `${file} does not match the Agent Plugins ${spec.version} schema: ${describeError(e)}`,
  );
}

function schemaFieldIssue(file: string, value: unknown): string {
  return value === undefined
    ? `${file} has no "$schema", so it names no Agent Plugins version`
    : `${file} "$schema" names an unknown Agent Plugins version: ${String(value)}`;
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const data: unknown = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// --- plugin.json ---

function pluginJsonIssues(data: Record<string, unknown>): string[] {
  const spec = SPEC_VERSIONS.byPluginId.get(data.$schema as string);
  if (!spec) return [schemaFieldIssue("plugin.json", data.$schema)];
  return spec.validatePlugin(data)
    ? []
    : schemaIssues("plugin.json", spec, spec.validatePlugin.errors);
}

// --- mcp.json ---

// A path that, once `..` segments are resolved, still sits inside the
// directory it started from.
function staysInside(relative: string): boolean {
  const normalized = posix.normalize(relative);
  return normalized !== ".." && !normalized.startsWith("../");
}

// An HTTP field name is a token (RFC 9110 §5.1).
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

// The server-entry requirements of spec §7.2.1 that the schema can't express.
// A server breaking any of them is one clients must skip (§7.2.2).
function serverRuleIssues(server: Record<string, unknown>): string[] {
  const issues: string[] = [];

  if (typeof server.command === "string") {
    const command = server.command;
    if (/\s/.test(command)) {
      issues.push(
        `"command" must be a single executable token, not a shell command line: ${JSON.stringify(command)}`,
      );
    } else if (command.includes("/") || command.includes("\\")) {
      if (!command.startsWith("./")) {
        issues.push(
          `"command" must be a bare executable name or a plugin-relative path beginning with "./": ${JSON.stringify(command)}`,
        );
      } else if (!staysInside(command)) {
        issues.push(
          `"command" leaves the plugin root: ${JSON.stringify(command)}`,
        );
      }
    }
  }

  if (typeof server.cwd === "string") {
    // The schema has already checked cwd starts with one of the three
    // allowed roots; what's left is whether it stays inside that root.
    const rest = server.cwd.replace(/^(\.\/|\$\{PLUGIN_(ROOT|DATA)\}\/?)/, "");
    if (!staysInside(rest || ".")) {
      issues.push(
        `"cwd" leaves the directory it is rooted in: ${JSON.stringify(server.cwd)}`,
      );
    }
  }

  if (typeof server.url === "string") {
    const raw = server.url;
    let url: URL | undefined;
    try {
      url = new URL(raw);
    } catch {
      url = undefined;
    }
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      issues.push(
        `"url" must be an absolute HTTP or HTTPS URL: ${JSON.stringify(raw)}`,
      );
    } else {
      if (url.username || url.password) {
        issues.push(`"url" must not contain user information`);
      }
      if (raw.includes("#")) {
        issues.push(
          `"url" must not contain a fragment: ${JSON.stringify(raw)}`,
        );
      }
      if (url.protocol === "http:" && !LOOPBACK_HOST.test(url.hostname)) {
        issues.push(
          `"url" must use HTTPS for a host other than localhost or a loopback address: ${JSON.stringify(raw)}`,
        );
      }
    }
  }

  if (server.headers && typeof server.headers === "object") {
    const seen = new Map<string, string>();
    for (const name of Object.keys(server.headers)) {
      if (!HEADER_NAME.test(name)) {
        issues.push(
          `"headers" has a name that isn't a valid HTTP header name: ${JSON.stringify(name)}`,
        );
      }
      const key = name.toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push(
          `"headers" names the same header twice under different casing: "${first}" and "${name}"`,
        );
      } else {
        seen.set(key, name);
      }
    }
  }

  return issues;
}

function serverIssues(
  name: string,
  server: unknown,
  spec: SpecVersion,
): string[] {
  const label = `mcp.json server "${name}"`;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    return [`${label} is not an object`];
  }
  const config = server as Record<string, unknown>;
  if (config.type === undefined) return [`${label} declares no "type"`];

  const validate =
    typeof config.type === "string"
      ? spec.validateServer.get(config.type)
      : undefined;
  if (!validate) {
    return [
      `${label} has type ${JSON.stringify(config.type)}, which Agent Plugins ${spec.version} doesn't define`,
    ];
  }
  if (!validate(config)) return schemaIssues(label, spec, validate.errors);
  return serverRuleIssues(config).map((issue) => `${label}: ${issue}`);
}

function mcpJsonIssues(
  data: Record<string, unknown>,
  pluginSchema: unknown,
): string[] {
  const issues: string[] = [];

  const mcpVersion = versionInSchemaUrl(data.$schema);
  const pluginVersion = versionInSchemaUrl(pluginSchema);
  if (mcpVersion && pluginVersion && mcpVersion !== pluginVersion) {
    issues.push(
      `mcp.json targets Agent Plugins ${mcpVersion}, but plugin.json targets ${pluginVersion}`,
    );
  }

  const spec = SPEC_VERSIONS.byMcpId.get(data.$schema as string);
  if (!spec) return [schemaFieldIssue("mcp.json", data.$schema), ...issues];

  // Server entries are checked one by one below, so a broken server gets
  // one message naming it instead of every oneOf branch's complaint.
  if (!spec.validateMcp(data)) {
    const topLevel = (spec.validateMcp.errors ?? []).filter(
      (e) => !e.instancePath.startsWith("/mcpServers/"),
    );
    issues.push(...schemaIssues("mcp.json", spec, topLevel));
  }

  const servers = data.mcpServers;
  if (servers && typeof servers === "object" && !Array.isArray(servers)) {
    for (const [name, server] of Object.entries(servers)) {
      issues.push(...serverIssues(name, server, spec));
    }
  }

  return issues;
}

// --- Skills ---

function skillIssues(skill: PluginFiles["skills"][0]): string[] {
  const { name, description } = parseSkillFrontmatter(skill.skillMd);
  const issues: string[] = [];
  if (!name.trim()) {
    issues.push(`skill "${skill.path}": SKILL.md frontmatter has no "name"`);
  }
  if (!description.trim()) {
    issues.push(
      `skill "${skill.path}": SKILL.md frontmatter has no "description"`,
    );
  }
  return issues;
}

// --- Entry point ---

/**
 * One readable message per conformance failure, empty for an Agent Plugin.
 * Every check runs, so a vendor sees everything to fix at once.
 */
export function agentPluginIssues(files: PluginFiles): string[] {
  const issues: string[] = [];

  const plugin = parseObject(files.pluginJson);
  if (plugin) issues.push(...pluginJsonIssues(plugin));
  else issues.push("plugin.json is not valid JSON");

  if (files.mcpJson !== undefined) {
    const mcp = parseObject(files.mcpJson);
    if (mcp) issues.push(...mcpJsonIssues(mcp, plugin?.$schema));
    else issues.push("mcp.json is not valid JSON");
  }

  for (const skill of files.skills) issues.push(...skillIssues(skill));

  return issues;
}
