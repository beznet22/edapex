<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { ExternalLink, PanelLeft, Plus } from "@lucide/svelte";
  import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
  import { innerWidth } from "svelte/reactivity/window";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { goto } from "$app/navigation";
  import type { AuthUser } from "$lib/types/auth-types";
  import ModelSelector from "./model-selector.svelte";
  import type { DBChat } from "$lib/server/db/schema";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";

  let { user, chat, readonly = false }: { user?: AuthUser; chat?: DBChat; readonly?: boolean } = $props();

  const sidebar = useSidebar();
</script>

<header class="bg-background sticky top-0 flex items-center gap-2 p-2">
  <div class="flex flex-1 items-center gap-2 px-3">
    <Tooltip>
      <TooltipTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            onclick={() => {
              sidebar.toggle();
            }}
            variant="outline"
            class="md:h-fit md:px-2"
          >
            <PanelLeft />
          </Button>
        {/snippet}
      </TooltipTrigger>
      <TooltipContent align="start">Toggle Sidebar</TooltipContent>
    </Tooltip>
    {#if !sidebar.open || (innerWidth.current ?? 768) < 768}
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              class="ml-auto px-2 md:ml-0 md:h-fit md:px-2"
              onclick={() => {
                goto("/", { invalidateAll: true });
              }}
            >
              <Plus />
              <span class="md:sr-only">New Chat</span>
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent>New Chat</TooltipContent>
      </Tooltip>

      <!-- {#if !readonly && chat}
      <VisibilitySelector {chat} class="order-1 md:order-4" />
    {/if} -->
    {/if}
    {#if !readonly}
      <ModelSelector class="" />
    {/if}
  </div>
  <div class="flex justify-end gap-2 px-3">
    <!-- {#if !user}
      <Button href="/signin" class="order-1 px-2 py-1.5 md:h-[34px]">Sign In</Button>
    {/if} -->
    <!-- <Button
      class="order-2 hidden h-fit bg-zinc-900 px-2 py-1.5 text-zinc-50 hover:bg-zinc-800 md:ml-auto md:flex md:h-[34px] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai-chatbot-svelte&project-name=my-awesome-chatbot&repository-name=my-awesome-chatbot&demo-title=AI%20Chatbot&demo-description=An%20Open-Source%20AI%20Chatbot%20Template%20Built%20With%20Next.js%20and%20the%20AI%20SDK%20by%20Vercel&demo-url=https%3A%2F%2Fsvelte-chat.vercel.ai&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22ai%22%2C%22productSlug%22%3A%22grok%22%2C%22integrationSlug%22%3A%22xai%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22ai%22%2C%22productSlug%22%3A%22api-key%22%2C%22integrationSlug%22%3A%22groq%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%2C%7B%22type%22%3A%22blob%22%7D%5D"
      target="_blank"
    >
      <ExternalLink size={16} />
      Deploy with Vercel
    </Button> -->
  </div>
</header>
