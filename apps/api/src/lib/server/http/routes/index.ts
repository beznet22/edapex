import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";
import { requireAdmin } from "../middleware/authorize";
import { adminAuth } from "./admin-auth.routes";
import { adminArchive } from "./admin-archive.routes";
import { adminClaimLinks } from "./admin-claim-links.routes";
import { adminBootstrap } from "./admin-bootstrap.routes";
import { adminDuplicateActions } from "./admin-duplicate-actions.routes";
import { adminDuplicateEmails } from "./admin-duplicate-emails.routes";
import { adminJobs } from "./admin-jobs.routes";
import { adminMigration } from "./admin-migration.routes";
import { adminPromotion } from "./admin-promotion.routes";
import { adminSessions } from "./admin-sessions.routes";
import { adminStaffing } from "./admin-staffing.routes";
import { adminTerms } from "./admin-terms.routes";
import { adminResults } from "./admin-results.routes";
import { adminStudentCodes } from "./admin-student-codes.routes";
import { adminTokens } from "./admin-tokens.routes";
import { archiveRender } from "./archive-render.routes";
import { archiveRetrieval } from "./archive-retrieval.routes";
import { reportCard } from "./report-card.routes";
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
    .route("/students", archiveRetrieval)
    .route("/students", archiveRender)
    .route("/students", reportCard)
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
    .route("/admin", adminBootstrap)
    .route("/admin", adminStaffing)
    .route("/admin", adminMigration)
    .route("/admin", adminPromotion)
    .route("/admin", adminTerms)
    .route("/admin", adminSessions)
    .route("/admin", adminJobs)
    .route("/admin", adminArchive)
    .route("/admin", adminClaimLinks)
    .route("/admin", adminTokens)
    .route("/admin", adminResults);
