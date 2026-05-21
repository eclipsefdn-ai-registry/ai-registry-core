import { Link } from "react-router-dom";

export function AboutPage() {
  return (
    <div className="page-content">
      <h1>About the AI Registry</h1>

      <section>
        <p>
          The AI Registry is a vendor-neutral, federated trust registry for AI
          artifacts, hosted at the Eclipse Foundation. It currently tracks
          approvals for{" "}
          <a
            href="https://modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Model Context Protocol (MCP)
          </a>{" "}
          servers, with support for additional artifact types planned for the
          future.
        </p>
        <p>
          Tool vendors maintain their own repositories with approval files for
          the AI artifacts they endorse. The central registry consolidates,
          validates, and enriches this data — making it available as a public
          API and this website.
        </p>
      </section>

      <section>
        <h2>Preview</h2>
        <p>
          This registry is currently in <strong>preview</strong>. Data, APIs,
          and the website may change as we iterate on the concept. Feedback is
          welcome.
        </p>
      </section>

      <section>
        <h2>Links</h2>
        <ul>
          <li>
            <a
              href="https://github.com/eclipsefdn-ai-registry/ai-registry-core"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>
          </li>
          <li>
            <a
              href="https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report an issue or give feedback
            </a>
          </li>
          <li>
            <Link to="/api-docs">API documentation</Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>Legal</h2>
        <p>
          The AI Registry is operated by the{" "}
          <a
            href="https://www.eclipse.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Eclipse Foundation AISBL
          </a>
          , a Belgian International Not-for-Profit Association (AISBL/IVZW).
        </p>
        <table className="legal-table">
          <tbody>
            <tr>
              <td>Headquarters</td>
              <td>
                Eclipse Foundation AISBL, Rond Point Schuman 11, Brussels 1040,
                Belgium
              </td>
            </tr>
            <tr>
              <td>License</td>
              <td>
                <a
                  href="https://www.eclipse.org/legal/epl-2.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Eclipse Public License v. 2.0
                </a>
              </td>
            </tr>
            <tr>
              <td>Legal &amp; Contact</td>
              <td>
                <a
                  href="https://www.eclipse.org/legal/compliance/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Compliance &amp; contact details
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
