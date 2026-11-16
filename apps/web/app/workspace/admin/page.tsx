import { UserManagementSurface } from "@/components/admin/UserManagementSurface";

/**
 * The dashboard.
 *
 * One route. Staff, students, duplicates and permissions are tabs; every object opens in a
 * modal; every parameter is a dropdown. Nothing here navigates away from the page, which is
 * why `app/workspace/admin/` has no children.
 */
export default function WorkspaceAdminPage() {
  return <UserManagementSurface />;
}
