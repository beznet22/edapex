import { describe, expect, it } from "vitest";

import { createApiClient } from "../../src/lib/http/client";
import type { ApiClient } from "../../src/lib/http/client";

const typeCoverage = (client: ApiClient): void => {
  void client.health.$get;
  void client.uploads.students[":file"].$get;

  void client.api.v1.auth["magic-link"].$post;
  void client.api.v1.auth["magic-link"].verify.$get;
  void client.api.v1.auth["claim-link"].exchange.$post;
  void client.api.v1.auth.logout.$post;
  void client.api.v1.auth["logout-all"].$post;
  void client.api.v1.auth.refresh.$post;
  void client.api.v1.auth.mobile.refresh.$post;
  void client.api.v1.auth.mobile.logout.$post;
  void client.api.v1.auth.claim.$post;
  void client.api.v1.auth.google.start.$get;
  void client.api.v1.auth.google.callback.$get;
  void client.api.v1.auth.code.$post;
  void client.api.v1.auth.mobile.code.$post;
  void client.api.v1.me.$get;
  void client.api.v1.me.$patch;

  void client.api.v1.students.$get;
  void client.api.v1.students[":studentId"].status.$patch;
  void client.api.v1.students[":studentId"].promotions.$post;
  void client.api.v1.students[":studentId"].demotions.$post;
  void client.api.v1.students[":studentId"].photo.$put;
  void client.api.v1.students[":studentId"].photo.claim.$post;
  void client.api.v1.students[":studentId"].photo.$delete;

  void client.api.v1.subjects.assignments.$post;
  void client.api.v1.attendance.$put;

  void client.api.v1.assessments.marksheets.$post;
  void client.api.v1.assessments.results.$put;
  void client.api.v1.assessments.results[":identifier"][":examId"].$get;
  void client.api.v1.assessments.transcripts[":studentId"][":academicId"].$get;
  void client.api.v1.assessments.feedback.remarks.$put;
  void client.api.v1.assessments.feedback.ratings.$put;
  void client.api.v1.assessments.ocr.extractions.$post;
  void client.api.v1.assessments.ocr.cache.$delete;
  void client.api.v1.assessments.captures.$post;
  void client.api.v1.assessments.captures[":captureId"].confirmation.$post;
  void client.api.v1.assessments.publish.results.$post;
  void client.api.v1.assessments.publish.transcript.$post;

  void client.api.v1.settings.general.$get;
  void client.api.v1.settings.general.$patch;
  void client.api.v1.settings["academic-years"].$get;
  void client.api.v1.settings["academic-years"].$post;
  void client.api.v1.settings["academic-years"].active.$get;
  void client.api.v1.settings["academic-years"].active.$put;
  void client.api.v1.settings["exam-types"].$get;
  void client.api.v1.settings["exam-types"].$post;
  void client.api.v1.settings["exam-types"][":examTypeId"].active.$patch;
  void client.api.v1.settings["report-templates"].$get;
  void client.api.v1.settings["report-templates"].$patch;

  void client.api.v1.admin["student-codes"].issue.$post;
  void client.api.v1.admin["student-codes"][":studentId"].reissue.$post;
  void client.api.v1.admin["student-codes"][":studentId"].$delete;
  void client.api.v1.admin["duplicate-emails"].$get;
  void client.api.v1.admin["duplicate-emails"]["export"].$get;
  void client.api.v1.admin["duplicate-emails"].reassign.$post;
  void client.api.v1.admin["duplicate-emails"].merge.$post;
  void client.api.v1.admin["duplicate-emails"].flag.$post;
  void client.api.v1.admin.auth["claim-reset"].$post;
  void client.api.v1.admin["claim-links"].$get;
  void client.api.v1.admin["claim-links"].$post;
  void client.api.v1.admin["claim-links"][":id"].revoke.$post;
};

describe("typed client coverage", () => {
  it("references every route through hc<AppType>", () => {
    expect(typeof typeCoverage).toBe("function");
    expect(createApiClient("http://local.test")).toBeDefined();
  });
});
