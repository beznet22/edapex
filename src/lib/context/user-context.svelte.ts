import type { Staff } from "$lib/server/db/schema";
import type { ClassStudent } from "$lib/server/repository/student.repo";
import type { AuthUser } from "$lib/types/auth-types";
import type { AssignedSubject, ClassSection } from "$lib/types/result-types";
import { DESIGNATION_TITLES, DESIGNATIONS, type Designation } from "$lib/types/sms-types";
import { getContext, setContext } from "svelte";

const USER_CONTEXT_KEY = Symbol("user-context");

export class UserContext {
  user = $state<AuthUser | undefined>(undefined);
  students = $state<ClassStudent[]>([]);
  classes = $state<Partial<ClassSection>[]>([]);
  designation = $state<Designation | undefined>(undefined);
  subjects = $state<Partial<AssignedSubject>[]>([]);
  staff = $state<Partial<Staff> | undefined>(undefined);

  isAdmin = $derived(this.designation === "ict_admin");
  isTeacher = $derived(this.designation === "class_teacher");
  isGrader = $derived(this.designation === "graders_coordinator");
  isEYFS = $derived(this.designation === "eyfs_coodinator");
  isCoordinator = $derived(this.isGrader || this.isEYFS || this.isAdmin);

  constructor(user: AuthUser | undefined, classes: Partial<ClassSection>[], students: ClassStudent[]) {
    this.user = user;
    this.classes = classes;
    this.students = students;
    this.designation = this.getDesignationById(user?.designationId || 0);
  }

  greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  };

  getName = (name?: string) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  getDesignationById(designationId: number): Designation | undefined {
    return DESIGNATIONS[designationId] as Designation | undefined;
  }

  getDesignationTitle(Designation?: Designation): string | undefined {
    if (!Designation) return undefined;
    return DESIGNATION_TITLES[DESIGNATIONS.indexOf(Designation)] as string | undefined;
  }

  setContext = () => {
    setContext(USER_CONTEXT_KEY, this);
  };

  static fromContext(): UserContext {
    return getContext(USER_CONTEXT_KEY);
  }
}
