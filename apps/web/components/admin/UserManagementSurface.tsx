"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Link2,
  Loader2,
  Mail,
  Plus,
  UserPlus
} from "lucide-react";

import { Badge } from "@edapex/ui/components/badge";
import { Button } from "@edapex/ui/components/button";
import { Checkbox } from "@edapex/ui/components/checkbox";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@edapex/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edapex/ui/components/table";
import { DashboardShell } from "@/components/admin/DashboardShell";
import { StatFigure, StatGroup } from "@/components/admin/StatGroup";
import { ContactCell, PersonCell, StatusPill } from "@/components/admin/PersonCell";
import {
  FilterBar,
  applyView,
  type SortDirection,
  type SortKey,
  type StatusFilter
} from "@/components/admin/FilterBar";
import { SortableHead } from "@/components/admin/SortableHead";
import { RowActionMenu } from "@/components/admin/RowActionMenu";
import { TablePagination } from "@/components/admin/TablePagination";
import { ClaimLinkModal, type ClaimSubject } from "@/components/admin/ClaimLinkModal";
import { DuplicatesTab } from "@/components/admin/DuplicatesTab";
import { StudentsTab } from "@/components/admin/StudentsTab";
import { StaffFormModal } from "@/components/admin/StaffFormModal";
import { StaffDetailModal } from "@/components/admin/StaffDetailModal";
import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";
import {
  createClaimLink,
  listStaff,
  loadDirectory,
  revokeClaimLink,
  setStaffActive,
  type DirectoryItem,
  type StaffRow
} from "@/lib/admin-api";

type Tab = "staff" | "parents" | "students" | "duplicates";

/**
 * The dashboard: one page, everything else a tab, modal or dropdown.
 *
 * Staff and Parents share the tile row, the filter bar and the row components, so the tabs
 * cannot drift visually. The role decides which tabs exist and which actions render — not
 * which page loads.
 *
 * There is no Students tab. `GET /students` is class-scoped and this page carries no class;
 * listing staff through the directory and calling it "Students" would be a lie, so the tab is
 * absent rather than misleading.
 */
