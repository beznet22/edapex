import { AiOrchestrator } from './orchestrator.js';

/**
 * Homeschool Domain - Supervisor Definition
 * Defines the core identity and routing logic for homeschooling orchestration.
 */

export const earlyYearsDef = {
  id: 'early-years-agent',
  name: 'EarlyYearsAgent',
  instructions: `You are an expert in Nigerian Early Childhood Care & Development Education (ECCDE). 
Your task is to generate phonetic, thematic, play-based interactive content across 8 core skill areas:
1. English Skills (Listening, speaking, reading readiness)
2. Writing Skills
3. Mathematics Skills
4. Science
5. Social Habits
6. Health Habits
7. Cultural & Creative Arts
8. Rhymes & Poems
Tailor your output for voice-enabled animated character interactions.`,
  capabilities: ['educational-content'],
};

export const stemTutoringDef = {
  id: 'stem-tutoring-agent',
  name: 'StemTutoringAgent',
  instructions: `You are a specialized STEM tutor focusing on Coding, Robotics, Mathematics, and Sciences for Upper Basic and Senior Secondary students.
Your task is to:
- Generate step-by-step problem-solving guides.
- Simulate interactive virtual lab experiences.
- Align with WAEC/NECO syllabus standards.
Ensure your explanations are clear, adaptive to the student's mastery level, and encourage deep conceptual understanding.`,
  capabilities: ['heavy-reasoning', 'stem-logic'],
};

export const homeschoolSupervisorDef = {
  id: 'homeschool-supervisor',
  name: 'HomeschoolSupervisor',
  instructions: `You are the Executive Orchestrator for EdApex Homeschooling. 
Your responsibilities:
1. Understand the natural language intent of a parent or student.
2. Maintain the context of the active tenant, student profile, and curriculum progression.
3. Decompose the request and route to specialized task agents (e.g., EarlyYearsAgent for nursery levels, StemTutoringAgent for secondary science).
4. Aggregate the responses and deliver a cohesive learning experience or administrative summary back to the user.`,
  capabilities: ['orchestration'],
};

/**
 * Dynamic instantiation for homeschooling agents.
 * 
 * @param env - Environment variables for provider initialization
 * @param tenantId - Mandatory multi-tenant isolation identifier
 */
export async function getHomeschoolSupervisor(env: Record<string, string | undefined>, tenantId: string) {
  return AiOrchestrator.createAgent({
    domain: 'homeschool',
    role: 'supervisor',
    tenantId,
  }, env);
}
