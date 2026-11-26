import { error } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { AssignmentRepository } from "$lib/server/repository/assignment.repo";
import { ParentRepository } from "$lib/server/repository/parent.repo";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StaffRepository } from "$lib/server/repository/staff.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { SettingsService } from "$lib/server/service/settings.service";
import {
  canAccessPeople,
  canSelfAssign,
  isAdminOrIt,
  resolveSelectedClass,
} from "$lib/server/people/people-access";
import { parsePeopleParams } from "$lib/server/people/people-params";
import { countScanStatuses, getScanStatuses, type ScanStatusCounts } from "$lib/server/people/scan/scan-status";
import type { AuthUser } from "$lib/types/auth-types";
import type { ClassSection } from "$lib/types/result-types";
import type {
  AssignmentConfig,
  ClassOption,
  PeoplePageData,
  StudentRosterRow,
} from "$lib/server/people/people-types";

function toClassOptions(rows: ClassSection[]): ClassOption[] {
  const options: ClassOption[] = [];
  for (const row of rows) {
    if (row.classId === null || row.sectionId === null) continue;
    options.push({
      classId: row.classId,
      className: row.className,
      sectionId: row.sectionId,
      sectionName: row.sectionName,
    });
  }
  return options;
}

export async function loadPeoplePage(input: {
  user: AuthUser;
  url: URL;
}): Promise<PeoplePageData> {
  const { user, url } = input;

  if (!canAccessPeople(user)) {
    throw error(403, "You do not have access to the people directory");
  }

  const canManage = isAdminOrIt(user);
  const staffId = typeof user.staffId === "number" && user.staffId > 0 ? user.staffId : null;
  const schoolId = user.schoolId ?? 1;
  const filters = parsePeopleParams({ searchParams: url.searchParams, canManage });

  const db = await getDatabase();
  const tenant = createTenantContext({
    schoolId,
    userId: user.id,
    staffId: staffId ?? undefined,
  });
  const provider = new ScopedRepositoryProvider(db, tenant);
  const results = provider.getRepo(ResultsRepository);
  const assignments = provider.getRepo(AssignmentRepository);

  const activeYear = await results.getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;

  let allowedClasses: ClassOption[] = [];
  if (filters.tab === "students" && academicId !== null) {
    if (canManage) {
      allowedClasses = toClassOptions(
        await results.getClassSections({ schoolId, academicId })
      );
    } else if (staffId !== null) {
      allowedClasses = await results.getAssignedClassSections({ staffId, schoolId, academicId });
    }
  }

  let hasActiveAssignments = true;
  if (!canManage && academicId !== null) {
    if (allowedClasses.length > 0) {
      hasActiveAssignments = true;
    } else if (staffId !== null) {
      const eligibility = await assignments.getEligibility({ staffId, schoolId, academicId });
      hasActiveAssignments = eligibility.activeAssignments > 0;
    } else {
      hasActiveAssignments = false;
    }
  }

  const noClassAssigned =
    !canManage && staffId !== null && academicId !== null && !hasActiveAssignments;

  let staff: PeoplePageData["staff"];
  let parents: PeoplePageData["parents"];
  let students: PeoplePageData["students"];
  let assignment: AssignmentConfig | undefined;

  if (canManage && filters.tab === "staff") {
    const staffRepo = provider.getRepo(StaffRepository);
    const [directory, options] = await Promise.all([
      staffRepo.listDirectory({
        schoolId,
        q: filters.q,
        status: filters.status,
        includeInactive: filters.includeInactive,
        sort: filters.sort,
        dir: filters.dir,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
      staffRepo.getStaffRegistrationOptions(),
    ]);
    staff = { ...directory, options };
  }

  if (canManage && filters.tab === "parents") {
    const parentRepo = provider.getRepo(ParentRepository);
    parents = await parentRepo.listDirectory({
      schoolId,
      academicId,
      allYears: filters.allYears,
      q: filters.q,
      status: filters.status,
      sort: filters.sort,
      dir: filters.dir,
      page: filters.page,
      pageSize: filters.pageSize,
    });
  }

  if (filters.tab === "students") {
    const requested =
      filters.classId !== null && filters.sectionId !== null
        ? { classId: filters.classId, sectionId: filters.sectionId }
        : null;
    // A requested class outside the allowed set is ignored and falls back to the
    // first allowed row. With no request, teachers get their first assignment
    // while admins are prompted until they pick (auto-select when there is one).
    const policy = requested || !canManage ? "first" : "single";
    const selected = resolveSelectedClass(requested, allowedClasses, policy);

    let rows: StudentRosterRow[] = [];
    let total = 0;
    let stats = { total: 0, active: 0, noAdmission: 0 };

    // Terms (exam types) drive scan status. Default to the most recent active term so the Marks
    // column is populated without the teacher choosing first.
    const examTypes = academicId !== null ? await results.getExamTypes() : [];
    const examTypeOptions = examTypes
      .filter((examType) => examType.id !== null)
      .map((examType) => ({ id: examType.id as number, title: examType.title ?? null }));

    const requestedExam =
      filters.examTypeId !== null
        ? examTypeOptions.find((option) => option.id === filters.examTypeId)?.id ?? null
        : null;
    const selectedExamTypeId =
      requestedExam ??
      (examTypeOptions.length > 0 ? examTypeOptions[examTypeOptions.length - 1].id : null);

    let scanCounts: ScanStatusCounts | null = null;

    if (selected !== null && academicId !== null) {
      const roster = await provider.getRepo(StudentRepository).getClassRosterPage({
        schoolId,
        academicId,
        classId: selected.classId,
        sectionId: selected.sectionId,
        q: filters.q,
        sort: "name",
        dir: filters.dir,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      rows = roster.rows;
      total = roster.total;
      stats = roster.stats;

      if (selectedExamTypeId !== null && rows.length > 0) {
        const statuses = await getScanStatuses({
          schoolId,
          academicId,
          examTypeId: selectedExamTypeId,
          studentIds: rows.map((row) => row.id),
        });
        rows = rows.map((row) => ({
          ...row,
          scanStatus: statuses.get(row.id) ?? "not_uploaded",
        }));
        scanCounts = countScanStatuses(statuses);
      }
    }

    students = {
      classes: allowedClasses,
      selected,
      rows,
      total,
      stats,
      examTypes: examTypeOptions,
      selectedExamTypeId,
      scanCounts,
    };
  }

  if (!canManage && filters.tab === "students" && noClassAssigned) {
    const enabled = await new SettingsService(schoolId).getTeacherSelfAssignEnabled();
    const eligible = canSelfAssign({
      enabled,
      isAdminOrIt: false,
      staffId,
      activeAssignments: 0,
      staffActive: user.activeStatus !== 0,
    });

    let classes: ClassOption[] = [];
    let subjects: AssignmentConfig["subjects"] = [];
    if (eligible && academicId !== null) {
      const [classRows, subjectRows] = await Promise.all([
        results.getClassSections({ schoolId, academicId }),
        assignments.listSubjectOptions({ schoolId, academicId }),
      ]);
      classes = toClassOptions(classRows);
      subjects = subjectRows;
    }

    assignment = {
      enabled,
      canSelfAssign: eligible,
      subjects,
      classes,
      conflicts: [],
      offeringCount: 0,
    };
  }

  return {
    tab: filters.tab,
    canManage,
    viewer: {
      staffId,
      allowedClasses,
      hasActiveAssignments,
      noClassAssigned,
    },
    filters,
    assignment,
    staff,
    parents,
    students,
  };
}
