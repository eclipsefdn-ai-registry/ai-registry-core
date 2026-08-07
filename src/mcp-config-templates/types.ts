export type GenericMcpConfig =
  | {
      type?: "http" | "sse" | "ws";
      url: string;
      headers?: Record<string, string>;
      oauth?: {
        authServerMetadataUrl?: string;
        scopes?: string;
        clientId?: string;
      };
    }
  | {
      type?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, unknown>;
    };

/**
 * Turns a vendor-supplied generic config into a tool's own installable
 * config shape. Returns undefined when the tool can't represent this
 * particular generic config (e.g. an auth shape it has no equivalent for) —
 * that's the signal to leave the installConfigs entry unresolved, not to
 * publish a broken card.
 */
export type McpConfigTransform = (
  config: GenericMcpConfig,
  slug: string,
) => Record<string, unknown> | undefined;
