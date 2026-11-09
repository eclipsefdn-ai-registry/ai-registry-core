import { Puzzle } from "lucide-react";
import type { Plugin } from "../types";

/**
 * The Agent Plugin badge: shown only when consolidation found the plugin
 * conforms to the Agent Plugins specification. A non-conforming plugin gets
 * no badge rather than a negative one, since it is still an approved Plugin,
 * and neither does one from a feed without the verdict, which is unknown.
 *
 * `interactive` adds the hover affordance used on cards, as
 * McpVerificationBadge does.
 */
export function AgentPluginBadge({
  plugin,
  interactive = false,
}: {
  plugin: Plugin;
  interactive?: boolean;
}) {
  if (plugin.isAgentPlugin !== true) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 ${
        interactive ? "cursor-help hover:bg-primary/20 transition-colors" : ""
      }`}
      title="Conforms to the Agent Plugins specification (agent-plugins.org)"
    >
      <Puzzle className="h-3 w-3" />
      Agent Plugin
    </span>
  );
}
