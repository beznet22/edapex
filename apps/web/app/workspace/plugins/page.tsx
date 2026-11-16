import { PluginsSurface } from "@/components/workspace/PluginsSurface";

/**
 * Plugins — the UI name for connectors.
 *
 * "Connector" is architecture vocabulary; nobody outside the codebase says it. The
 * internal type stays `ConnectorKind`, because renaming the server type to follow a label
 * is churn for a vocabulary change.
 */
export default function WorkspacePluginsPage() {
  return <PluginsSurface />;
}
