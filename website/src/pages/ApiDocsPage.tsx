const BASE_URL = "https://eclipsefdn-ai-registry.github.io/ai-registry-core/";

export function ApiDocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">API Documentation</h1>

      <section className="mb-6">
        <p className="mb-3 leading-relaxed">
          The AI Registry provides a public JSON API. No authentication is
          required.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Base URL</h2>
        <pre className="bg-[#1e293b] text-[#e2e8f0] p-3 rounded-lg overflow-x-auto text-sm leading-relaxed">
          {BASE_URL}api/v1/
        </pre>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Endpoints</h2>
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
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}api/v1/all.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    all.json
                  </code>
                </a>
              </td>
              <td className="py-2">
                Full registry — all organizations, tools, MCP servers, and
                skills with merged approvals from all vendors
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}api/v1/organizations.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    organizations.json
                  </code>
                </a>
              </td>
              <td className="py-2">
                All organizations and their tools (no server or skill data)
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  &lt;tool-id&gt;.json
                </code>
              </td>
              <td className="py-2">
                Per-tool view — only servers and skills approved for that tool,
                with install configs for other tools stripped. Example:{" "}
                <a
                  href={`${BASE_URL}api/v1/theia-ide.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    theia-ide.json
                  </code>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Schemas</h2>
        <p className="mb-3 leading-relaxed">
          These schemas define the format for vendor-submitted data. Vendors use
          them to create organization metadata, MCP server approvals, and skill
          approvals in their repositories.
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
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}schemas/organization.schema.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    organization.schema.json
                  </code>
                </a>
              </td>
              <td className="py-2">Vendor organization metadata</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}schemas/mcp-approval.schema.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    mcp-approval.schema.json
                  </code>
                </a>
              </td>
              <td className="py-2">MCP server approval file</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3">
                <a
                  href={`${BASE_URL}schemas/skill-approval.schema.json`}
                  className="text-primary hover:underline"
                >
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    skill-approval.schema.json
                  </code>
                </a>
              </td>
              <td className="py-2">Agent Skill approval file</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Usage</h2>
        <p className="mb-3 leading-relaxed">
          A tool integration typically fetches{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
            organizations.json
          </code>{" "}
          plus its own{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
            &lt;tool-id&gt;.json
          </code>{" "}
          to display approved MCP servers and skills for that tool.
        </p>
        <p className="mb-3 leading-relaxed">
          The registry data is updated whenever a vendor updates their
          approvals, and periodically refreshed from the{" "}
          <a
            href="https://registry.modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Anthropic MCP registry
          </a>{" "}
          for server metadata.
        </p>
      </section>
    </div>
  );
}
