import { Link } from "react-router-dom";

export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">About the AI Registry</h1>

      <section className="mb-6">
        <p className="mb-3 leading-relaxed text-card-foreground">
          The AI Registry is a vendor-neutral, federated trust registry for AI
          artifacts, hosted at the Eclipse Foundation. It currently tracks
          approvals for{" "}
          <a
            href="https://modelcontextprotocol.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Model Context Protocol (MCP)
          </a>{" "}
          servers and{" "}
          <a
            href="https://agentskills.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Agent Skills
          </a>
          , with support for additional artifact types planned for the future.
        </p>
        <p className="mb-3 leading-relaxed text-card-foreground">
          Tool vendors maintain their own repositories with approval files for
          the AI artifacts they endorse. The central registry consolidates,
          validates, and enriches this data — making it available as a public
          API and this website.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Preview</h2>
        <p className="mb-3 leading-relaxed text-card-foreground">
          This registry is currently in <strong>preview</strong>. Data, APIs,
          and the website may change as we iterate on the concept. Feedback is
          welcome.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Links</h2>
        <ul className="list-disc ml-6 mb-3 space-y-1">
          <li>
            <a
              href="https://github.com/eclipsefdn-ai-registry/ai-registry-core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              GitHub repository
            </a>
          </li>
          <li>
            <a
              href="https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Report an issue or give feedback
            </a>
          </li>
          <li>
            <Link to="/api-docs" className="text-primary hover:underline">
              API documentation
            </Link>
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Legal</h2>
        <p className="mb-3 leading-relaxed text-card-foreground">
          The AI Registry is operated by the{" "}
          <a
            href="https://www.eclipse.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Eclipse Foundation AISBL
          </a>
          , a Belgian International Not-for-Profit Association (AISBL/IVZW).
        </p>
        <table className="w-full text-sm mt-3">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap w-36">
                Headquarters
              </td>
              <td className="py-2">
                Eclipse Foundation AISBL, Rond Point Schuman 11, Brussels 1040,
                Belgium
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap w-36">
                License
              </td>
              <td className="py-2">
                <a
                  href="https://www.eclipse.org/legal/epl-2.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Eclipse Public License v. 2.0
                </a>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap w-36">
                Legal &amp; Contact
              </td>
              <td className="py-2">
                <a
                  href="https://www.eclipse.org/legal/compliance/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
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
