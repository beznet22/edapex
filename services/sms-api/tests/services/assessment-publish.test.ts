import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smStudentTimelines } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import {
  AssessmentEntryService,
  AssessmentPublishService
} from "../../src/lib/server/services/assessment";
import { PortError } from "../../src/lib/server/services/errors";
import type { EmailMessage, EmailSender } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let publish: AssessmentPublishService;
const sent: EmailMessage[] = [];
let fail = false;

const email: EmailSender = {
  async send(message) {
    if (fail) throw new PortError("email", "provider down", true);
    sent.push(message);
    return { messageId: `message-${sent.length}` };
  }
};

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  const ctx = createServiceContext({ DB: env.DB }, tenantOf(school), {
    ports: { email }
  });
  const entry = createService(AssessmentEntryService, ctx);
  await entry.upsertStudentResult(
    {
      studentData: {
        studentId: school.studentId,
        classId: school.classId,
        sectionId: school.sectionId,
        recordId: school.recordId,
        examTypeId: school.termId,
        studentCategory: "NURSERY"
      },
      marksData: [{ subjectId: school.subjectId, marks: { CA: 30, EXAM: 50 } }]
    },
    school.staffId
  );
  publish = createService(AssessmentPublishService, ctx);
});

describe("assessment publish service", () => {
  it("sends a result email and writes the timeline row", async () => {
    const result = await publish.publishResults({
      studentIds: [school.studentId],
      examId: school.termId
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(sent[0]?.template).toBe("result");
    expect(sent[0]?.to).toBe("parent1@example.test");
    await expect(publish.isEmailAlreadySent(school.studentId, school.termId)).resolves.toBe(
      true
    );

    const timelines = await db
      .select()
      .from(smStudentTimelines)
      .where(eq(smStudentTimelines.staffStudentId, school.studentId));
    expect(timelines).toHaveLength(1);
    expect(timelines[0]?.type?.startsWith(`exam-${school.termId}`)).toBe(true);
  });

  it("suppresses a duplicate send unless resend is requested", async () => {
    const suppressed = await publish.publishResults({
      studentIds: [school.studentId],
      examId: school.termId
    });
    expect(suppressed.sent).toBe(0);
    expect(suppressed.errors.length).toBeGreaterThan(0);

    const resent = await publish.publishResults({
      studentIds: [school.studentId],
      examId: school.termId,
      resend: true
    });
    expect(resent.sent).toBe(1);
  });

  it("surfaces a PortError and leaves no new timeline row", async () => {
    fail = true;
    await expect(
      publish.publishResults({
        studentIds: [school.studentId],
        examId: school.termId,
        resend: true
      })
    ).rejects.toBeInstanceOf(PortError);
    fail = false;

    const timelines = await db
      .select()
      .from(smStudentTimelines)
      .where(eq(smStudentTimelines.staffStudentId, school.studentId));
    expect(timelines).toHaveLength(1);
  });

  it("sends a transcript through the same email port", async () => {
    const result = await publish.publishTranscript({
      to: "parent1@example.test",
      parentName: "Guardian 1",
      studentName: "Student 1",
      academicYear: "2026/1"
    });

    expect(result.success).toBe(true);
    expect(sent.at(-1)?.template).toBe("transcript");
  });
});
