import { AgentsSurface } from "@/components/workspace/AgentsSurface";

/**
 * Make, v1: agents.
 *
 * The surface is named for making things, and an agent is the first thing a person can
 * make here. The placeholder this replaces said pages would appear "when the page
 * service is enabled" — true, but it left the tab doing nothing while the agent
 * lifecycle behind it was already built and unreachable.
 *
 * Artifacts and generated pages join this surface in their own chunk.
 */
export default function WorkspaceMakePage() {
  return <AgentsSurface />;
}
