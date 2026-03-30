import { Agent } from '@mastra/core/agent';

/**
 * Early Years Agent (ECCDE)
 * Responsible for generating play-based, thematic content for children ages 0-6.
 */
export const earlyYearsAgent = new Agent({
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
  model: 'openai/gpt-4o',
});

/**
 * STEM Tutoring Agent (Coding & Robotics / Basic to Senior Secondary)
 * Responsible for step-by-step interactive problem solving and virtual labs.
 */
export const stemTutoringAgent = new Agent({
  id: 'stem-tutoring-agent',
  name: 'StemTutoringAgent',
  instructions: `You are a specialized STEM tutor focusing on Coding, Robotics, Mathematics, and Sciences for Upper Basic and Senior Secondary students.
Your task is to:
- Generate step-by-step problem-solving guides.
- Simulate interactive virtual lab experiences.
- Align with WAEC/NECO syllabus standards.
Ensure your explanations are clear, adaptive to the student's mastery level, and encourage deep conceptual understanding.`,
  model: 'openai/gpt-4o',
});

/**
 * Homeschool Supervisor Orchestrator
 * Interprets parent/student requests, manages curriculum context, and routes to specialized agents.
 */
export const homeschoolSupervisor = new Agent({
  id: 'homeschool-supervisor',
  name: 'HomeschoolSupervisor',
  instructions: `You are the Executive Orchestrator for EdApex Homeschooling. 
Your responsibilities:
1. Understand the natural language intent of a parent or student.
2. Maintain the context of the active tenant, student profile, and curriculum progression.
3. Decompose the request and route to specialized task agents (e.g., EarlyYearsAgent for nursery levels, StemTutoringAgent for secondary science).
4. Aggregate the responses and deliver a cohesive learning experience or administrative summary back to the user.`,
  model: 'openai/gpt-4o',
});
