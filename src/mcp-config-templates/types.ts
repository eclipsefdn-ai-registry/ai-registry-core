/**
 * OAuth 2.1 configuration for a remote server. An empty object is meaningful:
 * it says the server expects OAuth but has nothing to pre-configure, so the
 * client should discover everything.
 */
export interface GenericMcpOAuth {
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  authServerMetadataUrl?: string;
  resource?: string;
}

/**
 * Mirrors schemas/mcp-server-config.schema.json. `type` is required on every
 * member, so it works as a discriminant — prefer switching on it over
 * `"command" in config` probing.
 */
export type GenericMcpConfig =
  | {
      type: "streamable-http" | "sse";
      url: string;
      headers?: Record<string, string>;
      oauth?: GenericMcpOAuth;
    }
  | {
      type: "ws";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    };

/**
 * Turns a vendor-supplied generic config into a tool's own installable
 * config shape. Returns undefined when the tool can't represent this
 * particular generic config (e.g. a transport it has no equivalent for) —
 * that's the signal to leave the installConfigs entry unresolved, not to
 * publish a broken card.
 */
export type McpConfigTransform = (
  config: GenericMcpConfig,
  slug: string,
) => Record<string, unknown> | undefined;
