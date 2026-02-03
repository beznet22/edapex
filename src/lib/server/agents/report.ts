// src/agents/reporting.ts

import type { AgentWorkflow } from "$lib/types/chat-types";
import { loadPrompt } from "$lib/server/helpers/prompt-loader";

export const reportingWorkflow: AgentWorkflow = {
  id: "reporting",
  label: "Reporting",
  iconName: "Library",
  assistants: [
    // —— Principal Assistant ——
    {
      workflowId: "reporting",
      designation: "principal",
      highlight: "Strategic Insights",
      suggestions: [
        "Generate weekly academic performance summaries",
        "Generate monthly staff and student attendance summaries",
        "Prepare classroom observation reports",
        "Prepare staff performance evaluation reports",
        "Compile incident and behaviour reports",
        "Prepare termly school-wide academic report",
        "Generate reports on curriculum coverage vs actual teaching",
        "Generate reports on school-wide events and activities",
      ] as const,
      instructions: loadPrompt("report", "principal"),
      maxSteps: 30,
    },

    // —— Teacher Assistant ——
    {
      workflowId: "reporting",
      designation: "class_teacher",
      highlight: "Classroom Diagnostics",
      suggestions: [
        "Generate weekly class performance summaries",
        "Generate behaviour and discipline tracking reports",
        "Generate attendance reports per class",
        "Prepare end-of-term student progress reports",
        "Summaries of assignments and project completion",
        "Generate classroom observation reports for Head Teacher",
        "Highlight struggling students or special needs cases",
      ] as const,
      instructions: loadPrompt("report", "class_teacher"),
      maxSteps: 30,
    },

    // —— Coordinator Assistant ——
    {
      workflowId: "reporting",
      designation: "coordinator",
      highlight: "Analytics & Trends",
      suggestions: [
        "Generate broadsheets and class ranking summaries",
        "Prepare termly performance analytics",
        "Analyze trends: top performers, weak subjects/topics, skill gaps",
        "Recommend interventions or remedial sessions",
        "Prepare report card summaries",
        "Comparative analysis: previous term vs current term performance",
        "Generate statistics for school inspection or accreditation purposes",
      ] as const,
      instructions: loadPrompt("report", "coordinator"),
      maxSteps: 30,
    },
  ] as const,
};
