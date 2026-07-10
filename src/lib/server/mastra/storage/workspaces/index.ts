import { createTenantWorkspace } from "./tenant";
import { resolveTenantFilesystem } from "./resolve-tenant-filesystem";
import { verifyTeacherAssignment } from "./verify-teacher-assignment";

export const tenantWorkspace = createTenantWorkspace();

export { createTenantWorkspace };
export { resolveTenantFilesystem };
export { verifyTeacherAssignment };
