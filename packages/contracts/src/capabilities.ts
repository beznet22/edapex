export const CAPABILITY_ROLES = ["admin", "teacher", "parent", "student"] as const;
export type CapabilityRole = (typeof CAPABILITY_ROLES)[number];

export const CAPABILITY_RISKS = ["read", "write", "destructive"] as const;
export type CapabilityRisk = (typeof CAPABILITY_RISKS)[number];

export const CAPABILITY_APPROVALS = ["required", "none"] as const;
export type CapabilityApproval = (typeof CAPABILITY_APPROVALS)[number];

export interface CapabilityOperation {
  readonly id: string;
  readonly description: string;
  readonly risk: CapabilityRisk;
  readonly approval: CapabilityApproval;
  readonly idempotent: boolean;
  readonly roles: readonly CapabilityRole[];
}

export interface CapabilityTool {
  readonly id: string;
  readonly description: string;
  readonly operations: readonly CapabilityOperation[];
}

export interface CapabilityPack {
  readonly id: string;
  readonly role: CapabilityRole;
  readonly tools: readonly CapabilityTool[];
}

export interface CapabilityLimits {
  readonly maxTools: 5;
  readonly maxOperationsPerTool: 8;
}

/**
 * A tenant-level on/off switch for a capability area.
 *
 * Filtering happens before the 5-tool cap, so a disabled area can never consume
 * a tool slot.
 */
export interface TenantFeature {
  readonly id: string;
  readonly enabled: boolean;
}

/**
 * The operations one agent may call, always a subset of its creator's ceiling.
 *
 * An agent narrows; it never extends the catalogue. Enforced server-side at
 * creation and again at every turn.
 */
export interface AgentGrant {
  readonly agentId: string;
  readonly operationIds: readonly string[];
}

/**
 * The subset of features that are explicitly disabled.
 *
 * Unlisted features are **enabled**: a tenant masks off what it does not use, and
 * a partial mask must not silently disable everything else.
 */
export function disabledFeatureIds(
  features: readonly TenantFeature[]
): ReadonlySet<string> {
  const disabled = new Set<string>();
  for (const feature of features) {
    if (!feature.enabled) disabled.add(feature.id);
  }
  return disabled;
}

export interface CapabilityManifest {
  readonly version: "1";
  readonly role: CapabilityRole;
  readonly packs: readonly CapabilityPack[];
  readonly limits: CapabilityLimits;
}

export const CAPABILITY_LIMITS: CapabilityLimits = Object.freeze({
  maxTools: 5,
  maxOperationsPerTool: 8
});

const ALL_ROLES = CAPABILITY_ROLES;
const ADULTS: readonly CapabilityRole[] = ["admin", "teacher", "parent"];
const STAFF: readonly CapabilityRole[] = ["admin", "teacher"];
const ADMIN_ONLY: readonly CapabilityRole[] = ["admin"];
const READERS: readonly CapabilityRole[] = ["admin", "teacher", "parent", "student"];