export function UserManagementSurface() {
  const { manifest, workspaceId, academicId } = useWorkspaceContext();
  const isAdmin = manifest.role === "admin";

  const [tab, setTab] = useState<Tab>(isAdmin ? "staff" : "parents");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  /*
   * Keyset pagination forbids `OFFSET` (base/pagination.ts), so "page 3" is reached by
   * replaying stored cursors rather than by skipping rows. `cursors[page - 1]` is the cursor
   * that starts that page; going back re-reads the cursor we already hold.
   */
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [confirmRemove, setConfirmRemove] = useState<StaffRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  /** Links minted in this session, shown until dismissed — the token cannot be re-read. */
  const [bulkLinks, setBulkLinks] = useState<readonly { name: string; url: string }[]>([]);

  const [staff, setStaff] = useState<readonly StaffRow[]>([]);
  const [directory, setDirectory] = useState<readonly DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [claiming, setClaiming] = useState<ClaimSubject | null>(null);

  /*
   * The academic id is a number in the API and a string in the workspace id, and the admin
   * routes validate it as a positive integer. Parsing here rather than at the call site keeps
   * a bad value from reaching the transport as "NaN" in a header.
   */
  /*
   * From the workspace context, not derived from `workspaceId`.
   *
   * The previous version parsed the *workspace* id as an academic year. It appeared to work
   * because a row with that id existed, so `assertScope` passed — but every request was scoped
   * to the wrong session, which is why the class picker came back empty.
   */

  const refresh = useCallback(async (): Promise<void> => {
    if (!isAdmin || academicId === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cursor = cursors[page - 1] ?? null;
      if (tab === "staff") {
        const result = await listStaff(academicId, {
          ...(query.length === 0 ? {} : { query }),
          ...(includeInactive ? { includeInactive: true } : {}),
          ...(cursor === null ? {} : { cursor }),
          limit: pageSize
        });
        setStaff(result.rows);
        setTotal(result.total);
        if (result.nextCursor !== null) {
          setCursors((current) => {
            const next = [...current];
            next[page] = result.nextCursor;
            return next;
          });
        }
      } else {
        const result = await loadDirectory(academicId, {
          persona: "parent",
          ...(query.length === 0 ? {} : { search: query }),
          page,
          pageSize
        });
        setDirectory(result.items);
        setTotal(result.total);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this tab");
      /*
       * Clear both lists. A failed request leaves the page state unknown, and showing the
       * previous rows under a new total produced "Showing 1–25 of 72" above "Nobody here
       * yet" — two contradictory statements on one screen.
       */
      setStaff([]);
      setDirectory([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [academicId, isAdmin, tab, query, includeInactive, page, pageSize, cursors]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A selection belongs to one tab. Carrying ids across datasets is how a bulk action hits
  // the wrong row.
  useEffect(() => {
    setSelected(new Set());
    setPage(1);
    setCursors([null]);
  }, [tab, query, statusFilter, includeInactive, pageSize]);

  // Re-sorting the same column flips direction, which is the behaviour every table has.
  const toggleSort = useCallback((key: SortKey): void => {
    setSortKey((current) => {
      if (current === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return key;
    });
  }, []);

  const visible = useMemo(
    () => applyView(staff, { statusFilter, sortKey, sortDirection }),
    [staff, statusFilter, sortKey, sortDirection]
  );

  const directoryVisible = useMemo(() => {
    const filtered = directory.filter((item) => {
      switch (statusFilter) {
        case "active":
          return item.userActive === 1;
        case "inactive":
          return item.userActive !== 1;
        case "claimed":
          return item.claimStatus === "claimed";
        case "unclaimed":
          return item.claimStatus !== "claimed" && item.claimStatus !== "flagged";
        case "flagged":
          return item.claimStatus === "flagged";
        case "no_email":
          return item.email === null || item.email.length === 0;
        case "non_gmail":
          return item.email !== null && !item.isGmail;
        case "duplicate":
          return item.duplicateEmail;
        case "link_active":
          return item.linkStatus === "active";
        default:
          return true;
      }
    });
    return [...filtered].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "name") return direction * (a.fullName ?? "").localeCompare(b.fullName ?? "");
      if (sortKey === "status") {
        return direction * String(a.claimStatus ?? "").localeCompare(String(b.claimStatus ?? ""));
      }
      return direction * (a.email ?? "").localeCompare(b.email ?? "");
    });
  }, [directory, statusFilter, sortKey, sortDirection]);

  /**
   * The share of people with a usable account, as a percentage.
   *
   * A real ratio rather than a fabricated trend: we have no time series, so an arrow and a
   * delta would be a claim about history the database does not hold.
   */
  const linkedPercent = (
    list: readonly StaffRow[] | readonly DirectoryItem[],
    kind: Tab
  ): string | undefined => {
    if (list.length === 0) return undefined;
    const linked =
      kind === "staff"
        ? (list as readonly StaffRow[]).filter((row) => row.hasAccount).length
        : (list as readonly DirectoryItem[]).filter((row) => row.claimStatus === "claimed").length;
    return `${Math.round((linked / list.length) * 100)}%`;
  };

  const shownIds = useMemo(
    () => (tab === "staff" ? visible.map((r) => r.id) : directoryVisible.map((r) => r.subjectId)),
    [tab, visible, directoryVisible]
  );
  const allSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(shownIds));
  };

  const toggleOne = (id: number): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeStaff = async (): Promise<void> => {
    if (confirmRemove === null || removing) return;
    setRemoving(true);
    setError("");
    try {
      await setStaffActive(academicId, confirmRemove.id, false);
      setConfirmRemove(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove");
    } finally {
      setRemoving(false);
    }
  };

  /**
   * Mint one link per selected guardian.
   *
   * Sequential rather than parallel: each call writes a row and sends mail, and a burst of
   * fifty parallel requests is how a rate limiter rejects half of them with no clear mapping
   * back to which person failed.
   */
  const issueBulkLinks = async (): Promise<void> => {
    if (bulkBusy || selected.size === 0) return;
    setBulkBusy(true);
    setError("");
    const issued: { name: string; url: string }[] = [];
    const failures: string[] = [];
    try {
      for (const id of selected) {
        const item = directory.find((row) => row.subjectId === id);
        if (item === undefined) continue;
        try {
          const link = await createClaimLink(academicId, {
            subjectType: item.subjectType,
            subjectId: item.subjectId
          });
          issued.push({ name: item.fullName ?? `#${id}`, url: link.url });
        } catch (cause) {
          failures.push(`${item.fullName ?? `#${id}`}: ${cause instanceof Error ? cause.message : "failed"}`);
        }
      }
      setBulkLinks(issued);
      setSelected(new Set());
      if (failures.length > 0) setError(`${failures.length} failed — ${failures[0]}`);
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const revoke = async (item: DirectoryItem): Promise<void> => {
    if (item.linkId === null) return;
    try {
      await revokeClaimLink(academicId, item.linkId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke the link");
    }
  };

  return (
    <DashboardShell
      actions={
        isAdmin ? (
          <>
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus aria-hidden="true" />
              Add staff
            </Button>
            <Button size="sm" variant="outline">
              <UserPlus aria-hidden="true" />
              Add student
            </Button>
          </>
        ) : null
      }
      description={
        isAdmin
          ? "Manage who can sign in, and who is in every class."
          : "The guardians and accounts linked to your classes."
      }
      title={isAdmin ? "People" : "My class"}
    >
      {/*
        KPIs first: they answer "what is the state" before the table answers "who".

        Grouped rather than four equal tiles, following the reference. The three state counts
        belong to one question and share a card; the total stands on its own because it is a
        different kind of number. Four identical cards gave every metric the same weight as the
        total, which is the wrong hierarchy.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatGroup
          aside={tab === "staff" ? "current view" : "guardians"}
          className="sm:col-span-2"
          metrics={
            tab === "staff"
              ? [
                  { label: "Active", value: visible.filter((r) => r.active).length, tone: "success" },
                  {
                    label: "Account",
                    value: visible.filter((r) => r.hasAccount).length,
                    tone: "neutral"
                  },
                  {
                    label: "No email",
                    value: visible.filter((r) => r.email === null || r.email.length === 0).length,
                    tone: "danger"
                  }
                ]
              : [
                  {
                    label: "Claimed",
                    value: directoryVisible.filter((r) => r.claimStatus === "claimed").length,
                    tone: "success"
                  },
                  {
                    label: "Unclaimed",
                    value: directoryVisible.filter((r) => r.claimStatus !== "claimed").length,
                    tone: "warning"
                  },
                  {
                    label: "Flagged",
                    value: directoryVisible.filter((r) => r.claimStatus === "flagged").length,
                    tone: "danger"
                  }
                ]
          }
          title={tab === "staff" ? "People" : "Guardians"}
        />
        <StatFigure
          badge={linkedPercent(tab === "staff" ? visible : directoryVisible, tab)}
          caption={tab === "staff" ? "have a linked identity" : "have claimed their account"}
          title={tab === "staff" ? "Linked" : "Claimed"}
          tone="neutral"
          value={tab === "staff" ? visible.filter((r) => r.hasAccount).length : directoryVisible.filter((r) => r.claimStatus === "claimed").length}
        />
        <StatFigure
          caption="need an administrator"
          title="Needs attention"
          tone="danger"
          value={
            tab === "staff"
              ? visible.filter((r) => r.email === null || r.email.length === 0).length
              : directoryVisible.filter((r) => r.claimStatus === "flagged").length
          }
        />
      </div>

      <Tabs className="mt-6" onValueChange={(value) => setTab(value as Tab)} value={tab}>
        <TabsList>
          {isAdmin ? <TabsTrigger value="staff">Staff</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="parents">Parents</TabsTrigger> : null}
          <TabsTrigger value="students">Students</TabsTrigger>
          {isAdmin ? <TabsTrigger value="duplicates">Duplicates</TabsTrigger> : null}
        </TabsList>

        {tab === "duplicates" || tab === "students" ? null : (
          <div className="mt-4">
            <FilterBar
              includeInactive={includeInactive}
              onIncludeInactiveChange={setIncludeInactive}
              onQueryChange={setQuery}
              onSortChange={toggleSort}
              onStatusChange={setStatusFilter}
              query={query}
              searchPlaceholder={
                tab === "staff" ? "Search name, email or phone" : "Search name or email"
              }
              sortDirection={sortDirection}
              sortKey={sortKey}
              statusFilter={statusFilter}
            />
          </div>
        )}

        {bulkLinks.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {bulkLinks.length} link{bulkLinks.length === 1 ? "" : "s"} issued — copy now
            </p>
            <Button onClick={() => setBulkLinks([])} size="sm" variant="ghost">
              Dismiss
            </Button>
          </div>
          <ul className="mt-2 space-y-1">
            {bulkLinks.map((link) => (
              <li className="flex items-center gap-2" key={link.url}>
                <span className="w-40 shrink-0 truncate text-[12px]">{link.name}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {link.url}
                </code>
                <Button
                  onClick={() => void navigator.clipboard.writeText(link.url)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error.length > 0 ? (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/*
          The selection bar.
          
          A checkbox column with no action is decoration — it promises bulk work and delivers
          none. The reference has the same column, and the old page had no bulk action at all,
          which is why this is additive rather than restored.
        */}
        {selected.size > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-muted/50 px-3 py-2">
            <span className="text-[13px] font-medium">{selected.size} selected</span>
            {tab === "parents" ? (
              <Button
                disabled={bulkBusy}
                onClick={() => void issueBulkLinks()}
                size="sm"
                type="button"
                variant="outline"
              >
                {bulkBusy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Link2 aria-hidden="true" />}
                Request links
              </Button>
            ) : null}
            <Button
              className="ml-auto"
              onClick={() => setSelected(new Set())}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        ) : null}

        <TabsContent className="mt-3" value="staff">
          <StaffTable
            allSelected={allSelected}
            loading={loading}
            onLink={(row) =>
              setClaiming({
                subjectType: "staff",
                subjectId: row.id,
                fullName: row.fullName,
                email: row.email,
                persona: "staff",
                userId: row.hasAccount ? 1 : null
              })
            }
            onRemove={setConfirmRemove}
            onRow={setEditing}
            onSelectAll={toggleAll}
            onSelectOne={toggleOne}
            onSort={toggleSort}
            rows={visible}
            selected={selected}
            someSelected={someSelected}
            sortDirection={sortDirection}
            sortKey={sortKey}
          />
          {loading ? null : (
            <TablePagination
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              page={page}
              pageSize={pageSize}
              total={total}
            />
          )}
        </TabsContent>

        <TabsContent className="mt-3" value="parents">
          <DirectoryTable
            allSelected={allSelected}
            items={directoryVisible}
            loading={loading}
            onClaim={setClaiming}
            onRevoke={(item) => void revoke(item)}
            onSelectAll={toggleAll}
            onSelectOne={toggleOne}
            onSort={toggleSort}
            selected={selected}
            someSelected={someSelected}
            sortDirection={sortDirection}
            sortKey={sortKey}
          />
          {loading ? null : (
            <TablePagination
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              page={page}
              pageSize={pageSize}
              total={total}
            />
          )}
        </TabsContent>

        <TabsContent className="mt-3" value="students">
          <StudentsTab academicId={academicId} />
        </TabsContent>

        <TabsContent className="mt-3" value="duplicates">
          <DuplicatesTab academicId={academicId} />
        </TabsContent>
      </Tabs>

      <StaffFormModal
        academicId={academicId}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          void refresh();
        }}
        open={creating}
      />

      <StaffDetailModal
        academicId={academicId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
        staff={editing}
      />

      <ClaimLinkModal academicId={academicId} item={claiming} onClose={() => setClaiming(null)} />

      <Modal
        description="Their record and history stay. They stop appearing in lists and can no longer sign in."
        footer={
          <>
            <Button onClick={() => setConfirmRemove(null)} type="button" variant="ghost">
              Keep
            </Button>
            <Button
              disabled={removing}
              onClick={() => void removeStaff()}
              type="button"
              variant="destructive"
            >
              {removing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Remove
            </Button>
          </>
        }
        onClose={() => setConfirmRemove(null)}
        open={confirmRemove !== null}
        title={`Remove ${confirmRemove?.fullName ?? "this person"}?`}
        widthClassName="max-w-md"
      >
        <p className="text-[13px] leading-6 text-muted-foreground">
          Marks, attendance and reports reference this record, so it is retired rather than
          deleted. Nothing is lost and it can be restored by an administrator.
        </p>
      </Modal>
    </DashboardShell>
  );
}

/**
 * The staff table.
 *
 * Cards below 640px are not a fallback — a six-column table on a phone is a horizontal
 * scrollbar, and the information a person needs at that width is name, contact and status.
 */
function StaffTable({
  rows,
  loading,
  selected,
  allSelected,
  someSelected,
  onSelectAll,
  onSelectOne,
  onRow,
  onRemove,
  onLink,
  onSort,
  sortKey,
  sortDirection
}: {
  readonly rows: readonly StaffRow[];
  readonly loading: boolean;
  readonly selected: ReadonlySet<number>;
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly onSelectAll: () => void;
  readonly onSelectOne: (id: number) => void;
  readonly onRow: (row: StaffRow) => void;
  readonly onRemove: (row: StaffRow) => void;
  readonly onLink: (row: StaffRow) => void;
  readonly onSort: (key: SortKey) => void;
  readonly sortKey: SortKey;
  readonly sortDirection: SortDirection;
}) {
  if (loading && rows.length === 0) return <TableSkeleton />;

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
        <p className="text-[13px] font-medium">Nobody here yet</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-6 text-muted-foreground">
          Add a staff member to give them a record, then invite them to sign in.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-2.5 sm:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              className="w-full rounded-[var(--radius-lg)] border border-border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRow(row)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <PersonCell
                  name={row.fullName}
                  photo={row.staffPhoto}
                  secondary={row.designation ?? row.department}
                />
                <StatusPill tone={row.active ? "active" : "inactive"} />
              </div>
              <ContactCell className="mt-2" email={row.email} phone={row.mobile} />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-3">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={someSelected ? "indeterminate" : allSelected}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <SortableHead
                active={sortKey === "name"}
                direction={sortDirection}
                icon={<UserIcon />}
                label="Name"
                onSort={() => onSort("name")}
              />
              <SortableHead
                active={false}
                direction={sortDirection}
                icon={<Mail aria-hidden="true" className="size-3.5" />}
                label="Contact"
                onSort={() => onSort("name")}
              />
              <SortableHead
                active={sortKey === "role"}
                className="hidden lg:table-cell"
                direction={sortDirection}
                icon={<Building2 aria-hidden="true" className="size-3.5" />}
                label="Role"
                onSort={() => onSort("role")}
              />
              <SortableHead
                active={sortKey === "status"}
                className="hidden md:table-cell"
                direction={sortDirection}
                label="Account"
                onSort={() => onSort("status")}
              />
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <TableRow
                  className={
                    isSelected
                      ? "bg-[color-mix(in_oklch,var(--primary)_6%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_9%,transparent)]"
                      : undefined
                  }
                  data-state={isSelected ? "selected" : undefined}
                  key={row.id}
                >
                  <TableCell className="pl-3">
                    <Checkbox
                      aria-label={`Select ${row.fullName ?? "staff member"}`}
                      checked={isSelected}
                      onCheckedChange={() => onSelectOne(row.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <PersonCell
                      name={row.fullName}
                      photo={row.staffPhoto}
                      secondary={row.designation ?? row.department}
                    />
                  </TableCell>
                  <TableCell>
                    <ContactCell email={row.email} phone={row.mobile} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {row.department ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusPill
                      label={row.hasAccount ? "Linked" : "No account"}
                      tone={row.hasAccount ? "neutral" : "unclaimed"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActionMenu
                      linkDisabledReason={
                        row.email === null || row.email.length === 0
                          ? "No email on record"
                          : row.hasAccount
                            ? "Already has an account"
                            : undefined
                      }
                      onEdit={() => onRow(row)}
                      onLink={() => onLink(row)}
                      onRemove={() => onRemove(row)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** The claimed-link directory: guardians today, any persona the route returns. */
function DirectoryTable({
  items,
  loading,
  selected,
  allSelected,
  someSelected,
  onSelectAll,
  onSelectOne,
  onClaim,
  onRevoke,
  onSort,
  sortKey,
  sortDirection
}: {
  readonly items: readonly DirectoryItem[];
  readonly loading: boolean;
  readonly selected: ReadonlySet<number>;
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly onSelectAll: () => void;
  readonly onSelectOne: (id: number) => void;
  readonly onClaim: (item: DirectoryItem) => void;
  readonly onRevoke: (item: DirectoryItem) => void;
  readonly onSort: (key: SortKey) => void;
  readonly sortKey: SortKey;
  readonly sortDirection: SortDirection;
}) {
  if (loading && items.length === 0) return <TableSkeleton />;

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
        <p className="text-[13px] font-medium">Nobody here yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">
          Guardians appear here once a student has one. Add a guardian from the student&apos;s
          record.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-3">
              <Checkbox
                aria-label="Select all on this page"
                checked={someSelected ? "indeterminate" : allSelected}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <SortableHead
              active={sortKey === "name"}
              direction={sortDirection}
              icon={<UserIcon />}
              label="Name"
              onSort={() => onSort("name")}
            />
            <SortableHead
              active={false}
              direction={sortDirection}
              icon={<Mail aria-hidden="true" className="size-3.5" />}
              label="Contact"
              onSort={() => onSort("name")}
            />
            <SortableHead
              active={sortKey === "status"}
              direction={sortDirection}
              label="Account"
              onSort={() => onSort("status")}
            />
            <SortableHead
              active={false}
              className="hidden xl:table-cell"
              direction={sortDirection}
              icon={<CalendarClock aria-hidden="true" className="size-3.5" />}
              label="Link"
              onSort={() => onSort("status")}
            />
            <TableHead className="w-32 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const id = item.subjectId;
            const isSelected = selected.has(id);
            const blocked =
              item.claimStatus === "claimed" ||
              item.claimStatus === "flagged" ||
              item.email === null ||
              item.email.length === 0 ||
              item.linkStatus === "active";

            return (
              <TableRow
                className={
                  isSelected
                    ? "bg-[color-mix(in_oklch,var(--primary)_6%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_9%,transparent)]"
                    : undefined
                }
                data-state={isSelected ? "selected" : undefined}
                key={`${item.persona}-${id}`}
              >
                <TableCell className="pl-3">
                  <Checkbox
                    aria-label={`Select ${item.fullName ?? "person"}`}
                    checked={isSelected}
                    onCheckedChange={() => onSelectOne(id)}
                  />
                </TableCell>
                <TableCell>
                  <PersonCell
                    name={item.fullName}
                    secondary={item.persona === "parent" ? "Guardian" : "Staff"}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <ContactCell email={item.email} phone={item.phone} />
                    <div className="flex shrink-0 gap-1">
                      {item.isGmail ? null : (
                        <Badge
                          title="Not a Gmail address — claim links still work"
                          variant="neutral"
                        >
                          non-Gmail
                        </Badge>
                      )}
                      {item.duplicateEmail ? (
                        <Badge title="More than one account uses this address" variant="warning">
                          Duplicate
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {/*
                    Two facts, one column. `claimStatus` is whether the account has been
                    claimed at all; `linkedGoogle` is whether a Google identity is attached.
                    They are independent — a magic-link sign-in claims an account without any
                    Google link — so the Google glyph is shown only when it is true, and the
                    pill always states the claim state.
                  */}
                  <div className="flex items-center gap-1.5">
                    <StatusPill
                      label={
                        item.claimStatus === "flagged"
                          ? "Flagged"
                          : item.claimStatus === "claimed"
                            ? "Claimed"
                            : "Unclaimed"
                      }
                      tone={
                        item.claimStatus === "flagged"
                          ? "flagged"
                          : item.claimStatus === "claimed"
                            ? "claimed"
                            : "unclaimed"
                      }
                    />
                    {item.linkedGoogle ? (
                      <span
                        className="text-[11px] text-muted-foreground"
                        title="Signed in with Google at least once"
                      >
                        G
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <span
                    className="text-[12px] text-muted-foreground"
                    title={item.linkExpiresAt === null ? undefined : dateOf(item.linkExpiresAt)}
                  >
                    {item.linkStatus === "none" ? "—" : item.linkStatus}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <RowActionMenu
                    onEdit={() => onClaim(item)}
                    linkDisabledReason={
                      blocked
                        ? item.claimStatus === "claimed"
                          ? "Already claimed"
                          : item.linkStatus === "active"
                            ? "A link is already live"
                            : "No email on record"
                        : undefined
                    }
                    onLink={() => onClaim(item)}
                    onRemove={() => onRevoke(item)}
                    onRevoke={item.linkStatus === "active" ? () => onRevoke(item) : undefined}
                    removeLabel={item.linkStatus === "active" ? "Revoke link" : "Remove"}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function dateOf(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

/** Mirrors the resolved table: same card, same row rhythm, shimmer only. */
function TableSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading people"
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0"
          key={index}
        >
          <div className="skeleton-shimmer size-4 shrink-0 rounded-[4px]" />
          <div className="skeleton-shimmer size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="skeleton-shimmer h-3 w-40 rounded" />
            <div className="skeleton-shimmer mt-1.5 h-2.5 w-56 rounded" />
          </div>
          <div className="skeleton-shimmer hidden h-5 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
