import { Link } from "react-router-dom";
import { ApiPreviewNotice } from "../components/ApiPreviewNotice";
import { InlineCode } from "../components/docs/Code";

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
          servers,{" "}
          <a
            href="https://agentskills.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Agent Skills
          </a>
          ,{" "}
          <a
            href="https://agent-plugins.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Agent Plugins
          </a>
          , and{" "}
          <a
            href="https://a2a-protocol.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            A2A agents
          </a>
          , and{" "}
          <a
            href="https://enclave.eclipse.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            sandbox extensions
          </a>
          , with support for additional artifact types planned for the future.
        </p>
        <p className="mb-3 leading-relaxed text-card-foreground">
          Organizations maintain their own repositories with approval files for
          the AI artifacts they endorse. The central registry consolidates,
          validates, and enriches this data — making it available as a public
          API and this website.
        </p>
      </section>

      <section className="mb-6">
        <ApiPreviewNotice linkToApiDocs />
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Ways to participate</h2>
        <p className="mb-3 leading-relaxed text-card-foreground">
          Every participating organization files the same thing: an{" "}
          <InlineCode>organization.json</InlineCode> plus approval files for the
          artifacts it stands behind. What differs is why. All three of these
          are first-class uses of the registry.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Provide a tool</h3>
        <p className="mb-3 leading-relaxed text-card-foreground">
          Declare your tools and give each approval an install configuration.
          Your tool then reads its own feed at{" "}
          <InlineCode>tools/&lt;tool-id&gt;.json</InlineCode> and offers users
          exactly what you approved, ready to install.
        </p>
        <h3 className="font-semibold mt-5 mb-2">
          Publish a whitelist for your organization
        </h3>
        <p className="mb-3 leading-relaxed text-card-foreground">
          You do not need a tool of your own. Approve the artifacts you have
          vetted and the registry publishes them at{" "}
          <InlineCode>orgs/&lt;org-id&gt;.json</InlineCode> and on your
          organization page — a list your people, and any client you point at
          it, can rely on. The <InlineCode>tools</InlineCode> array is optional,
          and leaving it out is a supported choice rather than a workaround.
          Bear in mind that everything in the registry is public, so a list you
          curate for internal use is published to everyone.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Publish your own artifacts</h3>
        <p className="mb-3 leading-relaxed text-card-foreground">
          If you build MCP servers, skills, plugins, agents, or sandbox
          extensions, approving them here lists them with their provenance and
          their source attached to your organization. This takes the same shape
          as a whitelist: no tools, no install configuration needed.
        </p>
        <p className="mb-3 leading-relaxed text-card-foreground">
          Ready to register? See{" "}
          <a
            href="https://github.com/eclipsefdn-ai-registry/ai-registry-core#registering-an-organization"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Registering an organization
          </a>{" "}
          in the project README for the step-by-step process. For anything else
          — adapting the registry for your tool, or a question the README does
          not answer — please{" "}
          <a
            href="https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            open an issue
          </a>{" "}
          on our GitHub repository. We will guide you through the process.
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
            <Link to="/docs/api" className="text-primary hover:underline">
              API documentation
            </Link>
          </li>
          <li>
            <Link to="/docs/clients" className="text-primary hover:underline">
              Implement an AI Registry client
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
