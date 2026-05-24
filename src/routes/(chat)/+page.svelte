<script lang="ts">
  import { assignSubjects } from "$lib/api/assessment.remote.js";
  import { signout, updatePassword } from "$lib/api/auth.remote.js";
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/WorkspaceSidebar.svelte";

  import MobileNavBar from "$lib/components/mobile-nav-bar.svelte";
  import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Select from "$lib/components/ui/select";
  import * as Resizable from "$lib/components/ui/resizable";
  import { cn } from "$lib/utils/shadcn";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { SelectedClass } from "$lib/context/sync.svelte";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";
  import { IsMobile } from "$lib/hooks/is-mobile.svelte.js";
  import type { PageData } from "./$types.js";

  let { data } = $props<{ data: PageData }>();
  // svelte-ignore state_referenced_locally
  const { user } = data;
  let open = $state(false);
  let value = $state<string | undefined>();
  let newPassword = $state("");
  let showPassword = $state(false);
  let isUpdating = $state(false);
  let inspectorOpen = $state(false);
  let inspectorPane = $state<any>(undefined);
  let userContext = $derived(UserContext.fromContext());
  const selectedClass = SelectedClass.fromContext();
  const isMobile = new IsMobile();

  $effect(() => {
    if (inspectorPane) {
      if (inspectorOpen) {
        if (inspectorPane.isCollapsed()) inspectorPane.expand();
      } else {
        if (inspectorPane.isExpanded()) inspectorPane.collapse();
      }
    }
  });

  const chatContext = new ChatContext({
    initialMessages: [],
    chatData: undefined,
    selectedClass,
  });
  chatContext.setContext();
  const chat = $derived(ChatContext.fromContext());

  onMount(() => {
    if (userContext.isTeacher && !userContext.assignedSection) open = true;
  });

  const handleLogout = async () => {
    isUpdating = true;
    try {
      await signout();
      window.location.href = "/signin";
    } finally {
      isUpdating = false;
    }
  };

  const doAssign = async () => {
    if (!chat.selectedClass) {
      toast.error("Please select a class");
      return;
    }

    isUpdating = true;
    try {
      if (newPassword) {
        if (newPassword.length < 6) {
          toast.error("Password must be at least 6 characters.");
          return;
        }

        const pwdRes = await updatePassword({ password: newPassword });
        if (!pwdRes.success) {
          toast.error(pwdRes.message);
          return;
        }
        toast.success("Password updated successfully.");
      }

      const { classId, sectionId } = chat.selectedClass;
      if (!classId || !sectionId || !user || !user.staffId) return;
      const res = await assignSubjects({ classId, sectionId });
      if ((!res.success && res.message) || !res.assigned) {
        toast.error(res.message);
        return;
      }

      userContext.students = res.assigned;
      userContext.assignedSection = chat.selectedClass;
      open = false;
    } finally {
      isUpdating = false;
    }
  };
</script>

<!-- Hermes 4-Panel Row: Panel 3 (Chat Stage) & Panel 4 (Workspace Inspector) -->
<Resizable.PaneGroup direction="horizontal" class="flex flex-1 min-h-0 w-full">
  <!-- Panel 3: Chat Stage -->
  <Resizable.Pane
    defaultSize={inspectorOpen && !isMobile.current ? 70 : 100}
    minSize={30}
    class="flex flex-col min-h-0 min-w-0 h-full relative"
  >
    <ChatHeader
      {user}
      onToggleInspector={() => (inspectorOpen = !inspectorOpen)}
    />
    <Chat class="border-none" readonly={false} {user} />
  </Resizable.Pane>

  <!-- Panel 4: Workspace Inspector (Desktop Resizable) -->
  {#if !isMobile.current}
    <!-- Glassmorphic divider -->
    <Resizable.Handle
      withHandle
      class={cn(
        "w-1 bg-transparent border-transparent hover:bg-muted/20 active:bg-muted/20 transition-colors z-10",
        !inspectorOpen && "hidden",
      )}
    />
    <Resizable.Pane
      bind:this={inspectorPane}
      collapsible={true}
      collapsedSize={0}
      defaultSize={inspectorOpen ? 40 : 0}
      minSize={20}
      maxSize={60}
      class="transition-all duration-300 ease-out overflow-hidden"
      onExpand={() => {
        inspectorOpen = true;
      }}
      onCollapse={() => {
        inspectorOpen = false;
      }}
    >
      <WorkspaceSidebar bind:open={inspectorOpen} isMobile={false} />
    </Resizable.Pane>
  {/if}
</Resizable.PaneGroup>

<!-- Mobile Sheet Overlay -->
{#if isMobile.current && inspectorOpen}
  <WorkspaceSidebar bind:open={inspectorOpen} isMobile={true} />
{/if}

<!-- Mobile Bottom Navigation Bar (<768px) -->
<MobileNavBar />

<AlertDialog.Root bind:open>
  <AlertDialog.Content
    class="bg-background/95 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl max-w-[calc(100%-1.5rem)] sm:max-w-md"
  >
    <AlertDialog.Header>
      <AlertDialog.Title>
        {`${userContext.getDesignationTitle(userContext.designation)} Onboarding`}
      </AlertDialog.Title>
      <AlertDialog.Description>
        You are not assigned to any class. Please select a class to work on.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="grid gap-4">
      <Select.Root
        type="single"
        name="classes"
        bind:value
        onValueChange={(val) => {
          const selected = userContext.classes.find((c) => `${c.id}` === val);
          if (selected) {
            chat.selectedClass = selected;
          }
        }}
      >
        <Select.Trigger class="w-full">
          {#if !chat.selectedClass}
            Select a class
          {:else}
            {`${chat.selectedClass?.className} (${chat.selectedClass?.sectionName})`}
          {/if}
        </Select.Trigger>
        <Select.Content>
          <Select.Group>
            <Select.Label>Classes and Sections</Select.Label>
            {#each userContext.classes as cls (cls.id)}
              <Select.Item value={`${cls.id}`} label={cls.className || ""}>
                {`${cls.className} (${cls.sectionName})`}
              </Select.Item>
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
      <div class="space-y-2 mt-4">
        <label for="newPassword" class="text-sm font-medium"
          >New Password (Optional)</label
        >
        <div class="relative">
          <Input
            id="newPassword"
            type={showPassword ? "text" : "password"}
            bind:value={newPassword}
            placeholder="Enter a new password"
            class="w-full pr-10"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onpointerdown={(e) => {
              e.preventDefault();
              showPassword = true;
            }}
            onpointerup={() => (showPassword = false)}
            onpointerleave={() => (showPassword = false)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {#if showPassword}
              <EyeOffIcon class="h-4 w-4" />
            {:else}
              <EyeIcon class="h-4 w-4" />
            {/if}
          </button>
        </div>
        {#if newPassword && newPassword.length < 6}
          <p class="text-xs text-destructive">
            Password must be at least 6 characters
          </p>
        {/if}
      </div>

      <AlertDialog.Footer
        class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2"
      >
        <Button variant="outline" onclick={handleLogout} disabled={isUpdating}
          >Log Out</Button
        >
        <Button
          onclick={doAssign}
          disabled={isUpdating ||
            (newPassword.length > 0 && newPassword.length < 6)}
        >
          {isUpdating ? "Saving..." : "Continue"}
        </Button>
      </AlertDialog.Footer>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
