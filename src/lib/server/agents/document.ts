// src/agents/documentation.ts

import type { AgentWorkflow } from "$lib/types/chat-types";
import { loadPrompt } from "$lib/server/helpers/prompt-loader";

export const documentationWorkflow: AgentWorkflow = {
  id: "documentation",
  label: "Documentation",
  iconName: "FileText",
  assistants: [
    // —— Principal Assistant ——
    {
      workflowId: "documentation",
      designation: "principal",
      highlight: "Governance & Oversight",
      suggestions: [
        "Approve lesson notes and schemes of work",
        "Draft policies, circulars, and memos",
        "Draft letters to parents and staff",
        "Prepare meeting agendas and minutes",
        "Create term calendars and academic schedules",
        "Prepare staff duty rosters",
        "Draft school improvement plans and action plans",
        "Maintain school handbook / operational manuals",
        "Draft event proposals and planning documents",
      ] as const,
      instructions: loadPrompt("document", "principal"),
      maxSteps: 30,
    },

    // —— Teacher Assistant ——
    {
      workflowId: "documentation",
      designation: "class_teacher",
      highlight: "Curriculum & Classroom Resources",
      suggestions: [
        "Generate lesson notes per class and week",
        "Create schemes of work for all subjects",
        "Prepare topic breakdowns for each subject",
        "Design project and assignment templates",
        "Create printable worksheets and handouts",
        "Generate nursery-specific resources (tracing sheets, rhymes, colouring pages)",
        "Prepare teaching aids (flashcards, quizzes, activity sheets)",
        "Maintain class records (attendance, assignments, behaviour logs)",
      ] as const,
      instructions: loadPrompt("document", "class_teacher"),
      maxSteps: 30,
    },

    // —— Coordinator Assistant ——
    {
      workflowId: "documentation",
      designation: "coordinator",
      highlight: "Records & Certificates",
      suggestions: [
        "Draft certificates (transfer, testimonial, completion)",
        "Maintain cumulative student records and transcripts",
        "Format exam papers and scripts",
        "Maintain academic records and official archives",
        "Prepare student enrollment and promotion documentation",
        "Draft official letters for exam or result verification",
      ] as const,
      instructions: loadPrompt("document", "coordinator"),
      maxSteps: 30,
    },

  ] as const,
};