export const CAPABILITY_TOOLS = [
  {
    id: "people",
    description: "Search and manage people within the current school scope.",
    operations: [
      {
        id: "search",
        description: "Search students, parents and staff by name, email or admission number.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: READERS
      },
      {
        id: "get",
        description: "Read one person and their guardian or class links.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: READERS
      },
      {
        id: "update",
        description: "Update permitted profile fields.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      },
      {
        id: "status",
        description: "Change a person's active or enrollment status.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      },
      {
        id: "link_guardian",
        description: "Link a guardian to a student after admin approval.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      },
      {
        id: "unlink_guardian",
        description: "Remove a guardian link after admin approval.",
        risk: "destructive",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      }
    ]
  },
  {
    id: "academics",
    description: "Read and plan academic structure, staffing and promotion.",
    operations: [
      {
        id: "list_classes",
        description: "List classes in the active academic year.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADULTS
      },
      {
        id: "list_sections",
        description: "List sections for a class.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADULTS
      },
      {
        id: "list_subjects",
        description: "List subjects and their class assignments.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADULTS
      },
      {
        id: "get_staffing",
        description: "Read section staffing and unstaffed gaps.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: STAFF
      },
      {
        id: "plan_promotion",
        description: "Build a promotion plan without writing it.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      }
    ]
  },
  {
    id: "attendance",
    description: "Read and record scoped attendance.",
    operations: [
      {
        id: "get_class",
        description: "Read a class or section attendance sheet.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: STAFF
      },
      {
        id: "get_student",
        description: "Read one student's attendance history.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ALL_ROLES
      },
      {
        id: "save",
        description: "Save attendance for the scoped class and date.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: STAFF
      }
    ]
  },
  {
    id: "assessment",
    description: "Read and write marksheets, feedback and transcripts.",
    operations: [
      {
        id: "get_marksheet",
        description: "Read a marksheet for a student and exam.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: READERS
      },
      {
        id: "save_marksheet",
        description: "Save a validated marksheet.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: STAFF
      },
      {
        id: "save_feedback",
        description: "Save ratings and remarks for a student.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: STAFF
      },
      {
        id: "get_report_card",
        description: "Read a published report card.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: READERS
      },
      {
        id: "get_transcript",
        description: "Read a published transcript.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: READERS
      }
    ]
  },
  {
    id: "admin_issues",
    description: "Review and resolve school-wide identity and setup issues.",
    operations: [
      {
        id: "list",
        description: "List open admin issues in the current school.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "get",
        description: "Read one admin issue with its evidence.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "plan",
        description: "Build a resolution plan without applying it.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "apply",
        description: "Apply an approved resolution action.",
        risk: "destructive",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      }
    ]
  },
  {
    id: "admissions",
    description: "Review applications and plan enrollment.",
    operations: [
      {
        id: "list",
        description: "List applications by status.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "get",
        description: "Read an application and its documents.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "review",
        description: "Record an application review note.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      },
      {
        id: "decide",
        description: "Record an offer, waitlist or rejection decision.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      },
      {
        id: "plan_enrollment",
        description: "Build an enrollment plan without writing it.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: ADMIN_ONLY
      },
      {
        id: "apply_enrollment",
        description: "Create the student, guardian link and enrollment after approval.",
        risk: "destructive",
        approval: "required",
        idempotent: false,
        roles: ADMIN_ONLY
      }
    ]
  },
  {
    id: "workspace",
    description: "Local files, workflows and sandboxed execution.",
    operations: [
      {
        id: "list_files",
        description: "List files in the workspace.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: STAFF
      },
      {
        id: "read_file",
        description: "Read a workspace file.",
        risk: "read",
        approval: "none",
        idempotent: true,
        roles: STAFF
      },
      {
        id: "write_file",
        description: "Write a workspace file after approval.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: STAFF
      },
      {
        id: "run_workflow",
        description: "Run a typed local workflow.",
        risk: "write",
        approval: "required",
        idempotent: false,
        roles: STAFF
      },
      {
        id: "run_code",
        description: "Run code in the local sandbox.",
        risk: "destructive",
        approval: "required",
        idempotent: false,
        roles: STAFF
      },
      {
        id: "create_artifact",
        description: "Create a local artifact from a tool result.",
        risk: "write",
        approval: "none",
        idempotent: false,
        roles: STAFF
      }
    ]
  }
] as const satisfies readonly CapabilityTool[];

const ROLE_TOOL_IDS = {
  admin: ["people", "academics", "assessment", "admin_issues", "admissions"],
  teacher: ["people", "academics", "attendance", "assessment", "workspace"],
  parent: ["people", "academics", "attendance", "assessment"],
  student: ["people", "academics", "attendance", "assessment"]
} as const satisfies Record<CapabilityRole, readonly string[]>;

function toolById(id: string): CapabilityTool {
  const tool = CAPABILITY_TOOLS.find((candidate) => candidate.id === id);
  if (tool === undefined) throw new Error(`Unknown capability tool: ${id}`);
  return tool;
}

function visibleTool(tool: CapabilityTool, role: CapabilityRole): CapabilityTool | null {
  const operations = tool.operations.filter((operation) => operation.roles.includes(role));
  if (operations.length === 0) return null;
  return Object.freeze({
    id: tool.id,
    description: tool.description,
    operations: Object.freeze(operations)
  });
}

/**
 * Build the effective manifest for a role in a tenant.
 *
 * `features` is the tenant feature mask. Filtering by feature happens **before**
 * the 5-tool cap, so disabling an area frees its slot rather than consuming it.
 * Omitting `features` means "no tenant filtering" — the shipped default.
 */
export function buildCapabilityManifest(
  role: CapabilityRole,
  features: readonly TenantFeature[] = []
): CapabilityManifest {
  const disabled = disabledFeatureIds(features);
  const toolIds = ROLE_TOOL_IDS[role];
  const tools: CapabilityTool[] = [];
  for (const id of toolIds) {
    if (disabled.has(id)) continue;
    const visible = visibleTool(toolById(id), role);
    if (visible !== null) tools.push(visible);
  }
  const issues = validateCapabilityPacks([
    { id: `${role}_pack`, role, tools }
  ]);
  if (issues.length > 0) throw new Error(`Capability budget violation: ${issues.join("; ")}`);
  return Object.freeze({
    version: "1" as const,
    role,
    packs: Object.freeze([{ id: `${role}_pack`, role, tools: Object.freeze(tools) }]),
    limits: CAPABILITY_LIMITS
  });
}

/** Every operation id a role may call in this tenant. Used to bound agent grants. */
export function allowedOperationIds(
  role: CapabilityRole,
  features: readonly TenantFeature[] = []
): ReadonlySet<string> {
  const manifest = buildCapabilityManifest(role, features);
  const ids = new Set<string>();
  for (const pack of manifest.packs) {
    for (const tool of pack.tools) {
      for (const operation of tool.operations) ids.add(operation.id);
    }
  }
  return ids;
}

/**
 * Validate an agent's grants against its creator's ceiling.
 *
 * Returns the offending operation ids, or an empty list when the grant set is a
 * legitimate subset. An agent with an empty grant list is valid.
 */
export function validateAgentGrant(
  grant: AgentGrant,
  role: CapabilityRole,
  features: readonly TenantFeature[] = []
): readonly string[] {
  const allowed = allowedOperationIds(role, features);
  const violations: string[] = [];
  for (const operationId of grant.operationIds) {
    if (!allowed.has(operationId)) {
      violations.push(`${grant.agentId} may not call ${operationId} as ${role}`);
    }
  }
  return Object.freeze(violations);
}

export function validateCapabilityPacks(
  packs: readonly CapabilityPack[]
): readonly string[] {
  const issues: string[] = [];
  for (const pack of packs) {
    if (pack.tools.length > CAPABILITY_LIMITS.maxTools) {
      issues.push(`${pack.id} exposes ${pack.tools.length} tools (max 5)`);
    }
    for (const tool of pack.tools) {
      if (tool.operations.length > CAPABILITY_LIMITS.maxOperationsPerTool) {
        issues.push(
          `${pack.id}.${tool.id} exposes ${tool.operations.length} operations (max 8)`
        );
      }
      const ids = new Set<string>();
      for (const operation of tool.operations) {
        if (ids.has(operation.id)) {
          issues.push(`${pack.id}.${tool.id} duplicates operation ${operation.id}`);
        }
        ids.add(operation.id);
        if (!operation.roles.includes(pack.role)) {
          issues.push(
            `${pack.id}.${tool.id}.${operation.id} is not allowed for ${pack.role}`
          );
        }
      }
    }
  }
  return Object.freeze(issues);
}

export function validateAllRolePacks(): readonly string[] {
  const issues: string[] = [];
  for (const role of CAPABILITY_ROLES) {
    const manifest = buildCapabilityManifest(role);
    for (const pack of manifest.packs) issues.push(...validateCapabilityPacks([pack]));
  }
  return Object.freeze(issues);
}
