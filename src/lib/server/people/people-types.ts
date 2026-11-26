import type { AuthUser } from "$lib/types/auth-types";

export type PeopleTab = "staff" | "parents" | "students";
export type SortDir = "asc" | "desc";

export type StaffStatus = "all" | "active" | "inactive" | "no_email" | "linked" | "unlinked";
export type ParentStatus = "all" | "linked" | "unlinked" | "no_email" | "non_gmail" | "duplicate";

export type StaffSort = "name" | "role" | "status";
export type ParentSort = "name" | "status" | "email";
export type StudentSort = "name";

export type ClassOption = {
  classId: number;
  className: string | null;
  sectionId: number;
  sectionName: string | null;
};

export type SubjectOption = {
  id: number;
  subjectName: string;
  subjectCode: string | null;
  subjectType: "T" | "P";
};

export type StaffDirectoryRow = {
  id: number;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  staffPhoto: string | null;
  userId: number | null;
  active: boolean;
  linked: boolean;
  designation: string | null;
  department: string | null;
};

export type StaffStats = {
  total: number;
  active: number;
  noEmail: number;
  linked: number;
};

export type StaffOptions = {
  designations: { id: number; name: string | null }[];
  departments: { id: number; name: string | null }[];
  roles: { id: number; name: string | null }[];
  genders: { id: number; name: string | null }[];
};

export type ParentDirectoryRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  userId: number | null;
  linked: boolean;
  duplicateCount: number;
};

export type ParentStats = {
  total: number;
  linked: number;
  unlinked: number;
  noEmail: number;
  duplicate: number;
};

export type StudentRosterRow = {
  id: number;
  fullName: string | null;
  admissionNo: number | null;
  studentPhoto: string | null;
  classId: number;
  className: string | null;
  sectionId: number;
  sectionName: string | null;
  active: boolean;
  /** Derived scan state for the selected exam. Absent when no exam is selected. */
  scanStatus?: ScanUiStatus;
  /** Set when the last extraction failed, so the row can show a reason on demand. */
  scanFailureMessage?: string | null;
};

/** Client-safe status vocabulary, re-exported so the roster row has no server import. */
export type ScanUiStatus =
  | "not_uploaded"
  | "queued"
  | "extracting"
  | "draft"
  | "committed"
  | "published"
  | "failed";

export type StudentEditRow = {
  id: number;
  admissionNo: number | null;
  rollNo: number | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  studentPhoto: string | null;
  genderId: number | null;
  studentCategoryId: number | null;
  classId: number | null;
  className: string | null;
  sectionId: number | null;
  sectionName: string | null;
  active: boolean;
};

export type StudentEditOptions = {
  genders: { id: number; name: string | null }[];
  categories: { id: number; name: string | null }[];
};

export type StudentStats = {
  total: number;
  active: number;
  noAdmission: number;
};

export type ConflictRawRow = {
  classId: number | null;
  sectionId: number | null;
  subjectId: number | null;
  activeTeachers: number;
  teacherIds: string | null;
};

export type ConflictGroup = {
  classId: number;
  sectionId: number;
  subjectId: number;
  activeTeachers: number;
  teacherIds: number[];
};

export type OfferingRow = {
  id: number;
  classId: number;
  sectionId: number;
  subjectId: number;
  subjectName: string | null;
  teacherId: number | null;
  teacherName: string | null;
  active: boolean;
};

export type StaffFilters = {
  tab: "staff";
  q: string;
  status: StaffStatus;
  sort: StaffSort;
  dir: SortDir;
  page: number;
  pageSize: number;
  includeInactive: boolean;
  allYears: false;
  classId: null;
  sectionId: null;
  onboarding: boolean;
};

export type ParentFilters = {
  tab: "parents";
  q: string;
  status: ParentStatus;
  sort: ParentSort;
  dir: SortDir;
  page: number;
  pageSize: number;
  includeInactive: false;
  allYears: boolean;
  classId: null;
  sectionId: null;
  onboarding: boolean;
};

export type StudentFilters = {
  tab: "students";
  q: string;
  status: "all";
  sort: StudentSort;
  dir: SortDir;
  page: number;
  pageSize: number;
  includeInactive: false;
  allYears: false;
  classId: number | null;
  sectionId: number | null;
  /** Selected exam type (term) for scan status. Null = not chosen yet. */
  examTypeId: number | null;
  onboarding: boolean;
};

export type PeopleFilters = StaffFilters | ParentFilters | StudentFilters;

export type AssignmentConfig = {
  enabled: boolean;
  canSelfAssign: boolean;
  subjects: SubjectOption[];
  classes: ClassOption[];
  conflicts: ConflictGroup[];
  offeringCount: number;
};

export type PeopleViewer = {
  staffId: number | null;
  allowedClasses: ClassOption[];
  hasActiveAssignments: boolean;
  noClassAssigned: boolean;
};

export type PeopleIdentity = Pick<AuthUser, "id" | "staffId" | "designation" | "isAdministrator" | "schoolId">;

export type PeoplePageData = {
  tab: PeopleTab;
  canManage: boolean;
  viewer: PeopleViewer;
  filters: PeopleFilters;
  assignment?: AssignmentConfig;
  staff?: { rows: StaffDirectoryRow[]; total: number; stats: StaffStats; options: StaffOptions };
  parents?: {
    rows: ParentDirectoryRow[];
    total: number;
    stats: ParentStats;
    yearFallback: boolean;
  };
  students?: {
    classes: ClassOption[];
    selected: ClassOption | null;
    rows: StudentRosterRow[];
    total: number;
    stats: StudentStats;
    /** Exam types (terms) available for scanning. */
    examTypes: { id: number; title: string | null }[];
    /** Selected term, defaults to the current one. */
    selectedExamTypeId: number | null;
    /** Toolbar counters, present only when a term is selected. */
    scanCounts?: {
      pending: number;
      drafts: number;
      committed: number;
      published: number;
      failed: number;
    } | null;
  };
};
