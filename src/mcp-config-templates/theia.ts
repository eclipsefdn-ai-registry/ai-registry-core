import type { GenericMcpOAuth, McpConfigTransform } from "./types.js";

// Theia's own MCP server preferences format: wrapper key "servers", local
// servers use command/args/env with no "type" field, remote servers use
// "serverUrl" (not "url"). At most one auth header can go in the dedicated
// serverAuthToken/serverAuthTokenHeader pair; anything else goes in "headers".
// OAuth maps onto Theia's MCPOAuthConfig. Theia has no "cwd" and no WebSocket
// transport. See ai-registry-theia/ai-docs/mcp-approval.md.

// Theia does not expand ${VAR}; its convention is a <name> placeholder the user
// replaces by hand. A ${VAR:-default} reference loses its default here — no
// config in any vendor repo uses that form, so there is nothing to preserve
// yet, and inventing a rule for it now would be guessing.
function toTheiaPlaceholders<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g,
      "<$1>",
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map(toTheiaPlaceholders) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toTheiaPlaceholders(v)]),
    ) as T;
  }
  return value;
}

// Theia's MCPOAuthConfig. Every field is optional on both sides and the names
// line up one-to-one except authServerMetadataUrl -> authorizationServer, and
// scopes is string[] on both so there is no RFC 6749 §3.3 joining to do.
// A bare `oauth: {}` means "expects OAuth, discover everything" — Theia has no
// way to say that explicitly, but an entry with no oauth block falls through to
// discovery/DCR on a 401, which is the same behaviour. So it emits nothing.
function toTheiaOAuth(oauth: GenericMcpOAuth) {
  const mapped = {
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    scopes: oauth.scopes,
    authorizationServer: oauth.authServerMetadataUrl,
    resource: oauth.resource,
  };
  const set = Object.entries(mapped).filter(([, v]) => v !== undefined);
  return set.length > 0 ? Object.fromEntries(set) : undefined;
}

// The auth header goes in serverAuthToken (Bearer-stripped, since Theia adds
// the prefix itself) and everything else in headers — that split is the idiom
// Theia's own approvals already use, see io.github.grafana--mcp-grafana. With
// no Authorization header and exactly one other, that one is unambiguously the
// token, so it gets the dedicated pair. With several and no Authorization there
// is no non-guessing way to pick one, so they all go in headers.
// Taking the first case-insensitive "authorization" match is safe because
// validateApproval rejects a config whose header names collide case-
// insensitively — see checkGenericConfigHeaders. Without that guarantee this
// would put the losing spelling in the headers bag and emit the same header
// twice with different values.
function toTheiaAuth(headers: Record<string, string> | undefined) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return {};

  const authIndex = entries.findIndex(
    ([name]) => name.toLowerCase() === "authorization",
  );

  if (authIndex === -1) {
    if (entries.length === 1) {
      const [name, value] = entries[0];
      return { serverAuthToken: value, serverAuthTokenHeader: name };
    }
    return { headers: Object.fromEntries(entries) };
  }

  const [, authValue] = entries[authIndex];
  const rest = entries.filter((_, i) => i !== authIndex);
  return {
    serverAuthToken: authValue.replace(/^Bearer\s+/i, ""),
    ...(rest.length > 0 && { headers: Object.fromEntries(rest) }),
  };
}

export const theiaMcpConfigTransform: McpConfigTransform = (config, slug) => {
  if (config.type === "stdio") {
    // cwd is dropped: Theia's format has no equivalent, and most servers do not
    // need one, so a card minus cwd beats no card at all.
    return {
      servers: {
        [slug]: toTheiaPlaceholders({
          command: config.command,
          args: config.args,
          env: config.env,
        }),
      },
    };
  }

  // Theia speaks no WebSocket transport. Emitting the wss:// URL as a plain
  // serverUrl would produce a config that silently fails to connect.
  if (config.type === "ws") {
    return undefined;
  }

  // Mapped separately so a bare `oauth: {}` drops the key entirely rather than
  // leaving `oauth: undefined` behind.
  const oauth = config.oauth && toTheiaOAuth(config.oauth);

  return {
    servers: {
      [slug]: toTheiaPlaceholders({
        serverUrl: config.url,
        ...toTheiaAuth(config.headers),
        ...(oauth && { oauth }),
      }),
    },
  };
};
