// src/agents/communication.ts

import type { AgentWorkflow } from "$lib/types/chat-types";
import { loadPrompt } from "$lib/server/helpers/prompt-loader";

export const communicationWorkflow: AgentWorkflow = {
  id: "communication",
  label: "Communication",
  iconName: "Megaphone",
  assistants: [
    // —— Principal Assistant ——
    {
      workflowId: "communication",
      designation: "principal",
      highlight: "Official Messaging",
      suggestions: [
        "Send bulk SMS to all parents",
        "Send individualized performance SMS",
        "Generate meeting notifications",
        "Send fee reminders/alerts",
        "Broadcast emergency announcements",
        "Schedule future communications",
      ] as const,
      instructions: loadPrompt("communicate", "principal"),
      maxSteps: 30,
    },

    // —— Teacher Assistant ——
    {
      workflowId: "communication",
      designation: "class_teacher",
      highlight: "Parent & Student Engagement",
      suggestions: [
        "Send messages to parents: homework reminders, behaviour alerts, praise notes, academic concerns",
        "Notify students and parents about deadlines, projects, or extra classes",
        "Communicate classroom updates or schedule changes",
      ] as const,
      instructions: loadPrompt("communicate", "class_teacher"),
      maxSteps: 30,
    },

    // —— Coordinator Assistant ——
    {
      workflowId: "communication",
      designation: "coordinator",
      highlight: "Staff & Parent Engagement",
      suggestions: [
        "## Audience Awareness",
        "- For parents: focus on partnership, growth, and clear next steps",
        "- For students (e.g., Grade 5): friendly, encouraging, with concrete praise",
        "- Respect cultural & linguistic diversity",
        "## Best Practices",
        "- Use positive framing",
        "- Include specific evidence, not generalizations",
        "- Never assign blame — use 'we' language",
      ] as const,
      instructions: loadPrompt("communicate", "coordinator"),
      maxSteps: 30,
    },
  ] as const,
};
