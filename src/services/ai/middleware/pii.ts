import { logger } from '../../../utils/logger.js';

const log = logger.child({ service: 'PIIObfuscator' });

export interface ObfuscationMap {
  [token: string]: string;
}

export class PIIObfuscator {
  private map: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private tokenCount = 0;

  /**
   * Tokenizes PII in the input text.
   * Simple regex for demonstration, will be expanded to NER in production.
   */
  obfuscate(text: string): string {
    let obfuscated = text;

    // Patterns for PII
    const patterns = {
      EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      PHONE: /\+?[0-9]{10,15}/g,
      // Names are harder with regex, usually requires NER or known list
    };

    for (const [label, regex] of Object.entries(patterns)) {
      obfuscated = obfuscated.replace(regex, (match) => {
        return this.getOrCreateToken(match, label);
      });
    }

    return obfuscated;
  }

  /**
   * Replaces tokens in the LLM response with original PII.
   */
  deobfuscate(text: string): string {
    let deobfuscated = text;
    this.reverseMap.forEach((original, token) => {
      deobfuscated = deobfuscated.split(token).join(original);
    });
    return deobfuscated;
  }

  private getOrCreateToken(original: string, label: string): string {
    if (this.map.has(original)) {
      return this.map.get(original)!;
    }

    const token = `[${label}_${++this.tokenCount}]`;
    this.map.set(original, token);
    this.reverseMap.set(token, original);
    
    log.debug('PII Tokenized', { label, token });
    return token;
  }

  getMapping(): ObfuscationMap {
    const mapping: ObfuscationMap = {};
    this.reverseMap.forEach((v, k) => {
      mapping[k] = v;
    });
    return mapping;
  }
}
