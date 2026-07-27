import { json } from "@sveltejs/kit";
import { RequestContext } from "@mastra/core/request-context";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import { admitStudentSchema, admitStudentTool } from "$lib/server/mastra/tools/operations/write/admit-student";
import { StudentRepository, BaseRepository } from "$lib/server/repository";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { getDatabase } from "$lib/server/db";
import { mastra } from "$lib/server/mastra";
import { GROQ_FORMAT_MODEL } from "$lib/server/mastra/agents/format";
import { resolveModelForRequest } from "$lib/server/mastra/provider";
import { resolveUserRole } from "$lib/server/mastra/provider/role-resolver";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { template } = body as { template: string };
  if (!template) {
    return json({ error: "template field required" }, { status: 400 });
  }

  const schoolId = Number(body.schoolId ?? 1);

  const db = await getDatabase();
  const baseTenant = createTenantContext({ schoolId, userId: 1, designationId: ALLOWED_DESIGNATIONS.IT });
  const baseRepo = await BaseRepository.build(db, baseTenant);
  const activeYear = await baseRepo.getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  const academicYearTitle = activeYear?.title ?? null;

  const classId = Number(body.classId ?? 12);
  const sectionId = Number(body.sectionId ?? 5);
  const displayNames = await resolveClassNamesByIds({ schoolId, classId, sectionId, academicId: academicId ?? 0 });

  const tenant = createTenantContext({
    schoolId,
    userId: 1,
    staffId: 1,
    designationId: ALLOWED_DESIGNATIONS.IT,
    classId,
    sectionId,
    academicId,
    className: displayNames.className,
    sectionName: displayNames.sectionName,
    academicYearTitle,
  });

  const provider = new ScopedRepositoryProvider(db, tenant);
  const studentRepo = provider.getRepo(StudentRepository);
  const catalog = await studentRepo.getStudentRegistrationOptions();

  const requestContext = new RequestContext<unknown>();
  requestContext.set("tenantContext", tenant);

  const appDb = getAppDb();
  const traceContext = {
    userId: 1,
    schoolId: tenant.schoolId,
    actorStaffId: tenant.staffId,
    userRole: resolveUserRole(tenant.designationId),
    todayTokenUsage: 0,
  };
  try {
    const resolved = await resolveModelForRequest(1, GROQ_FORMAT_MODEL, appDb, undefined, traceContext);
    requestContext.set("modelConfig", resolved.config as never);
    if (resolved.providerOptions) {
      requestContext.set("providerOptions", resolved.providerOptions as never);
    }
  } catch {
    // Falls through to agent's built-in buildDefaultModelForRole('formatter')
  }

  const classCatalog = catalog.classes
    .map((c) => {
      const sections = catalog.sections
        .map((s) => `{id: ${s.id}, name: "${s.name}"}`)
        .join(", ");
      return `  - id=${c.id}, name="${c.name}", sections: [${sections}]`;
    })
    .join("\n");

  const categories = catalog.categories.map((c) => c.name).join(", ");

  const instructions = `You are a structured data extraction specialist. Extract student admission data from a plain-text template and output ONLY a JSON object — no markdown fences, no commentary, no extra text.

Output keys:
- studentDetails: object with firstName, lastName, gender ("Male"|"Female"), category (one of: ${categories}), and optional dateOfBirth (YYYY-MM-DD)
- guardianDetails: object with relation ("Father"|"Mother"|"Other"), guardianName, phone, email
- enrollmentDetails: object with classId (number) and sectionId (number)
- resolvedClass: object with className and sectionName matching the matched catalog entry
- reason: a short human-readable summary like "Admit firstName lastName to className [sectionName]"

Extraction rules:
- Split the template's firstName field on the first space: firstName is the part before, lastName is the part after.
- gender: normalize to "Male" or "Female".
- category: use one of: ${categories}.
- dateOfBirth: parse from "Date of Birth:" line if present. Output as YYYY-MM-DD. Omit if absent.
- guardianRelation: normalize to "Father", "Mother", or "Other".
- assignedClass: match against the AVAILABLE CLASSES to find classId and sectionId. Output BOTH the resolved classId/sectionId AND the className/sectionName in resolvedClass.
- reason: a short human-readable summary.`;

  const prompt = [
    `Extract structured admission data from this template.`,
    ``,
    `AVAILABLE CLASSES (match assignedClass text against name + section):`,
    classCatalog,
    ``,
    `TEMPLATE:`,
    template,
  ].join("\n");

  const agent = mastra.getAgent("format");
  const response = await agent.generate(prompt, {
    instructions,
    requestContext: requestContext as never,
    providerOptions: { groq: { reasoningEffort: "none" } } as never,
  });

  let rawJson: unknown;
  const obj = (response as { object?: unknown }).object;
  if (obj !== undefined) {
    rawJson = obj;
  } else {
    const text = (response as { text?: string }).text ?? "";
    try {
      rawJson = JSON.parse(text);
    } catch {
      return json({ error: "Agent returned unparseable output", raw: text }, { status: 422 });
    }
  }

  const parsed = admitStudentSchema.safeParse(rawJson);
  if (!parsed.success) {
    return json({
      error: "Schema validation failed",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      raw: rawJson,
    }, { status: 422 });
  }

  const executeFn = admitStudentTool.execute;
  if (typeof executeFn !== "function") throw new Error("admitStudentTool.execute is not bound");
  const result = await executeFn(
    parsed.data,
    { requestContext: requestContext as never } as never,
  );

  return json(result);
};