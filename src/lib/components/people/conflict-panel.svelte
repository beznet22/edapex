<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { submitPeopleAction } from "./people-action-response";
  import type { ConflictGroup } from "$lib/server/people/people-types";

  let {
    conflicts,
    labels,
  }: {
    conflicts: ConflictGroup[];
    labels: Record<string, string>;
  } = $props();

  let pending = $state<string | null>(null);
  let error = $state<string | null>(null);

  function key(group: ConflictGroup): string {
    return `${group.classId}:${group.sectionId}:${group.subjectId}`;
  }

  function label(group: ConflictGroup): string {
    const classKey = `${group.classId}:${group.sectionId}`;
    return labels[classKey] ?? `Class ${group.classId} · Section ${group.sectionId}`;
  }

  async function resolve(group: ConflictGroup, keepRowId: number): Promise<void> {
    pending = key(group);
    error = null;
    try {
      const payload = new FormData();
      payload.set("classId", String(group.classId));
      payload.set("sectionId", String(group.sectionId));
      payload.set("subjectId", String(group.subjectId));
      payload.set("keepRowId", String(keepRowId));
      const reply = await submitPeopleAction("?/resolveConflict", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      await invalidateAll();
      toast.success("Conflict resolved");
    } catch {
      error = "Could not resolve the conflict";
    } finally {
      pending = null;
    }
  }
</script>

<div class="space-y-3">
  {#if conflicts.length === 0}
    <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      No duplicate assignments for this academic year.
    </p>
  {:else}
    <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {conflicts.length} duplicate {conflicts.length === 1 ? "group" : "groups"}. Keep one row per
      class, section and subject; the rest are deactivated (never deleted). Duplicates block
      self-assignment.
    </p>
    {#each conflicts as group (key(group))}
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-sm font-medium text-foreground">
          {label(group)}
          <span class="text-xs text-muted-foreground">· subject {group.subjectId}</span>
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          {group.activeTeachers} active rows
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each group.teacherIds as teacherId}
            <Button
              variant="outline"
              size="sm"
              disabled={pending === key(group)}
              onclick={() => resolve(group, teacherId)}
            >
              Keep teacher {teacherId}
            </Button>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}
</div>
