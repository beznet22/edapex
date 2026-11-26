<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { submitPeopleAction } from "./people-action-response";

  let {
    enabled,
  }: {
    enabled: boolean;
  } = $props();

  let pending = $state(false);
  let error = $state<string | null>(null);

  async function toggle(): Promise<void> {
    pending = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("enabled", enabled ? "false" : "true");
      const reply = await submitPeopleAction("?/setSelfAssignEnabled", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      await invalidateAll();
      toast.success(enabled ? "Self-assignment disabled" : "Self-assignment enabled");
    } finally {
      pending = false;
    }
  }
</script>

<div class="space-y-2">
  <div class="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
    <div class="min-w-0">
      <Label for="self-assign-toggle" class="text-sm font-medium text-foreground">
        Teacher self-assignment
      </Label>
      <p class="text-xs text-muted-foreground">
        {enabled
          ? "Staff with no assignments can add a class themselves. Existing assignments are untouched."
          : "Off. Only an administrator can assign classes. Turning this off does not remove any assignment."}
      </p>
    </div>
    <Switch
      id="self-assign-toggle"
      checked={enabled}
      disabled={pending}
      aria-label="Teacher self-assignment"
      onCheckedChange={() => void toggle()}
    />
  </div>
  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}
</div>
