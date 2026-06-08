export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Terms of Use</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Last updated: May 2026
      </p>

      <section className="mb-6">
        <p className="mb-3 leading-relaxed">
          This website and the services provided by this website (collectively,
          "Website") and its Content (as defined hereunder) are a service
          provided by the Eclipse Foundation AISBL ("Eclipse Foundation"). As
          used herein, the terms "you" and "your" means the individual accessing
          this Website. By accessing, browsing, or using this Website, you
          acknowledge that you have read, understand, and agree to be bound by
          these terms.
        </p>
      </section>

      <section className="mb-6">
        <p className="mb-3 leading-relaxed">
          All data, metadata, links, and other materials provided on and through
          this Website ("Content") may be used solely under the following terms
          and conditions ("Terms of Use").
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">
          Nature of the Registry
        </h2>
        <p className="mb-3 leading-relaxed">
          The AI Registry is a trust and approval registry. It aggregates and
          displays vendor approval data for AI artifacts, currently Model
          Context Protocol (MCP) servers and in the future additional artifact
          types. The Registry links to artifacts hosted by third parties — it
          does not host, distribute, or store the artifacts themselves.
        </p>
        <p className="mb-3 leading-relaxed">
          The approval data is contributed by third-party organizations ("Vendor
          Organizations") that independently evaluate and endorse artifacts for
          use with their tools.
        </p>
        <p className="mb-3 leading-relaxed">
          The Eclipse Foundation does not independently verify, test, or
          endorse, monitor, or continuously review the security, functionality,
          legality, or compliance of the artifacts referenced in the Registry
          beyond aggregating and displaying vendor approval data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Third-Party Content</h2>
        <p className="mb-3 leading-relaxed">
          This Website makes available Content from entities other than the
          Eclipse Foundation ("Third Party Organizations"), including approval
          data, metadata, and links to external artifacts. It is your
          responsibility when accessing and using any Content or following any
          links to comply with terms and licenses associated with that Content.
          The Eclipse Foundation assumes no responsibility with respect to the
          collection or protection of your personally identifiable information
          by Third Party Organizations or the providers of the artifacts
          referenced in this Registry.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Modifications</h2>
        <p className="mb-3 leading-relaxed">
          The Eclipse Foundation may remove, update, or modify Content from this
          Website at any time without notice.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">No Warranties</h2>
        <p className="mb-3 leading-relaxed">
          Neither the Eclipse Foundation nor its agents, affiliates, and members
          (collectively, "Members") assume any responsibility regarding the
          Content nor the availability of such Content. The access and use of
          any Content is solely at your own risk. Neither the Eclipse Foundation
          nor its Members provide any assurances that any reported problems with
          any Content will be resolved.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">
          Intellectual Property
        </h2>
        <p className="mb-3 leading-relaxed">
          By making the Content available for access by you on this Website,
          neither the Eclipse Foundation nor the Members grant any licenses to
          any copyrights, patents, or any other intellectual property rights in
          the Content or any other materials.
        </p>
        <p className="mb-3 leading-relaxed">
          All logos and trademarks contained on this Website are and remain the
          property of their respective owners. No licenses or other rights in or
          to such logos and/or trademarks are granted to you.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Feedback</h2>
        <p className="mb-3 leading-relaxed">
          If you wish to provide any feedback regarding this Website or its
          Content, please create an issue at{" "}
          <a
            href="https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            github.com/eclipsefdn-ai-registry/ai-registry-core/issues
          </a>
          . If you believe that Content residing or accessible on or through
          this Website infringes a copyright, please send a notice of copyright
          infringement to{" "}
          <a
            href="mailto:license@eclipse.org"
            className="text-primary hover:underline"
          >
            license@eclipse.org
          </a>
          .
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Disclaimers</h2>
        <p className="mb-3 text-xs leading-relaxed">
          ALL CONTENT ON THIS WEBSITE IS MADE AVAILABLE ON AN "AS IS" BASIS
          ONLY. TO THE EXTENT PERMITTED BY LAW, THE ECLIPSE FOUNDATION AND ITS
          MEMBERS MAKE NO REPRESENTATIONS OR WARRANTIES ABOUT THE CONTENT, AND
          DISCLAIM ALL REPRESENTATIONS AND WARRANTIES, EXPRESS OR IMPLIED, ABOUT
          THE CONTENT, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF
          FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY AND
          NON-INFRINGEMENT. THE ECLIPSE FOUNDATION MAKES NO REPRESENTATIONS OR
          WARRANTIES ABOUT THE SECURITY OF ANY INFORMATION OR MATERIAL USED,
          STORED OR PROCESSED BY ANY CONTENT AVAILABLE THROUGH THIS WEBSITE.
        </p>
        <p className="mb-3 leading-relaxed">
          The Eclipse Foundation and the Members make no representations
          whatsoever about any third-party artifact that may be accessed through
          links on this Website. When you access a non-Eclipse Foundation
          website, please understand that it is independent from the Eclipse
          Foundation, and that the Eclipse Foundation and the Members have no
          control over the content on such website.
        </p>
        <p className="mb-3 text-xs leading-relaxed">
          TO THE EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE ECLIPSE
          FOUNDATION AND/OR THE MEMBERS BE LIABLE TO YOU OR ANY OTHER INDIVIDUAL
          OR ENTITY FOR ANY INDIRECT, INCIDENTAL, PUNITIVE, SPECIAL OR
          CONSEQUENTIAL DAMAGES RELATED TO ANY USE OF THIS WEBSITE, THE CONTENT,
          OR ANY OTHER LINKED WEBSITE, INCLUDING, WITHOUT LIMITATION, ANY LOST
          PROFITS, LOST SALES, LOST REVENUE, LOSS OF GOODWILL, BUSINESS
          INTERRUPTION, OR LOSS OF PROGRAMS OR OTHER DATA, EVEN IF THE ECLIPSE
          FOUNDATION OR THE MEMBERS ARE EXPRESSLY ADVISED OR AWARE OF THE
          POSSIBILITY OF SUCH DAMAGES OR LOSSES. IN ANY EVENT, AND TO THE EXTENT
          PERMITTED BY LAW, THE COLLECTIVE LIABILITY OF THE ECLIPSE FOUNDATION
          AND ITS MEMBERS ARISING FROM USE OF THIS WEBSITE OR ANY CONTENT
          ASSOCIATED WITH THIS WEBSITE SHALL NOT EXCEED FIVE EUROS.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mt-8 mb-3">Governing Law</h2>
        <p className="mb-3 leading-relaxed">
          Any dispute arising out of or in relation with the use of this Website
          shall be construed and governed by the laws of Belgium without
          reference to conflict of laws principles. Both you and the Eclipse
          Foundation irrevocably agree that the Courts of the judicial district
          of Brussels, Belgium, shall have exclusive jurisdiction to settle any
          dispute or claim.
        </p>
      </section>
    </div>
  );
}
