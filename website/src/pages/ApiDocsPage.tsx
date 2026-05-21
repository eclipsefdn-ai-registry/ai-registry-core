const BASE_URL = "https://eclipsefdn-ai-registry.github.io/ai-registry-core/";

export function ApiDocsPage() {
  return (
    <div className="page-content">
      <h1>API Documentation</h1>

      <section>
        <p>
          The AI Registry provides a public JSON API. No authentication is
          required.
        </p>
      </section>

      <section>
        <h2>Base URL</h2>
        <pre className="code-block">{BASE_URL}api/v1/</pre>
      </section>

      <section>
        <h2>Endpoints</h2>
        <table className="api-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a href={`${BASE_URL}api/v1/all.json`}>
                  <code>all.json</code>
                </a>
              </td>
              <td>
                Full registry — all organizations, tools, and MCP servers with
                merged approvals from all vendors
              </td>
            </tr>
            <tr>
              <td>
                <a href={`${BASE_URL}api/v1/organizations.json`}>
                  <code>organizations.json</code>
                </a>
              </td>
              <td>All organizations and their tools (no MCP server data)</td>
            </tr>
            <tr>
              <td>
                <code>&lt;tool-id&gt;.json</code>
              </td>
              <td>
                Per-tool view — only servers approved for that tool, with
                install configs for other tools stripped. Example:{" "}
                <a href={`${BASE_URL}api/v1/theia-ide.json`}>
                  <code>theia-ide.json</code>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Schemas</h2>
        <p>
          These schemas define the format for vendor-submitted data. Vendors use
          them to create organization metadata and MCP server approval files in
          their repositories.
        </p>
        <table className="api-table">
          <thead>
            <tr>
              <th>Schema</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a href={`${BASE_URL}schemas/organization.schema.json`}>
                  <code>organization.schema.json</code>
                </a>
              </td>
              <td>Vendor organization metadata</td>
            </tr>
            <tr>
              <td>
                <a href={`${BASE_URL}schemas/mcp-approval.schema.json`}>
                  <code>mcp-approval.schema.json</code>
                </a>
              </td>
              <td>MCP server approval file</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Usage</h2>
        <p>
          A tool integration typically fetches <code>organizations.json</code>{" "}
          plus its own <code>&lt;tool-id&gt;.json</code> to display approved MCP
          servers for that tool.
        </p>
        <p>
          The registry data is updated whenever a vendor updates their
          approvals, and periodically refreshed from the{" "}
          <a
            href="https://registry.modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Anthropic MCP registry
          </a>{" "}
          for server metadata.
        </p>
      </section>
    </div>
  );
}
