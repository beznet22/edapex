import { BaseRepository } from "./base.repo";
import { AuthRepository } from "./auth.repo";
import { ParentRepository } from "./parent.repo";
import { ResultsRepository } from "./result.repo";
import { StaffRepository } from "./staff.repo";
import { StudentRepository } from "./student.repo";
import { TimelineRepository } from "./timeline.repo";

// Auth is the only repository that keeps a module-level singleton. It is
// not tenant-scoped: login, refresh, and password reset queries must run
// across all schools (the user is not yet known to be tied to a tenant
// when the first lookup happens). All other repos are now constructed
// per-request via `provider.getRepo(RepoClass)` — see
// `lib/server/mastra/scoped-repository.ts` for the per-request pattern.
export const authRepo = await AuthRepository.build();

export * from "./base.repo";
export * from "./auth.repo";
export * from "./parent.repo";
export * from "./result.repo";
export * from "./staff.repo";
export * from "./student.repo";
export * from "./timeline.repo";

// Re-exported classes so callers can do `provider.getRepo(StudentRepository)`
// without reaching into the individual files.
export {
  BaseRepository,
  ParentRepository,
  ResultsRepository,
  StaffRepository,
  StudentRepository,
  TimelineRepository,
};
