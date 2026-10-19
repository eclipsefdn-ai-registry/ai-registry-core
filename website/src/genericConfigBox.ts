import type { GenericConfig } from "./types";

/**
 * What a server's generic config box shows: the JSON it prints and copies,
 * the caveat under it, and the notes beside it.
 *
 * The JSON is the connection info alone. notes is prose for a person and
 * serverKey names where the config goes, so neither belongs in what a visitor
 * pastes. It isn't wrapped under any key either: the caveat says where to
 * nest it, and names the server key when the vendor set one. Without one the
 * caveat names none, rather than repeat consolidation's fallback rule here.
 */
export interface GenericConfigBox {
  json: Record<string, unknown>;
  caveat: string;
  notes?: string;
}

export function genericConfigBox(config: GenericConfig): GenericConfigBox {
  const { notes, serverKey, ...json } = config;
  const as = serverKey ? ` as "${serverKey}"` : "";
  return {
    json,
    caveat: `Generic, tool-agnostic connection info — nest this under your client's own top-level key (e.g. mcpServers, servers)${as} instead of pasting it in as shown.`,
    ...(notes && { notes }),
  };
}
