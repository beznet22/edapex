import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";
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
    .route("/settings", settingsReport);
