import { redirect } from "next/navigation";

/**
 * `/admin/claim-links` redirects rather than 404s.
 *
 * The URL is recorded as live in `docs/cloudflare-port/PROGRESS.md`,
 * `phase9a-closeout.md` and `docs/workspace/specs/45-admin-claim-links.md`, and it may be
 * bookmarked by the people who used it. A permanent redirect keeps the bookmark working
 * without keeping a second page that renders the same data as `/workspace/admin`.
 */
export default function AdminClaimLinksPage() {
  redirect("/workspace/admin");
}
