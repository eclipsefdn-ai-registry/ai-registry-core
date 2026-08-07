import type { McpConfigTransform } from "./types.js";

// Theia's own MCP server preferences format: wrapper key "servers", local
// servers use command/args/env with no "type" field, remote servers use
// "serverUrl" (not "url") and can represent at most one bearer-style auth
// header via serverAuthToken/serverAuthTokenHeader (no arbitrary headers, no
// OAuth at all). See ai-registry-theia/ai-docs/mcp-approval.md.
export const theiaMcpConfigTransform: McpConfigTransform = (config, slug) => {
  if ("command" in config) {
    return {
      servers: {
        [slug]: {
          command: config.command,
          args: config.args,
          env: config.env,
        },
      },
    };
  }

  const headerEntries = Object.entries(config.headers ?? {});
  if (config.oauth || headerEntries.length > 1) {
    return undefined;
  }

  const [headerName, headerValue] = headerEntries[0] ?? [];
  return {
    servers: {
      [slug]: {
        serverUrl: config.url,
        ...(headerValue && {
          serverAuthToken: headerValue.replace(/^Bearer\s+/i, ""),
        }),
        ...(headerValue &&
          headerName !== "Authorization" && {
            serverAuthTokenHeader: headerName,
          }),
      },
    },
  };
};
