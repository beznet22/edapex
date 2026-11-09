import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import type { ClaimDirectoryItem, ClaimDirectoryPage } from "./api";

const linkLabel = (item: ClaimDirectoryItem): string => {
  if (item.linkStatus === "none") return "—";
  if (item.linkStatus === "active") return "Active";
  return item.linkStatus[0]?.toUpperCase() + item.linkStatus.slice(1);
};

const dateLabel = (value: number | null): string =>
  value === null ? "—" : new Date(value * 1000).toLocaleString();

const statusBadge = (item: ClaimDirectoryItem) => {
  if (item.claimStatus === "claimed") {
    return <Badge className="bg-emerald-400/10 text-emerald-300">Claimed</Badge>;
  }
  if (item.claimStatus === "flagged") return <Badge variant="destructive">Flagged</Badge>;
  if (item.userId === null) return <Badge variant="secondary">No user</Badge>;
  return <Badge className="bg-amber-300/10 text-amber-200">Unclaimed</Badge>;
};

interface DirectoryTableProps {
  readonly page: ClaimDirectoryPage | null;
  readonly loading: boolean;
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onRequest: (item: ClaimDirectoryItem) => void;
  readonly onRevoke: (item: ClaimDirectoryItem) => void;
}

export function DirectoryTable({
  page,
  loading,
  pageNumber,
  pageSize,
  onPrevious,
  onNext,
  onRequest,
  onRevoke
}: DirectoryTableProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex justify-between px-4 py-3 text-xs text-muted-foreground">
        <span>{page?.total ?? 0} records</span>
        {loading ? <span>Loading…</span> : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {["Persona", "Name", "Email", "Phone", "Claim", "Google", "Duplicate", "Link", "Action"].map(
              (label) => (
                <TableHead key={label}>{label}</TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(page?.items ?? []).map((item) => {
            const disabled =
              item.claimStatus === "claimed" ||
              item.claimStatus === "flagged" ||
              item.email === null ||
              item.email.length === 0 ||
              item.linkStatus === "active";
            return (
              <TableRow key={`${item.persona}-${item.subjectId}`}>
                <TableCell className="capitalize">{item.persona}</TableCell>
                <TableCell>{item.fullName ?? "—"}</TableCell>
                <TableCell>
                  {item.email ?? "—"}
                  {item.email !== null && !item.isGmail ? (
                    <Badge className="ml-2" variant="destructive">
                      Non-Gmail
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{item.phone ?? "—"}</TableCell>
                <TableCell>{statusBadge(item)}</TableCell>
                <TableCell>{item.linkedGoogle ? "Linked" : "—"}</TableCell>
                <TableCell>{item.duplicateEmail ? "Duplicate" : "—"}</TableCell>
                <TableCell title={dateLabel(item.linkExpiresAt)}>{linkLabel(item)}</TableCell>
                <TableCell>
                  {item.linkStatus === "active" && item.linkId !== null ? (
                    <Button onClick={() => onRevoke(item)} size="sm" type="button" variant="outline">
                      Revoke
                    </Button>
                  ) : (
                    <Button disabled={disabled} onClick={() => onRequest(item)} size="sm" type="button">
                      Generate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {(page?.items.length ?? 0) === 0 && !loading ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No staff or parent records match these filters.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <Button disabled={pageNumber <= 1} onClick={onPrevious} size="sm" type="button" variant="outline">
          Previous
        </Button>
        <span>Page {pageNumber}</span>
        <Button
          disabled={(page?.items.length ?? 0) < pageSize}
          onClick={onNext}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </section>
  );
}
