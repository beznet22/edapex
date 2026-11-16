import { redirect } from "next/navigation";

/**
 * The site root goes to the workspace.
 *
 * It used to render the admin claim directory, which meant the root URL was behind
 * `requireAdmin` — a teacher hitting it got a permissions error instead of their own
 * workspace, and a signed-out visitor got an admin table's login screen with no way to tell
 * it apart from the ordinary one.
 */
export default function HomePage() {
  redirect("/workspace");
}
