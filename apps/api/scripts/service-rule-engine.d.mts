export interface ServiceRuleViolation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export function validateSource(relative: string, source: string): ServiceRuleViolation[];

export const SERVICE_RULE_CAPS: {
  readonly SERVICE_CAP: number;
  readonly DOMAIN_CAP: number;
};
