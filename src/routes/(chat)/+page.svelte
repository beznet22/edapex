<script lang="ts">
  import { assignSubjects } from "$lib/api/result.remote.js";
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Select from "$lib/components/ui/select";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  const { user, agents } = data;
  let open = $state(false);
  let value = $state<string | undefined>();
  let userContext = $derived(UserContext.fromContext());
  const chatContext = new ChatContext({
    initialMessages: [],
    chatData: undefined,
    agents,
  });
  chatContext.setContext();
  const chat = $derived(ChatContext.fromContext());

  onMount(() => {
    if (userContext.isTeacher && !userContext.students.length) open = true;
  });

  const doAssign = async () => {
    if (!chat.selectedClass) return;
    const { classId, sectionId } = chat.selectedClass;
    if (!classId || !sectionId || !user || !user.staffId) return;
    const res = await assignSubjects({ classId, sectionId });
    if ((!res.success && res.message) || !res.assigned) {
      toast.error(res.message);
      return;
    }

    userContext.students = res.assigned;
    open = false;
  };
</script>

<div class="">
  <ChatHeader {user} />
  <Chat readonly={false} {user} />
</div>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {`${userContext.getDesignationTitle(userContext.designation)} Onboarding`}
      </AlertDialog.Title>
      <AlertDialog.Description>
        You are not assined to any class, Please select a class to work on.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="grid gap-4">
      <Select.Root type="single" name="classes" bind:value>
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
      <AlertDialog.Footer>
        <AlertDialog.Action onclick={doAssign}>Continue</AlertDialog.Action>
      </AlertDialog.Footer>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
