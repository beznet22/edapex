/**
 * Connector catalogue.
 *
 * A description of what *can* be connected, with no credential and no client
 * code. The UI renders this; the implementation stays on the server.
 */

import type { ConnectorKind } from "@edapex/contracts";

export interface CatalogueEntry {
  readonly kind: ConnectorKind;
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** Scopes or capabilities requested when connecting, for informed consent. */
  readonly requests: readonly string[];
  /** True when each person connects their own account. */
  readonly perPerson: boolean;
}

export const CATALOGUE: readonly CatalogueEntry[] = [
  {
    kind: "google",
    id: "google",
    name: "Google Workspace",
    summary: "Read mail, calendars and files as the connected person, and send on their behalf.",
    requests: ["Read mail and calendar", "Send mail on your behalf", "Create files you own"],
    perPerson: true
  },
  {
    kind: "mcp",
    id: "mcp",
    name: "MCP server",
    summary: "A self-run Model Context Protocol server, dialled from the server side.",
    requests: ["Call the tools you explicitly allow"],
    // A configured server is connected once per workspace; the person does not
    // hold the credential.
    perPerson: false
  }
];

export function catalogueFor(kind: ConnectorKind): CatalogueEntry | undefined {
  return CATALOGUE.find((entry) => entry.kind === kind);
}

/**
 * Whether a connector is offered at all.
 *
 * Brokered and paid connectors (Composio, Arcade) are excluded from v1 by spec,
 * so this is a closed set rather than a flag that could be flipped by config
 * without a review.
 */
export function isOffered(kind: string): kind is ConnectorKind {
  return kind === "google" || kind === "mcp";
}
