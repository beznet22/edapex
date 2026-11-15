"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { DashboardShell, StatTile } from "@/components/admin/DashboardShell";
import { ContactCell, PersonCell, StatusPill } from "@/components/admin/PersonCell";
import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";
import { listStaff, type StaffRow } from "@/lib/admin-api";

import { StaffFormModal } from "./StaffFormModal";
import { StaffDetailModal } from "./StaffDetailModal";

/**
 * The dashboard: one page, everything else a tab, modal or dropdown.
 *
 * Staff and Students share the tile row, the filter bar and the row components, so the two
 * cannot drift visually. A teacher sees the roster of their class; an admin sees the staff
 * directory. The role decides which dataset loads and which actions render — not which page.
 */
export function UserManagementSurface() {
  const { manifest, workspaceId } = useWorkspaceContext();
  const isAdmin = manifest.role === "admin";

  const [tab, setTab] = useState<"staff" | "students">(isAdmin ? "staff" : "students");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<readonly StaffRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  /*
   * The academic id is a number in the API and a string in the workspace id, and the admin
   * routes validate it as a positive integer. Parsing here rather than at the call site keeps
   * a bad value from reaching the transport as "NaN" in a header.
   */
  const academicId = useMemo(() => {
    const value = Number(workspaceId);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }, [workspaceId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isAdmin || academicId === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const page = await listStaff(academicId, {
        ...(query.length === 0 ? {} : { query }),
        limit: 25
      });
      setRows(page.rows);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the directory");
    } finally {
      setLoading(false);
    }
  }, [academicId, isAdmin, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tiles = useMemo(() => {
    const active = rows.filter((row) => row.active).length;
    const withAccount = rows.filter((row) => row.hasAccount).length;
    const noEmail = rows.filter((row) => row.email === null || row.email.length === 0).length;
    return [
      { label: "People", value: rows.length, qualifier: "in this view" },
      { label: "Active", value: active, qualifier: "can sign in" },
      { label: "With account", value: withAccount, qualifier: "linked identity" },
      { label: "No email", value: noEmail, qualifier: "cannot be invited" }
    ];
  }, [rows]);

  const nextPage = useCallback(async (): Promise<void> => {
    if (cursor === null || academicId === 0) return;
    setLoading(true);
    try {
      const page = await listStaff(academicId, {
        ...(query.length === 0 ? {} : { query }),
        cursor,
        limit: 25
      });
      setRows((current) => [...current, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }, [academicId, cursor, query]);

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
          : "The students in your classes. Read-only — an admin changes records."
      }
      title={isAdmin ? "People" : "My class"}
    >
      {/* KPIs first: they answer "what is the state" before the table answers "who". */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            qualifier={tile.qualifier}
            value={tile.value}
          />
        ))}
      </div>

      <Tabs className="mt-6" onValueChange={(value) => setTab(value as "staff" | "students")} value={tab}>
        <TabsList>
          {isAdmin ? <TabsTrigger value="staff">Staff</TabsTrigger> : null}
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search people"
              className="h-9 pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or phone"
              type="search"
              value={query}
            />
          </div>
        </div>

        {error.length > 0 ? (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <TabsContent className="mt-3" value="staff">
          <StaffTable
            loading={loading}
            onEdit={setEditing}
            rows={tab === "staff" ? rows : []}
          />
        </TabsContent>

        <TabsContent className="mt-3" value="students">
          <p className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-10 text-center text-[13px] text-muted-foreground">
            The class roster lands with the students surface.
          </p>
        </TabsContent>
      </Tabs>

      {cursor === null || loading ? null : (
        <div className="mt-3 flex justify-center">
          <Button onClick={() => void nextPage()} size="sm" variant="ghost">
            Load more
          </Button>
        </div>
      )}

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
    </DashboardShell>
  );
}

/**
 * The staff table, which becomes cards below 640px.
 *
 * The card form is not a fallback — a five-column table on a phone is a horizontal
 * scrollbar, and the information a person needs at that width is name, contact and status.
 * Contact and the secondary line survive; everything else waits for the detail modal.
 */
function StaffTable({
  rows,
  loading,
  onEdit
}: {
  readonly rows: readonly StaffRow[];
  readonly loading: boolean;
  readonly onEdit: (row: StaffRow) => void;
}) {
  if (loading && rows.length === 0) {
    return <StaffSkeleton />;
  }

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
      {/* Cards under 640px — the table is unusable at that width. */}
      <ul className="grid gap-2.5 sm:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              className="w-full rounded-[var(--radius-lg)] border border-border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onEdit(row)}
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
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden lg:table-cell">Role</TableHead>
              <TableHead className="hidden md:table-cell">Account</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
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
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {row.department ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <StatusPill
                    label={row.hasAccount ? "Linked" : "No account"}
                    tone={row.hasAccount ? "neutral" : "unclaimed"}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    aria-label={`Open ${row.fullName ?? "staff member"}`}
                    onClick={() => onEdit(row)}
                    size="sm"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Mirrors the resolved table: same card, same row rhythm, shimmer only. */
function StaffSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading people" className="rounded-[var(--radius-lg)] border border-border bg-card">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0"
          key={index}
        >
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
