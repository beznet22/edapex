import { logger } from '../../../utils/logger.js';

const log = logger.child({ service: 'SkillLoaderService' });

export interface SkillDefinition {
  domain: string;
  role: string;
  identity: string; // From AGENTS.md
  procedures: string; // From SKILL.md
}

/**
 * SkillLoaderService
 * Responsible for hydrating agent identity and procedures from the filesystem.
 * Markdown-First approach inspired by Paperclip/Hermes.
 */
export class SkillLoaderService {
  private static skillsCache: Map<string, SkillDefinition> = new Map();

  /**
   * Loads a skill by domain and role.
   * [EDGE-NATIVE]: Uses dynamic imports or pre-bundled registry.
   */
  static async loadSkill(domain: string, role: string): Promise<SkillDefinition | null> {
    const cacheKey = `${domain}.${role}`;
    if (this.skillsCache.has(cacheKey)) {
      return this.skillsCache.get(cacheKey)!;
    }

    try {
      log.info('Loading skill from filesystem', { domain, role });

      const identity = await this.readSkillFile(domain, role, 'AGENTS.md');
      const procedures = await this.readSkillFile(domain, role, 'SKILL.md');

      if (!identity || !procedures) {
        log.warn('Skill files missing', { domain, role });
        return null;
      }

      const definition: SkillDefinition = {
        domain,
        role,
        identity,
        procedures,
      };

      this.skillsCache.set(cacheKey, definition);
      return definition;
    } catch (error) {
      log.error('Failed to load skill', { domain, role, error });
      return null;
    }
  }

  private static async readSkillFile(domain: string, role: string, filename: string): Promise<string | null> {
    // This is where the magic happens. We need to resolve the file content.
    // For local dev with `nodejs_compat`, we can use `fs`.
    // For production, we'll need these bundled.
    
    try {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      
      // Calculate path relative to project root or use a build-time constant
      const filePath = join(process.cwd(), 'src/services/ai/skills', domain, role, filename);
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch {
      // Fallback for non-node environments
      return null;
    }
  }
}
