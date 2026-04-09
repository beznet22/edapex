import { Agent } from '@mastra/core/agent';
import { Tool } from '@mastra/core/tools';
import { SkillLoaderService } from './loader.service.js';
import { logger } from '../../../utils/logger.js';
import { PIIObfuscator } from '../middleware/pii.js';

const log = logger.child({ service: 'UniversalWorker' });

export interface WorkerOptions {
  domain: string;
  role: string;
  tenantId: string;
  env?: Record<string, string | undefined>;
}

/**
 * UniversalWorker
 * A high-fidelity, dynamic AI worker hydrated by Hermes skills.
 * 
 * [PATTERN]: This is the foundation of the EdApex V2 Agentic School.
 * It replaces static agent definitions with dynamic skill hydration.
 */
export class UniversalWorker {
  private static piiObfuscator = new PIIObfuscator();

  /**
   * Creates a Mastra Agent for the given role, hydrated with domain specific skills.
   */
  static async createAgent(options: WorkerOptions): Promise<Agent> {
    const { domain, role, tenantId, env } = options;

    log.info('Hydrating UniversalWorker', { domain, role, tenantId });

    // 1. Load Skill Definition
    const skill = await SkillLoaderService.loadSkill(domain, role);
    if (!skill) {
      throw new Error(`Failed to load skill for ${domain}.${role}`);
    }

    // 2. Composite Instructions (Soul + Procedures)
    const domainContext = this.getDomainContext(domain);
    const rawInstructions = `
# Identity (Soul)
${skill.identity}

# Procedural Memory
${skill.procedures}

# Context Guards
${domainContext}
- Tenant Lifecycle: Scoped to tenantId ${tenantId}
- Protocol: Hermes Standard (Markdown-First)
    `;

    // 3. Privacy Obfuscation
    const obfuscatedInstructions = this.piiObfuscator.obfuscate(rawInstructions);

    // 4. Resolve Model (Using unified AiOrchestrator)
    const orchestratorPath = '../orchestrator.js';
    const { AiOrchestrator } = await import(orchestratorPath);
    const modelConfig = await AiOrchestrator.resolveModelConfig('speed', env || {});
    const model = await AiOrchestrator.initializeModel(modelConfig, env || {});

    // 5. Tool Binding (Centralized Dynamic Registration)
    const { toolRegistry, getToolsByRole } = await import('./tool.registry.js');
    const roleId = `${domain}.${role}`;
    
    // Get authorized tool names for this role
    const authorizedToolNames = toolRegistry[roleId] || getToolsByRole(role);

    // 6. Fetch actual move instances
    const availableTools = await this.getDomainTools(domain, undefined, env || {});
    const boundTools: Tool[] = [];

    for (const name of authorizedToolNames) {
       if (availableTools[name]) {
         boundTools.push(availableTools[name]);
       }
    }

    // 7. Instantiate Mastra Agent
    return new Agent({
      id: `${roleId}.${tenantId}`,
      name: `${skill.role} Agent`,
      instructions: obfuscatedInstructions,
      model,
      tools: boundTools,
    });
  }

  private static getDomainContext(domain: string): string {
    const contexts: Record<string, string> = {
      academic: '- Authority: Senior Teacher / HOD guidelines / NERDC standards.',
      finance: '- Authority: Bursar Head / School Board fiscal policies / FIRS compliance.',
      hr: '- Authority: HR Manager / Employment Laws / Staff Confidentiality.',
      it: '- Authority: Systems Lead / Data Security / Privacy Policy.',
      executive: '- Authority: School Proprietor / Strategic Growth Board.',
    };

    return contexts[domain] || '- Authority: Domain-specific supervisor guidelines.';
  }

  private static async getDomainTools(domain: string, aiService?: { updateTask: (t: string, id: string, d: Record<string, string | number | boolean | null | object>) => Promise<object | void> }, env: Record<string, string | undefined> = {}) {
    const { requestHumanOperatorTool } = await import('../tools/handoff.tools.js');
    const { sendSMSNotificationTool, createPaymentLinkTool } = await import('../tools/webhooks.vault.js');
    
    const tools: Record<string, Tool> = {
      // Universal Tools (available to all)
      request_human_operator: requestHumanOperatorTool(aiService),
    };

    if (aiService) {
      tools.request_human_operator = requestHumanOperatorTool(aiService);
    }

    // Domain-Specific Tools
    if (domain === 'finance' || domain === 'executive') {
      tools.create_payment_link = createPaymentLinkTool(env);
    }

    if (domain === 'communication' || domain === 'hr' || domain === 'academic') {
      tools.send_sms_notification = sendSMSNotificationTool(env);
    }

    return tools;
  }
}
