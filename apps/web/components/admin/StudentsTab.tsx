"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactCell, PersonCell, StatusPill } from "@/components/admin/PersonCell";
import { SortableHead } from "@/components/admin/SortableHead";
import { StatFigure, StatGroup } from "@/components/admin/StatGroup";
import { loadMyClasses, loadRoster, type ClassSection, type RosterStudent } from "@/lib/admin-api";

/**
 * The class roster.
 *
 * A roster only exists inside a class — `GET /students` is class-scoped on the server, and
 * that is not incidental: it is how a teacher sees their own section and cannot see anyone
 * else's. So the tab opens on a class picker rather than on a list of every student in the
 * school, and the picker is populated from `/me/classes`, which returns exactly the sections
 * the caller is allowed to open.
 *
 * A teacher with one class skips the picker entirely: a control with a single option is a
 * click that teaches nothing.
 */
export function StudentsTab({ academicId }: { readonly academicId: number }) {
  const [classes, setClasses] = useState<readonly ClassSection[]>([]);
  const [selected, setSelected] = useState<ClassSection | null>(null);
  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (academicId === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadMyClasses(academicId);
        if (cancelled) return;
        setClasses(list);
        // One class: select it. Otherwise the person chooses.
        setSelected(list.length === 1 ? (list[0] ?? null) : null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load your classes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academicId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (selected === null || academicId === 0) {
      setRoster([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setRoster(
        await loadRoster(
          academicId,
          { classId: selected.classId, sectionId: selected.sectionId },
          query.length === 0 ? undefined : query
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the roster");
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [academicId, selected, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...roster].sort(
      (a, b) => direction * (a.fullName ?? "").localeCompare(b.fullName ?? "")
    );
  }, [roster, sortDirection]);

  if (loading && classes.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading classes" className="space-y-2.5">
        <div className="skeleton-shimmer h-9 w-full max-w-sm rounded-[var(--radius-md)]" />
        <div className="skeleton-shimmer h-64 rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
        <p className="text-[13px] font-medium">No classes assigned</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">
          A roster belongs to a class. Ask an administrator to assign you to one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          Class
          <select
            aria-label="Class"
            className="h-9 min-w-[12rem] rounded-[var(--radius-md)] border border-border bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              const next = classes[Number(event.target.value)];
              setSelected(next ?? null);
            }}
            value={selected === null ? "" : String(classes.indexOf(selected))}
          >
            {selected === null ? <option value="">Choose a class…</option> : null}
            {classes.map((entry, index) => (
              <option key={`${entry.classId}-${entry.sectionId}`} value={String(index)}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search students"
            className="h-9 pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or admission number"
            type="search"
            value={query}
          />
        </div>
      </div>

      {error.length > 0 ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {selected === null ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
          <p className="text-[13px] font-medium">Choose a class</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">
            {classes.length} classes are assigned to you.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatGroup
              aside={selected.label}
              className="sm:col-span-2"
              metrics={[
                {
                  label: "Students",
                  value: visible.length,
                  tone: "neutral"
                },
                {
                  label: "Active",
                  value: visible.filter((row) => row.activeStatus === 1).length,
                  tone: "success"
                },
                {
                  label: "No admission",
                  value: visible.filter((row) => row.admissionNo === null).length,
                  tone: "danger"
                }
              ]}
              title="Roster"
            />
            <StatFigure
              caption="in this section"
              title="On roll"
              tone="neutral"
              value={visible.length}
            />
            <StatFigure
              caption="need an admission number"
              title="Needs attention"
              tone="danger"
              value={visible.filter((row) => row.admissionNo === null).length}
            />
          </div>

          {loading ? (
            <div className="skeleton-shimmer h-64 rounded-[var(--radius-lg)]" />
          ) : visible.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
              <p className="text-[13px] font-medium">No students</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">
                {query.length === 0
                  ? "Nobody is enrolled in this section yet."
                  : "No student matches that search."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableHead
                      active
                      direction={sortDirection}
                      label="Student"
                      onSort={() =>
                        setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
                      }
                    />
                    <TableHead>Admission no</TableHead>
                    <TableHead className="hidden md:table-cell">Class</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <PersonCell name={student.fullName} secondary={null} />
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-muted-foreground">
                        {student.admissionNo ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {[student.className, student.sectionName]
                          .filter((part) => part !== null)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={student.activeStatus === 1 ? "active" : "inactive"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
