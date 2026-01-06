import type { Staff } from "$lib/server/db/schema";
import type { ClassStudent } from "$lib/server/repository/student.repo";
import type { AuthUser } from "$lib/types/auth-types";
import type { AssignedSubject, ClassSection } from "$lib/types/result-types";
import { DESIGNATION_TITLES, DESIGNATIONS, type Designation } from "$lib/types/sms-types";
import { localStore } from "$lib/utils";
import { getContext, setContext } from "svelte";

const USER_CONTEXT_KEY = Symbol("user-context");

export class UserContext {
  user = $state<AuthUser | undefined>(undefined);
  students = $state<ClassStudent[]>([]);
  classes = $state<ClassSection[]>([]);
  designation = $state<Designation | undefined>(undefined);
  subjects = $state<AssignedSubject[]>([]);
  staff = $state<Staff | undefined>(undefined);

  isIt = $derived(this.designation === "it");
  isTeacher = $derived(this.designation === "class_teacher");
  isCoordinator = $derived(this.designation === "coordinator");

  constructor(user: AuthUser | undefined, classes: ClassSection[], students?: ClassStudent[]) {
    this.user = user;
    this.classes = classes;
    this.students = students || [];
    this.designation = user?.designation;
    this.students = localStore<ClassStudent[]>("students") || []
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

export function useUser() {
  return UserContext.fromContext();
}

