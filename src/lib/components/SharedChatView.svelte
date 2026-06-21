<script lang="ts">
  import { assignSubjects } from "$lib/api/assessment.remote.js";
  import { signout, updatePassword } from "$lib/api/auth.remote.js";
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import ArtifactViewer from "$lib/components/workspace/ArtifactViewer.svelte";
  import ArtifactsFab from "$lib/components/artifacts-fab.svelte";

  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Select from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { SelectedClass } from "$lib/context/sync.svelte";
  import { useInspector } from "$lib/context/inspector-context.svelte";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { ChatThread, xUIMessage } from "$lib/types/chat-types";
  import type { Artifact } from "$lib/types/workspace-types";
  import { deriveKind } from "$lib/utils/artifact-kind";

  let {
    user,
    messages = [],
    chatData = undefined,
    examTypeId = null,
  } = $props<{
    user: AuthUser;
    messages?: xUIMessage[];
    chatData?: ChatThread;
    examTypeId?: number | null;
  }>();
  let open = $state(false);
  let value = $state<string | undefined>();
  let newPassword = $state("");
  let showPassword = $state(false);
  let isUpdating = $state(false);
  let userContext = $derived(UserContext.fromContext());
  const selectedClass = SelectedClass.fromContext();
  const inspector = useInspector();

  // svelte-ignore state_referenced_locally
  const chatContext = new ChatContext({
    initialMessages: messages,
    chatData,
    selectedClass,
  });

  chatContext.setContext();
  const chat = $derived(ChatContext.fromContext());

  $effect(() => {
    chat.threadData.setExamTypeId(examTypeId ?? null);
  });

  const chatArtifacts = $derived<Artifact[]>(
    chat.messages
      .flatMap((m) => m.parts ?? [])
      .filter(
        (p: any) =>
          p.type === "data-createDocument" || p.type === "data-generatePDF",
      )
      .map((p: any) => {
        const data = p.data ?? {};
        const title = data.title ?? "untitled";
        const examTypeId = chat.threadData.examTypeId;
        const persistedUrl = examTypeId
          ? `/api/file/exams/examType-${examTypeId}/${title}${p.type === "data-generatePDF" ? ".pdf" : ".md"}`
          : undefined;
        return {
          id: data.id ?? p.id,
          title,
          kind: p.type === "data-generatePDF" ? "pdf" : deriveKind(title),
          content: data.content,
          url: persistedUrl,
          saveUrl: persistedUrl,
          status: data.status,
        };
      }),
  );

  $effect(() => {
    inspector.setChatArtifacts(chatArtifacts);
  });

  $effect(() => {
    const filesContext = FilesContext.fromContext();
    if (filesContext.references.length > 0) {
      chatContext.fileReferences = [...filesContext.references];
      filesContext.references = [];
    }
  });

  $effect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { id: string };
      inspector.openChatArtifact(detail.id);
    }
    window.addEventListener("chat:openArtifact", onOpen);
    return () => window.removeEventListener("chat:openArtifact", onOpen);
  });

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
      if (!classId || !sectionId || !user || !user.staffId) {
        toast.error(
          "Cannot complete onboarding: missing class, section, or staff assignment. Please contact your administrator.",
        );
        return;
      }
      const res = await assignSubjects({ classId, sectionId });
      if ((!res.success && res.message) || !res.assigned) {
        toast.error(res.message);
        return;
      }

      userContext.students = res.assigned;
      userContext.assignedSection = chat.selectedClass;
      open = false;
    } catch (err) {
      toast.error("Failed to complete onboarding. Please try again.");
      throw err;
    } finally {
      isUpdating = false;
    }
  };
</script>

<!-- Chat Stage: inspector + sidebar are mounted by (chat)/+layout.svelte -->
<ChatHeader {user} />
<ArtifactsFab count={chatArtifacts.length} threadId={chat.chatData?.threadId ?? null} />
<Chat class="border-none" readonly={false} {user} />

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
