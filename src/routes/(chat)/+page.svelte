<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Select from "$lib/components/ui/select";
  import { onMount } from "svelte";
  import { assign } from "nodemailer/lib/shared";
  import { assignSubjects } from "$lib/api/result.remote.js";

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  const { user, agents, uploads, students, classes } = data;
  let open = $state(false);
  let value = $state<string | undefined>();
  const selectedClass = $derived(classes.find((c) => c.id == value));

  const chatContext = new ChatContext({
    initialMessages: [],
    chatData: undefined,
    agents,
  });

  chatContext.setContext();
  const filesContext = new FilesContext(uploads, true);
  filesContext.setContext();

  onMount(() => {
    if (!students) open = true;
  });

  const doAssign = async () => {
    if (!selectedClass) return;
    const { classId, sectionId } = selectedClass;
    if (!classId || !sectionId || !user || !user.staffId) return;
    const res = await assignSubjects({ classId, sectionId, teacherId: user.staffId });
    if (res.success) {
      open = false;
    }
  };
</script>

<div class="">
  <ChatHeader {user} />
  <Chat readonly={false} {user} />
</div>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>You are not assined to any subjects</AlertDialog.Title>
      <AlertDialog.Description>
        This action cannot be undone. This will permanently delete your chat and remove it from our servers.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="grid gap-4">
      <Select.Root type="single" name="classes" bind:value>
        <Select.Trigger class="w-full">
          {#if !selectedClass}
            Select a class
            {:else}
            {`${selectedClass?.className!} (${selectedClass?.sectionName!})`}

          {/if}
        </Select.Trigger>
        <Select.Content>
          <Select.Group>
            <Select.Label>Classes and Sections</Select.Label>
            {#each classes as cls (cls.id)}
              <Select.Item value={`${cls.id}`} label={cls.className || ""}>
                {`${cls.className} (${cls.sectionName})`}
              </Select.Item>
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
      <AlertDialog.Footer>
        <AlertDialog.Action onclick={doAssign}>Continue</AlertDialog.Action>
      </AlertDialog.Footer>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
