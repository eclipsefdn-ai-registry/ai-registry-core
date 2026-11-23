# Security Policy

The AI Registry is a service hosted and operated by the Eclipse Foundation at
<https://ai.open-vsx.org>. This policy covers the registry itself and the
artifacts it lists.

**Do not report security issues through public GitHub issues, discussions, or
pull requests.** Report them privately by email to
[security@open-vsx.org](mailto:security@open-vsx.org).

Unless this policy says otherwise, the
[Eclipse Foundation Baseline Security Policy](https://www.eclipse.org/security/baseline/)
applies, including what to include in a report and how reports are handled and
disclosed.

## The registry itself

Vulnerabilities in the registry's code, consolidation pipeline, website, API,
the deployment at ai.open-vsx.org, or its credentials.

## Listed artifacts

The registry does not host or distribute the MCP servers, skills, plugins,
agents, or sandbox extensions it lists. It publishes which organizations
approve them. Report the following to the same address:

- an artifact is malicious or compromised, for example it exfiltrates data or
  its upstream package was hijacked
- an install command or configuration shown by the registry leads to something
  vulnerable, for example `@latest` resolving to a compromised version
- a listing falsely claims a publisher or an approval

The Eclipse Foundation Security Team reviews these reports and decides what
happens to the listing, following the
[Open VSX Security Policy](https://open-vsx.org/security/).

## Out of scope

- A vulnerability in a listed artifact's own code, such as a vulnerable
  dependency, goes to that artifact's maintainers. The registry cannot patch it.
- Problems with a listing that are not security issues (wrong metadata, a
  discontinued product, a request to be removed) go to the approving
  organization's repository, or to a
  [public issue](https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues)
  for inferred organizations.
