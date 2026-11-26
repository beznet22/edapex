<script lang="ts">
  import { formatPercent } from "$lib/people/people-display";
  import type {
    ParentStats,
    StaffStats,
    StudentStats,
  } from "$lib/server/people/people-types";

  type Props =
    | { tab: "staff"; stats: StaffStats }
    | { tab: "parents"; stats: ParentStats }
    | { tab: "students"; stats: StudentStats };

  let props: Props = $props();
</script>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {#if props.tab === "staff"}
    <div class="rounded-xl border border-border bg-card p-4 sm:col-span-2">
      <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Active</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.active}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Account</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.linked}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">No email</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.noEmail}</span>
        </div>
      </div>
    </div>

    <figure class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">Linked</span>
        <span class="rounded-full border border-border px-2 py-0.5 text-xs">
          {props.stats.linked} of {props.stats.total}
        </span>
      </div>
      <p class="mt-2 text-2xl font-semibold tabular-nums">
        {formatPercent(props.stats.linked, props.stats.total)}%
      </p>
      <figcaption class="text-xs text-muted-foreground">Accounts linked to a login</figcaption>
    </figure>

    <figure class="rounded-xl border border-border bg-card p-4">
      <span class="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</span>
      <p class="mt-2 text-2xl font-semibold tabular-nums">{props.stats.noEmail}</p>
      <figcaption class="text-xs text-muted-foreground">Staff without an email address</figcaption>
    </figure>
  {:else if props.tab === "parents"}
    <div class="rounded-xl border border-border bg-card p-4 sm:col-span-2">
      <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Linked</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.linked}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Unlinked</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.unlinked}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Duplicate email</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.duplicate}</span>
        </div>
      </div>
    </div>

    <figure class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">Linked</span>
        <span class="rounded-full border border-border px-2 py-0.5 text-xs">
          {props.stats.linked} of {props.stats.total}
        </span>
      </div>
      <p class="mt-2 text-2xl font-semibold tabular-nums">
        {formatPercent(props.stats.linked, props.stats.total)}%
      </p>
      <figcaption class="text-xs text-muted-foreground">Parents with a login</figcaption>
    </figure>

    <figure class="rounded-xl border border-border bg-card p-4">
      <span class="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</span>
      <p class="mt-2 text-2xl font-semibold tabular-nums">{props.stats.duplicate}</p>
      <figcaption class="text-xs text-muted-foreground">Parents sharing an email address</figcaption>
    </figure>
  {:else}
    <div class="rounded-xl border border-border bg-card p-4 sm:col-span-2">
      <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Students</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.total}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Active</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.active}</span>
        </div>
        <div class="flex flex-col gap-1 border-border pl-6 sm:border-l">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">No admission</span>
          <span class="text-2xl font-semibold tabular-nums">{props.stats.noAdmission}</span>
        </div>
      </div>
    </div>

    <figure class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">On roll</span>
        <span class="rounded-full border border-border px-2 py-0.5 text-xs">
          {props.stats.active} of {props.stats.total}
        </span>
      </div>
      <p class="mt-2 text-2xl font-semibold tabular-nums">
        {formatPercent(props.stats.active, props.stats.total)}%
      </p>
      <figcaption class="text-xs text-muted-foreground">Active students in this class</figcaption>
    </figure>

    <figure class="rounded-xl border border-border bg-card p-4">
      <span class="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</span>
      <p class="mt-2 text-2xl font-semibold tabular-nums">{props.stats.noAdmission}</p>
      <figcaption class="text-xs text-muted-foreground">Students missing an admission number</figcaption>
    </figure>
  {/if}
</div>
