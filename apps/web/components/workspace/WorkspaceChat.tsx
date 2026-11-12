"use client";

import { ChatSurface } from "@/components/workspace/ChatSurface";
import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";

export function WorkspaceChat() {
  const { manifest, runtime } = useWorkspaceContext();

  return (
    <ChatSurface
      manifest={manifest}
      messages={runtime.messages}
      onApproval={runtime.decideApproval}
      onRemoveQueued={runtime.removeQueued}
      onSend={runtime.send}
      onStop={runtime.stop}
      queue={runtime.queue}
      runtime={runtime.view}
    />
  );
}
