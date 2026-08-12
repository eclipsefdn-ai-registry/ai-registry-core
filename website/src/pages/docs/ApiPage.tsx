import { Link } from "react-router-dom";
import { ApiPreviewNotice } from "../../components/ApiPreviewNotice";
import { DocsSection } from "../../components/docs/DocsSection";
import { CodeBlock, FieldTable, InlineCode } from "../../components/docs/Code";

const BASE_URL = "https://ai.open-vsx.org/";

const APPROVAL_FIELDS = [
  {
    name: "organizationId",
    type: "string",
    description: "The organization that approved the artifact.",
  },
  {
    name: "date",
    type: "string",
    description: "ISO date of the approval.",
  },
  {
    name: "configHash",
    type: "string",
    description:
      "Hash of the approval, recomputed whenever the approval changes. Drives update detection.",
  },
  {
    name: "installConfigs",
    type: "array",
    description:
      "Tool-specific install configuration. Empty when the organization approved without configuring anything.",
  },
  {
    name: "version",
    type: "string?",
    description: "Pinned MCP server version. Absent means latest.",
  },
  {
    name: "viaTrust",
    type: "string?",
    description:
      "Present when the approval is derived from trusting another organization; names the trusted organization.",
  },
];

export function ApiPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">API</h1>

      <div className="mb-8">
        <ApiPreviewNotice />
      </div>

      <p className="mb-3 leading-relaxed">
        The registry is served as static JSON. No authentication, no rate
        limits, and no query parameters. Every endpoint is a whole document you
        fetch and cache.
      </p>

      <CodeBlock>{BASE_URL}api/v1/</CodeBlock>

      <DocsSection id="endpoints">
        <table className="w-full text-sm mt-3">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 border-b-2 border-border font-semibold">
                Endpoint
              </th>
              <th className="text-left py-2 border-b-2 border-border font-semibold">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border align-top">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}api/v1/all.json`}
                  className="text-primary hover:underline"
                >
                  <InlineCode>all.json</InlineCode>
                </a>
              </td>
              <td className="py-2">
                Every organization, tool, MCP server, skill, and plugin, with
                approvals merged across all vendors.
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}api/v1/organizations.json`}
                  className="text-primary hover:underline"
                >
                  <InlineCode>organizations.json</InlineCode>
                </a>
              </td>
              <td className="py-2">
                Organizations and their tools. Needed to turn an{" "}
                <InlineCode>organizationId</InlineCode> into a name a user can
                recognise.
              </td>
            </tr>
            <tr className="border-b border-border align-top">
              <td className="py-2 pr-3">
                <InlineCode>tools/&lt;tool-id&gt;.json</InlineCode>
              </td>
              <td className="py-2">
                Artifacts approved for one tool, with other tools' install
                configs stripped. Example:{" "}
                <a
                  href={`${BASE_URL}api/v1/tools/theia-ide.json`}
                  className="text-primary hover:underline"
                >
                  <InlineCode>theia-ide.json</InlineCode>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 mb-3 leading-relaxed">
          A tool integration fetches <InlineCode>organizations.json</InlineCode>{" "}
          plus its own <InlineCode>tools/&lt;tool-id&gt;.json</InlineCode>. See{" "}
          <Link to="/docs/clients" className="text-primary hover:underline">
            Clients
          </Link>{" "}
          for what to do with them.
        </p>
      </DocsSection>

      <DocsSection id="response-shapes">
        <p className="mb-3 leading-relaxed">
          Every endpoint returns an object with the same five top-level keys.
          The per-tool view carries the same shapes as{" "}
          <InlineCode>all.json</InlineCode>, filtered.
        </p>
        <CodeBlock>{`{
  "organizations": [ ... ],
  "tools": [ ... ],
  "mcp": [ ... ],
  "skills": [ ... ],
  "plugins": [ ... ]
}`}</CodeBlock>
        <p className="mb-3 leading-relaxed">
          These shapes are produced by consolidation and differ from the
          approval files vendors write. Fields such as{" "}
          <InlineCode>approvals</InlineCode>,{" "}
          <InlineCode>contentHash</InlineCode>, and{" "}
          <InlineCode>containedSkills</InlineCode> exist only in the output.
        </p>

        <FieldTable
          caption="organizations[]"
          fields={[
            { name: "id", type: "string", description: "Organization id." },
            { name: "name", type: "string", description: "Display name." },
            {
              name: "description",
              type: "string",
              description: "Short description.",
            },
            { name: "website", type: "string", description: "Homepage URL." },
            {
              name: "color",
              type: "string?",
              description: "Brand colour, for badges and accents.",
            },
            {
              name: "inferred",
              type: "boolean?",
              description:
                "True for organizations pre-seeded from a public source rather than participating directly.",
            },
          ]}
        />

        <FieldTable
          caption="tools[]"
          fields={[
            { name: "id", type: "string", description: "Tool id." },
            { name: "name", type: "string", description: "Display name." },
            {
              name: "organizationId",
              type: "string",
              description: "Organization providing the tool.",
            },
          ]}
        />

        <FieldTable
          caption="mcp[]"
          fields={[
            {
              name: "serverId",
              type: "string",
              description: "Server id, matching the Anthropic MCP registry.",
            },
            { name: "name", type: "string", description: "Display name." },
            {
              name: "description",
              type: "string",
              description: "Short description.",
            },
            {
              name: "latestVersion",
              type: "string?",
              description:
                "Latest version known to the Anthropic MCP registry.",
            },
            {
              name: "mcpRegistryVerified",
              type: "boolean",
              description:
                "True when the server is listed in the Anthropic MCP registry. Says nothing about its behaviour.",
            },
            {
              name: "publisherClaimedBy",
              type: "string?",
              description:
                "Organization claiming to publish the server, not merely to approve it.",
            },
            {
              name: "approvals",
              type: "array",
              description: "One entry per approving organization.",
            },
          ]}
        />

        <FieldTable
          caption="skills[]"
          fields={[
            { name: "skillId", type: "string", description: "Skill id." },
            {
              name: "name",
              type: "string",
              description: "Name from the SKILL.md frontmatter.",
            },
            {
              name: "description",
              type: "string",
              description: "Description from the SKILL.md frontmatter.",
            },
            {
              name: "source",
              type: "object",
              description:
                "Git repository URL and optional path to the skill folder. No commit pin.",
            },
            {
              name: "contentHash",
              type: "string",
              description:
                "Hash of the skill folder as of the last consolidation run.",
            },
            {
              name: "approvals",
              type: "array",
              description: "One entry per approving organization.",
            },
          ]}
        />

        <FieldTable
          caption="plugins[]"
          fields={[
            { name: "pluginId", type: "string", description: "Plugin id." },
            {
              name: "name",
              type: "string",
              description: "Name from plugin.json.",
            },
            {
              name: "description",
              type: "string",
              description: "Description from plugin.json.",
            },
            {
              name: "version",
              type: "string?",
              description: "Version from plugin.json.",
            },
            {
              name: "author",
              type: "string?",
              description: "Author from plugin.json.",
            },
            {
              name: "homepage",
              type: "string?",
              description: "Homepage from plugin.json.",
            },
            {
              name: "keywords",
              type: "string[]?",
              description: "Keywords from plugin.json.",
            },
            {
              name: "source",
              type: "object",
              description:
                "Git repository URL and optional path to the directory holding plugin.json.",
            },
            {
              name: "contentHash",
              type: "string",
              description: "Hash of the whole plugin directory.",
            },
            {
              name: "containedSkills",
              type: "array",
              description:
                "Skills found under skills/*/SKILL.md, each with name, description, and path. Read-only metadata; no standalone skill entries are created.",
            },
            {
              name: "containedMcpServers",
              type: "array",
              description:
                "Servers declared in mcp.json, each with name and transport. Transport is empty when the entry declares no type.",
            },
            {
              name: "approvals",
              type: "array",
              description: "One entry per approving organization.",
            },
          ]}
        />

        <FieldTable caption="approvals[]" fields={APPROVAL_FIELDS} />

        <FieldTable
          caption="approvals[].installConfigs[]"
          fields={[
            {
              name: "tool",
              type: "string",
              description: "Tool this config targets.",
            },
            {
              name: "installUrl",
              type: "string?",
              description:
                "Deep link for one-click install, in the tool's own URL scheme.",
            },
            {
              name: "openVsxUrl",
              type: "string?",
              description: "Related Open VSX extension, where one exists.",
            },
            {
              name: "config",
              type: "object?",
              description:
                "Tool-specific configuration. For MCP servers this holds a servers map keyed by local server name.",
            },
            {
              name: "instructions",
              type: "string?",
              description: "Human-readable setup notes.",
            },
          ]}
        />
      </DocsSection>

      <DocsSection id="schemas">
        <p className="mb-3 leading-relaxed">
          These schemas describe the approval files vendors write, not the API
          responses above. Consolidation reads them, enriches them, and emits
          the response shapes.
        </p>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 border-b-2 border-border font-semibold">
                Schema
              </th>
              <th className="text-left py-2 border-b-2 border-border font-semibold">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ["organization.schema.json", "Vendor organization metadata"],
              ["mcp-approval.schema.json", "MCP server approval file"],
              ["skill-approval.schema.json", "Agent Skill approval file"],
              [
                "plugin-approval.schema.json",
                "Agent Plugin (agent-plugins.org) approval file",
              ],
            ].map(([file, description]) => (
              <tr key={file} className="border-b border-border align-top">
                <td className="py-2 pr-3">
                  <a
                    href={`${BASE_URL}schemas/${file}`}
                    className="text-primary hover:underline"
                  >
                    <InlineCode>{file}</InlineCode>
                  </a>
                </td>
                <td className="py-2">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocsSection>

      <DocsSection id="stability">
        <p className="mb-3 leading-relaxed">
          Registry data is rebuilt whenever a vendor updates their approvals,
          and daily to pick up changes in{" "}
          <a
            href="https://registry.modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Anthropic MCP registry
          </a>{" "}
          metadata and in skill and plugin sources.
        </p>
        <p className="mb-3 leading-relaxed">
          The API is versioned by path. New fields and new top-level keys can
          appear within <InlineCode>v1</InlineCode>, so ignore what you do not
          recognise rather than rejecting the document.
        </p>
        <p className="mb-3 leading-relaxed">
          A build only deploys if collection and MCP enrichment succeed, so a
          failed run leaves the previous data live. Skills and plugins whose
          sources were unreachable are omitted from that build and return when
          their source does. An entry disappearing is not the same as an
          approval being withdrawn.
        </p>
      </DocsSection>
    </div>
  );
}
