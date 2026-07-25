<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { toast } from "svelte-sonner";
  import Phone from "@lucide/svelte/icons/phone";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import Download from "@lucide/svelte/icons/download";
  import Search from "@lucide/svelte/icons/search";
  import Pencil from "@lucide/svelte/icons/pencil";
  import type { PageData } from "./$types";
  import type { YahooParentStudent } from "./+page.server";

  let { data }: { data: PageData } = $props();
  let students = $derived(data.students as YahooParentStudent[]);
  let examTypeTitle = $derived(data.examTypeTitle);
  let generatedAt = $derived(data.generatedAt);

  let search = $state("");
  let editingParentId = $state<number | null>(null);
  let editValue = $state("");

  function normalizePhone(phone: string): string | null {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return null;
    if (digits.startsWith("234")) return digits;
    if (digits.startsWith("0")) return "234" + digits.slice(1);
    return "234" + digits;
  }

  function waLink(student: YahooParentStudent): string | null {
    if (!student.parentMobile) return null;
    const normalized = normalizePhone(student.parentMobile);
    if (!normalized) return null;
    const name = student.parentName ?? "Parent";
    const sname = student.fullName ?? "student";
    const text =
      `Hello ${name}, this is EdApex School. Please find attached ${sname}'s result for ${examTypeTitle}. Thank you.`;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Phone number copied");
    } catch {
      toast.error("Failed to copy");
    }
  }

  function startEdit(student: YahooParentStudent) {
    editingParentId = student.parentId;
    editValue = student.parentMobile ?? "";
  }

  function cancelEdit() {
    editingParentId = null;
    editValue = "";
  }

  async function savePhone() {
    if (editingParentId === null) return;
    const formData = new FormData();
    formData.append("parentId", String(editingParentId));
    formData.append("phone", editValue);
    try {
      const res = await fetch("/admin/parents?/updatePhone", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await invalidateAll();
        toast.success("Phone number updated");
        editingParentId = null;
        editValue = "";
      } else {
        const body = await res.json();
        toast.error(body?.error ?? "Failed to update phone");
      }
    } catch {
      toast.error("Failed to update phone");
    }
  }

  const filteredStudents = $derived.by((): YahooParentStudent[] => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        (s.fullName ?? "").toLowerCase().includes(q) ||
        (s.parentName ?? "").toLowerCase().includes(q) ||
        (s.className ?? "").toLowerCase().includes(q) ||
        (s.parentMobile ?? "").includes(q),
    );
  });

  const totalStudents = $derived(filteredStudents.length);

  const formattedDate = $derived(
    new Date(generatedAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const groups = $derived.by(() => {
    const map = new Map<string, { key: string; label: string; students: YahooParentStudent[] }>();
    for (const s of filteredStudents) {
      const c = s.className ?? "Unknown";
      const sec = s.sectionName && s.sectionName !== "\u2014" ? s.sectionName : null;
      const key = `${c}|${sec ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: sec ? `${c} ${sec}` : c,
          students: [],
        });
      }
      map.get(key)!.students.push(s);
    }
    return Array.from(map.values());
  });

  function exportCSV() {
    try {
      const headers = ["Student Name", "Admission No", "Roll No", "Class", "Section", "Parent Name", "Phone", "Email"];
      const rows = filteredStudents.map((s) => [
        s.fullName ?? "",
        s.admissionNo != null ? String(s.admissionNo) : "",
        s.rollNo ?? "",
        s.className ?? "",
        s.sectionName && s.sectionName !== "\u2014" ? s.sectionName : "",
        s.parentName ?? "",
        s.parentMobile ?? "",
        s.parentEmail ?? "",
      ]);
      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yahoo-parents.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Failed to export CSV");
    }
  }
</script>

<svelte:head>
  <title>Yahoo Parents — EdApex</title>
</svelte:head>

<div class="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
  <div class="flex-1 min-h-0 overflow-auto bg-background">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-6 sm:space-y-8">

      <!-- Header -->
      <header class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Yahoo Mail Parents
          </h1>
          <p class="mt-1 text-sm text-muted-foreground max-w-xl">
            Students whose parent email uses <span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">@yahoo</span>
            &mdash; Google SMTP blocks delivery to Yahoo, so results must be sent manually via WhatsApp.
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs tabular-nums text-muted-foreground">{totalStudents} student{totalStudents !== 1 ? "s" : ""}</span>
          <Button variant="outline" size="sm" class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold" onclick={exportCSV}>
            <Download class="size-3.5" />
            CSV
          </Button>
        </div>
      </header>

      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, class, or phone..."
          bind:value={search}
          class="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 transition-all"
        />
        {#if search}
          <button
            onclick={() => (search = "")}
            class="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X class="size-4" />
          </button>
        {/if}
      </div>

      <!-- Empty state -->
      {#if groups.length === 0}
        <div class="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-accent/50 bg-accent/10">
          <p class="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            {#if search}
              No matches
            {:else}
              No Yahoo email parents found
            {/if}
          </p>
        </div>
      {/if}

      <!-- Desktop header row (hidden on mobile) -->
      <div
        class="hidden sm:grid grid-cols-[minmax(160px,1fr)_70px_55px_minmax(140px,1fr)_minmax(180px,auto)_minmax(100px,1fr)] items-center gap-4 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground"
      >
        <span>Student</span>
        <span>Adm</span>
        <span>Roll</span>
        <span>Parent</span>
        <span>Phone</span>
        <span>Email</span>
      </div>

      <!-- Groups -->
      {#each groups as group (group.key)}
        <section>
          <h2 class="text-sm font-semibold text-foreground/80 px-4 py-1.5">
            {group.label}
            <span class="text-muted-foreground font-normal tabular-nums">&middot; {group.students.length}</span>
          </h2>

          <ul class="divide-y divide-border/40">
            {#each group.students as student (student.id)}
              <li class="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(160px,1fr)_70px_55px_minmax(140px,1fr)_minmax(180px,auto)_minmax(100px,1fr)] items-center gap-4 px-4 py-2.5 transition-colors rounded-lg hover:bg-muted/30">
                <!-- Student name (mobile: span whole row as first child) -->
                <span class="text-sm font-medium text-foreground truncate min-w-0">{student.fullName ?? "\u2014"}</span>

                <!-- Adm -->
                <span class="hidden sm:block text-sm text-muted-foreground truncate font-mono">{student.admissionNo ?? "\u2014"}</span>

                <!-- Roll -->
                <span class="hidden sm:block text-sm text-muted-foreground truncate font-mono">{student.rollNo ?? "\u2014"}</span>

                <!-- Parent name (mobile: hidden, shown below name) -->
                <span class="hidden sm:block text-sm text-foreground truncate min-w-0">{student.parentName ?? "\u2014"}</span>

                <!-- Phone / actions -->
                {#if editingParentId === student.parentId}
                  <div class="flex items-center gap-1 min-w-0">
                    <Input bind:value={editValue} placeholder="Phone" class="h-8 text-sm !px-2.5 !py-0 !rounded-lg min-w-0 max-w-[9rem]" />
                    <button
                      onclick={savePhone}
                      class="size-7 grid place-items-center rounded-full text-[oklch(0.5_0.15_140)] hover:bg-muted/50 transition-colors"
                      aria-label="Save"
                    >
                      <Check class="size-3.5" />
                    </button>
                    <button
                      onclick={cancelEdit}
                      class="size-7 grid place-items-center rounded-full text-destructive hover:bg-muted/50 transition-colors"
                      aria-label="Cancel"
                    >
                      <X class="size-3.5" />
                    </button>
                  </div>
                {:else if student.parentMobile}
                  <div class="flex items-center gap-1 min-w-0">
                    <span class="text-sm font-mono text-foreground truncate hidden sm:inline">{student.parentMobile}</span>
                    <a
                      href={waLink(student) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                      class:pointer-events-none={!waLink(student)}
                      class:opacity-40={!waLink(student)}
                      aria-label="WhatsApp"
                    >
                      <Phone class="size-3.5" />
                    </a>
                    <button
                      onclick={() => copyPhone(student.parentMobile!)}
                      class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                      aria-label="Copy phone"
                    >
                      <Copy class="size-3.5" />
                    </button>
                    <button
                      onclick={() => startEdit(student)}
                      class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                      aria-label="Edit phone"
                    >
                      <Pencil class="size-3.5" />
                    </button>
                  </div>
                {:else}
                  <div class="flex items-center gap-1 min-w-0">
                    <span class="text-sm text-muted-foreground">\u2014</span>
                    <button
                      onclick={() => startEdit(student)}
                      class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                      aria-label="Add phone"
                    >
                      <Pencil class="size-3.5" />
                    </button>
                  </div>
                {/if}

                <!-- Email -->
                <span class="hidden sm:block text-sm text-muted-foreground truncate min-w-0">{student.parentEmail ?? "\u2014"}</span>

                <!-- Mobile-only: parent name + phone under student name -->
                <div class="col-span-2 -mt-2 sm:hidden">
                  <p class="text-xs text-muted-foreground truncate">{student.parentName ?? "No parent"}</p>
                  <p class="text-xs font-mono text-foreground/80 truncate">{student.parentMobile ?? ""}</p>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}

      <!-- Footer -->
      <p class="text-center text-xs text-muted-foreground/60 pt-4">Generated {formattedDate}</p>

    </div>
  </div>
</div>
