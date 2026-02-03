// src/agents/index.ts

import type { AgentWorkflow, Assistant } from "$lib/types/chat-types";
import { assessmentWorkflow } from "./assessment";
import { communicationWorkflow } from "./communicate";
import { documentationWorkflow } from "./document";
import { reportingWorkflow } from "./report";

export const agentWorkflows = [
  assessmentWorkflow,
  communicationWorkflow,
  documentationWorkflow,
  reportingWorkflow,
];
