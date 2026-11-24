# Runbook: incidents and takedowns

The AI Registry at [ai.open-vsx.org](https://ai.open-vsx.org) is a static website. Each build pulls fresh data from this repository and from every organization repository in [`vendors.json`](vendors.json), then replaces the whole site. The README explains a build in [Data flow](README.md#data-flow) and [Reliability](README.md#reliability).

Uptime and incident history are on <https://status.ai.open-vsx.org/>.

## Rebuilds and hosting

Infra handles the hosting level as usual: nginx, the cluster, and rolling back to a previous image if your setup keeps them. The nginx configuration is [`config/nginx/default.conf`](config/nginx/default.conf), and the Jenkins pipeline is defined in the [`Jenkinsfile`](Jenkinsfile).

None of the procedures in this section need a change in a GitHub repository. Changes there go through a pull request and a green build, so the registry maintainers make them.

To reach the registry maintainers, open an issue at <https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues>. For anything security-related, email [security@open-vsx.org](mailto:security@open-vsx.org) instead, as [SECURITY.md](SECURITY.md) describes.

### Rebuild the site

1. Open the Jenkins job <https://foundation.eclipse.org/ci/webdev/job/public/job/ai.open-vsx.org/job/main/>.
2. Start a new build of `main`.
3. Wait for the build to finish. It pulls fresh data from all organization repositories and redeploys the site.

If the build fails, the previous deployment stays live.

### Handle a failed build

A failed build is not an outage. The site keeps serving the last successful deployment with older data.

1. Open the failed build's log and find the error.
2. Act on what the error says:

   | Error in the log                                                                                  | Cause                                                                                       | What to do                                                                                                                                                                                                             |
   | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `Anthropic MCP registry returned HTTP 5xx for ...` or `Anthropic MCP registry appears to be down` | The Anthropic MCP registry failed. The build retries 5xx and 429 responses before it fails. | [Rebuild the site](#rebuild-the-site) later. If it keeps failing, open an issue. The registry maintainers can't fix an outage of the Anthropic MCP registry, so the previous deployment stays live until it recovers.  |
   | `Failed to clone <repository>` or `[<organization>] Validation failed`                            | One organization repository is unreachable or invalid.                                      | Open an issue with the link to the log. If a takedown is waiting for the build, say so, and the registry maintainers [exclude the organization that blocks the build](#exclude-an-organization-that-blocks-the-build). |
   | Anything else                                                                                     |                                                                                             | Open an issue with the link to the log.                                                                                                                                                                                |

## Takedowns

The Eclipse Foundation Security Team decides on reports about listed artifacts, as described in [SECURITY.md](SECURITY.md#listed-artifacts). This section describes how to carry out a decision.

The registry hosts no artifacts. An artifact is listed because an organization's repository contains an approval file for it. To take the artifact down, remove that file. To take an organization down, remove its entry from [`vendors.json`](vendors.json).

### Take down an artifact

Someone with write access to the approving organization's repository does this.

1. Find every organization that approves the artifact. The artifact's page on the website lists them. In [`all.json`](https://ai.open-vsx.org/api/v1/all.json), the artifact's entry has one item under `approvals` per organization.
2. Ignore approvals that have a `viaTrust` field. They come from one organization trusting another, and they disappear with the approval they come from.
3. In each remaining organization's repository, find the approval file. Approval files are in `mcp/`, `skills/`, `plugins/`, `agents/`, `marketplaces/` and `sandbox-extensions/`. The file name is the artifact's ID with `/` replaced by `--`, plus `.json`. The [Organization guide](README.md#organization-guide) describes the layout.
4. Check whether the file approves more than this artifact. See [Approval files that cover several artifacts](#approval-files-that-cover-several-artifacts).
5. Remove the file, or narrow it, and merge the change to `main`.
6. Check the site after a few minutes. See [How long a takedown takes](#how-long-a-takedown-takes).

The artifact stays listed until every direct approval is removed.

### Approval files that cover several artifacts

These approval files can list more than one artifact:

- A skill approval whose `source.path` is a list or a glob such as `skills/*`. To take down one skill, replace the glob with an explicit list of the paths to keep, or remove the skill's path from the list.
- A `marketplaces/*.json` approval. It lists every plugin in a vendor's marketplace file and can't exclude a single plugin. To take down one plugin, remove the whole marketplace approval.
- A `sandbox-extensions/*.json` approval. It covers every extension in a repository. To take down one extension, remove the whole approval.

### Take down an organization

A registry maintainer does this.

1. Open a pull request on this repository that removes the organization's entry from [`vendors.json`](vendors.json).
2. Merge the pull request once its build is green.
3. Check the site after a few minutes.

The organization and all its approvals disappear from the site. Organizations that trust it lose that trust. Consolidation logs a warning for each trusting organization and continues.

### Exclude an organization that blocks the build

The build collects data from all organization repositories, and one failure stops it. If one repository is unreachable or contains invalid data, no change is deployed, including a takedown. A registry maintainer can exclude that organization until it fixes its repository.

1. Find the organization's ID in the build log.
2. Follow [Take down an organization](#take-down-an-organization) for it. The pull request's build runs without that organization, so it can pass.
3. After the organization fixes its repository, revert the pull request.

This doesn't help when the Anthropic MCP registry fails. See [Handle a failed build](#handle-a-failed-build).

### How long a takedown takes

- A merge to `main` in an organization repository starts a rebuild. The site shows the change a few minutes later.
- A merge to `main` in this repository also starts a rebuild.
- The site is also rebuilt every day at 06:00 UTC.

If a merged change doesn't show after a few minutes, check the [Jenkins job](https://foundation.eclipse.org/ci/webdev/job/public/job/ai.open-vsx.org/job/main/). If the last build failed, read its log. Otherwise, [rebuild the site](#rebuild-the-site).

### What a takedown doesn't do

A takedown removes the listing from the registry. It doesn't change the artifact's source, which is hosted elsewhere, and it doesn't uninstall the artifact from anyone's machine. Clients that cached the registry's data, or that added one of the registry's published marketplaces, see the change when they next refresh.
