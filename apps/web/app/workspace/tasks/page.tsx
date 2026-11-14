"use client";

import { TasksSurface } from "@/components/workspace/TasksSurface";
import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";

export default function WorkspaceTasksPage() {
  const { proactive } = useWorkspaceContext();
  return <TasksSurface notice={proactive.notice} tasks={proactive.tasks} />;
}
