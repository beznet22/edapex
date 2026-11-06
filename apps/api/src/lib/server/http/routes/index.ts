import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { adminAuth } from "./admin-auth.routes";
import { adminArchive } from "./admin-archive.routes";
import { adminDuplicateActions } from "./admin-duplicate-actions.routes";
import { adminDuplicateEmails } from "./admin-duplicate-emails.routes";
import { adminJobs } from "./admin-jobs.routes";
import { adminSessions } from "./admin-sessions.routes";
import { adminStudentCodes } from "./admin-student-codes.routes";
import { assessmentCaptures } from "./assessment-captures.routes";
import { assessmentFeedback } from "./assessment-feedback.routes";
import { assessmentOcr } from "./assessment-ocr.routes";
import { assessmentPublish } from "./assessment-publish.routes";
import { assessmentQueries } from "./assessment-queries.routes";
import { assessments } from "./assessments.routes";
import { attendance } from "./attendance.routes";
import { protectedAuth, publicAuth } from "./auth.routes";
import { me } from "./me.routes";
import { settingsAcademic } from "./settings-academic.routes";
import { settingsGeneral } from "./settings-general.routes";
import { settingsReport } from "./settings-report.routes";
import { studentLifecycle } from "./student-lifecycle.routes";
import { studentPhotos } from "./student-photos.routes";
import { students } from "./students.routes";
import { subjectAssignments } from "./subject-assignments.routes";

export const publicAuthRoutes = publicAuth;

export const createProtectedRoutes = (
  tenant: MiddlewareHandler<AppContext>
) =>
  new Hono<AppContext>()
    .use("/students", tenant)
    .use("/students/*", tenant)
    .use("/subjects/*", tenant)
    .use("/attendance", tenant)
    .use("/assessments/*", tenant)
    .use("/settings/*", tenant)
    .use("/admin", tenant)
    .use("/admin/*", tenant)
    .use("/admin/*", requireAdmin)
    .route("/auth", protectedAuth)
    .route("/me", me)
    .route("/students", students)
    .route("/students", studentPhotos)
    .route("/students", studentLifecycle)
    .route("/subjects", subjectAssignments)
    .route("/attendance", attendance)
    .route("/assessments", assessments)
    .route("/assessments", assessmentQueries)
    .route("/assessments", assessmentFeedback)
    .route("/assessments", assessmentOcr)
    .route("/assessments", assessmentCaptures)
    .route("/assessments/publish", assessmentPublish)
    .route("/settings", settingsGeneral)
    .route("/settings", settingsAcademic)
    .route("/settings", settingsReport)
    .route("/admin", adminStudentCodes)
    .route("/admin", adminDuplicateEmails)
    .route("/admin", adminDuplicateActions)
    .route("/admin", adminAuth)
    .route("/admin", adminSessions)
    .route("/admin", adminJobs)
    .route("/admin", adminArchive);
