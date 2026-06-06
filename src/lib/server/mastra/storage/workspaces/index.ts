import { createTenantWorkspace } from "./tenant";
import { resolveTenantFilesystem, resolveExamFilesystem } from "./resolve-tenant-filesystem";
import { verifyTeacherAssignment } from "./verify-teacher-assignment";

export const tenantWorkspace = createTenantWorkspace();

export { createTenantWorkspace };
export { resolveTenantFilesystem, resolveExamFilesystem };
export { verifyTeacherAssignment };
