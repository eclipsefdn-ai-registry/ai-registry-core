import { Link } from "react-router-dom";
import { InfoCallout } from "../../components/InfoCallout";
import { ApiPreviewNotice } from "../../components/ApiPreviewNotice";
import { DocsSection } from "../../components/docs/DocsSection";
import { CodeBlock, InlineCode } from "../../components/docs/Code";

const SKILL_URL =
  "https://github.com/eclipsefdn-ai-registry/ai-registry-core/tree/main/skills/implement-registry-client";

/**
 * Tickable checklist. The boxes are real inputs so a reader can work through
 * them while implementing; nothing persists the state, which is fine for a
 * scratch pass over a page.
 */
function Checklist({
  title,
  idPrefix,
  items,
}: {
  title: string;
  idPrefix: string;
  items: string[];
}) {
  return (
    <div className="mb-5">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, index) => {
          const id = `${idPrefix}-${index}`;
          return (
            <li key={item} className="flex gap-2">
              <input
                type="checkbox"
                id={id}
                className="mt-1 h-3.5 w-3.5 flex-shrink-0 accent-primary"
              />
              <label htmlFor={id} className="leading-relaxed">
                {item}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ClientsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Implement an AI Registry client
      </h1>

      <div className="mb-8">
        <ApiPreviewNotice />
      </div>

      <p className="mb-3 leading-relaxed">
        A client reads the registry, shows users which artifacts their
        organizations approved, and installs them. Implement any subset of the
        three artifact types.
      </p>
      <p className="mb-3 leading-relaxed">
        The same guidance is packaged as an agent skill,{" "}
        <a
          href={SKILL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          implement-registry-client
        </a>
        , if you want to hand it to a coding agent.
      </p>

      <DocsSection id="what-it-vouches-for">
        <p className="mb-3 leading-relaxed">
          The registry records that a named organization approved an artifact on
          a date. That is the whole claim. It does not test, audit, sandbox, or
          certify anything.
        </p>
        <p className="mb-3 leading-relaxed">
          Approval is per organization, not a registry-wide certification. A
          client can present its per-tool list as its own and never name another
          organization, or it can show the approval chain behind each artifact.
          Both are valid; the second gives the user something to evaluate.
        </p>
        <ul className="mb-3 space-y-2 text-sm list-disc pl-5">
          <li className="leading-relaxed">
            MCP servers are described by configuration, not by content. The
            registry publishes the command or URL to run. Nothing covers the
            server's code, and that code can change under a stable command at
            any time.
          </li>
          <li className="leading-relaxed">
            Skills and plugins carry a content hash of their source as of the
            last consolidation run. Sources are referenced by repository URL and
            path with no commit pin, so the hash is the only pin available.
          </li>
          <li className="leading-relaxed">
            Withdrawing an approval removes the entry from the feed, but so does
            a source that was briefly unreachable when consolidation ran.
            Nothing in the data separates the two, so there is no revocation
            signal a client can act on.
          </li>
        </ul>
      </DocsSection>

      <DocsSection id="the-data">
        <p className="mb-3 leading-relaxed">
          <InlineCode>tools/&lt;tool-id&gt;.json</InlineCode> is all you need to
          browse and install. Add <InlineCode>organizations.json</InlineCode> if
          you want to name the approving organizations, since the per-tool view
          carries <InlineCode>organizationId</InlineCode> strings and nothing
          else about them. Field reference lives on the{" "}
          <Link to="/docs/api" className="text-primary hover:underline">
            API page
          </Link>
          .
        </p>
        <p className="mb-3 leading-relaxed">
          Use <InlineCode>all.json</InlineCode> when your tool has no registered
          tool id yet. It includes install configs aimed at other tools, so
          treat it as a browsing view rather than an install source.
        </p>
        <InfoCallout>
          <strong>The base URL and tool id are product configuration.</strong>{" "}
          Both decide who the user trusts. A user who can point the tool at
          another registry can change their trust anchor without seeing that as
          the decision it is.
        </InfoCallout>
        <p className="mt-3 mb-3 leading-relaxed">
          Fetch on startup, cache in memory, and refetch when the user asks or
          before an update check. A fetch that fails leaves the previous state
          intact, because failure to reach the registry is not evidence that
          anything changed. Keep an empty response and a failed request
          distinct, because they mean opposite things.
        </p>
      </DocsSection>

      <DocsSection id="core">
        <p className="mb-3 leading-relaxed">
          Every artifact type follows the same five steps.
        </p>
        <p className="mb-3 leading-relaxed">
          <strong>1. Read the entries you handle.</strong> Top-level keys are{" "}
          <InlineCode>organizations</InlineCode>, <InlineCode>tools</InlineCode>
          , <InlineCode>mcp</InlineCode>, <InlineCode>skills</InlineCode>, and{" "}
          <InlineCode>plugins</InlineCode>. New keys may appear.
        </p>
        <p className="mb-3 leading-relaxed">
          <strong>2. Resolve approvals.</strong> Each entry carries an{" "}
          <InlineCode>approvals</InlineCode> array, one element per approving
          organization. Keep every <InlineCode>organizationId</InlineCode>. Pick
          one <InlineCode>installConfig</InlineCode> to install from, sorting by{" "}
          <InlineCode>date</InlineCode> descending with{" "}
          <InlineCode>organizationId</InlineCode> ascending as the tie-break, so
          two clients given the same feed reach the same result.
        </p>
        <CodeBlock>{`{
  "serverId": "io.github.ChromeDevTools/chrome-devtools-mcp",
  "name": "Chrome DevTools",
  "mcpRegistryVerified": true,
  "approvals": [
    {
      "organizationId": "example-org",
      "date": "2026-05-12",
      "configHash": "a3f19c284b7e",
      "installConfigs": [
        {
          "tool": "example-tool",
          "config": {
            "servers": {
              "chrome-devtools": {
                "command": "npx",
                "args": ["-y", "chrome-devtools-mcp@latest"]
              }
            }
          }
        }
      ]
    }
  ]
}`}</CodeBlock>
        <p className="mb-3 leading-relaxed">
          <InlineCode>viaTrust</InlineCode> means the organization approved by
          trusting another organization rather than by filing its own approval.
          Attribute it to the organization in{" "}
          <InlineCode>organizationId</InlineCode>, and mention the delegation if
          you show approval detail.
        </p>
        <p className="mb-3 leading-relaxed">
          <strong>3. Decide how much of the approval chain to show.</strong>{" "}
          Presence in your per-tool view already means approved for your tool,
          so a list with no organization names is a legitimate client. If you do
          show them, show all of them rather than only the one whose config you
          picked, since several organizations approving the same artifact is a
          signal that disappears when it collapses to one name.
        </p>
        <p className="mb-3 leading-relaxed">
          <strong>4. Install.</strong> What that means depends on the type.
        </p>
        <p className="mb-3 leading-relaxed">
          <strong>5. Record provenance.</strong> Write a marker alongside every
          artifact you install, recording at minimum the registry id it came
          from and the hash you recorded at install time.
        </p>
        <InfoCallout>
          <strong>
            You must be able to tell an artifact you installed from one the user
            placed there, and never overwrite the latter.
          </strong>{" "}
          Adoption, update detection, drift detection, and safe uninstall all
          depend on it, and it cannot be added retroactively, because after the
          fact there is no way to tell which artifacts were yours.
        </InfoCallout>
        <p className="mt-3 mb-3 leading-relaxed">
          When the local slot is already occupied by something you did not
          install, offer to adopt it. Write your provenance marker without
          touching its content, rather than replacing it.
        </p>
      </DocsSection>

      <DocsSection id="mcp-servers">
        <p className="mb-3 leading-relaxed">
          The registry publishes configuration. Install means writing that
          configuration wherever your tool keeps MCP server definitions.
        </p>
        <ul className="mb-3 space-y-2 text-sm list-disc pl-5">
          <li className="leading-relaxed">
            The key inside <InlineCode>config.servers</InlineCode> is the local
            name, chosen by the organization that filed the approval. Use it as
            the artifact's local identity. It can collide with a server the user
            configured by hand, which is what the adoption path is for.
          </li>
          <li className="leading-relaxed">
            <InlineCode>config.servers</InlineCode> may hold more than one
            entry. Install all of them or install none. Picking one silently
            gives the user a partial server set with no indication anything is
            missing.
          </li>
          <li className="leading-relaxed">
            <InlineCode>mcpRegistryVerified</InlineCode> means the server is
            listed in the Anthropic MCP registry. It says nothing about the
            server's behaviour or safety.
          </li>
          <li className="leading-relaxed">
            <InlineCode>publisherClaimedBy</InlineCode> names an organization
            claiming to publish the server, not merely to approve it. Show it
            distinctly from approval if you show it at all.
          </li>
          <li className="leading-relaxed">
            Content hashing does not apply. <InlineCode>configHash</InlineCode>{" "}
            covers the approval, and update detection uses it.
          </li>
        </ul>
      </DocsSection>

      <DocsSection id="agent-skills">
        <p className="mb-3 leading-relaxed">
          The registry points at a skill's source; it does not host it. Install
          means downloading <InlineCode>source.path</InlineCode> from{" "}
          <InlineCode>source.url</InlineCode> into wherever your tool keeps
          skills.
        </p>
        <InfoCallout>
          <strong>
            Verify what you downloaded against <code>contentHash</code> before
            installing.
          </strong>{" "}
          Recompute the hash over the downloaded tree and compare.
        </InfoCallout>
        <p className="mt-3 mb-3 leading-relaxed">
          On a mismatch, tell the user the source has changed since the
          organization approved it, name the organization and the date, and let
          them install anyway with an explicit choice. A mismatch is expected
          for up to a day after any upstream commit, because consolidation runs
          daily and the source has no commit pin. It is also what a compromised
          source looks like, and the user is the one who gets to weigh that.
        </p>
        <p className="mb-3 leading-relaxed">
          Record the hash you computed, not the one from the feed. The recorded
          hash is the baseline for drift detection, and a baseline the local
          content never matched detects nothing.
        </p>
        <p className="mb-3 leading-relaxed">
          A skill's identity is the <InlineCode>name</InlineCode> in its{" "}
          <InlineCode>SKILL.md</InlineCode> frontmatter, because that is what
          the agent runtime and the model address it by. Two skills with the
          same name collide no matter which directories they occupy.
        </p>
      </DocsSection>

      <DocsSection id="agent-plugins">
        <p className="mb-3 leading-relaxed">
          An{" "}
          <a
            href="https://agent-plugins.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Agent Plugin
          </a>{" "}
          is a directory holding a <InlineCode>plugin.json</InlineCode>{" "}
          manifest, optional{" "}
          <InlineCode>skills/&lt;name&gt;/SKILL.md</InlineCode> folders, and an
          optional <InlineCode>mcp.json</InlineCode>.{" "}
          <InlineCode>source.path</InlineCode> points at that directory; omit it
          and the plugin is at the repository root.
        </p>
        <InfoCallout>
          <strong>Install the plugin whole.</strong> Download the plugin
          directory into a root of your choosing, keyed by <code>pluginId</code>
          , and load its skills and MCP servers from inside that root. Do not
          extract components into your shared skills directory or merge its
          servers into your global MCP configuration.
        </InfoCallout>
        <p className="mt-3 mb-3 leading-relaxed">
          The plugin root is a boundary that agent-plugins.org builds on: files
          must resolve inside it, <InlineCode>PLUGIN_ROOT</InlineCode> and{" "}
          <InlineCode>PLUGIN_DATA</InlineCode> are defined relative to it,{" "}
          <InlineCode>./</InlineCode> commands resolve against it, and failure
          isolation is expressed per plugin, per component type, and per entry.
          A decomposed plugin can no longer find its own files.
        </p>
        <p className="mb-3 leading-relaxed">
          Keeping plugins whole also means plugins and standalone artifacts
          coexist. The same skill can appear twice in a client, once on its own
          and once inside a plugin, with different approvals and different
          content. That is not a duplicate to merge, and merging them would
          assert an equivalence the registry never published.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Where the registry stops</h3>
        <p className="mb-3 leading-relaxed">
          The registry answers which plugin, approved by whom, from where, and
          whether it is current. Loading and running it is defined by
          agent-plugins.org, which leaves installation sources, registries,
          enablement, update experience, and trust policy to clients. That is
          the registry's half. The handoff is the verified plugin root on disk.
        </p>
        <ul className="mb-3 space-y-2 text-sm list-disc pl-5">
          <li className="leading-relaxed">
            <InlineCode>containedSkills</InlineCode> and{" "}
            <InlineCode>containedMcpServers</InlineCode> are what consolidation
            read from the plugin at the time it ran. Use them to tell the user
            what they are about to install. Discover components yourself from
            the plugin root, and let the root win if the two disagree.
          </li>
          <li className="leading-relaxed">
            <InlineCode>containedMcpServers</InlineCode> gives only a name and a
            transport, and the transport is empty when the entry declares no{" "}
            <InlineCode>type</InlineCode>. The feed cannot tell you how to run
            anything.
          </li>
          <li className="leading-relaxed">
            Approval attaches to the plugin as a whole. No contained MCP server
            is approved independently, and since a plugin's MCP servers can run
            arbitrary local commands, say so before installing.
          </li>
        </ul>
      </DocsSection>

      <DocsSection id="disappearing-entries">
        <p className="mb-3 leading-relaxed">
          An installed artifact vanishing from the feed can mean an organization
          withdrew its approval, or that consolidation skipped the entry because
          its source was briefly unreachable, or that a vendor retargeted the
          approval, or that an id was renamed. The data does not distinguish
          them.
        </p>
        <p className="mb-3 leading-relaxed">
          Surface it and act on nothing. Mark the artifact as no longer listed,
          and let the user keep it, dropping the registry link, or remove it.
        </p>
        <p className="mb-3 leading-relaxed">
          Removing artifacts automatically deletes working installations
          whenever a source repository has a bad morning. Skipping unreachable
          sources is normal consolidation behaviour, not an exception.
        </p>
      </DocsSection>

      <DocsSection id="staying-current">
        <p className="mb-3 leading-relaxed">
          An organization can revise an approval, either with a new config for
          an MCP server or with a source whose content moved on. Without update
          detection, users sit on whatever the registry said the day they
          installed.
        </p>
        <p className="mb-3 leading-relaxed">
          Compare a hash from the feed against the one you recorded at install:{" "}
          <InlineCode>approvals[].configHash</InlineCode> for MCP servers,{" "}
          <InlineCode>contentHash</InlineCode> for skills and plugins. Different
          means an update is available. Refetch before checking, since a cached
          response cannot contain anything new.
        </p>
        <p className="mb-3 leading-relaxed">
          <InlineCode>version</InlineCode> is not an update signal. A new
          version with an unchanged config gives the user nothing to apply, and
          a changed config under the same version is a real update that a
          version comparison misses. Show it where it helps a user understand
          what they have; decide with the hash.
        </p>
        <p className="mb-3 leading-relaxed">
          An update replaces what the registry published and preserves what the
          user supplied: authentication tokens, enablement flags, environment
          entries the user added. When an update switches transport, drop the
          previous transport's fields rather than leaving both in place. For
          skills and plugins, updating is a clean replace, with the same hash
          verification as at install.
        </p>
        <p className="mb-3 leading-relaxed">
          Update only artifacts carrying your provenance marker. One the user
          placed by hand was never yours to replace.
        </p>
      </DocsSection>

      <DocsSection id="detecting-tampering">
        <p className="mb-3 leading-relaxed">
          Local content can change after installation. Recompute the content
          hash over the artifact directory and compare it against the hash in
          your provenance marker. Different means the local content has changed
          since install. This applies to skills and plugins; MCP servers have no
          content to check.
        </p>
        <p className="mb-3 leading-relaxed">
          Offer to restore the artifact from its source, and leave it alone
          until the user asks. A local change is often deliberate, and a client
          that quietly reverts it destroys the user's work to satisfy a hash.
          Resolve drift before offering an update, since restoring already
          writes the current registry content and a single restore lands both.
        </p>
        <p className="mb-3 leading-relaxed">
          Recomputing reads every file and this check runs often, so cache the
          result against a signature built from the file paths, sizes, and
          modification times gathered while walking the directory.
        </p>
      </DocsSection>

      <DocsSection id="content-hash">
        <p className="mb-3 leading-relaxed">
          The hash published as <InlineCode>contentHash</InlineCode> for skills
          and plugins. Reproduce it byte for byte or comparisons are
          meaningless. Consolidation computes it over the skill folder or the
          plugin directory, using the same algorithm for both.
        </p>
        <ol className="mb-3 space-y-2 text-sm list-decimal pl-5">
          <li className="leading-relaxed">
            Walk the directory recursively. Skip every entry whose name begins
            with <InlineCode>.</InlineCode>, at every level. Skipping a
            directory skips everything under it.
          </li>
          <li className="leading-relaxed">
            For each remaining file, take its path relative to the directory
            root, with <InlineCode>/</InlineCode> as the separator regardless of
            platform.
          </li>
          <li className="leading-relaxed">
            Sort those relative paths in lexicographic byte order.
          </li>
          <li className="leading-relaxed">
            Create a SHA-256 hash. For each path in sorted order, feed the path
            as UTF-8 bytes, then the file's raw bytes. Nothing separates or
            delimits the two.
          </li>
          <li className="leading-relaxed">
            Take the hex digest and keep the first 12 characters.
          </li>
        </ol>
        <p className="mb-3 leading-relaxed">
          Name your provenance marker with a leading dot and the algorithm
          excludes it automatically. Written without one it changes the hash,
          and the artifact reads as tampered with the moment it is installed.
        </p>
        <p className="mb-3 leading-relaxed">
          Twelve hex characters is part of the format. A 48-bit prefix detects
          accidental change and is not a defence against a prepared collision.
        </p>
      </DocsSection>

      <DocsSection id="deep-links">
        <p className="mb-3 leading-relaxed">
          A vendor declaring an install URL prefix in its{" "}
          <InlineCode>organization.json</InlineCode> causes consolidation to
          mint an <InlineCode>installUrl</InlineCode> for every approval
          targeting that tool. Handling these is optional, so ignore{" "}
          <InlineCode>installUrl</InlineCode> and everything else still works.
        </p>
        <CodeBlock>{`"installUrl": "example-tool://install-skill?id=io.github.anthropics/code-review"`}</CodeBlock>
        <p className="mb-3 leading-relaxed">
          A deep link arrives from a web page. It is untrusted input landing
          directly on an install path, so if you handle them:
        </p>
        <ul className="mb-3 space-y-2 text-sm list-disc pl-5">
          <li className="leading-relaxed">
            <strong>Carry an identifier and nothing else.</strong> Resolve the
            source, name, hash, and approvals from the registry when you handle
            the link. Any field taken from URL parameters is a field an attacker
            chose.
          </li>
          <li className="leading-relaxed">
            <strong>Refuse ids your registry view does not list</strong>, and
            say which id you refused.
          </li>
          <li className="leading-relaxed">
            <strong>Confirm before installing.</strong> Show the source, and the
            approving organizations if you surface them at all. A deep link is
            the one entry point with no browsing context, so the confirmation is
            all the user has to go on.
          </li>
        </ul>
        <p className="mb-3 leading-relaxed">
          Declaring a prefix is a commitment: the registry mints URLs in that
          scheme for every approval targeting your tool and publishes them
          publicly. Ship the handler first.
        </p>
      </DocsSection>

      <DocsSection id="yours-to-decide">
        <p className="mb-3 leading-relaxed">
          The registry publishes data. What a client builds on top of it is the
          client's call, and the sketches below show what the data supports
          rather than prescribing an implementation.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Organization filtering</h3>
        <p className="mb-3 leading-relaxed">
          A client that names approving organizations can go further and let the
          choice of organizations change what a user sees. Everything needed is
          already in the feed: <InlineCode>organizations.json</InlineCode> gives
          each organization an id, name, description, website, and colour, every
          approval carries an <InlineCode>organizationId</InlineCode>, and{" "}
          <InlineCode>viaTrust</InlineCode> names the organization whose
          judgment was delegated to. Some shapes this can take:
        </p>
        <ul className="mb-3 space-y-2 text-sm list-disc pl-5">
          <li className="leading-relaxed">
            <strong>Pinned in product configuration.</strong> A distribution
            ships an allowlist. Predictable, and the user cannot widen it.
          </li>
          <li className="leading-relaxed">
            <strong>Chosen by the user.</strong> Settings list the organizations
            present in the feed. Flexible, and it needs an answer for an
            artifact whose only approval comes from an organization the user
            later deselects while it is installed.
          </li>
          <li className="leading-relaxed">
            <strong>Ranking rather than filtering.</strong> Everything stays
            visible, and approvals from preferred organizations sort first. No
            empty-list state to design.
          </li>
          <li className="leading-relaxed">
            <strong>A threshold.</strong> Require more than one approval before
            an artifact is offered. Cheap, and it disadvantages artifacts that
            are simply new.
          </li>
        </ul>
        <p className="mb-3 leading-relaxed">
          The <InlineCode>inferred</InlineCode> flag is worth surfacing in any
          of these. It marks an organization pre-seeded from a public source
          rather than one participating in the registry directly, which is a
          different kind of approval than a vendor filing its own.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Auto-update policy</h3>
        <p className="mb-3 leading-relaxed">
          The registry tells you an update exists. Whether to apply it, whether
          to ask first, and whether that choice is global or per artifact are
          product decisions it has no opinion on.
        </p>
        <p className="mb-3 leading-relaxed">
          The one interaction worth knowing is with drift: an artifact whose
          local content has changed is a restore rather than an update, so it
          does not belong in whatever automatic path you build.
        </p>
        <h3 className="font-semibold mt-5 mb-2">Presentation</h3>
        <p className="mb-3 leading-relaxed">
          The registry has no opinion on how artifacts are browsed and searched,
          whether approval appears as a badge or a sentence, how a plugin's
          contained components are displayed, where installed artifacts are
          managed, or how updates are announced.
        </p>
      </DocsSection>

      <DocsSection id="checklist">
        <Checklist
          title="Core"
          idPrefix="core"
          items={[
            "Treat the base URL and tool id as product configuration, not user settings",
            "Keep a failed fetch distinct from an empty response, and change nothing on failure",
            "Ignore fields you do not recognise rather than rejecting the document",
            "Pick an install config by date descending, organizationId ascending",
            "Verify contentHash before installing a skill or plugin, and let the user override an explicit mismatch warning",
            "Record provenance for everything you install, and never overwrite what you did not",
            "Offer adoption when a local slot is already occupied",
            "Install plugins whole, keyed by pluginId, and load from inside the plugin root",
            "Surface artifacts missing from the feed without removing them",
          ]}
        />
        <Checklist
          title="If you show approving organizations"
          idPrefix="orgs"
          items={[
            "Fetch organizations.json to resolve organizationId into a name",
            "Show every approving organization, not only the one whose config you used",
            "Attribute a viaTrust approval to its organizationId, noting the delegation",
          ]}
        />
        <Checklist
          title="If you implement updates"
          idPrefix="updates"
          items={[
            "Use configHash for MCP servers and contentHash for skills and plugins",
            "Preserve user-supplied configuration across an update",
          ]}
        />
        <Checklist
          title="If you implement deep links"
          idPrefix="deeplinks"
          items={[
            "Resolve everything from the registry by id, and install nothing from URL parameters",
            "Refuse ids absent from your registry view",
            "Confirm with the user, naming the source",
          ]}
        />
      </DocsSection>
    </div>
  );
}
