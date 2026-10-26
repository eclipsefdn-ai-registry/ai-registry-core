import type { GenericMcpOAuth, McpConfigTransform } from "./types.js";

// Kiro's mcp.json format: wrapper key "mcpServers", local servers use
// command/args/env, remote servers use url/headers/oauth. There is no "type"
// field; Kiro tells streamable HTTP from SSE itself. Kiro has no "cwd" and no
// WebSocket transport. The Kiro-only disabled, autoApprove and disabledTools
// are the user's preferences, not connection info, so none is emitted.
// See https://kiro.dev/docs/mcp/configuration/.

// Kiro expands ${VAR} in env and headers itself, once the user approves the
// variable, so references pass through as written, unlike Theia's transform.
// Kiro documents only the bare ${VAR} form. A ${VAR:-default} reference is
// kept as written too — no config in any vendor repo uses that form, and
// rewriting it would be guessing.

// Kiro's oauth object. clientId and clientSecret line up by name, and scopes
// is called oauthScopes, a string[] on both sides.
// authServerMetadataUrl and resource have no Kiro field. They are dropped and
// the rest is kept, the way cwd is: Kiro can't be told either, so it falls
// back to discovery as for any server.
// clientSecret passes through even though the Kiro IDE supports only public
// clients: the Kiro CLI supports confidential ones and needs it. The schema
// makes it a ${VAR} reference, and Kiro documents expansion only in env and
// headers, so whether Kiro resolves it here is unconfirmed. It is still kept
// as written, since any rewrite would be a guess.
// A bare `oauth: {}` means "expects OAuth, discover everything", which Kiro
// already does for an entry with no oauth block. So it emits nothing.
function toKiroOAuth(oauth: GenericMcpOAuth) {
  const mapped = {
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    oauthScopes: oauth.scopes,
  };
  const set = Object.entries(mapped).filter(([, v]) => v !== undefined);
  return set.length > 0 ? Object.fromEntries(set) : undefined;
}

export const kiroMcpConfigTransform: McpConfigTransform = (
  config,
  serverKey,
) => {
  if (config.type === "stdio") {
    // cwd is dropped: Kiro documents none, and most servers do not need one,
    // so a card minus cwd beats no card at all.
    return {
      mcpServers: {
        [serverKey]: {
          command: config.command,
          ...(config.args && { args: config.args }),
          ...(config.env && { env: config.env }),
        },
      },
    };
  }

  // Kiro speaks no WebSocket transport. Emitting the wss:// URL as a plain
  // url would produce a config that silently fails to connect.
  if (config.type === "ws") {
    return undefined;
  }

  const oauth = config.oauth && toKiroOAuth(config.oauth);

  return {
    mcpServers: {
      [serverKey]: {
        url: config.url,
        ...(config.headers && { headers: config.headers }),
        ...(oauth && { oauth }),
      },
    },
  };
};
